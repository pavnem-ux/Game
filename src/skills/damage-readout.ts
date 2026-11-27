import {
  COMBAT_ATTRIBUTE_CAPS,
  calculateCriticalDamage,
  scaleCircularAoeRadius,
  scaleCooldown,
} from '../character-stats';
import type { CombatAttributes } from '../character-stats';
import { calculateSuccessfulDamage } from '../combat-core';
import type { DamageType } from '../combat-core';
import { STATUS_RULES } from '../status-effects';
import type { EffectType } from '../status-effects';
import { getSkill } from './catalog';
import { elementalDamageMultiplier, modifyPlayerEffect } from './modifiers';
import type { RankLookup } from './modifiers';
import type { CombatTag, SkillParams } from './types';

/**
 * Task 07.2 v2 damage transparency: a read-only, current-character readout of what a skill rank
 * does. It reuses the authoritative pieces of the combat pipeline instead of a second formula:
 * - attack stat × coefficient (Combat Core `createAttackSnapshot`), with Elemental Mastery via the
 *   same `elementalDamageMultiplier` the SkillEngine applies to attack coefficients;
 * - crit via `calculateCriticalDamage` and the central Crit Chance cap;
 * - Resistance via Combat Core `calculateSuccessfulDamage` (MAX(1, ROUND(raw·100/(100+RES))), 0 → 0);
 * - DoT per stack via `modifyPlayerEffect` (Toxic Mastery, Lingering Effects, Elemental Mastery).
 * Numbers are examples against one target with the given Resistance; target counts, hit chance,
 * marks and crits are variable and are never folded into a guaranteed total.
 */
export interface DamageContext {
  /** Finalized run attributes (snapshot `stats`: permanent stats + passives + buffs, caps applied). */
  readonly stats: CombatAttributes;
  /** Acquired ranks in this run (0 = not acquired). */
  readonly rankOf: RankLookup;
  /** Example target Resistance (alpha enemies use the provisional config value). */
  readonly targetResistance: number;
  /** Basic weapon coefficient, used by passives that copy basic attacks (Multishot). */
  readonly weaponCoefficient?: number;
}
export interface HitAmount {
  /** Before crit and Resistance. */
  readonly raw: number;
  /** After Resistance, non-critical. */
  readonly normal: number;
  /** After Resistance if the attack crits (conditional). */
  readonly critical: number;
  /** Chance that this attack crits, within the central cap. */
  readonly critChance: number;
}
export interface HitLine {
  readonly kind: 'hit';
  readonly key: string;
  readonly label: string;
  readonly damageType: DamageType;
  /** Catalogue coefficient of this rank (unchanged by the readout). */
  readonly coefficient: number;
  /** Coefficient after Elemental Mastery, as sent to Combat Core. */
  readonly effectiveCoefficient: number;
  /** Separate instances of this hit per activation (projectiles, strikes); 1 = single. */
  readonly count: number;
  /** "per target" lines can hit several enemies; the number of targets is not guaranteed. */
  readonly perTarget: boolean;
  /** Zone/periodic hit interval and number of ticks (if periodic). */
  readonly every?: number;
  readonly ticks?: number;
  /** Secondary/follow-up/bonus instance: never triggers synergies. */
  readonly secondary: boolean;
  /** Only happens under a condition (text). */
  readonly condition?: string;
  readonly amount: HitAmount;
}
export interface DotLine {
  readonly kind: 'dot';
  readonly key: string;
  readonly label: string;
  readonly effectType: EffectType;
  /** Raw damage per stack per tick after player modifiers (before Resistance). */
  readonly rawPerStack: number;
  /** One stack's tick after Resistance. */
  readonly perStackTick: number;
  /** A full group's tick (stack cap) after Resistance; ticks sum all stacks of one type. */
  readonly fullStackTick: number;
  readonly stacks: number;
  readonly chance: number;
  readonly duration: number;
  readonly tickInterval: number;
  readonly stackCap: number;
  readonly condition?: string;
}
export interface InfoLine {
  readonly kind: 'control' | 'buff' | 'area' | 'note';
  readonly key: string;
  readonly text: string;
}
export type ReadoutLine = HitLine | DotLine | InfoLine;
export interface SkillDamageReadout {
  readonly skillId: string;
  readonly rank: number;
  readonly kind: 'auto' | 'passive';
  /** False for utility ranks without any unconditional direct damage ("No direct damage"). */
  readonly hasDirectDamage: boolean;
  /** Actual cooldown after Cooldown Reduction (automatic skills). */
  readonly cooldown?: number;
  readonly lines: readonly ReadoutLine[];
}

// ───────────────────────────── per-skill component descriptors ─────────────────────────────
type HitSpec = Omit<HitLine, 'kind' | 'amount' | 'effectiveCoefficient' | 'damageType'> & {
  readonly damageType?: DamageType;
  readonly extraTags?: readonly CombatTag[];
  readonly critBonus?: number;
};
type DotSpec = {
  readonly key: string;
  readonly label: string;
  readonly effectType: EffectType;
  readonly damage: number;
  readonly duration: number;
  readonly stacks?: number;
  readonly chance?: number;
  readonly condition?: string;
};
type Spec =
  | ({ readonly t: 'hit' } & HitSpec)
  | ({ readonly t: 'dot' } & DotSpec)
  | ({ readonly t: 'info' } & InfoLine);
interface Helpers {
  readonly r: (radius: number) => number;
  readonly ctx: DamageContext;
}
const fmt = (n: number) => String(Math.round(n * 100) / 100);
/** Distances are shown as whole world units. */
const dist = (n: number) => String(Math.round(n));
const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
const hit = (spec: HitSpec): Spec => ({ t: 'hit', ...spec });
const dot = (spec: DotSpec): Spec => ({ t: 'dot', ...spec });
const info = (kind: InfoLine['kind'], key: string, text: string): Spec => ({
  t: 'info',
  kind,
  key,
  text,
});
const one = { count: 1, perTarget: false, secondary: false } as const;
const area = { count: 1, perTarget: true, secondary: false } as const;
const zone = (p: SkillParams, coefficient: number, label = 'Zone tick') =>
  hit({
    key: 'tick',
    label,
    coefficient,
    ...area,
    every: p.tickInterval,
    ticks: Math.floor(p.duration / p.tickInterval + 1e-9),
  });

/** One descriptor per class skill: which rank parameters form which separate damage events. */
const PROFILES: Readonly<Record<string, (p: SkillParams, h: Helpers) => Spec[]>> = {
  // ─────────────── Mage ───────────────
  fireball: (p, { r }) => [
    hit({ key: 'projectile', label: 'Bolt', coefficient: p.coefficient, ...one }),
    hit({
      key: 'explosion',
      label: 'Explosion (other enemies nearby)',
      coefficient: p.explosionCoefficient,
      ...area,
      extraTags: ['area'],
    }),
    info('area', 'explosion-radius', `Explosion radius ${dist(r(p.explosionRadius))}`),
    dot({
      key: 'burn',
      label: 'Burn (target and enemies caught in the explosion)',
      effectType: 'burn',
      damage: p.burnDamage,
      duration: p.burnDuration,
      stacks: p.burnStacks,
    }),
    hit({
      key: 'embers',
      label: 'Sparks',
      coefficient: p.emberCoefficient,
      count: p.embers,
      perTarget: false,
      secondary: true,
    }),
  ],
  flame_burst: (p, { r }) => [
    hit({ key: 'ring', label: 'Ring of fire', coefficient: p.coefficient, ...area }),
    info('area', 'radius', `Radius ${dist(r(p.radius))}`),
    dot({
      key: 'burn',
      label: 'Burn',
      effectType: 'burn',
      damage: p.burnDamage,
      duration: p.burnDuration,
    }),
    hit({
      key: 'outer',
      label: 'Outer pulse',
      coefficient: p.outerCoefficient,
      ...area,
      condition: `after ${fmt(p.outerDelay)} s, radius ${dist(r(p.radius * p.outerRadiusFactor))}`,
    }),
  ],
  inferno: (p, { r }) => [
    zone(p, p.tickCoefficient),
    info('area', 'radius', `Radius-${dist(r(p.radius))} zone for ${fmt(p.duration)} s`),
    dot({
      key: 'burn',
      label: 'Burn from zone ticks',
      effectType: 'burn',
      damage: p.burnDamage,
      duration: p.burnDuration,
      chance: p.burnChance,
    }),
    hit({ key: 'final', label: 'Final explosion', coefficient: p.finalCoefficient, ...area }),
  ],
  frost_nova: (p, { r }) => [
    hit({ key: 'nova', label: 'Icy blast', coefficient: p.coefficient, ...area }),
    info('area', 'radius', `Radius ${dist(r(p.radius))}`),
    info('control', 'slow', `Slow ${pct(p.slow)} for ${fmt(p.slowDuration)} s (cap 60%)`),
    hit({
      key: 'second',
      label: 'Second pulse',
      coefficient: p.secondCoefficient,
      ...area,
      condition: `after ${fmt(p.secondDelay)} s`,
    }),
  ],
  ice_shards: (p) => [
    hit({
      key: 'shard',
      label: 'Shard',
      coefficient: p.coefficient,
      count: p.count,
      perTarget: false,
      secondary: false,
    }),
    ...(p.pierce > 0
      ? [info('note', 'pierce', `Pierces ${p.pierce} more target(s); each target at most once`)]
      : []),
  ],
  blizzard: (p, { r }) => [
    zone(p, p.tickCoefficient, 'Storm tick'),
    info('area', 'radius', `Radius-${dist(r(p.radius))} storm for ${fmt(p.duration)} s`),
    info('control', 'slow', `Slow ${pct(p.slow)} for ${fmt(p.slowDuration)} s per tick`),
    hit({
      key: 'pulse',
      label: 'Strong pulse',
      coefficient: p.pulseCoefficient,
      ...area,
      condition: `every ${p.pulseEvery}th tick, only against already slowed enemies`,
    }),
  ],
  // ─────────────── Warrior ───────────────
  ground_slam: (p) => [
    hit({ key: 'slam', label: 'Cone strike', coefficient: p.coefficient, ...area }),
    info('area', 'cone', `Cone ${fmt(p.range)} / ${fmt(p.arc)}°`),
    info('control', 'stun', `Stun ${fmt(p.stun)} s (cap 1.5 s, then 1.2 s immunity)`),
    hit({
      key: 'follow',
      label: 'Second wave',
      coefficient: p.followCoefficient,
      ...area,
      condition: `after ${fmt(p.followDelay)} s, range ${fmt(p.followRange)}`,
    }),
  ],
  whirlwind: (p, { r }) => [
    hit({ key: 'spin', label: 'Whirlwind', coefficient: p.coefficient, ...area, count: p.pulses }),
    info('area', 'radius', `Radius ${dist(r(p.radius))}; at most ${p.hitLimit} hit(s) per enemy`),
  ],
  shield_bash: (p, { r }) => [
    hit({ key: 'bash', label: 'Shield Bash', coefficient: p.coefficient, ...one }),
    info('control', 'stun', `Stun ${fmt(p.stun)} s (cap 1.5 s, then 1.2 s immunity)`),
    ...(p.adjacentRange > 0
      ? [info('control', 'adjacent', `Stuns one more neighbour within ${fmt(p.adjacentRange)}`)]
      : []),
    hit({
      key: 'shock',
      label: 'Shockwave',
      coefficient: p.shockCoefficient,
      ...area,
      secondary: true,
      condition: `if the target is stunned; radius ${dist(r(p.shockRadius))}`,
    }),
  ],
  earthquake: (p, { r }) => [
    hit({ key: 'quake', label: 'Earthquake', coefficient: p.coefficient, ...area }),
    info('area', 'radius', `Radius ${dist(r(p.radius))}`),
    hit({
      key: 'ripple',
      label: 'Echo wave',
      coefficient: p.rippleCoefficient,
      ...area,
      condition: `after ${fmt(p.rippleDelay)} s`,
    }),
  ],
  cleave: (p) => [
    hit({ key: 'slash', label: 'Cleave', coefficient: p.coefficient, ...area }),
    info('area', 'cone', `Cone ${fmt(p.range)} / ${fmt(p.arc)}°`),
    hit({
      key: 'cross',
      label: 'Return strike',
      coefficient: p.crossCoefficient,
      ...area,
      condition: `after ${fmt(p.crossDelay)} s`,
    }),
  ],
  war_cry: (p, { r }) => [
    info(
      'buff',
      'buff',
      `+${p.attackSpeed}% Attack speed and +${p.resistance} Armor for ${fmt(p.duration)} s`,
    ),
    ...(p.disruptSlow > 0
      ? [
          info(
            'control',
            'disrupt',
            `Slow ${pct(p.disruptSlow)} for ${fmt(p.disruptDuration)} s within radius ${dist(r(p.disruptRadius))}`,
          ),
        ]
      : []),
    hit({
      key: 'counter',
      label: 'Counter wave',
      coefficient: p.counterCoefficient,
      damageType: 'physical',
      extraTags: ['physical', 'melee', 'area'],
      ...area,
      condition: `if enemies are within radius ${dist(r(p.counterRadius))} on the cry`,
    }),
  ],
  // ─────────────── Archer ───────────────
  arrow_rain: (p, { r }) => [
    hit({
      key: 'arrow',
      label: 'Tick arrow',
      coefficient: p.tickCoefficient,
      count: p.arrows,
      perTarget: false,
      secondary: false,
      every: p.tickInterval,
      ticks: Math.floor(p.duration / p.tickInterval + 1e-9),
    }),
    info(
      'area',
      'radius',
      `Radius-${dist(r(p.radius))} zone for ${fmt(p.duration)} s; up to ${p.arrows} enemies per tick`,
    ),
    hit({
      key: 'final',
      label: 'Final volley',
      coefficient: p.finalCoefficient,
      ...area,
      condition: `radius ${dist(r(p.finalRadius))}`,
    }),
  ],
  toxic_volley: (p, { r }) => [
    hit({
      key: 'arrow',
      label: 'Arrow',
      coefficient: p.coefficient,
      count: p.count,
      perTarget: false,
      secondary: false,
    }),
    dot({
      key: 'poison',
      label: 'Poison',
      effectType: 'poison',
      damage: p.poisonDamage,
      duration: p.poisonDuration,
      chance: p.poisonChance,
    }),
    dot({
      key: 'patch',
      label: 'Poison pool',
      effectType: 'poison',
      damage: p.patchPoisonDamage,
      duration: p.poisonDuration,
      condition: `every ${fmt(p.patchTick)} s, radius ${dist(r(p.patchRadius))}, ${fmt(p.patchDuration)} s`,
    }),
  ],
  piercing_arrow: (p, { r }) => [
    hit({ key: 'arrow', label: 'Piercing Arrow', coefficient: p.coefficient, ...area }),
    info('note', 'pierce', `Pierces up to ${p.pierce} enemies`),
    hit({
      key: 'splash',
      label: 'Burst at the last target',
      coefficient: p.splashCoefficient,
      ...area,
      secondary: true,
      condition: `radius ${dist(r(p.splashRadius))}`,
    }),
  ],
  split_shot: (p) => [
    hit({ key: 'arrow', label: 'Main arrow', coefficient: p.coefficient, ...one }),
    hit({
      key: 'split',
      label: 'Shard',
      coefficient: p.splitCoefficient,
      count: p.splits,
      perTarget: false,
      secondary: true,
    }),
    dot({
      key: 'split-poison',
      label: 'Shard Poison',
      effectType: 'poison',
      damage: p.splitPoisonDamage,
      duration: p.splitPoisonDuration,
      condition: 'only against already poisoned enemies',
    }),
  ],
  poison_trap: (p, { r }) => [
    hit({ key: 'trap', label: 'Trap trigger', coefficient: p.coefficient, ...area }),
    info(
      'area',
      'radius',
      `Radius ${dist(r(p.triggerRadius))}, the trap lasts ${fmt(p.lifetime)} s`,
    ),
    dot({
      key: 'poison',
      label: 'Poison',
      effectType: 'poison',
      damage: p.poisonDamage,
      duration: p.poisonDuration,
      stacks: p.poisonStacks,
    }),
    dot({
      key: 'cloud',
      label: 'Poison cloud',
      effectType: 'poison',
      damage: p.cloudPoisonDamage,
      duration: p.poisonDuration,
      condition: `every ${fmt(p.cloudTick)} s, radius ${dist(r(p.cloudRadius))}, ${fmt(p.cloudDuration)} s`,
    }),
  ],
  hunters_mark: (p) => [
    info('buff', 'mark', `Mark: +${p.bonusPercent}% damage to the target for ${fmt(p.duration)} s`),
    ...(p.spreadRange > 0
      ? [
          info(
            'note',
            'spread',
            `On death the mark passes to an enemy within ${fmt(p.spreadRange)}`,
          ),
        ]
      : []),
    hit({
      key: 'bonus-arrow',
      label: 'Bonus arrow',
      coefficient: p.bonusArrowCoefficient,
      ...one,
      secondary: true,
      condition: `on hitting the marked target, at most once per ${fmt(p.bonusArrowCooldown)} s`,
    }),
  ],
  // ─────────────── Rogue ───────────────
  blade_flurry: (p) => [
    hit({
      key: 'strike',
      label: 'Strike',
      coefficient: p.coefficient,
      count: p.hits,
      perTarget: false,
      secondary: false,
    }),
    ...(p.lastHitCritBonus > 0
      ? [
          hit({
            key: 'last',
            label: 'Last strike (+crit chance)',
            coefficient: p.coefficient,
            ...one,
            critBonus: p.lastHitCritBonus,
            condition: `part of ${p.hits} strikes, +${p.lastHitCritBonus} crit chance`,
          }),
        ]
      : []),
  ],
  fan_of_knives: (p) => [
    hit({
      key: 'knife',
      label: 'Dagger',
      coefficient: p.coefficient,
      count: p.count,
      perTarget: false,
      secondary: false,
    }),
    info(
      'note',
      'limit',
      `At most ${p.maxHitsPerEnemy} dagger(s) per enemy${p.pierce ? `, pierce ${p.pierce}` : ''}`,
    ),
  ],
  lacerate: (p) => [
    hit({ key: 'cut', label: 'Lacerate', coefficient: p.coefficient, ...one }),
    dot({
      key: 'bleed',
      label: 'Bleed',
      effectType: 'bleed',
      damage: p.bleedDamage,
      duration: p.bleedDuration,
    }),
    dot({
      key: 'extra-bleed',
      label: 'Extra Bleed stack',
      effectType: 'bleed',
      damage: p.extraBleedChance > 0 ? p.bleedDamage : 0,
      duration: p.bleedDuration,
      chance: p.extraBleedChance,
    }),
    ...(p.perStackBonusPercent > 0
      ? [
          info(
            'note',
            'per-stack',
            `+${p.perStackBonusPercent}% strike damage per Bleed stack on the target (up to 10)`,
          ),
        ]
      : []),
  ],
  shadow_strike: (p) => [
    hit({ key: 'blade', label: 'Shadow blade', coefficient: p.coefficient, ...one }),
    ...(p.pierce > 0 ? [info('note', 'pierce', `Pierces ${p.pierce} more target(s)`)] : []),
    hit({
      key: 'follow',
      label: 'Follow-up blade',
      coefficient: p.followCoefficient,
      ...one,
      secondary: true,
      condition: `after ${fmt(p.followDelay)} s, at most once per ${fmt(p.followCooldown)} s`,
    }),
  ],
  blood_blades: (p, { r }) => [
    hit({
      key: 'blade',
      label: 'Blade',
      coefficient: p.coefficient,
      count: p.count,
      perTarget: false,
      secondary: false,
    }),
    dot({
      key: 'bleed',
      label: 'Bleed',
      effectType: 'bleed',
      damage: p.bleedDamage,
      duration: p.bleedDuration,
      chance: p.bleedChance,
    }),
    dot({
      key: 'splash',
      label: 'Bleed to neighbours',
      effectType: 'bleed',
      damage: p.splashRadius > 0 ? p.bleedDamage : 0,
      duration: p.bleedDuration,
      condition: `if the target is already bleeding; radius ${dist(r(p.splashRadius))}`,
    }),
  ],
  death_mark: (p) => [
    info('buff', 'mark', `Mark: +${p.bonusPercent}% damage to the target for ${fmt(p.duration)} s`),
    ...(p.jumpRange > 0
      ? [
          info(
            'note',
            'jump',
            `On death the mark jumps once to an enemy within ${fmt(p.jumpRange)}`,
          ),
        ]
      : []),
    hit({
      key: 'execute',
      label: 'Execution',
      coefficient: p.executeCoefficient,
      ...one,
      secondary: true,
      condition: `on a marked target below ${p.executeThresholdPercent}% HP, at most once per ${fmt(p.executeCooldown)} s`,
    }),
  ],
  // ─────────────── Passives with direct effects ───────────────
  multishot: (p, { ctx }) => [
    hit({
      key: 'copy',
      label: 'Extra basic-attack arrow',
      coefficient: (ctx.weaponCoefficient ?? 1) * p.coefficientFactor,
      count: p.extraArrows,
      perTarget: false,
      secondary: false,
      damageType: 'physical',
      condition: `${pct(p.coefficientFactor)} of the bow coefficient${p.distinctTargets ? ', at different targets' : ''}`,
    }),
  ],
  battle_fury: (p) => [
    info(
      'buff',
      'stacks',
      `Per melee kill: +${p.damagePerStack}% Physical damage per stack, up to ${p.maxStacks} stacks, ${fmt(p.duration)} s`,
    ),
    ...(p.empowerMultiplier > 1
      ? [
          info(
            'note',
            'empower',
            `At max stacks: an empowered strike ×${fmt(p.empowerMultiplier)} (an extra instance of ×${fmt(p.empowerMultiplier - 1)} of the strike)`,
          ),
        ]
      : []),
  ],
  serrated_blades: (p) => [
    dot({
      key: 'bleed',
      label: 'Bleed from basic dagger strikes',
      effectType: 'bleed',
      damage: p.bleedDamage,
      duration: p.bleedDuration,
      chance: p.bleedChance,
    }),
    ...(p.critExtraStack > 0
      ? [info('note', 'crit', `Basic-strike crit: +${p.critExtraStack} Bleed stack`)]
      : []),
  ],
  elemental_mastery: (p) => [
    info(
      'buff',
      'elemental',
      `+${p.elementalDamagePercent}% to fire and ice skill coefficients (already included in their damage)`,
    ),
    ...(p.burnDamagePercent > 0
      ? [info('buff', 'burn', `Burn +${p.burnDamagePercent}% damage per tick`)]
      : []),
    ...(p.slowBonus > 0 ? [info('control', 'slow', `Ice skill Slow +${pct(p.slowBonus)}`)] : []),
    ...(p.alternateBonusPercent > 0
      ? [
          info(
            'note',
            'alternate',
            `Alternating fire and ice: +${p.alternateBonusPercent}% per stack, up to ${p.alternateMaxStacks}, ${fmt(p.alternateDuration)} s`,
          ),
        ]
      : []),
  ],
};
/** Universal passives: truthful modifier descriptions (already contained in `stats`). */
const PASSIVE_TEXT: Readonly<Record<string, (p: SkillParams) => string>> = {
  power: (p) => `+${p.damagePercent}% Physical and Magic damage (already in your stats)`,
  haste: (p) => `+${p.attackSpeed} Attack Speed`,
  vitality: (p) => `+${p.maxHpPercent}% Max HP`,
  fortitude: (p) => `+${p.resistance} Armor`,
  precision: (p) => `+${p.criticalChance} Crit chance (cap 75%)`,
  deadly_strikes: (p) => `+${p.criticalDamage} Crit damage`,
  swiftness: (p) => `+${p.movementSpeed} Movement Speed`,
  toxic_mastery: (p) => `+${p.dotDamagePercent}% Poison/Burn/Bleed damage per tick`,
  lingering_effects: (p) => `+${p.dotDurationPercent}% Poison/Burn/Bleed duration`,
};

// ───────────────────────────── computation ─────────────────────────────
function amount(
  ctx: DamageContext,
  damageType: DamageType,
  coefficient: number,
  critBonus = 0,
): HitAmount {
  const stat = damageType === 'physical' ? ctx.stats.physicalDamage : ctx.stats.magicalDamage;
  const raw = stat * coefficient;
  return Object.freeze({
    raw,
    normal: calculateSuccessfulDamage(raw, ctx.targetResistance),
    critical: calculateSuccessfulDamage(
      calculateCriticalDamage(raw, ctx.stats.criticalDamage),
      ctx.targetResistance,
    ),
    critChance: Math.min(
      COMBAT_ATTRIBUTE_CAPS.criticalChance,
      ctx.stats.criticalChance + critBonus,
    ),
  });
}

/** Readout of one skill at one rank for the current character. Pure; never mutates the catalogue. */
export function skillDamageReadout(
  skillId: string,
  rank: number,
  ctx: DamageContext,
): SkillDamageReadout {
  const skill = getSkill(skillId);
  if (!Number.isInteger(rank) || rank < 1 || rank > skill.maxRank)
    throw new RangeError(`Rank must be 1–${skill.maxRank}.`);
  const p = skill.ranks[rank - 1];
  const helpers: Helpers = {
    r: (radius) => scaleCircularAoeRadius(radius, ctx.stats.areaSize),
    ctx,
  };
  const skillDamageType: DamageType = skill.tags.includes('magical') ? 'magical' : 'physical';
  const specs: Spec[] = PROFILES[skillId]
    ? PROFILES[skillId](p, helpers)
    : PASSIVE_TEXT[skillId]
      ? [info('buff', 'modifier', PASSIVE_TEXT[skillId](p))]
      : [];
  const lines: ReadoutLine[] = [];
  for (const spec of specs) {
    if (spec.t === 'info') {
      const { t: _t, ...line } = spec;
      lines.push(Object.freeze(line));
    } else if (spec.t === 'hit') {
      if (spec.coefficient <= 0 || spec.count <= 0) continue;
      const { t: _t, extraTags, critBonus, damageType: forced, ...rest } = spec;
      const damageType = forced ?? skillDamageType;
      const tags = new Set<CombatTag>([...skill.tags, ...(extraTags ?? [])]);
      // Synergy-free secondary instances of mage skills keep the skill's fire/ice tags (as in combat).
      const effectiveCoefficient =
        skill.kind === 'auto'
          ? spec.coefficient * elementalDamageMultiplier(ctx.rankOf, tags)
          : spec.coefficient;
      lines.push(
        Object.freeze({
          ...rest,
          kind: 'hit',
          damageType,
          effectiveCoefficient,
          amount: amount(ctx, damageType, effectiveCoefficient, critBonus ?? 0),
        } satisfies HitLine),
      );
    } else {
      if (spec.damage <= 0 || spec.duration <= 0 || (spec.chance ?? 100) <= 0) continue;
      const modified = modifyPlayerEffect(
        {
          effectType: spec.effectType,
          rawDamagePerTick: spec.damage,
          duration: spec.duration,
          probabilityPercent: spec.chance ?? 100,
        },
        ctx.rankOf,
      );
      const cap = STATUS_RULES.maxStacks;
      lines.push(
        Object.freeze({
          kind: 'dot',
          key: spec.key,
          label: spec.label,
          effectType: spec.effectType,
          rawPerStack: modified.rawDamagePerTick,
          perStackTick: calculateSuccessfulDamage(modified.rawDamagePerTick, ctx.targetResistance),
          fullStackTick: calculateSuccessfulDamage(
            modified.rawDamagePerTick * cap,
            ctx.targetResistance,
          ),
          stacks: spec.stacks ?? 1,
          chance: spec.chance ?? 100,
          duration: modified.duration,
          tickInterval: STATUS_RULES.tickInterval,
          stackCap: cap,
          ...(spec.condition ? { condition: spec.condition } : {}),
        } satisfies DotLine),
      );
    }
  }
  return Object.freeze({
    skillId,
    rank,
    kind: skill.kind,
    hasDirectDamage: lines.some((l) => l.kind === 'hit' && !l.condition),
    ...(skill.kind === 'auto' && typeof p.cooldown === 'number'
      ? { cooldown: scaleCooldown(p.cooldown, ctx.stats.cooldownReduction) }
      : {}),
    lines: Object.freeze(lines),
  });
}

export type LineChange = 'new' | 'changed' | 'same';
export interface RankComparison {
  readonly from: SkillDamageReadout | null;
  readonly to: SkillDamageReadout;
  /** Per line of the next rank: a new effect, an updated value, or unchanged. */
  readonly changes: readonly { readonly line: ReadoutLine; readonly change: LineChange }[];
}
const lineSignature = (l: ReadoutLine) =>
  l.kind === 'hit'
    ? `${l.coefficient}|${l.count}|${l.condition ?? ''}|${l.ticks ?? ''}|${l.every ?? ''}`
    : l.kind === 'dot'
      ? `${l.rawPerStack}|${l.stacks}|${l.chance}|${l.duration}|${l.condition ?? ''}`
      : l.text;
/** Next-rank readout with what is new vs updated relative to the current rank (0 = new skill). */
export function compareRanks(
  skillId: string,
  currentRank: number,
  ctx: DamageContext,
): RankComparison {
  const to = skillDamageReadout(skillId, currentRank + 1, ctx);
  const from = currentRank > 0 ? skillDamageReadout(skillId, currentRank, ctx) : null;
  const before = new Map((from?.lines ?? []).map((l) => [`${l.kind}:${l.key}`, lineSignature(l)]));
  return Object.freeze({
    from,
    to,
    changes: Object.freeze(
      to.lines.map((line) => {
        const old = before.get(`${line.kind}:${line.key}`);
        const change: LineChange =
          from === null || old === undefined
            ? 'new'
            : old === lineSignature(line)
              ? 'same'
              : 'changed';
        return Object.freeze({ line, change });
      }),
    ),
  });
}
