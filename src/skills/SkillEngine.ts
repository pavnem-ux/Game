import { scaleCircularAoeRadius, scaleCooldown } from '../character-stats';
import type { CharacterClass, CombatAttributes, PrimaryAttributes } from '../character-stats';
import type {
  AttackSnapshot,
  CombatCore,
  CombatEvent,
  DamageResult,
  DamageType,
  PeriodicDamageSource,
} from '../combat-core';
import type { EnemyAI } from '../enemy-ai';
import { sameInstant, validateAdvance } from '../simulation-boundary';
import type { SimulationBoundary } from '../simulation-boundary';
import type { EffectDefinition, EffectType, StatusEffects, StatusEvent } from '../status-effects';
import { circleIntersectsSector, edgeDistance } from '../weapon-attacks';
import type {
  AttackStartedEvent,
  CombatBody,
  DamageModifierContext,
  Point,
  ProjectileExpiredEvent,
  WeaponAttacks,
  WeaponImpactEvent,
} from '../weapon-attacks';
import { ABILITIES } from './abilities';
import { getSkill } from './catalog';
import { BONUS_TUNING, CONTROL_RULES } from './config';
import type { RunSkills } from './RunSkills';
import { elementalDamageMultiplier, modifyPlayerEffect } from './modifiers';
import { composeRunStats, NO_MODIFIERS } from './stats';
import type { RunStatModifiers } from './stats';
import { SynergyResolver } from './synergies';
import type {
  BonusRewardId,
  ChoiceResult,
  CombatTag,
  SkillCombatSnapshot,
  SkillEvent,
  SkillParams,
} from './types';

/** World services the engine is allowed to use. All calls happen at the shared world clock. */
export interface SkillHost {
  readonly core: CombatCore;
  readonly statuses: StatusEffects;
  readonly weapons: WeaponAttacks;
  readonly enemies: EnemyAI;
  readonly playerId: string;
  readonly characterClass: CharacterClass;
  readonly primary: PrimaryAttributes;
  /**
   * Task 09: permanent talent stat layer for this run (optional; absent = none). It is the base
   * of `modifiers()`, so talents combine with passives/buffs and are capped once.
   */
  readonly talentModifiers?: RunStatModifiers;
  readonly basicWeaponId: string;
  /**
   * Fixed simulation grid (the world's control step). Automatic activations happen only on this
   * grid, so frame endpoints never decide when a moving target became eligible.
   */
  readonly activationStep: number;
  playerBody(): CombatBody;
  facing(): Point;
  /** Registered, Core-alive enemy IDs in stable order. */
  enemyIds(): readonly string[];
  /** World death/reward/cleanup pipeline for Core events produced by the engine. */
  forwardCombat(events: readonly CombatEvent[]): void;
  recordStatus(events: readonly StatusEvent[]): void;
  recordSkill(events: readonly SkillEvent[]): void;
  /** Called when passive/buff changes alter effective stats or on-hit definitions. */
  statsChanged(stats: CombatAttributes): void;
  /**
   * Task 08 (optional, additive): stricter crowd-control limits for specific targets (bosses).
   * Values can only tighten the global CONTROL_RULES; null/absent = global rules.
   */
  controlLimits?(targetId: string): Readonly<{
    maxSlow: number;
    stunScale: number;
    stunImmunity: number;
  }> | null;
}
/** Target state captured immediately before a hit; synergies and kill rules read only this. */
export interface PreHit {
  readonly targetId: string;
  readonly effects: ReadonlySet<EffectType>;
  readonly slowed: boolean;
  readonly stunned: boolean;
  readonly mark: MarkState | null;
  readonly hpPercent: number;
  readonly position: Point | null;
}
export interface HitInfo {
  readonly targetId: string;
  readonly attack: AttackSnapshot;
  readonly result: DamageResult;
  readonly tags: ReadonlySet<CombatTag>;
  /** false for synergy procs and secondary hits: they never trigger synergies or kill rules. */
  readonly procs: boolean;
  /** Distinct projectile identity for multi-projectile rules. */
  readonly projectileKey?: string;
  readonly pre: PreHit;
}
export interface ProjectilePayload {
  readonly key: string;
  readonly tags: ReadonlySet<CombatTag>;
  readonly procs: boolean;
  readonly maxHits: number;
  hits: number;
  /** Bounds hits on one enemy across all projectiles of one activation. */
  readonly limit?: Readonly<{ key: string; max: number }>;
  readonly onHit?: (hit: HitInfo, engine: SkillEngine) => void;
  readonly onEnd?: (position: Point, engine: SkillEngine) => void;
  /** Task 08.5: damage attribution of the skill/synergy that launched it. */
  readonly source?: string;
}
export interface MarkState {
  readonly kind: 'hunter' | 'death';
  readonly rank: number;
  readonly expiresAt: number;
  readonly jumped: boolean;
}
interface ControlState {
  slow: number;
  slowUntil: number;
  stunUntil: number;
  stunImmuneUntil: number;
  /** Last time this state was pushed to EnemyAI; later transition times are pending boundaries. */
  syncedAt: number;
}
interface BuffState {
  stacks: number;
  value: number;
  expiresAt: number;
}
export interface ZoneSpec {
  readonly key: string;
  readonly center: Point;
  readonly radius: number;
  readonly duration: number;
  readonly tickInterval: number;
  readonly armTime?: number;
  readonly onTick: (zone: ZoneState, engine: SkillEngine) => void;
  readonly onEnd?: (zone: ZoneState, engine: SkillEngine) => void;
}
export interface ZoneState extends ZoneSpec {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly firstTickAt: number;
  /** Task 08.5: damage attribution of the skill/synergy that created the zone. */
  readonly source?: string;
  tickIndex: number;
  nextTickAt: number;
  ended: boolean;
}
/** Task 08.5: attribution entries kept for attack snapshots still in flight. */
const ATTACK_SOURCE_LIMIT = 1024;
interface Scheduled {
  readonly at: number;
  readonly sequence: number;
  readonly run: () => void;
}
interface AutoState {
  readyAt: number;
  activationCount: number;
}
const BASIC_TAGS: Record<CharacterClass, readonly CombatTag[]> = {
  warrior: ['basic', 'physical', 'melee'],
  rogue: ['basic', 'physical', 'melee', 'dagger'],
  mage: ['basic', 'magical', 'projectile'],
  archer: ['basic', 'physical', 'projectile'],
};
const DOT_TYPES: readonly EffectType[] = ['poison', 'burn', 'bleed'];

/**
 * Task 07 skill runtime: automatic abilities, passives, Slow/Stun, marks, buffs, zones and the
 * synergy resolver. It is another boundary module of GameplayWorld (peek/advance/resolve); it never
 * runs its own clock, so pause/death/level-up freezes it exactly like every other system.
 */
export class SkillEngine {
  private clock = 0;
  private sequence = 0;
  private zoneSequence = 0;
  private readonly autos = new Map<string, AutoState>();
  private readonly queue: Scheduled[] = [];
  private readonly zones = new Map<string, ZoneState>();
  /**
   * Task 08.5 run statistics: the skill/synergy whose code is executing (`skill:<id>` or
   * `synergy:<id>`) and the source of each attack snapshot the engine created. Read-only
   * metadata — never affects resolution. Bounded (oldest entries dropped).
   */
  private source: string | null = null;
  private readonly attackSources = new Map<string, string>();
  private readonly controls = new Map<string, ControlState>();
  private readonly marks = new Map<string, MarkState>();
  private readonly buffs = new Map<string, BuffState>();
  private readonly projectiles = new Map<string, ProjectilePayload>();
  private readonly cooldowns = new Map<string, number>();
  private readonly counters = new Map<string, { n: number; at: number }>();
  private readonly deaths = new Map<string, Point>();
  private barrierUntil: number | null = null;
  private stats: CombatAttributes;
  readonly synergies: SynergyResolver;
  constructor(
    readonly host: SkillHost,
    readonly run: RunSkills,
    private readonly random: () => number,
  ) {
    this.stats = composeRunStats(host.primary, host.talentModifiers ?? NO_MODIFIERS);
    this.synergies = new SynergyResolver(this);
  }
  get time() {
    return this.clock;
  }
  get effectiveStats(): CombatAttributes {
    return this.stats;
  }
  rank(skillId: string): number {
    return this.run.rank(skillId);
  }
  params(skillId: string): SkillParams {
    return getSkill(skillId).ranks[this.rank(skillId) - 1];
  }
  /** Seeded engine RNG for proc chances that are not Core/Status rolls. */
  roll(percent: number): boolean {
    if (percent >= 100) return true;
    if (percent <= 0) return false;
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new RangeError('Skill random source must return a number in [0, 1).');
    return value < percent / 100;
  }

  // ───────────────────────────── level-up integration ─────────────────────────────
  applyChoice(result: ChoiceResult): void {
    if (result.type === 'bonus') return this.applyBonus(result.bonusId);
    const definition = getSkill(result.skillId);
    if (definition.kind === 'auto' && !this.autos.has(definition.id))
      this.autos.set(definition.id, { readyAt: this.clock, activationCount: 0 });
    this.refreshStats();
  }
  private applyBonus(bonusId: BonusRewardId) {
    const player = this.host.core.getEntity(this.host.playerId);
    let amount = 0;
    if (bonusId === 'recovery') {
      const healed = this.host.core.heal(
        this.host.playerId,
        (player.maxHp * BONUS_TUNING.recoveryMaxHpPercent) / 100,
      );
      amount = healed.healed;
      this.host.forwardCombat(healed.events);
    } else if (bonusId === 'barrier') {
      amount = (player.maxHp * BONUS_TUNING.barrierMaxHpPercent) / 100;
      // A new barrier replaces the old one; it never stacks without limit.
      this.host.core.setBarrier(this.host.playerId, amount);
      this.barrierUntil = this.clock + BONUS_TUNING.barrierDuration;
    } else {
      amount = BONUS_TUNING.gold;
      this.run.addGold(amount);
    }
    this.host.recordSkill([Object.freeze({ type: 'bonus-claimed', bonusId, amount })]);
  }

  // ───────────────────────────── stats and on-hit modifiers ─────────────────────────────
  private modifiers(): RunStatModifiers {
    const m: Record<keyof RunStatModifiers, number> = {
      ...(this.host.talentModifiers ?? NO_MODIFIERS),
    };
    const add = (key: keyof RunStatModifiers, skillId: string, param: string) => {
      if (this.rank(skillId) > 0) m[key] += this.params(skillId)[param];
    };
    add('damagePercent', 'power', 'damagePercent');
    add('attackSpeed', 'haste', 'attackSpeed');
    add('maxHpPercent', 'vitality', 'maxHpPercent');
    add('resistance', 'fortitude', 'resistance');
    add('criticalChance', 'precision', 'criticalChance');
    add('criticalDamage', 'deadly_strikes', 'criticalDamage');
    add('movementSpeed', 'swiftness', 'movementSpeed');
    for (const [id, buff] of this.buffs) {
      if (buff.expiresAt <= this.clock && !sameInstant(buff.expiresAt, this.clock)) continue;
      if (id === 'war_cry') {
        const p = this.params('war_cry');
        m.attackSpeed += p.attackSpeed;
        m.resistance += p.resistance;
      } else if (id === 'battle_fury')
        m.physicalDamagePercent += buff.stacks * this.params('battle_fury').damagePerStack;
      else if (id === 'battle_momentum' || id === 'blood_frenzy') m.attackSpeed += buff.value;
    }
    return m;
  }
  refreshStats(): void {
    const next = composeRunStats(this.host.primary, this.modifiers());
    const changed = (Object.keys(next) as (keyof CombatAttributes)[]).some(
      (k) => next[k] !== this.stats[k],
    );
    this.stats = next;
    if (changed) this.host.statsChanged(next);
  }
  /** Player status applications: Toxic Mastery, Lingering Effects and Elemental Mastery Burn. */
  playerEffect(definition: EffectDefinition): EffectDefinition {
    return modifyPlayerEffect(definition, this.rankOf);
  }
  private readonly rankOf = (skillId: string) => this.rank(skillId);
  /** Target multiplier for every player hit: marks, focus bonus and per-enemy hit limits. Pure. */
  targetMultiplier(
    attack: AttackSnapshot,
    targetId: string,
    limit?: Readonly<{ key: string; max: number }>,
  ): number {
    if (attack.attackerId !== this.host.playerId) return 1;
    if (limit && this.counted(limit.key, targetId) >= limit.max) return 0;
    let multiplier = 1;
    const mark = this.activeMark(targetId);
    if (mark?.kind === 'hunter')
      multiplier *= 1 + getSkill('hunters_mark').ranks[mark.rank - 1].bonusPercent / 100;
    if (mark?.kind === 'death')
      multiplier *= 1 + getSkill('death_mark').ranks[mark.rank - 1].bonusPercent / 100;
    multiplier *= this.synergies.focusMultiplier(targetId);
    return multiplier;
  }
  damageModifier(context: DamageModifierContext): number {
    const payload = context.projectileId ? this.projectiles.get(context.projectileId) : undefined;
    return this.targetMultiplier(context.attack, context.targetId, payload?.limit);
  }
  /** Short-lived per-activation counters (hit limits); pruned after a few seconds. */
  count(key: string, targetId: string): number {
    const k = `${key}:${targetId}`;
    const n = (this.counters.get(k)?.n ?? 0) + 1;
    this.counters.set(k, { n, at: this.clock });
    return n;
  }
  counted(key: string, targetId: string): number {
    return this.counters.get(`${key}:${targetId}`)?.n ?? 0;
  }

  // ───────────────────────────── geometry and targeting ─────────────────────────────
  get player(): CombatBody {
    return this.host.playerBody();
  }
  body(id: string): CombatBody | null {
    if (!this.host.core.getEntity(id).alive) return null;
    try {
      const e = this.host.enemies.getEnemy(id);
      return { x: e.position.x, y: e.position.y, radius: e.config.radius };
    } catch {
      return null;
    }
  }
  private geometry: { id: string; body: CombatBody }[] | null = null;
  /** Living enemy bodies at the current instant; cached until time, deaths or spawns change them. */
  /**
   * Target position for pre-hit snapshots. Weapon impacts resolve Core damage before the world
   * snapshot, so a lethal target is dead but still registered in EnemyAI until cleanup.
   */
  lastPosition(id: string): Point | null {
    try {
      const p = this.host.enemies.getEnemy(id).position;
      return Object.freeze({ x: p.x, y: p.y });
    } catch {
      return this.deaths.get(id) ?? null;
    }
  }
  bodies(): readonly { id: string; body: CombatBody }[] {
    if (this.geometry) return this.geometry;
    const out: { id: string; body: CombatBody }[] = [];
    for (const id of this.host.enemyIds()) {
      const body = this.body(id);
      if (body) out.push({ id, body });
    }
    this.geometry = out;
    return out;
  }
  /** World calls this whenever enemy geometry or liveness may have changed. */
  invalidateGeometry(): void {
    this.geometry = null;
  }
  nearest(range: number, from: Point = this.player, exclude?: ReadonlySet<string>): string | null {
    let best: string | null = null,
      distance = Infinity;
    for (const { id, body } of this.bodies()) {
      if (exclude?.has(id)) continue;
      // Edge-to-edge when measured from a body (the player), like weapon ranges.
      const d = edgeDistance(from, body) - ('radius' in from ? (from as CombatBody).radius : 0);
      if (d <= range && d < distance) {
        best = id;
        distance = d;
      }
    }
    return best;
  }
  /** Edge-to-edge distance from the player body. */
  reach(body: CombatBody): number {
    return edgeDistance(this.player, body) - this.player.radius;
  }
  anyWithin(range: number): boolean {
    return this.nearest(range) !== null;
  }
  /** Enemy position with the most neighbours inside `radius`, among enemies within `range`. */
  cluster(range: number, radius: number): Point | null {
    const all = this.bodies().filter(({ body }) => this.reach(body) <= range);
    let best: Point | null = null,
      count = -1;
    for (const { body } of all) {
      let n = 0;
      for (const other of all)
        if (Math.hypot(other.body.x - body.x, other.body.y - body.y) <= radius) n++;
      if (n > count) {
        count = n;
        best = { x: body.x, y: body.y };
      }
    }
    return best;
  }
  inCircle(center: Point, radius: number, innerRadius = 0): string[] {
    return this.bodies()
      .filter(({ body }) => {
        const d = Math.hypot(body.x - center.x, body.y - center.y);
        // A ring excludes its inner disc; a filled circle includes targets at its very centre.
        return d <= radius + body.radius && (innerRadius <= 0 || d > innerRadius + body.radius);
      })
      .map(({ id }) => id);
  }
  inCone(origin: Point, direction: Point, range: number, arc: number): string[] {
    return this.bodies()
      .filter(({ body }) =>
        circleIntersectsSector(body, origin, direction, range, Math.min(360, arc)),
      )
      .map(({ id }) => id);
  }
  lowestHp(range: number): string | null {
    let best: string | null = null,
      ratio = Infinity;
    for (const { id, body } of this.bodies()) {
      if (this.reach(body) > range) continue;
      const e = this.host.core.getEntity(id);
      const r = e.currentHp / e.maxHp;
      if (r < ratio) {
        ratio = r;
        best = id;
      }
    }
    return best;
  }
  directionTo(target: Point, from: Point = this.player): Point {
    const dx = target.x - from.x,
      dy = target.y - from.y,
      d = Math.hypot(dx, dy);
    return d > 1e-9 ? { x: dx / d, y: dy / d } : this.host.facing();
  }
  area(radius: number): number {
    return scaleCircularAoeRadius(radius, this.stats.areaSize);
  }

  // ───────────────────────────── attacks and hits ─────────────────────────────
  elementalMultiplier(tags: ReadonlySet<CombatTag>): number {
    const alternate = this.buffs.get('elemental_alternation');
    const stacks =
      alternate &&
      (alternate.expiresAt > this.clock || sameInstant(alternate.expiresAt, this.clock))
        ? alternate.stacks
        : 0;
    return elementalDamageMultiplier(this.rankOf, tags, stacks);
  }
  attack(
    tags: ReadonlySet<CombatTag>,
    coefficient: number,
    damageType: DamageType,
    criticalChanceBonus = 0,
  ): AttackSnapshot {
    const attack = this.host.core.createAttack({
      attackerId: this.host.playerId,
      damageType,
      coefficient: coefficient * this.elementalMultiplier(tags),
      ...(criticalChanceBonus > 0 ? { criticalChanceBonus } : {}),
    });
    if (this.source) this.tagAttack(attack.id, this.source);
    return attack;
  }
  private tagAttack(attackId: string, source: string) {
    this.attackSources.set(attackId, source);
    if (this.attackSources.size > ATTACK_SOURCE_LIMIT)
      this.attackSources.delete(this.attackSources.keys().next().value!);
  }
  /**
   * Task 09 §1.2 talent secondary attack (counterattacks, shadow copies, off-hand, ballistae).
   * Attributed to `talent:<nodeId>` (separate in run stats/DPS), tagged `talent` + `secondary`
   * and resolved with `procs: false`: it never triggers passives, synergies or kill reactions,
   * so a talent hit can never start a chain. Core resolves all damage as usual.
   */
  talentStrike(
    nodeId: string,
    targetId: string,
    coefficient: number,
    damageType: DamageType,
    extraTags: readonly CombatTag[] = [],
  ): HitInfo | null {
    if (!/^(warrior|mage|archer|rogue)\.b[1-3]\.n0[1-5]$/.test(nodeId))
      throw new RangeError(`Unknown talent source ${nodeId}.`);
    if (!Number.isFinite(coefficient) || coefficient < 0)
      throw new RangeError('Talent strike coefficient must be ≥ 0.');
    let hit: HitInfo | null = null;
    this.withSource(`talent:${nodeId}`, () => {
      const tags = new Set<CombatTag>(['talent', 'secondary', damageType, ...extraTags]);
      hit = this.hit(targetId, this.attack(new Set(), coefficient, damageType), tags, {
        procs: false,
      });
    });
    return hit;
  }
  /** Task 08.5: which skill/synergy created this attack snapshot (undefined = not the engine). */
  attackSource(attackId: string): string | undefined {
    return this.attackSources.get(attackId);
  }
  /** Task 08.5: current attribution (used by synergies to mark their own damage). */
  currentSource(): string | null {
    return this.source;
  }
  setSource(source: string | null): void {
    this.source = source;
  }
  private withSource(source: string | null | undefined, run: () => void): void {
    const previous = this.source;
    this.source = source ?? null;
    try {
      run();
    } finally {
      this.source = previous;
    }
  }
  preHit(targetId: string): PreHit {
    const entity = this.host.core.getEntity(targetId);
    const control = this.controls.get(targetId);
    const now = this.clock;
    const active = (until: number | undefined) =>
      until !== undefined && (until > now || sameInstant(until, now));
    return Object.freeze({
      targetId,
      effects: new Set(this.host.statuses.getGroups(targetId).map((g) => g.effectType)),
      slowed: !!control && control.slow > 0 && active(control.slowUntil),
      stunned: !!control && active(control.stunUntil),
      mark: this.activeMark(targetId),
      hpPercent: entity.maxHp > 0 ? (entity.currentHp / entity.maxHp) * 100 : 0,
      position: this.lastPosition(targetId),
    });
  }
  /**
   * Engine-resolved direct hit. Order: capture pre-hit state → Core damage → world death/reward
   * pipeline → caller's on-hit effects (living target only) → passives, synergies and kill rules.
   */
  hit(
    targetId: string,
    attack: AttackSnapshot,
    tags: ReadonlySet<CombatTag>,
    options: {
      procs?: boolean;
      multiplier?: number;
      projectileKey?: string;
      onHit?: (hit: HitInfo) => void;
    } = {},
  ): HitInfo | null {
    if (!this.host.core.getEntity(targetId).alive) return null;
    const pre = this.preHit(targetId);
    const result = this.host.core.resolveAttack(attack, targetId, {
      damageMultiplier: this.targetMultiplier(attack, targetId) * (options.multiplier ?? 1),
    });
    this.host.forwardCombat(result.events);
    const hit: HitInfo = Object.freeze({
      targetId,
      attack,
      result,
      tags,
      procs: options.procs ?? true,
      ...(options.projectileKey ? { projectileKey: options.projectileKey } : {}),
      pre,
    });
    if (result.status === 'hit' && this.host.core.getEntity(targetId).alive) options.onHit?.(hit);
    this.afterHit(hit);
    return hit;
  }
  /** Weapon/skill projectile impacts resolved by WeaponAttacks; world already forwarded Core events. */
  handleImpact(event: WeaponImpactEvent, pre: PreHit): void {
    const payload = event.projectileId ? this.projectiles.get(event.projectileId) : undefined;
    const basic = event.weaponId === this.host.basicWeaponId;
    if (!basic && !payload) return;
    const tags = basic ? new Set(BASIC_TAGS[this.host.characterClass]) : payload!.tags;
    const hit: HitInfo = Object.freeze({
      targetId: event.targetId,
      attack: event.attack,
      result: event.result,
      tags,
      procs: basic ? true : payload!.procs,
      ...(event.projectileId ? { projectileKey: event.projectileId } : {}),
      pre,
    });
    this.withSource(payload?.source, () => {
      if (payload) {
        payload.hits++;
        if (payload.limit) this.count(payload.limit.key, event.targetId);
        if (event.result.status === 'hit') payload.onHit?.(hit, this);
        if (payload.hits >= payload.maxHits) {
          this.projectiles.delete(event.projectileId!);
          payload.onEnd?.(pre.position ?? this.player, this);
        }
      }
      this.afterHit(hit);
    });
  }
  handleProjectileExpired(event: ProjectileExpiredEvent): void {
    const payload = this.projectiles.get(event.projectileId);
    if (!payload) return;
    this.projectiles.delete(event.projectileId);
    if (payload.onEnd) this.withSource(payload.source, () => payload.onEnd!(event.position, this));
  }
  /** Multishot: extra arrows for each basic bow attack. */
  onBasicAttack(event: AttackStartedEvent): void {
    if (event.weaponId !== this.host.basicWeaponId) return;
    ABILITIES.multishot?.onBasicAttack?.(event, this);
  }
  private afterHit(hit: HitInfo) {
    const killed = hit.result.events.some((e) => e.type === 'death' && e.entityId === hit.targetId);
    // Secondary hits and synergy procs never re-enter passive reactions or synergies.
    if (hit.result.status === 'hit' && hit.procs) {
      for (const id of this.run.ownedIds()) {
        const onPlayerHit = ABILITIES[id]?.onPlayerHit;
        if (onPlayerHit) this.withSource(`skill:${id}`, () => onPlayerHit(hit, this));
      }
      this.synergies.onHit(hit);
      this.trackElement(hit);
    }
    if (killed)
      this.onKill(hit.targetId, hit.pre, { direct: true, tags: hit.tags, procs: hit.procs });
  }
  private trackElement(hit: HitInfo) {
    if (this.rank('elemental_mastery') < 5 || !hit.procs) return;
    const element = hit.tags.has('fire') ? 'fire' : hit.tags.has('ice') ? 'ice' : null;
    if (!element) return;
    const p = this.params('elemental_mastery');
    const last = this.counters.get('element:last')?.n;
    const code = element === 'fire' ? 1 : 2;
    if (last !== undefined && last !== code) {
      const buff = this.buffs.get('elemental_alternation');
      const stacks = Math.min(p.alternateMaxStacks, (this.activeBuff(buff) ? buff!.stacks : 0) + 1);
      this.buffs.set('elemental_alternation', {
        stacks,
        value: 0,
        expiresAt: this.clock + p.alternateDuration,
      });
    }
    this.counters.set('element:last', { n: code, at: Number.POSITIVE_INFINITY });
  }
  /** Periodic (status tick) death. `effects` are the target's groups immediately before death. */
  handlePeriodicKill(
    targetId: string,
    effects: ReadonlySet<EffectType>,
    lethalSources: readonly PeriodicDamageSource[],
  ): void {
    const fromPlayer = lethalSources.filter(
      (s) => s.rawDamage > 0 && s.sourceId === this.host.playerId,
    );
    if (fromPlayer.length === 0) return;
    // No recursion: a kill whose player contribution came only from synergy-applied stacks never procs.
    const procs = fromPlayer.some((s) => !s.originId?.startsWith('synergy:'));
    const pre: PreHit = Object.freeze({
      targetId,
      effects,
      slowed: false,
      stunned: false,
      mark: this.marks.get(targetId) ?? null,
      hpPercent: 0,
      position: this.deaths.get(targetId) ?? null,
    });
    this.onKill(targetId, pre, { direct: false, tags: new Set(), procs });
  }
  private onKill(
    targetId: string,
    pre: PreHit,
    cause: { direct: boolean; tags: ReadonlySet<CombatTag>; procs: boolean },
  ) {
    // The skill's own mark transfer is not a synergy and happens for any kill.
    if (pre.mark)
      ABILITIES[pre.mark.kind === 'hunter' ? 'hunters_mark' : 'death_mark']?.onMarkedDeath?.(
        pre,
        this,
      );
    this.marks.delete(targetId);
    if (!cause.procs) return;
    if (cause.direct && cause.tags.has('melee') && this.rank('battle_fury') > 0)
      ABILITIES.battle_fury?.onMeleeKill?.(this);
    this.synergies.onKill(targetId, pre, cause);
  }
  /** World notifies before unregistering a dead enemy so kill rules know its last position. */
  noteDeath(id: string, position: Point): void {
    this.geometry = null;
    this.deaths.set(id, Object.freeze({ x: position.x, y: position.y }));
  }

  // ───────────────────────────── statuses, control, marks, buffs ─────────────────────────────
  applyStatus(
    targetId: string,
    definition: EffectDefinition,
    stacks = 1,
    originId?: string,
  ): number {
    if (!this.host.core.getEntity(targetId).alive || stacks < 1) return 0;
    const effect = this.playerEffect(definition);
    let applied = 0;
    // Task 08.5: an unlabelled skill/synergy status carries its attribution as the origin.
    const origin = originId ?? this.source ?? undefined;
    for (let i = 0; i < stacks; i++) {
      const result = this.host.statuses.apply({
        ...effect,
        targetId,
        sourceId: this.host.playerId,
        ...(origin ? { originId: origin } : {}),
      });
      this.host.recordStatus(result.events);
      if (result.status === 'applied') applied++;
    }
    return applied;
  }
  hasEffect(targetId: string, type: EffectType): boolean {
    return this.host.statuses.getGroup(targetId, type) !== null;
  }
  effectStacks(targetId: string, type: EffectType): number {
    return this.host.statuses.getGroup(targetId, type)?.stacks.length ?? 0;
  }
  slow(targetId: string, strength: number, duration: number): void {
    if (!this.host.core.getEntity(targetId).alive || duration <= 0 || strength <= 0) return;
    const bonus =
      this.rank('elemental_mastery') > 0 ? this.params('elemental_mastery').slowBonus : 0;
    const limits = this.host.controlLimits?.(targetId) ?? null;
    const cap = limits ? Math.min(CONTROL_RULES.maxSlow, limits.maxSlow) : CONTROL_RULES.maxSlow;
    const s = Math.min(cap, strength + bonus);
    const c = this.control(targetId);
    const active = c.slowUntil > this.clock;
    c.slow = active ? Math.max(c.slow, s) : s;
    c.slowUntil = Math.max(active ? c.slowUntil : 0, this.clock + duration);
    this.syncControl(targetId);
    this.host.recordSkill([
      Object.freeze({ type: 'control-applied', targetId, control: 'slow', until: c.slowUntil }),
    ]);
  }
  /** Returns true only if a new stun started. Stunned or recently stunned enemies are immune. */
  stun(targetId: string, duration: number): boolean {
    if (!this.host.core.getEntity(targetId).alive || duration <= 0) return false;
    const c = this.control(targetId);
    if (c.stunUntil > this.clock || c.stunImmuneUntil > this.clock) return false;
    const limits = this.host.controlLimits?.(targetId) ?? null;
    const d =
      Math.min(CONTROL_RULES.maxStunDuration, duration) *
      (limits ? Math.min(1, limits.stunScale) : 1);
    if (d <= 0) return false;
    c.stunUntil = this.clock + d;
    c.stunImmuneUntil =
      c.stunUntil +
      (limits
        ? Math.max(CONTROL_RULES.stunImmunity, limits.stunImmunity)
        : CONTROL_RULES.stunImmunity);
    this.syncControl(targetId);
    this.host.recordSkill([
      Object.freeze({ type: 'control-applied', targetId, control: 'stun', until: c.stunUntil }),
    ]);
    return true;
  }
  private control(targetId: string): ControlState {
    let c = this.controls.get(targetId);
    if (!c) {
      c = { slow: 0, slowUntil: 0, stunUntil: 0, stunImmuneUntil: 0, syncedAt: this.clock };
      this.controls.set(targetId, c);
    }
    return c;
  }
  private syncControl(targetId: string) {
    const c = this.controls.get(targetId);
    if (!c) return;
    c.syncedAt = this.clock;
    if (!this.host.enemyIds().includes(targetId)) return;
    const slowed = c.slowUntil > this.clock && !sameInstant(c.slowUntil, this.clock);
    const stunned = c.stunUntil > this.clock && !sameInstant(c.stunUntil, this.clock);
    this.host.enemies.setControl(targetId, {
      movementMultiplier: slowed ? 1 - c.slow : 1,
      stunned,
    });
  }
  mark(targetId: string, kind: MarkState['kind'], duration: number, jumped = false): void {
    if (!this.host.core.getEntity(targetId).alive) return;
    const skillId = kind === 'hunter' ? 'hunters_mark' : 'death_mark';
    // One mark of each kind at a time.
    for (const [id, m] of this.marks) if (m.kind === kind) this.marks.delete(id);
    this.marks.set(
      targetId,
      Object.freeze({ kind, rank: this.rank(skillId), expiresAt: this.clock + duration, jumped }),
    );
  }
  activeMark(targetId: string): MarkState | null {
    const m = this.marks.get(targetId);
    return m && (m.expiresAt > this.clock || sameInstant(m.expiresAt, this.clock)) ? m : null;
  }
  setBuff(id: string, stacks: number, value: number, expiresAt: number): void {
    this.buffs.set(id, { stacks, value, expiresAt });
    this.refreshStats();
  }
  buff(id: string): BuffState | null {
    const b = this.buffs.get(id);
    return this.activeBuff(b) ? b! : null;
  }
  private activeBuff(b: BuffState | undefined) {
    return !!b && (b.expiresAt > this.clock || sameInstant(b.expiresAt, this.clock));
  }
  ready(key: string): boolean {
    const at = this.cooldowns.get(key);
    return at === undefined || at <= this.clock || sameInstant(at, this.clock);
  }
  startCooldown(key: string, seconds: number): void {
    this.cooldowns.set(key, this.clock + seconds);
  }

  // ───────────────────────────── projectiles, zones, delays ─────────────────────────────
  launch(
    spec: {
      origin: Point;
      direction: Point;
      speed: number;
      radius: number;
      range: number;
      pierce?: number;
    },
    attack: AttackSnapshot,
    payload: Omit<ProjectilePayload, 'hits' | 'maxHits'>,
  ): string {
    const id = this.host.weapons.launchProjectile({
      sourceId: this.host.playerId,
      weaponId: `skill:${payload.key}`,
      origin: spec.origin,
      direction: spec.direction,
      speed: spec.speed,
      radius: spec.radius,
      maxTravelDistance: spec.range,
      attack,
      ...(spec.pierce ? { pierce: spec.pierce } : {}),
    });
    const source = this.source ?? `skill:${payload.key.split('#')[0]}`;
    if (!this.attackSources.has(attack.id)) this.tagAttack(attack.id, source);
    this.projectiles.set(id, { ...payload, hits: 0, maxHits: 1 + (spec.pierce ?? 0), source });
    return id;
  }
  schedule(delay: number, run: () => void): void {
    const source = this.source;
    this.queue.push({
      at: this.clock + delay,
      sequence: ++this.sequence,
      run: source ? () => this.withSource(source, run) : run,
    });
  }
  zone(spec: ZoneSpec): ZoneState {
    const id = `zone-${++this.zoneSequence}`;
    // Armed traps check immediately when armed; ordinary zones tick one interval after creation.
    const firstTickAt = this.clock + (spec.armTime ? spec.armTime : spec.tickInterval);
    const zone: ZoneState = {
      ...spec,
      id,
      createdAt: this.clock,
      expiresAt: this.clock + spec.duration,
      firstTickAt,
      ...(this.source ? { source: this.source } : {}),
      tickIndex: 1,
      nextTickAt: firstTickAt,
      ended: false,
    };
    this.zones.set(id, zone);
    return zone;
  }
  endZone(zone: ZoneState): void {
    if (zone.ended) return;
    zone.ended = true;
    this.zones.delete(zone.id);
    if (zone.onEnd) this.withSource(zone.source, () => zone.onEnd!(zone, this));
  }
  recordArea(
    sourceKey: string,
    shape: 'circle' | 'ring' | 'cone',
    center: Point,
    radius: number,
    hits: number,
    extra: { innerRadius?: number; direction?: Point; arcDegrees?: number } = {},
  ): void {
    this.host.recordSkill([
      Object.freeze({
        type: 'skill-area',
        sourceKey,
        shape,
        center: Object.freeze({ x: center.x, y: center.y }),
        radius,
        hits,
        ...extra,
      }),
    ]);
  }

  // ───────────────────────────── boundary API ─────────────────────────────
  private autoReady(skillId: string): number | null {
    const state = this.autos.get(skillId);
    if (!state || !this.host.core.getEntity(this.host.playerId).alive) return null;
    const behavior = ABILITIES[skillId];
    if (!behavior?.canActivate?.(this, this.params(skillId))) return null;
    return this.gridCeil(Math.max(this.clock, state.readyAt));
  }
  /** Smallest grid instant k·step ≥ t (same arithmetic as the world's control ticks). */
  private gridCeil(t: number): number {
    const step = this.host.activationStep;
    // Already on the grid (within clock precision): keep the exact current instant.
    if (sameInstant(Math.round(t / step) * step, t)) return t;
    return Math.ceil(t / step) * step;
  }

  /**
   * `includeAutos=false` excludes opportunistic activations. Their readiness depends on live enemy
   * geometry, which other modules advance first; they are evaluated only at real boundaries.
   */
  private nextEvent(
    end: number,
    includeAutos = true,
  ): { at: number; priority: 0 | 1; run: () => void } | null {
    let best: { at: number; priority: 0 | 1; order: number; run: () => void } | null = null;
    const consider = (at: number, priority: 0 | 1, order: number, run: () => void) => {
      if (at > end && !sameInstant(at, end)) return;
      const t = Math.max(this.clock, Math.min(at, end));
      if (
        !best ||
        (t < best.at && !sameInstant(t, best.at)) ||
        (sameInstant(t, best.at) &&
          (priority < best.priority || (priority === best.priority && order < best.order)))
      )
        best = { at: t, priority, order, run };
    };
    for (const s of this.queue) consider(s.at, 0, s.sequence, () => this.runScheduled(s));
    for (const z of this.zones.values()) {
      const tickAt = z.nextTickAt;
      if (tickAt < z.expiresAt || sameInstant(tickAt, z.expiresAt))
        consider(tickAt, 0, 1e9 + this.zoneOrder(z), () => this.tickZone(z));
      else consider(z.expiresAt, 1, this.zoneOrder(z), () => this.endZone(z));
    }
    let order = 2e9;
    if (includeAutos)
      for (const id of this.run.ownedIds()) {
        order++;
        const ready = this.autoReady(id);
        if (ready !== null) consider(ready, 0, order, () => this.activate(id));
      }
    // Expirations (priority 1): control transitions not yet pushed to EnemyAI, buffs, marks, barrier.
    for (const [id, c] of this.controls) {
      const pending = [c.slowUntil, c.stunUntil, c.stunImmuneUntil].filter(
        (t) => t > c.syncedAt && !sameInstant(t, c.syncedAt),
      );
      if (pending.length) consider(Math.min(...pending), 1, 0, () => this.expireControl(id));
    }
    for (const [id, b] of this.buffs) consider(b.expiresAt, 1, 1, () => this.expireBuff(id));
    for (const [id, m] of this.marks) consider(m.expiresAt, 1, 2, () => this.marks.delete(id));
    if (this.barrierUntil !== null)
      consider(this.barrierUntil, 1, 3, () => {
        this.host.core.setBarrier(this.host.playerId, 0);
        this.barrierUntil = null;
      });
    return best;
  }
  private zoneOrder(z: ZoneState) {
    return Number(z.id.slice(5));
  }
  peekBoundary(end: number): SimulationBoundary | null {
    validateAdvance(this.clock, end, null);
    const next = this.nextEvent(end);
    return next ? Object.freeze({ time: next.at, priority: next.priority }) : null;
  }
  advanceToBoundary(time: number): void {
    validateAdvance(this.clock, time, null);
    validateAdvance(this.clock, time, this.nextEvent(time, false)?.at ?? null);
    if (time !== this.clock) this.geometry = null;
    this.clock = time;
  }
  /** Resolve exactly one due engine event at the current clock. */
  resolveBoundary(): void {
    this.prune();
    const next = this.nextEvent(this.clock);
    next?.run();
  }
  private runScheduled(s: Scheduled) {
    const i = this.queue.indexOf(s);
    if (i >= 0) this.queue.splice(i, 1);
    if (this.host.core.getEntity(this.host.playerId).alive) s.run();
  }
  private tickZone(z: ZoneState) {
    z.tickIndex++;
    z.nextTickAt = z.firstTickAt + (z.tickIndex - 1) * z.tickInterval;
    if (this.host.core.getEntity(this.host.playerId).alive)
      this.withSource(z.source, () => z.onTick(z, this));
  }
  private activate(skillId: string) {
    const state = this.autos.get(skillId)!;
    const p = this.params(skillId);
    const behavior = ABILITIES[skillId];
    const before = this.clock;
    if (!behavior?.activate) throw new Error(`No behavior for ${skillId}.`);
    state.activationCount++;
    state.readyAt = before + scaleCooldown(p.cooldown, this.stats.cooldownReduction);
    this.host.recordSkill([
      Object.freeze({
        type: 'skill-activated',
        skillId,
        rank: this.rank(skillId),
        origin: Object.freeze({ x: this.player.x, y: this.player.y }),
      }),
    ]);
    this.withSource(`skill:${skillId}`, () =>
      behavior.activate!(this, p, `${skillId}#${state.activationCount}`),
    );
  }
  private expireControl(id: string) {
    const c = this.controls.get(id)!;
    const stunEnded = sameInstant(c.stunUntil, this.clock);
    this.syncControl(id);
    if (c.slowUntil <= this.clock && c.stunUntil <= this.clock && c.stunImmuneUntil <= this.clock)
      this.controls.delete(id);
    this.host.recordSkill([
      Object.freeze({
        type: 'control-expired',
        targetId: id,
        control: stunEnded ? 'stun' : 'slow',
      }),
    ]);
  }
  private expireBuff(id: string) {
    this.buffs.delete(id);
    this.refreshStats();
  }
  /** Drop per-enemy state for dead/unregistered enemies; bounded memory for long runs. */
  prune(): void {
    const living = new Set(this.host.enemyIds());
    for (const id of [...this.controls.keys()]) if (!living.has(id)) this.controls.delete(id);
    for (const [id, m] of this.marks)
      if ((!living.has(id) && !this.deaths.has(id)) || m.expiresAt < this.clock)
        this.marks.delete(id);
    for (const [key, c] of this.counters) if (c.at < this.clock - 5) this.counters.delete(key);
    this.synergies.prune(living);
  }
  /** World calls this after finishing each boundary so death positions never accumulate. */
  endStep(): void {
    this.deaths.clear();
  }
  /** Expired-control bookkeeping that must not wait for a separate boundary. */
  snapshot(): SkillCombatSnapshot {
    const cooldowns: Record<string, number> = {};
    for (const [id, s] of this.autos) cooldowns[id] = Math.max(0, s.readyAt - this.clock);
    return Object.freeze({
      zones: Object.freeze(
        [...this.zones.values()].map((z) =>
          Object.freeze({
            id: z.id,
            sourceKey: z.key,
            center: z.center,
            radius: z.radius,
            expiresAt: z.expiresAt,
            ...(z.armTime ? { armedAt: z.createdAt + z.armTime } : {}),
          }),
        ),
      ),
      marks: Object.freeze(
        [...this.marks]
          .filter(([id]) => this.host.core.getEntity(id).alive)
          .map(([targetId, m]) =>
            Object.freeze({ targetId, kind: m.kind, expiresAt: m.expiresAt }),
          ),
      ),
      controls: Object.freeze(
        [...this.controls].map(([targetId, c]) =>
          Object.freeze({
            targetId,
            slow: c.slowUntil > this.clock ? c.slow : 0,
            slowUntil: c.slowUntil,
            stunUntil: c.stunUntil,
            stunImmuneUntil: c.stunImmuneUntil,
          }),
        ),
      ),
      buffs: Object.freeze(
        [...this.buffs]
          .filter(([, b]) => this.activeBuff(b))
          .map(([id, b]) => Object.freeze({ id, stacks: b.stacks, expiresAt: b.expiresAt })),
      ),
      barrier: this.host.core.getBarrier(this.host.playerId),
      barrierExpiresAt: this.barrierUntil,
      cooldowns: Object.freeze(cooldowns),
    });
  }
  /** Status types that matter for synergy snapshots. */
  static readonly DOT_TYPES = DOT_TYPES;
}
