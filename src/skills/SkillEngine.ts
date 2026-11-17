import { TalentCombat } from '../talents/combat';
import { TALENT_HANDLERS } from '../talents/handlers';
import { TalentRuntime } from '../talents/runtime';
import { OFFHAND_TAGS, OFFHAND_WEAPON } from '../talents/offhand';
import type { TalentConfig, TalentRanks } from '../talents/types';
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
import { PetRunner } from '../pets/runtime';
import type { PetDamageType, PetEvent, PetHost, Point2 } from '../pets/runtime';
import type { PetId } from '../pets/config';
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
  /** Task 09.1: this run's talent ranks (+ test config) and the seeded talent stream. */
  readonly talents?: Readonly<{
    ranks: TalentRanks;
    config?: TalentConfig;
    random?: () => number;
  }>;
  readonly basicWeaponId: string;
  /** Task 09.1 (optional): the player has a non-zero movement input this step. */
  playerMoving?(): boolean;
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
  /**
   * Task 24 (optional, additive): targets fully immune to Slow and Stun (Blight Nest). Damage and
   * damage-over-time effects still apply; absent = nobody is immune.
   */
  controlImmune?(targetId: string): boolean;
  /** Task 20 (optional): the run's active pet (validated by the world). */
  readonly pet?: Readonly<{ id: PetId; level: number }> | null;
  /** Task 20 (optional): pet actions for run statistics and rendering. */
  recordPet?(event: PetEvent): void;
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
  /** Task 15: stack counts per effect type just before the hit/death (additive, optional). */
  readonly stacks?: ReadonlyMap<EffectType, number>;
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
  /** Task 09.1 G11: damage falloff per previous hit of this projectile (0–1; default none). */
  readonly falloff?: number;
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
  /** Task 15: start of the current Stun and the Stun start a synergy already extended (-1 none). */
  stunStartedAt: number;
  stunExtendedFor: number;
  /** Last time this state was pushed to EnemyAI; later transition times are pending boundaries. */
  syncedAt: number;
}
interface BuffState {
  stacks: number;
  value: number;
  expiresAt: number;
  /** Task 15 (Battle Momentum III): movement speed % while the buff is active. */
  movementSpeedPercent?: number;
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
  /** Task 27: length of the cooldown set at the last activation (snapshot / HUD only). */
  cooldownTotal: number;
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
  /** Task 09.1: talent runtime (cooldowns, buffs, proc guard, entities) on simulation time. */
  readonly talents: TalentRuntime;
  /** Task 09.1: talent combat hooks (direct-hit bonuses, crit, DoT, reactions). */
  readonly talentCombat: TalentCombat;
  // ── TalentEngine view (read-only helpers for talent handlers) ──
  get statuses() {
    return this.host.statuses;
  }
  entity(id: string) {
    return this.host.core.getEntity(id);
  }
  enemiesInCircle(center: Point, radius: number): string[] {
    return this.inCircle(center, radius);
  }
  enemyPosition(id: string): Point | null {
    const b = this.body(id);
    return b ? { x: b.x, y: b.y } : null;
  }
  playerPosition(): Point {
    return { x: this.player.x, y: this.player.y };
  }
  facing(): Point {
    return this.host.facing();
  }
  get playerId(): string {
    return this.host.playerId;
  }
  enhancedSkillId(): string | null {
    return this.run.enhancedSkillId;
  }
  skillParams(skillId: string): Readonly<Record<string, number>> | null {
    return this.rank(skillId) > 0 ? this.params(skillId) : null;
  }
  nearestEnemy(from: Point): string | null {
    return this.nearest(Infinity, from);
  }
  private talentShots = 0;
  /** Task 09.1: a talent projectile (ballista bolt), `procs=false`, attributed to the talent. */
  talentProjectile(
    nodeId: string,
    origin: Point,
    targetId: string,
    spec: Readonly<{ speed: number; radius: number; range: number; baseDamage: number }>,
    extraTags: readonly CombatTag[],
    onHit?: (targetId: string) => void,
  ): void {
    this.secondaryProjectile(
      `talent:${nodeId}`,
      origin,
      targetId,
      spec,
      'physical',
      ['talent', 'secondary', 'physical', 'projectile', ...extraTags],
      onHit,
    );
  }
  /**
   * Secondary projectile (talent ballista, Task 20 pets): exact pre-resistance `baseDamage`, no
   * crit, `procs=false`, attributed to `source`. Nothing is launched when the stat is 0.
   */
  private secondaryProjectile(
    source: string,
    origin: Point,
    targetId: string,
    spec: Readonly<{ speed: number; radius: number; range: number; baseDamage: number }>,
    damageType: DamageType,
    tags: readonly CombatTag[],
    onHit?: (targetId: string) => void,
  ): void {
    const body = this.body(targetId);
    const player = this.host.core.getEntity(this.host.playerId);
    const stat = damageType === 'physical' ? player.physicalDamage : player.magicalDamage;
    if (!body || !(stat > 0) || !(spec.baseDamage >= 0)) return;
    const attack = this.host.core.createAttack({
      attackerId: this.host.playerId,
      damageType,
      coefficient: spec.baseDamage / stat,
      noCritical: true,
    });
    this.tagAttack(attack.id, source);
    const id = this.host.weapons.launchProjectile({
      sourceId: this.host.playerId,
      weaponId: `${source}#${++this.talentShots}`,
      origin,
      direction: this.directionTo(body, origin),
      speed: spec.speed,
      radius: spec.radius,
      maxTravelDistance: spec.range,
      attack,
    });
    this.projectiles.set(id, {
      key: source,
      tags: new Set<CombatTag>(tags),
      procs: false,
      hits: 0,
      maxHits: 1,
      source,
      ...(onHit ? { onHit: (hit: HitInfo) => onHit(hit.targetId) } : {}),
    });
  }
  /** Task 09.1: talent healing of the player through Combat Core (never revives). */
  healPlayer(amount: number): void {
    if (!(amount > 0) || !this.host.core.getEntity(this.host.playerId).alive) return;
    this.host.forwardCombat(this.host.core.heal(this.host.playerId, amount).events);
  }
  /** Task 09.1: player HP last seen by talent threshold rules (percent of Max HP). */
  private playerHpSeen = 100;
  private conditionalKey = '';
  /**
   * Task 09.1: the world reports every change of the player's HP. Threshold talents react
   * (e.g. heal on crossing below 30%), and HP-conditional stats are recomposed once when their
   * condition flips (caps still applied once by composeRunStats).
   */
  onPlayerHpChanged(damage: boolean): void {
    const p = this.host.core.getEntity(this.host.playerId);
    const now = p.maxHp > 0 ? (p.currentHp / p.maxHp) * 100 : 0;
    const before = this.playerHpSeen;
    this.playerHpSeen = now;
    if (!this.talents.anyActive) return;
    if (now !== before) this.talentCombat.onPlayerHpChanged(before, now, damage);
    const key = JSON.stringify(this.talentCombat.conditionalStats());
    if (key !== this.conditionalKey) {
      this.conditionalKey = key;
      this.refreshStats();
    }
  }
  /** Targets of the area/melee attack currently being resolved (talent «2+ targets» rules). */
  private targetCount = 1;
  withTargetCount<T>(count: number, run: () => T): T {
    const previous = this.targetCount;
    this.targetCount = Math.max(1, count);
    try {
      return run();
    } finally {
      this.targetCount = previous;
    }
  }
  controlState(id: string): {
    readonly slowed: boolean;
    readonly stunned: boolean;
    readonly marked: boolean;
  } {
    const pre = this.preHit(id);
    return { slowed: pre.slowed, stunned: pre.stunned, marked: pre.mark !== null };
  }
  playerMoving(): boolean {
    return this.host.playerMoving?.() ?? false;
  }
  /** Task 09.1: shortens an owned automatic skill's remaining cooldown (not below ready now). */
  reduceSkillCooldown(skillId: string, seconds: number): void {
    const state = this.autos.get(skillId);
    if (!state || !(seconds > 0) || state.readyAt <= this.clock) return;
    state.readyAt = Math.max(this.clock, state.readyAt - seconds);
  }
  /**
   * Task 09.1 C2: the one barrier slot shared by the bonus Barrier and talent barriers. A stronger
   * (or equal) new barrier replaces strength and expiry; a weaker one never lowers the active
   * barrier's HP and only extends its expiry to max(existing, new).
   */
  grantBarrier(amount: number, duration: number): void {
    const current = this.barrierUntil === null ? 0 : this.host.core.getBarrier(this.host.playerId);
    const until = this.clock + duration;
    if (current > amount) this.barrierUntil = Math.max(this.barrierUntil!, until);
    else {
      this.host.core.setBarrier(this.host.playerId, amount);
      this.barrierUntil = until;
    }
  }
  /** Task 09.1: the player took real direct damage (world forwards Core damage events). */
  onPlayerDirectDamage(attackerId: string): void {
    this.talentCombat.onPlayerDirectDamage(attackerId);
  }
  /** Task 09.1: a dodge by the player (enemy direct attack missed). */
  onPlayerDodged(attackerId: string): void {
    this.talentCombat.onPlayerDodged(attackerId);
  }
  /** Task 09.1: crit-chance bonus for the player's equipped weapon at strike creation. */
  weaponAttackBonus(weaponId?: string): { criticalChanceBonus?: number } {
    const bonus =
      weaponId === OFFHAND_WEAPON.id
        ? this.talentCombat.offhandCritChance()
        : this.talentCombat.critChance(new Set(BASIC_TAGS[this.host.characterClass]));
    return bonus > 0 ? { criticalChanceBonus: bonus } : {};
  }
  /** Task 09.1: attributes an attack snapshot to a talent (run stats source `talent:<node>`). */
  tagTalentAttack(attackId: string, nodeId: string): void {
    this.tagAttack(attackId, `talent:${nodeId}`);
  }
  constructor(
    readonly host: SkillHost,
    readonly run: RunSkills,
    private readonly random: () => number,
  ) {
    this.stats = composeRunStats(host.primary, host.talentModifiers ?? NO_MODIFIERS);
    this.talents = new TalentRuntime({
      ranks: host.talents?.ranks,
      config: host.talents?.config,
      now: () => this.clock,
      random:
        host.talents?.random ??
        (() => {
          throw new Error('Talent RNG used without a seeded stream.');
        }),
    });
    this.talents.onBuffsChanged = () => this.refreshStats();
    this.talentCombat = new TalentCombat(
      this,
      TALENT_HANDLERS[host.characterClass],
      host.characterClass,
    );
    this.synergies = new SynergyResolver(this);
    if (host.pet) this.setPet(host.pet);
  }

  // ───────────────────────────── Task 20 pets ─────────────────────────────
  /** The run's pet (null = none). Its timed actions are engine boundaries (skill-action slot). */
  pet: PetRunner | null = null;
  /**
   * Creates (or removes, with null) the run's pet at the current clock — run start, or the debug
   * spawn — and recomposes stats once for its aura.
   */
  setPet(spec: Readonly<{ id: PetId; level: number }> | null): void {
    this.pet = spec ? new PetRunner(spec.id, spec.level, this.petHost) : null;
    this.refreshStats();
  }
  private readonly petHost: PetHost = {
    now: () => this.clock,
    playerAlive: () => this.host.core.getEntity(this.host.playerId).alive,
    playerPosition: () => ({ x: this.player.x, y: this.player.y }),
    facing: () => this.host.facing(),
    playerMaxHp: () => this.host.core.getEntity(this.host.playerId).maxHp,
    playerDamage: () => {
      const p = this.host.core.getEntity(this.host.playerId);
      return { physical: p.physicalDamage, magical: p.magicalDamage };
    },
    enemiesInCircle: (center: Point2, radius: number) => this.enemiesInCircle(center, radius),
    enemyPosition: (id: string) => this.enemyPosition(id),
    petStrike: (source: string, targetId: string, baseDamage: number, type: PetDamageType) =>
      this.petStrike(source, targetId, baseDamage, type),
    petProjectile: (source, origin, targetId, spec, type) =>
      this.secondaryProjectile(source, origin, targetId, spec, this.usableType(type), [
        'pet',
        'secondary',
        this.usableType(type),
        'projectile',
      ]),
    petStatus: (source, targetId, effect, stacks) => {
      if (!this.host.core.getEntity(targetId).alive) return;
      // Listed pet effect only: applied as given (no player status modifiers, no procs).
      for (let i = 0; i < stacks; i++) {
        const result = this.host.statuses.apply({
          effectType: effect.effectType,
          rawDamagePerTick: effect.rawDamagePerTick,
          duration: effect.duration,
          probabilityPercent: 100,
          targetId,
          sourceId: this.host.playerId,
          originId: source,
        });
        this.host.recordStatus(result.events);
      }
    },
    healPlayer: (amount: number) => {
      if (!(amount > 0) || !this.host.core.getEntity(this.host.playerId).alive) return 0;
      const result = this.host.core.heal(this.host.playerId, amount);
      this.host.forwardCombat(result.events);
      return result.healed;
    },
    grantBarrier: (amount: number, duration: number) => this.grantBarrier(amount, duration),
    recordPet: (event: PetEvent) => this.host.recordPet?.(event),
  };
  /** A damage type with a usable (> 0) stat: the requested one, else the other. */
  private usableType(type: PetDamageType): PetDamageType {
    const p = this.host.core.getEntity(this.host.playerId);
    const stat = type === 'physical' ? p.physicalDamage : p.magicalDamage;
    return stat > 0 ? type : type === 'physical' ? 'magical' : 'physical';
  }
  /** Task 20: instant pet hit — exact base damage, no crit, `procs=false`, source `pet.<id>`. */
  private petStrike(
    source: string,
    targetId: string,
    baseDamage: number,
    requested: PetDamageType,
  ): boolean {
    const type = this.usableType(requested);
    const p = this.host.core.getEntity(this.host.playerId);
    const stat = type === 'physical' ? p.physicalDamage : p.magicalDamage;
    if (!(stat > 0) || !(baseDamage >= 0) || !this.host.core.getEntity(targetId).alive)
      return false;
    let landed = false;
    this.withSource(source, () => {
      const attack = this.host.core.createAttack({
        attackerId: this.host.playerId,
        damageType: type,
        coefficient: baseDamage / stat,
        noCritical: true,
      });
      this.tagAttack(attack.id, source);
      const hit = this.hit(targetId, attack, new Set<CombatTag>(['pet', 'secondary', type]), {
        procs: false,
      });
      landed = hit?.result.status === 'hit';
    });
    return landed;
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
      this.autos.set(definition.id, { readyAt: this.clock, activationCount: 0, cooldownTotal: 0 });
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
      // One shared slot (Task 09.1 C2): never stacks; a weaker barrier only extends the expiry.
      this.grantBarrier(amount, BONUS_TUNING.barrierDuration);
    } else {
      amount = BONUS_TUNING.gold;
      this.run.addGold(amount);
    }
    this.host.recordSkill([Object.freeze({ type: 'bonus-claimed', bonusId, amount })]);
  }

  // ───────────────────────────── stats and on-hit modifiers ─────────────────────────────
  /** Task 12: temporary run modifiers owned by the world (chest buffs). */
  private external: RunStatModifiers = NO_MODIFIERS;
  /**
   * Task 12 (additive): sets the world's temporary run modifiers (chest buffs) and recomposes the
   * stats; they join the same `composeRunStats` composition, so the central caps apply once.
   */
  setExternalModifiers(m: RunStatModifiers): void {
    this.external = Object.freeze({ ...m });
    this.refreshStats();
  }
  private modifiers(): RunStatModifiers {
    const m: Record<keyof RunStatModifiers, number> = {
      ...(this.host.talentModifiers ?? NO_MODIFIERS),
    };
    for (const [key, value] of Object.entries(this.external))
      m[key as keyof RunStatModifiers] += value;
    // Task 20: the active pet's aura (hedgehog resistance, wolf attack / movement speed).
    if (this.pet) {
      const a = this.pet.modifiers();
      m.resistance += a.resistance;
      m.attackSpeed += a.attackSpeed;
      m.movementSpeedPercent += a.movementSpeedPercent;
    }
    // Task 09.1: timed talent stat buffs (refresh, don't stack) join the same composition.
    for (const [stat, value] of Object.entries(this.talents.statBuffs()))
      m[stat as keyof RunStatModifiers] += value ?? 0;
    // Task 09.1: HP-conditional talent stats (e.g. Resistance while HP < 30%).
    for (const [stat, value] of Object.entries(this.talentCombat?.conditionalStats() ?? {}))
      m[stat as keyof RunStatModifiers] += value;
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
        m.physicalDamagePercent +=
          buff.stacks * this.params('battle_fury').damagePerStack +
          this.talentCombat.buffStackBonus(
            'battle_fury',
            buff.stacks,
            this.params('battle_fury').maxStacks,
          );
      else if (id === 'battle_momentum' || id === 'blood_frenzy') {
        // Task 15: Battle Momentum III stacks (value per stack) and adds move speed while active.
        m.attackSpeed += buff.value * (id === 'battle_momentum' ? buff.stacks : 1);
        if (buff.movementSpeedPercent) m.movementSpeedPercent += buff.movementSpeedPercent;
      }
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
  playerEffect(
    definition: EffectDefinition,
    origin?: Readonly<{ basic?: boolean }>,
  ): EffectDefinition {
    const base = modifyPlayerEffect(definition, this.rankOf);
    // Task 09.1: talent DoT factors (e.g. Bleed applied by daggers). Origin: the basic weapon or
    // the skill currently executing.
    const skillId = this.source?.startsWith('skill:') ? this.source.slice(6) : null;
    const dagger =
      (origin?.basic && BASIC_TAGS[this.host.characterClass].includes('dagger')) ||
      (!!skillId && getSkill(skillId).tags.includes('dagger'));
    const origin2 = { dagger, skillId };
    const factor = this.talentCombat.dotFactor(base.effectType, origin2);
    const duration = this.talentCombat.dotDuration(base.effectType, origin2);
    return factor === 1 && duration === 1
      ? base
      : Object.freeze({
          ...base,
          rawDamagePerTick: base.rawDamagePerTick * factor,
          duration: base.duration * duration,
        });
  }
  private readonly rankOf = (skillId: string) => this.rank(skillId);
  /** Target multiplier for every player hit: marks, focus bonus and per-enemy hit limits. Pure. */
  targetMultiplier(
    attack: AttackSnapshot,
    targetId: string,
    limit?: Readonly<{ key: string; max: number }>,
    tags?: ReadonlySet<CombatTag>,
    targets = this.targetCount,
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
    // Task 09.1: talent direct-hit / crit-damage bonuses (never on talent or secondary hits).
    multiplier *= this.talentCombat.hitMultiplier(attack, targetId, tags, targets);
    return multiplier;
  }
  damageModifier(context: DamageModifierContext): number {
    const payload = context.projectileId ? this.projectiles.get(context.projectileId) : undefined;
    const tags =
      context.weaponId === this.host.basicWeaponId
        ? new Set<CombatTag>(BASIC_TAGS[this.host.characterClass])
        : context.weaponId === OFFHAND_WEAPON.id
          ? new Set<CombatTag>(OFFHAND_TAGS)
          : payload?.tags;
    // G11: a piercing projectile loses `falloff` per target it already hit (1, 0.8, 0.64 …).
    const falloff = payload?.falloff ? (1 - payload.falloff) ** payload.hits : 1;
    return (
      this.targetMultiplier(
        context.attack,
        context.targetId,
        payload?.limit,
        tags,
        context.targetCount ?? 1,
      ) * falloff
    );
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
    // Task 09.1: a talent radius bonus for the executing skill's AoE (never synergy/talent areas).
    const tags = this.sourceSkillTags();
    const factor = tags ? this.talentCombat.skillAreaFactor(tags, this.source!.slice(6)) : 1;
    return scaleCircularAoeRadius(radius * factor, this.stats.areaSize);
  }
  private zoneDurationFactor(): number {
    const tags = this.sourceSkillTags();
    return tags ? this.talentCombat.zoneDurationFactor(tags) : 1;
  }
  /** Tags of the skill whose code is executing (null outside a skill). */
  private sourceSkillTags(): ReadonlySet<CombatTag> | null {
    if (!this.source?.startsWith('skill:')) return null;
    return new Set(getSkill(this.source.slice(6)).tags);
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
    const critBonus = criticalChanceBonus + this.talentCombat.critChance(tags);
    const attack = this.host.core.createAttack({
      attackerId: this.host.playerId,
      damageType,
      coefficient: coefficient * this.elementalMultiplier(tags),
      ...(critBonus > 0 ? { criticalChanceBonus: critBonus } : {}),
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
    options: { noCritical?: boolean } = {},
  ): HitInfo | null {
    if (!/^(warrior|mage|archer|rogue)\.b[1-3]\.n0[1-5]$/.test(nodeId))
      throw new RangeError(`Unknown talent source ${nodeId}.`);
    if (!Number.isFinite(coefficient) || coefficient < 0)
      throw new RangeError('Talent strike coefficient must be ≥ 0.');
    let hit: HitInfo | null = null;
    this.withSource(`talent:${nodeId}`, () => {
      const tags = new Set<CombatTag>(['talent', 'secondary', damageType, ...extraTags]);
      const attack = options.noCritical
        ? this.host.core.createAttack({
            attackerId: this.host.playerId,
            damageType,
            coefficient,
            noCritical: true,
          })
        : this.attack(new Set(), coefficient, damageType);
      if (options.noCritical) this.tagAttack(attack.id, `talent:${nodeId}`);
      hit = this.hit(targetId, attack, tags, { procs: false });
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
      stacks: new Map(
        this.host.statuses.getGroups(targetId).map((g) => [g.effectType, g.stacks.length]),
      ),
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
      damageMultiplier:
        this.targetMultiplier(attack, targetId, undefined, tags) * (options.multiplier ?? 1),
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
    // Task 09.1: sword hits for the off-hand rules (C4); the off-hand itself never procs.
    if (event.result.status === 'hit') {
      if (event.weaponId === OFFHAND_WEAPON.id) {
        this.talentCombat.onSwordHit('offhand', event.targetId);
        return;
      }
      if (basic && this.host.characterClass === 'warrior')
        this.talentCombat.onSwordHit('main', event.targetId);
    }
    if (!basic && !payload) return;
    const tags = basic ? new Set(BASIC_TAGS[this.host.characterClass]) : payload!.tags;
    // Task 09.1: basic-weapon hit reactions (e.g. Rogue superpower Poison/Burn procs).
    if (basic && event.result.status === 'hit') this.talentCombat.onBasicHit(event.targetId);
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
    // Task 09.1: direct-hit reactions (Archer focus/kill rules); secondary hits are ignored.
    if (hit.result.status === 'hit')
      this.talentCombat.onDirectHit({ targetId: hit.targetId, tags: hit.tags, killed });
    // Task 09.1: a critical direct hit of an executing skill (e.g. Mage Arcane Supremacy).
    if (
      hit.result.status === 'hit' &&
      hit.attack.critical &&
      hit.procs &&
      this.source?.startsWith('skill:')
    )
      this.talentCombat.onSkillCrit(this.source.slice(6), hit.tags);
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
    stacks?: ReadonlyMap<EffectType, number>,
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
      ...(stacks ? { stacks } : {}),
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
    // Task 15: death reactions that are not damage (Deadly Precision III bonus transfer).
    this.synergies.onDeath(targetId, pre);
    if (!cause.procs) return;
    this.talentCombat.onKill({ targetId, direct: cause.direct, tags: cause.tags });
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
    if (this.host.controlImmune?.(targetId)) return;
    const tags = this.sourceSkillTags();
    const bonus =
      (this.rank('elemental_mastery') > 0 ? this.params('elemental_mastery').slowBonus : 0) +
      (tags ? this.talentCombat.slowBonus(tags) : 0);
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
    if (this.host.controlImmune?.(targetId)) return false;
    const c = this.control(targetId);
    if (c.stunUntil > this.clock || c.stunImmuneUntil > this.clock) return false;
    const limits = this.host.controlLimits?.(targetId) ?? null;
    // Task 09.1: talent Stun bonus of the executing skill, inside the existing duration limit.
    const tags = this.sourceSkillTags();
    const d =
      Math.min(
        CONTROL_RULES.maxStunDuration,
        duration + (tags ? this.talentCombat.stunBonus(tags) : 0),
      ) * (limits ? Math.min(1, limits.stunScale) : 1);
    if (d <= 0) return false;
    c.stunStartedAt = this.clock;
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
  /**
   * Task 15 (Skull Crusher III «Concussion»): extend the target's current Stun by `seconds`, at most
   * once per Stun; the total never exceeds the Stun duration limit (× the target's stun scale) and
   * the immunity window moves with the new end. Returns the seconds added (0 = nothing changed).
   */
  extendStun(targetId: string, seconds: number): number {
    if (!(seconds > 0) || !this.host.core.getEntity(targetId).alive) return 0;
    const c = this.controls.get(targetId);
    if (!c || !(c.stunUntil > this.clock) || sameInstant(c.stunUntil, this.clock)) return 0;
    if (c.stunExtendedFor === c.stunStartedAt) return 0;
    const limits = this.host.controlLimits?.(targetId) ?? null;
    const maxTotal = CONTROL_RULES.maxStunDuration * (limits ? Math.min(1, limits.stunScale) : 1);
    const until = Math.min(c.stunStartedAt + maxTotal, c.stunUntil + seconds);
    const added = until - c.stunUntil;
    if (!(added > 0) || sameInstant(until, c.stunUntil)) return 0;
    c.stunExtendedFor = c.stunStartedAt;
    c.stunUntil = until;
    c.stunImmuneUntil += added;
    this.syncControl(targetId);
    this.host.recordSkill([
      Object.freeze({ type: 'control-applied', targetId, control: 'stun', until: c.stunUntil }),
    ]);
    return added;
  }
  private control(targetId: string): ControlState {
    let c = this.controls.get(targetId);
    if (!c) {
      c = {
        slow: 0,
        slowUntil: 0,
        stunUntil: 0,
        stunImmuneUntil: 0,
        stunStartedAt: 0,
        stunExtendedFor: -1,
        syncedAt: this.clock,
      };
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
  setBuff(
    id: string,
    stacks: number,
    value: number,
    expiresAt: number,
    extra: { readonly movementSpeedPercent?: number } = {},
  ): void {
    this.buffs.set(id, { stacks, value, expiresAt, ...extra });
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
      // Task 09.1: talent zone-duration bonus of the executing skill.
      expiresAt: this.clock + spec.duration * this.zoneDurationFactor(),
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
    // Task 09.1: talent automatic actions (ballista summon), same grid rule as automatic skills.
    if (includeAutos && this.host.core.getEntity(this.host.playerId).alive)
      for (const a of this.talentCombat.autoActions()) {
        order++;
        if (a.canAct()) consider(this.gridCeil(Math.max(this.clock, a.readyAt)), 0, order, a.run);
      }
    // Task 09.1: talent entity actions/expirations and talent buff expirations.
    for (const t of this.talents.scheduled()) consider(t.at, t.priority, 3e9 + t.order, t.run);
    // Task 20: the pet's timed action (fixed time; the target is chosen when it resolves).
    if (this.pet?.due != null) {
      const pet = this.pet;
      consider(pet.due!, 0, 4e9, () => pet.act());
    }
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
    // Task 09.1: talent cooldown reductions apply to the already CDR-scaled cooldown.
    const cooldown =
      scaleCooldown(p.cooldown, this.cooldownReduction()) *
      this.talentCombat.cooldownMultiplier(skillId);
    state.readyAt = before + cooldown;
    state.cooldownTotal = cooldown;
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
  /** CDR for a cooldown starting now: conditional talent CDR is composed with the stats (caps once). */
  private cooldownReduction(): number {
    const bonus = this.talentCombat.cooldownReductionBonus();
    if (!bonus) return this.stats.cooldownReduction;
    const m = this.modifiers();
    return composeRunStats(this.host.primary, {
      ...m,
      cooldownReduction: m.cooldownReduction + bonus,
    }).cooldownReduction;
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
    this.talents.prune();
    this.synergies.prune(living);
  }
  /** World calls this after finishing each boundary so death positions never accumulate. */
  endStep(): void {
    this.deaths.clear();
  }
  /** Expired-control bookkeeping that must not wait for a separate boundary. */
  snapshot(): SkillCombatSnapshot {
    const cooldowns: Record<string, number> = {};
    const cooldownTotals: Record<string, number> = {};
    for (const [id, s] of this.autos) {
      cooldowns[id] = Math.max(0, s.readyAt - this.clock);
      cooldownTotals[id] = s.cooldownTotal;
    }
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
      cooldownTotals: Object.freeze(cooldownTotals),
    });
  }
  /** Status types that matter for synergy snapshots. */
  static readonly DOT_TYPES = DOT_TYPES;
}
