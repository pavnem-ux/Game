import type { CharacterClass } from '../character-stats';
import { sameInstant } from '../simulation-boundary';
import type { EffectType } from '../status-effects';
import type { Point } from '../weapon-attacks';
import { getSkill } from './catalog';
import {
  SYNERGY_AWAKENING,
  SYNERGY_LEVEL_RULES,
  SYNERGY_TUNING,
  SYNERGY_TUNING_LEVEL_II,
} from './config';
import type { HitInfo, PreHit, SkillEngine } from './SkillEngine';
import type { CombatTag } from './types';

export type SynergyId =
  | 'thermal_shock'
  | 'wildfire'
  | 'shattered_ice'
  | 'skull_crusher'
  | 'battle_momentum'
  | 'seismic_impact'
  | 'toxic_barrage'
  | 'plague_chain'
  | 'deadly_precision'
  | 'blood_frenzy'
  | 'deep_wounds'
  | 'final_cut';
/** Two distinct skill IDs; order is presentation only (the workbook's «Skill 1» / «Skill 2»). */
export type SynergyPair = readonly [string, string];
const pairs = (list: readonly (readonly [string, string])[]): readonly SynergyPair[] =>
  Object.freeze(list.map((pair) => Object.freeze([pair[0], pair[1]] as const)));
export interface SynergyRule {
  readonly id: SynergyId;
  readonly name: string;
  readonly characterClass: CharacterClass;
  readonly trigger: 'hit' | 'kill';
  /**
   * Task 07.2 v2 unlock: an OR of explicit two-skill pairs. A pair counts once both distinct skill
   * IDs are acquired in this run (rank I+). Source: workbook sheet «Synergy pairs» (40 rows).
   */
  readonly unlockPairs: readonly SynergyPair[];
  readonly description: string;
  /** Player-facing combat condition (display only; the resolver below is authoritative). */
  readonly condition: string;
  /** Player-facing outcome (display only). */
  readonly effect: string;
}
/** Display/catalogue data. Conditions are evaluated from tags, statuses and events below. */
export const SYNERGY_RULES: readonly SynergyRule[] = Object.freeze([
  {
    id: 'thermal_shock',
    unlockPairs: pairs([
      ['fireball', 'frost_nova'],
      ['fireball', 'ice_shards'],
      ['flame_burst', 'blizzard'],
      ['inferno', 'frost_nova'],
    ]),
    name: 'Thermal Shock',
    characterClass: 'mage',
    trigger: 'hit',
    condition: 'A direct ice hit on an enemy that is burning (Burn).',
    effect: 'An extra magic explosion on the target.',
    description: 'A direct ice hit on a target with Burn — a magic explosion.',
  },
  {
    id: 'wildfire',
    unlockPairs: pairs([
      ['fireball', 'flame_burst'],
      ['fireball', 'inferno'],
      ['flame_burst', 'inferno'],
      ['inferno', 'elemental_mastery'],
    ]),
    name: 'Wildfire',
    characterClass: 'mage',
    trigger: 'kill',
    condition: 'An enemy dies while Burn is on it.',
    effect: 'Burn spreads to the nearest enemies.',
    description: 'The death of a target with Burn spreads Burn to its neighbours.',
  },
  {
    id: 'shattered_ice',
    unlockPairs: pairs([
      ['frost_nova', 'ice_shards'],
      ['frost_nova', 'blizzard'],
      ['ice_shards', 'blizzard'],
      ['blizzard', 'elemental_mastery'],
    ]),
    name: 'Shattered Ice',
    characterClass: 'mage',
    trigger: 'hit',
    condition: 'A direct ice hit on a slowed enemy (Slow).',
    effect: 'Bonus ice damage to the target.',
    description: 'A direct ice hit on a slowed target — bonus ice damage.',
  },
  {
    id: 'skull_crusher',
    unlockPairs: pairs([
      ['shield_bash', 'cleave'],
      ['shield_bash', 'whirlwind'],
      ['ground_slam', 'cleave'],
    ]),
    name: 'Skull Crusher',
    characterClass: 'warrior',
    trigger: 'hit',
    condition: 'A physical melee hit on a stunned enemy (Stun).',
    effect: 'Extra physical damage.',
    description: 'A physical melee hit on a stunned target — extra damage.',
  },
  {
    id: 'battle_momentum',
    unlockPairs: pairs([
      ['whirlwind', 'battle_fury'],
      ['cleave', 'battle_fury'],
      ['ground_slam', 'battle_fury'],
      ['war_cry', 'battle_fury'],
    ]),
    name: 'Battle Momentum',
    characterClass: 'warrior',
    trigger: 'kill',
    condition: 'Killing an enemy with a melee hit.',
    effect: 'A brief Attack speed bonus.',
    description: 'A melee kill — a brief Attack speed bonus.',
  },
  {
    id: 'seismic_impact',
    unlockPairs: pairs([
      ['ground_slam', 'earthquake'],
      ['shield_bash', 'earthquake'],
      ['ground_slam', 'shield_bash'],
    ]),
    name: 'Seismic Impact',
    characterClass: 'warrior',
    trigger: 'hit',
    condition: 'A heavy melee hit on an already stunned enemy.',
    effect: 'A shockwave around the target.',
    description: 'A heavy hit on a stunned target — a shockwave.',
  },
  {
    id: 'toxic_barrage',
    unlockPairs: pairs([
      ['toxic_volley', 'multishot'],
      ['toxic_volley', 'split_shot'],
      ['poison_trap', 'split_shot'],
    ]),
    name: 'Toxic Barrage',
    characterClass: 'archer',
    trigger: 'hit',
    condition: 'Several different projectiles hit a poisoned enemy (Poison) within a short time.',
    effect: 'A toxic explosion and extra Poison.',
    description:
      'Several different projectiles on a poisoned target within a short time — a toxic explosion.',
  },
  {
    id: 'plague_chain',
    unlockPairs: pairs([
      ['toxic_volley', 'poison_trap'],
      ['toxic_volley', 'split_shot'],
      ['poison_trap', 'arrow_rain'],
    ]),
    name: 'Plague Chain',
    characterClass: 'archer',
    trigger: 'kill',
    condition: 'An enemy dies while poisoned (Poison).',
    effect: 'Poison spreads to the nearest enemies.',
    description: 'The death of a poisoned target spreads Poison.',
  },
  {
    id: 'deadly_precision',
    unlockPairs: pairs([
      ['piercing_arrow', 'hunters_mark'],
      ['split_shot', 'hunters_mark'],
      ['toxic_volley', 'hunters_mark'],
    ]),
    name: 'Deadly Precision',
    characterClass: 'archer',
    trigger: 'hit',
    condition: 'A streak of direct hits in a row on one poisoned enemy.',
    effect: 'A temporary damage bonus against that target.',
    description: 'A streak of direct hits on one poisoned target — a damage bonus against it.',
  },
  {
    id: 'blood_frenzy',
    unlockPairs: pairs([
      ['lacerate', 'blade_flurry'],
      ['blood_blades', 'blade_flurry'],
      ['fan_of_knives', 'serrated_blades'],
    ]),
    name: 'Blood Frenzy',
    characterClass: 'rogue',
    trigger: 'hit',
    condition: 'A dagger hit on a bleeding enemy (Bleed).',
    effect: 'A brief Attack speed bonus.',
    description: 'A dagger hit on a bleeding target — an Attack speed bonus.',
  },
  {
    id: 'deep_wounds',
    unlockPairs: pairs([
      ['blood_blades', 'serrated_blades'],
      ['lacerate', 'serrated_blades'],
      ['blood_blades', 'blade_flurry'],
    ]),
    name: 'Deep Wounds',
    characterClass: 'rogue',
    trigger: 'hit',
    condition: 'A critical hit on a bleeding enemy.',
    effect: 'An extra Bleed stack.',
    description: 'A crit on a bleeding target — an extra Bleed stack.',
  },
  {
    id: 'final_cut',
    unlockPairs: pairs([
      ['lacerate', 'death_mark'],
      ['blood_blades', 'death_mark'],
      ['blade_flurry', 'death_mark'],
    ]),
    name: 'Final Cut',
    characterClass: 'rogue',
    trigger: 'hit',
    condition: 'A hit on a bleeding enemy with low health.',
    effect: 'Finishing damage.',
    description: 'A hit on a bleeding target with low HP — finishing damage.',
  },
] satisfies SynergyRule[]);

const RULES_BY_ID = new Map(SYNERGY_RULES.map((rule) => [rule.id, rule]));

/** True once both skills of the pair are acquired (any rank ≥ I; upgrades never remove ownership). */
export function pairComplete(pair: SynergyPair, owned: ReadonlySet<string>): boolean {
  return owned.has(pair[0]) && owned.has(pair[1]);
}
/** Completed unlock pairs of a rule for the acquired skill IDs, in workbook order. */
export function completedPairs(
  rule: Pick<SynergyRule, 'unlockPairs'>,
  ownedIds: Iterable<string>,
): readonly SynergyPair[] {
  const owned = ownedIds instanceof Set ? (ownedIds as ReadonlySet<string>) : new Set(ownedIds);
  return rule.unlockPairs.filter((pair) => pairComplete(pair, owned));
}
/**
 * The single unlock check, shared by combat (SynergyResolver), the Skills overview, level-up card
 * hints and QA diagnostics: at least one allowed pair is fully acquired.
 */
export function synergyUnlocked(
  rule: Pick<SynergyRule, 'unlockPairs'>,
  ownedIds: Iterable<string>,
): boolean {
  return completedPairs(rule, ownedIds).length > 0;
}

/** Task 15 synergy level: 0 locked, 1 (I), 2 (II), 3 (III «Awakening»). */
export type SynergyLevel = 0 | 1 | 2 | 3;
/** Level of one pair from its weakest skill rank (0 when a skill is missing). */
export function pairLevel(pair: SynergyPair, ranks: ReadonlyMap<string, number>): SynergyLevel {
  const weakest = Math.min(ranks.get(pair[0]) ?? 0, ranks.get(pair[1]) ?? 0);
  if (weakest >= SYNERGY_LEVEL_RULES.levelThreeRank) return 3;
  if (weakest >= SYNERGY_LEVEL_RULES.levelTwoRank) return 2;
  return weakest >= 1 ? 1 : 0;
}
/**
 * Task 15: the synergy's best completed pair (highest pair level; ties keep workbook order) and its
 * level. Pure: depends only on the run's skill ranks — talents never unlock or raise a level.
 */
export function bestSynergyPair(
  rule: Pick<SynergyRule, 'unlockPairs'>,
  ranks: ReadonlyMap<string, number>,
): { readonly level: SynergyLevel; readonly pair: SynergyPair | null } {
  let level: SynergyLevel = 0;
  let pair: SynergyPair | null = null;
  for (const p of rule.unlockPairs) {
    const l = pairLevel(p, ranks);
    if (l > level) {
      level = l;
      pair = p;
    }
  }
  return Object.freeze({ level, pair });
}
export function synergyLevel(
  rule: Pick<SynergyRule, 'unlockPairs'>,
  ranks: ReadonlyMap<string, number>,
): SynergyLevel {
  return bestSynergyPair(rule, ranks).level;
}

/**
 * Startup validation of the pair configuration: exactly 12 rules, 3 per class; every pair has two
 * distinct existing skills legal for that class (class skill or universal), at least one active;
 * no duplicate order-insensitive pair inside a rule; every rule has a pair. Throws on violation.
 */
export function validateSynergyRules(
  rules: readonly Pick<SynergyRule, 'id' | 'characterClass' | 'unlockPairs'>[],
  lookup: (skillId: string) => { readonly owner: string; readonly kind: 'auto' | 'passive' },
): void {
  if (rules.length !== 12) throw new Error(`Expected 12 synergies, found ${rules.length}.`);
  const ids = new Set(rules.map((rule) => rule.id));
  if (ids.size !== rules.length) throw new Error('Duplicate synergy ID.');
  const perClass = new Map<string, number>();
  for (const rule of rules) {
    perClass.set(rule.characterClass, (perClass.get(rule.characterClass) ?? 0) + 1);
    if (rule.unlockPairs.length === 0) throw new Error(`Synergy ${rule.id} has no unlock pair.`);
    const seen = new Set<string>();
    for (const pair of rule.unlockPairs) {
      if (pair.length !== 2 || pair[0] === pair[1])
        throw new Error(`Synergy ${rule.id} needs two distinct skills per pair.`);
      const kinds = pair.map((skillId) => {
        const skill = lookup(skillId);
        if (skill.owner !== rule.characterClass && skill.owner !== 'universal')
          throw new Error(`Skill ${skillId} is not available to ${rule.characterClass}.`);
        return skill.kind;
      });
      if (!kinds.includes('auto'))
        throw new Error(`Synergy ${rule.id} pair ${pair.join('+')} has no active skill.`);
      const key = [...pair].sort().join('+');
      if (seen.has(key)) throw new Error(`Synergy ${rule.id} repeats pair ${key}.`);
      seen.add(key);
    }
  }
  for (const [cls, n] of perClass)
    if (n !== 3) throw new Error(`Class ${cls} must have exactly 3 synergies, found ${n}.`);
}
validateSynergyRules(SYNERGY_RULES, getSkill);

const SYNERGY_TAGS: ReadonlySet<CombatTag> = new Set(['synergy', 'secondary']);
/** Task 15: the Blood Feast heal limiter's cooldown key (not an enemy id). */
const HEAL_KEY = '@heal';

/**
 * Event-driven synergy rules. Each rule fires at most once per originating hit/kill; proc damage is
 * tagged `synergy` with procs=false, so it can never trigger another synergy (no cascades).
 */
export class SynergyResolver {
  private readonly cooldowns = new Map<string, number>();
  private readonly barrage = new Map<string, { since: number; keys: Set<string> }>();
  private focus: {
    targetId: string;
    since: number;
    hits: number;
    bonusUntil: number;
    /** Task 15 (Deadly Precision III): transfers used by the current activation. */
    transfers: number;
  } | null = null;
  constructor(private readonly e: SkillEngine) {}
  private get cls() {
    return this.e.host.characterClass;
  }
  private unlockedCache: { version: number; ids: ReadonlySet<SynergyId> } | null = null;
  /**
   * Unlocked rules of the current class. Ownership only grows within a run (choices are permanent),
   * so the owned-skill count is a sufficient cache version.
   */
  unlockedIds(): ReadonlySet<SynergyId> {
    const owned = this.e.run.ownedIds();
    if (this.unlockedCache?.version === owned.length) return this.unlockedCache.ids;
    const set = new Set(owned);
    const ids = new Set(
      SYNERGY_RULES.filter(
        (rule) => rule.characterClass === this.cls && synergyUnlocked(rule, set),
      ).map((rule) => rule.id),
    );
    this.unlockedCache = { version: owned.length, ids };
    return ids;
  }
  private levelCache: { version: number; levels: ReadonlyMap<SynergyId, SynergyLevel> } | null =
    null;
  /**
   * Task 15: levels of the current class's synergies (0 = locked). Ranks only rise within a run,
   * so the rank total is a sufficient cache version; a new run has a new resolver (levels reset).
   */
  levels(): ReadonlyMap<SynergyId, SynergyLevel> {
    const version = this.e.run.rankTotal();
    if (this.levelCache?.version === version) return this.levelCache.levels;
    const ranks = this.e.run.rankMap();
    const levels = new Map<SynergyId, SynergyLevel>();
    for (const rule of SYNERGY_RULES)
      if (rule.characterClass === this.cls) levels.set(rule.id, synergyLevel(rule, ranks));
    this.levelCache = { version, levels };
    return levels;
  }
  private readonly levelOverrides = new Map<SynergyId, SynergyLevel>();
  /**
   * Task 15 QA/tests: force a synergy's level (0 locks it, 1–3 open it at that level); null returns
   * to the level from the run's ranks. Only the DEV/QA controller and tests call it.
   */
  setLevelOverride(id: SynergyId, level: SynergyLevel | null): void {
    const rule = SYNERGY_RULES.find((r) => r.id === id);
    if (!rule) throw new RangeError(`Unknown synergy: ${String(id)}.`);
    if (rule.characterClass !== this.cls)
      throw new RangeError(`Synergy ${id} belongs to another class.`);
    if (level === null) this.levelOverrides.delete(id);
    else if (level === 0 || level === 1 || level === 2 || level === 3)
      this.levelOverrides.set(id, level);
    else throw new RangeError('Synergy level must be 0–3.');
  }
  /** Current level of one synergy (read at trigger time). */
  level(id: SynergyId): SynergyLevel {
    return this.levelOverrides.get(id) ?? this.levels().get(id) ?? 0;
  }
  /** True while a QA override decides this synergy's level. */
  hasLevelOverride(id: SynergyId): boolean {
    return this.levelOverrides.has(id);
  }
  /** Tuning for the synergy's current level: II and III use the ×1.5 main number. */
  private tuning(id: SynergyId): typeof SYNERGY_TUNING {
    return this.level(id) >= 2 ? SYNERGY_TUNING_LEVEL_II : SYNERGY_TUNING;
  }
  /** Pure ownership/class check shared with read-only QA diagnostics. */
  isEligible(id: SynergyId): boolean {
    const forced = this.levelOverrides.get(id);
    if (forced !== undefined) return forced > 0;
    return this.unlockedIds().has(id);
  }
  private now() {
    return this.e.time;
  }
  private ready(id: SynergyId, targetId: string) {
    const at = this.cooldowns.get(`${id}:${targetId}`);
    return at === undefined || at <= this.now() || sameInstant(at, this.now());
  }
  private cool(id: SynergyId, targetId: string, seconds: number) {
    this.cooldowns.set(`${id}:${targetId}`, this.now() + seconds);
  }
  private announce(id: SynergyId, targetId: string, position: Point | null, awakened = false) {
    this.e.setSource(`synergy:${id}`);
    const level = this.level(id);
    this.e.host.recordSkill([
      Object.freeze({
        type: 'synergy-triggered',
        synergyId: id,
        targetId,
        position: Object.freeze({ ...(position ?? this.e.player) }),
        ...(level > 0 ? { level: level as 1 | 2 | 3 } : {}),
        ...(awakened ? { awakened: true } : {}),
      }),
    ]);
  }
  private awake(id: SynergyId) {
    return this.level(id) >= 3;
  }
  /**
   * Task 15 awakened explosion: one shared attack snapshot, at most one hit per living enemy in the
   * circle, secondary (procs=false) so it never triggers synergies or talent procs. Returns the
   * enemies hit (alive or killed by it).
   */
  private burst(
    id: SynergyId,
    center: Point,
    radius: number,
    coefficient: number,
    damageType: 'physical' | 'magical',
    extra: CombatTag[] = [],
  ): string[] {
    const r = this.e.area(radius);
    const attack = this.e.attack(new Set(), coefficient, damageType);
    const tags = new Set<CombatTag>([...SYNERGY_TAGS, damageType, 'area', ...extra]);
    const hit: string[] = [];
    for (const target of this.e.inCircle(center, r))
      if (this.e.hit(target, attack, tags, { procs: false })) hit.push(target);
    this.e.recordArea(id, 'circle', center, r, hit.length);
    return hit;
  }
  /** Living enemies within `radius` of `center` (excluding `exclude`), nearest first, ties by id. */
  private nearestAround(center: Point, radius: number, exclude: string, max: number) {
    return this.e
      .inCircle(center, radius)
      .filter((x) => x !== exclude)
      .map((x) => ({
        x,
        d: Math.hypot(this.e.body(x)!.x - center.x, this.e.body(x)!.y - center.y),
      }))
      .sort((a, b) => a.d - b.d || (a.x < b.x ? -1 : 1))
      .slice(0, max)
      .map((e) => e.x);
  }
  private defaultSlow(targetId: string) {
    const s = SYNERGY_AWAKENING.defaultSlow;
    this.e.slow(targetId, s.strength, s.duration);
  }
  private procDamage(
    id: SynergyId,
    targetId: string,
    coefficient: number,
    damageType: 'physical' | 'magical',
    extra: CombatTag[] = [],
  ) {
    const tags = new Set<CombatTag>([...SYNERGY_TAGS, damageType, ...extra]);
    return this.e.hit(targetId, this.e.attack(new Set(), coefficient, damageType), tags, {
      procs: false,
    });
  }
  private spread(
    id: SynergyId,
    center: Point,
    exclude: string,
    effectType: EffectType,
    damage: number,
    duration: number,
    radius: number,
    max: number,
    stacks = 1,
  ) {
    const ids = this.nearestAround(center, radius, exclude, max);
    // originId marks synergy-applied stacks: kills from them never re-trigger spread rules.
    for (const x of ids)
      this.e.applyStatus(
        x,
        { effectType, rawDamagePerTick: damage, duration, probabilityPercent: 100 },
        stacks,
        `synergy:${id}`,
      );
    return ids.length;
  }
  /** Damage multiplier against the current Deadly Precision focus target. Pure. */
  focusMultiplier(targetId: string): number {
    const f = this.focus;
    if (this.cls !== 'archer' || !f || f.targetId !== targetId) return 1;
    return f.bonusUntil > this.now() || sameInstant(f.bonusUntil, this.now())
      ? 1 + this.tuning('deadly_precision').deadlyPrecision.bonusPercent / 100
      : 1;
  }
  onHit(hit: HitInfo): void {
    if (!hit.procs || hit.tags.has('synergy')) return;
    // Task 08.5: damage created after a synergy announces itself is attributed to it.
    const source = this.e.currentSource();
    try {
      this.resolveHit(hit);
    } finally {
      this.e.setSource(source);
    }
  }
  private resolveHit(hit: HitInfo): void {
    const { pre, targetId, tags } = hit;
    const alive = () => this.e.host.core.getEntity(targetId).alive;
    const A = SYNERGY_AWAKENING;
    switch (this.cls) {
      case 'mage':
        if (
          this.isEligible('thermal_shock') &&
          tags.has('ice') &&
          pre.effects.has('burn') &&
          this.ready('thermal_shock', targetId) &&
          alive()
        ) {
          const t = this.tuning('thermal_shock').thermalShock;
          const awake = this.awake('thermal_shock') && !!pre.position;
          this.cool('thermal_shock', targetId, t.cooldown);
          this.announce('thermal_shock', targetId, pre.position, awake);
          // III «Steam Blast»: the explosion hits every enemy around the target once.
          if (awake)
            this.burst(
              'thermal_shock',
              pre.position!,
              A.thermalShock.radius,
              t.coefficient,
              'magical',
              ['fire', 'ice'],
            );
          else
            this.procDamage('thermal_shock', targetId, t.coefficient, 'magical', ['fire', 'ice']);
        }
        if (
          this.isEligible('shattered_ice') &&
          tags.has('ice') &&
          pre.slowed &&
          this.ready('shattered_ice', targetId) &&
          alive()
        ) {
          const t = this.tuning('shattered_ice').shatteredIce;
          const awake = this.awake('shattered_ice') && !!pre.position;
          this.cool('shattered_ice', targetId, t.cooldown);
          this.announce('shattered_ice', targetId, pre.position, awake);
          this.procDamage('shattered_ice', targetId, t.coefficient, 'magical', ['ice']);
          // III «Ice Shrapnel»: shards into the nearest other enemies (ice damage + Slow).
          if (awake) {
            const shards = this.nearestAround(
              pre.position!,
              this.e.area(A.shatteredIce.radius),
              targetId,
              A.shatteredIce.shards,
            );
            for (const id of shards) {
              this.procDamage('shattered_ice', id, A.shatteredIce.coefficient, 'magical', ['ice']);
              this.defaultSlow(id);
            }
          }
        }
        break;
      case 'warrior': {
        const physicalMelee = tags.has('physical') && tags.has('melee');
        if (
          this.isEligible('skull_crusher') &&
          physicalMelee &&
          pre.stunned &&
          this.ready('skull_crusher', targetId) &&
          alive()
        ) {
          const t = this.tuning('skull_crusher').skullCrusher;
          const awake = this.awake('skull_crusher');
          this.cool('skull_crusher', targetId, t.cooldown);
          this.announce('skull_crusher', targetId, pre.position, awake);
          this.procDamage('skull_crusher', targetId, t.coefficient, 'physical');
          // III «Concussion»: extend the current Stun once per Stun, within the limits.
          if (awake && alive()) this.e.extendStun(targetId, A.skullCrusher.stunExtension);
        }
        if (
          this.isEligible('seismic_impact') &&
          tags.has('heavy_melee') &&
          pre.stunned &&
          this.ready('seismic_impact', targetId) &&
          pre.position
        ) {
          const t = this.tuning('seismic_impact').seismicImpact;
          const awake = this.awake('seismic_impact');
          this.cool('seismic_impact', targetId, t.cooldown);
          this.announce('seismic_impact', targetId, pre.position, awake);
          this.burst('seismic_impact', pre.position, t.radius, t.coefficient, 'physical');
          // III «Rift»: a rift ticking physical damage + default Slow (a zone of the engine).
          if (awake) this.rift(pre.position);
        }
        break;
      }
      case 'archer': {
        if (!pre.effects.has('poison')) {
          if (this.focus?.targetId === targetId) this.focus.hits = 0;
          break;
        }
        // Toxic Barrage: distinct projectiles on one poisoned target inside a short window.
        const tb = this.tuning('toxic_barrage').toxicBarrage;
        if (
          this.isEligible('toxic_barrage') &&
          tags.has('projectile') &&
          hit.projectileKey &&
          this.ready('toxic_barrage', targetId)
        ) {
          let b = this.barrage.get(targetId);
          if (!b || this.now() - b.since > tb.window) {
            b = { since: this.now(), keys: new Set() };
            this.barrage.set(targetId, b);
          }
          b.keys.add(hit.projectileKey);
          if (b.keys.size >= tb.projectiles && alive()) {
            this.barrage.delete(targetId);
            const awake = this.awake('toxic_barrage') && !!pre.position;
            this.cool('toxic_barrage', targetId, tb.cooldown);
            this.announce('toxic_barrage', targetId, pre.position, awake);
            const poison = (id: string, stacks: number) =>
              this.e.applyStatus(
                id,
                {
                  effectType: 'poison',
                  rawDamagePerTick: tb.poisonDamage,
                  duration: tb.poisonDuration,
                  probabilityPercent: 100,
                },
                stacks,
                'synergy:toxic_barrage',
              );
            if (awake) {
              // III «Plague Downpour»: explosion around the target; 2 Poison stacks on each enemy hit.
              const hitIds = this.burst(
                'toxic_barrage',
                pre.position!,
                A.toxicBarrage.radius,
                tb.coefficient,
                'physical',
              );
              for (const id of hitIds) poison(id, A.toxicBarrage.poisonStacks);
            } else {
              const proc = this.procDamage('toxic_barrage', targetId, tb.coefficient, 'physical');
              if (proc && alive()) poison(targetId, 1);
            }
          }
        }
        // Deadly Precision: repeated direct hits on the same poisoned target; resets on change/expiry.
        if (this.isEligible('deadly_precision')) {
          const dp = this.tuning('deadly_precision').deadlyPrecision;
          const f = this.focus;
          if (!f || f.targetId !== targetId || this.now() - f.since > dp.window)
            this.focus = {
              targetId,
              since: this.now(),
              hits: 1,
              bonusUntil: f?.targetId === targetId ? f.bonusUntil : 0,
              transfers: f?.targetId === targetId ? f.transfers : 0,
            };
          else f.hits++;
          const focus = this.focus!;
          if (focus.hits >= dp.hits) {
            const fresh = !(focus.bonusUntil > this.now());
            focus.bonusUntil = this.now() + dp.duration;
            focus.hits = 0;
            focus.since = this.now();
            // A new activation (3 hits) starts a fresh transfer budget for III.
            focus.transfers = 0;
            if (fresh) this.announce('deadly_precision', targetId, pre.position);
          }
        }
        break;
      }
      case 'rogue': {
        if (!pre.effects.has('bleed')) break;
        if (this.isEligible('blood_frenzy') && tags.has('dagger')) {
          const t = this.tuning('blood_frenzy').bloodFrenzy;
          const current = this.e.buff('blood_frenzy');
          if (!current) this.announce('blood_frenzy', targetId, pre.position);
          // Refresh duration, never stack: the global Attack Speed cap still applies.
          this.e.setBuff('blood_frenzy', 1, t.attackSpeed, this.now() + t.duration);
          // III «Blood Feast»: heal through Combat Core (never revives), once per interval.
          if (this.awake('blood_frenzy') && this.ready('blood_frenzy', HEAL_KEY)) {
            this.cool('blood_frenzy', HEAL_KEY, A.bloodFrenzy.interval);
            const player = this.e.host.core.getEntity(this.e.host.playerId);
            this.e.healPlayer((player.maxHp * A.bloodFrenzy.healPercent) / 100);
          }
        }
        if (
          this.isEligible('deep_wounds') &&
          hit.attack.critical &&
          this.ready('deep_wounds', targetId) &&
          alive()
        ) {
          const t = this.tuning('deep_wounds').deepWounds;
          const awake = this.awake('deep_wounds');
          this.cool('deep_wounds', targetId, t.cooldown);
          this.announce('deep_wounds', targetId, pre.position, awake);
          // III «Lacerations»: 2 stacks; a new stack refreshes the group duration (Status rules).
          this.e.applyStatus(
            targetId,
            {
              effectType: 'bleed',
              rawDamagePerTick: t.bleedDamage,
              duration: t.bleedDuration,
              probabilityPercent: 100,
            },
            awake ? A.deepWounds.stacks : 1,
            'synergy:deep_wounds',
          );
        }
        if (this.isEligible('final_cut') && alive()) {
          const t = this.tuning('final_cut').finalCut;
          const awake = this.awake('final_cut');
          const threshold = awake ? A.finalCut.hpThresholdPercent : t.hpThresholdPercent;
          const target = this.e.host.core.getEntity(targetId);
          if (
            (target.currentHp / target.maxHp) * 100 < threshold &&
            this.ready('final_cut', targetId)
          ) {
            this.cool('final_cut', targetId, t.cooldown);
            this.announce('final_cut', targetId, pre.position, awake);
            this.procDamage('final_cut', targetId, t.coefficient, 'physical');
            // III «Execution»: a lethal execution explodes around the target.
            if (awake && !alive() && pre.position) {
              const f = A.finalCut;
              const hitIds = this.burst(
                'final_cut',
                pre.position,
                f.radius,
                f.coefficient,
                'physical',
              );
              for (const id of hitIds)
                this.e.applyStatus(
                  id,
                  {
                    effectType: 'bleed',
                    rawDamagePerTick: f.bleedDamage,
                    duration: f.bleedDuration,
                    probabilityPercent: 100,
                  },
                  1,
                  'synergy:final_cut',
                );
            }
          }
        }
        break;
      }
    }
  }
  /** Seismic Impact III «Rift»: engine zone (scheduled by GameplayWorld through the engine). */
  private rift(center: Point) {
    const r = SYNERGY_AWAKENING.seismicImpact;
    const radius = this.e.area(r.radius);
    this.e.zone({
      key: 'synergy:seismic_impact#rift',
      center: Object.freeze({ ...center }),
      radius,
      duration: r.duration,
      tickInterval: r.tickInterval,
      onTick: (zone, e) => {
        const attack = e.attack(new Set(), r.coefficient, 'physical');
        const tags = new Set<CombatTag>([...SYNERGY_TAGS, 'physical', 'area']);
        let n = 0;
        for (const id of e.inCircle(zone.center, zone.radius))
          if (e.hit(id, attack, tags, { procs: false })) {
            n++;
            if (e.host.core.getEntity(id).alive) this.defaultSlow(id);
          }
        e.recordArea('seismic_impact', 'circle', zone.center, zone.radius, n);
      },
    });
  }
  /**
   * Task 15: death reactions that deal no damage, for any death of a tracked target (also by
   * secondary damage). Deadly Precision III «Hunter's Instinct» moves an active bonus to the
   * nearest poisoned enemy with full duration, at most 3 times per activation.
   */
  onDeath(targetId: string, pre: PreHit): void {
    const f = this.focus;
    if (this.cls !== 'archer' || !f || f.targetId !== targetId) return;
    const active = f.bonusUntil > this.now() || sameInstant(f.bonusUntil, this.now());
    const A = SYNERGY_AWAKENING.deadlyPrecision;
    if (
      !active ||
      !this.isEligible('deadly_precision') ||
      !this.awake('deadly_precision') ||
      f.transfers >= A.maxTransfers ||
      !pre.position
    )
      return;
    const next = this.nearestAround(pre.position, A.radius, targetId, Infinity).find((id) =>
      this.e.hasEffect(id, 'poison'),
    );
    if (!next) return;
    const dp = this.tuning('deadly_precision').deadlyPrecision;
    this.focus = {
      targetId: next,
      since: this.now(),
      hits: 0,
      bonusUntil: this.now() + dp.duration,
      transfers: f.transfers + 1,
    };
    const source = this.e.currentSource();
    try {
      this.announce('deadly_precision', next, this.e.lastPosition(next), true);
    } finally {
      this.e.setSource(source);
    }
  }
  onKill(
    targetId: string,
    pre: PreHit,
    cause: { direct: boolean; tags: ReadonlySet<CombatTag>; procs: boolean },
  ): void {
    if (!cause.procs || cause.tags.has('synergy')) return;
    const source = this.e.currentSource();
    try {
      this.resolveKill(targetId, pre, cause);
    } finally {
      this.e.setSource(source);
    }
  }
  private resolveKill(
    targetId: string,
    pre: PreHit,
    cause: { direct: boolean; tags: ReadonlySet<CombatTag>; procs: boolean },
  ): void {
    const A = SYNERGY_AWAKENING;
    if (this.isEligible('wildfire') && pre.effects.has('burn') && pre.position) {
      const t = this.tuning('wildfire').wildfire;
      const awake = this.awake('wildfire');
      // Task 09.1: talents naming Wildfire may widen the spread (radius, neighbours); no cascade.
      const geometry = this.e.talentCombat.synergySpread('wildfire', {
        radius: t.radius,
        maxTargets: t.maxTargets,
      });
      // III «Firestorm»: 5 neighbours + the talent's extra neighbours, total cap 7 (the cap
      // replaces the talent's own 4/5 limit); 2 Burn stacks each.
      const targets = awake
        ? Math.min(
            A.wildfire.totalCap,
            A.wildfire.maxTargets + Math.max(0, geometry.maxTargets - t.maxTargets),
          )
        : geometry.maxTargets;
      const n = this.spread(
        'wildfire',
        pre.position,
        targetId,
        'burn',
        t.burnDamage,
        t.burnDuration,
        this.e.area(geometry.radius),
        targets,
        awake ? A.wildfire.stacks : 1,
      );
      if (n) this.announce('wildfire', targetId, pre.position, awake);
    }
    if (this.isEligible('plague_chain') && pre.effects.has('poison') && pre.position) {
      const t = this.tuning('plague_chain').plagueChain;
      const awake = this.awake('plague_chain');
      // III «Pestilence»: 5 neighbours, each half the dead target's Poison stacks (ceil, 1–5).
      const dead = pre.stacks?.get('poison') ?? 1;
      const stacks = awake
        ? Math.min(A.plagueChain.maxStacks, Math.max(A.plagueChain.minStacks, Math.ceil(dead / 2)))
        : 1;
      const n = this.spread(
        'plague_chain',
        pre.position,
        targetId,
        'poison',
        t.poisonDamage,
        t.poisonDuration,
        this.e.area(t.radius),
        awake ? A.plagueChain.maxTargets : t.maxTargets,
        stacks,
      );
      if (n) this.announce('plague_chain', targetId, pre.position, awake);
    }
    if (this.isEligible('battle_momentum') && cause.direct && cause.tags.has('melee')) {
      const t = this.tuning('battle_momentum').battleMomentum;
      const awake = this.awake('battle_momentum');
      const current = this.e.buff('battle_momentum');
      if (!current) this.announce('battle_momentum', targetId, pre.position, awake);
      // III «Unstoppable»: +1 stack per melee kill (max 3, duration refreshed) and +10% move speed.
      const stacks = awake ? Math.min(A.battleMomentum.maxStacks, (current?.stacks ?? 0) + 1) : 1;
      this.e.setBuff(
        'battle_momentum',
        stacks,
        t.attackSpeed,
        this.now() + t.duration,
        awake ? { movementSpeedPercent: A.battleMomentum.movementSpeedPercent } : {},
      );
    }
    if (this.focus?.targetId === targetId) this.focus = null;
  }
  prune(living: ReadonlySet<string>): void {
    for (const key of [...this.cooldowns.keys()]) {
      const target = key.slice(key.indexOf(':') + 1);
      if (!living.has(target) && this.cooldowns.get(key)! < this.now()) this.cooldowns.delete(key);
    }
    for (const id of [...this.barrage.keys()]) if (!living.has(id)) this.barrage.delete(id);
    if (this.focus && !living.has(this.focus.targetId)) this.focus = null;
  }
}
