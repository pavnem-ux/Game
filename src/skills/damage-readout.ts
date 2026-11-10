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
  /** False for utility ranks without any unconditional direct damage ("Нет прямого урона"). */
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
const zone = (p: SkillParams, coefficient: number, label = 'Тик зоны') =>
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
    hit({ key: 'projectile', label: 'Снаряд', coefficient: p.coefficient, ...one }),
    hit({
      key: 'explosion',
      label: 'Взрыв (другие враги рядом)',
      coefficient: p.explosionCoefficient,
      ...area,
      extraTags: ['area'],
    }),
    info('area', 'explosion-radius', `Радиус взрыва ${dist(r(p.explosionRadius))}`),
    dot({
      key: 'burn',
      label: 'Burn (цель и задетые взрывом)',
      effectType: 'burn',
      damage: p.burnDamage,
      duration: p.burnDuration,
      stacks: p.burnStacks,
    }),
    hit({
      key: 'embers',
      label: 'Искры',
      coefficient: p.emberCoefficient,
      count: p.embers,
      perTarget: false,
      secondary: true,
    }),
  ],
  flame_burst: (p, { r }) => [
    hit({ key: 'ring', label: 'Огненное кольцо', coefficient: p.coefficient, ...area }),
    info('area', 'radius', `Радиус ${dist(r(p.radius))}`),
    dot({
      key: 'burn',
      label: 'Burn',
      effectType: 'burn',
      damage: p.burnDamage,
      duration: p.burnDuration,
    }),
    hit({
      key: 'outer',
      label: 'Внешний импульс',
      coefficient: p.outerCoefficient,
      ...area,
      condition: `через ${fmt(p.outerDelay)} с, радиус ${dist(r(p.radius * p.outerRadiusFactor))}`,
    }),
  ],
  inferno: (p, { r }) => [
    zone(p, p.tickCoefficient),
    info('area', 'radius', `Зона радиусом ${dist(r(p.radius))} на ${fmt(p.duration)} с`),
    dot({
      key: 'burn',
      label: 'Burn от тика зоны',
      effectType: 'burn',
      damage: p.burnDamage,
      duration: p.burnDuration,
      chance: p.burnChance,
    }),
    hit({ key: 'final', label: 'Финальный взрыв', coefficient: p.finalCoefficient, ...area }),
  ],
  frost_nova: (p, { r }) => [
    hit({ key: 'nova', label: 'Ледяной взрыв', coefficient: p.coefficient, ...area }),
    info('area', 'radius', `Радиус ${dist(r(p.radius))}`),
    info('control', 'slow', `Slow ${pct(p.slow)} на ${fmt(p.slowDuration)} с (предел 60%)`),
    hit({
      key: 'second',
      label: 'Второй импульс',
      coefficient: p.secondCoefficient,
      ...area,
      condition: `через ${fmt(p.secondDelay)} с`,
    }),
  ],
  ice_shards: (p) => [
    hit({
      key: 'shard',
      label: 'Осколок',
      coefficient: p.coefficient,
      count: p.count,
      perTarget: false,
      secondary: false,
    }),
    ...(p.pierce > 0
      ? [info('note', 'pierce', `Пробивает ещё ${p.pierce} цель; одну цель — не больше раза`)]
      : []),
  ],
  blizzard: (p, { r }) => [
    zone(p, p.tickCoefficient, 'Тик бури'),
    info('area', 'radius', `Буря радиусом ${dist(r(p.radius))} на ${fmt(p.duration)} с`),
    info('control', 'slow', `Slow ${pct(p.slow)} на ${fmt(p.slowDuration)} с за тик`),
    hit({
      key: 'pulse',
      label: 'Сильный импульс',
      coefficient: p.pulseCoefficient,
      ...area,
      condition: `каждый ${p.pulseEvery}-й тик, только по уже замедленным`,
    }),
  ],
  // ─────────────── Warrior ───────────────
  ground_slam: (p) => [
    hit({ key: 'slam', label: 'Удар в конусе', coefficient: p.coefficient, ...area }),
    info('area', 'cone', `Конус ${fmt(p.range)} / ${fmt(p.arc)}°`),
    info('control', 'stun', `Stun ${fmt(p.stun)} с (предел 1.5 с, затем 1.2 с иммунитета)`),
    hit({
      key: 'follow',
      label: 'Вторая волна',
      coefficient: p.followCoefficient,
      ...area,
      condition: `через ${fmt(p.followDelay)} с, дальность ${fmt(p.followRange)}`,
    }),
  ],
  whirlwind: (p, { r }) => [
    hit({ key: 'spin', label: 'Вихрь', coefficient: p.coefficient, ...area, count: p.pulses }),
    info('area', 'radius', `Радиус ${dist(r(p.radius))}; не больше ${p.hitLimit} удар(а) по врагу`),
  ],
  shield_bash: (p, { r }) => [
    hit({ key: 'bash', label: 'Удар щитом', coefficient: p.coefficient, ...one }),
    info('control', 'stun', `Stun ${fmt(p.stun)} с (предел 1.5 с, затем 1.2 с иммунитета)`),
    ...(p.adjacentRange > 0
      ? [info('control', 'adjacent', `Оглушает ещё одного соседа в ${fmt(p.adjacentRange)}`)]
      : []),
    hit({
      key: 'shock',
      label: 'Ударная волна',
      coefficient: p.shockCoefficient,
      ...area,
      secondary: true,
      condition: `если цель оглушена; радиус ${dist(r(p.shockRadius))}`,
    }),
  ],
  earthquake: (p, { r }) => [
    hit({ key: 'quake', label: 'Землетрясение', coefficient: p.coefficient, ...area }),
    info('area', 'radius', `Радиус ${dist(r(p.radius))}`),
    hit({
      key: 'ripple',
      label: 'Повторная волна',
      coefficient: p.rippleCoefficient,
      ...area,
      condition: `через ${fmt(p.rippleDelay)} с`,
    }),
  ],
  cleave: (p) => [
    hit({ key: 'slash', label: 'Рассекающий удар', coefficient: p.coefficient, ...area }),
    info('area', 'cone', `Конус ${fmt(p.range)} / ${fmt(p.arc)}°`),
    hit({
      key: 'cross',
      label: 'Встречный удар',
      coefficient: p.crossCoefficient,
      ...area,
      condition: `через ${fmt(p.crossDelay)} с`,
    }),
  ],
  war_cry: (p, { r }) => [
    info(
      'buff',
      'buff',
      `+${p.attackSpeed} Attack Speed и +${p.resistance} Resistance на ${fmt(p.duration)} с`,
    ),
    ...(p.disruptSlow > 0
      ? [
          info(
            'control',
            'disrupt',
            `Slow ${pct(p.disruptSlow)} на ${fmt(p.disruptDuration)} с в радиусе ${dist(r(p.disruptRadius))}`,
          ),
        ]
      : []),
    hit({
      key: 'counter',
      label: 'Ответная волна',
      coefficient: p.counterCoefficient,
      damageType: 'physical',
      extraTags: ['physical', 'melee', 'area'],
      ...area,
      condition: `если враги в радиусе ${dist(r(p.counterRadius))} при кличе`,
    }),
  ],
  // ─────────────── Archer ───────────────
  arrow_rain: (p, { r }) => [
    hit({
      key: 'arrow',
      label: 'Стрела тика',
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
      `Зона радиусом ${dist(r(p.radius))} на ${fmt(p.duration)} с; до ${p.arrows} врагов за тик`,
    ),
    hit({
      key: 'final',
      label: 'Финальный залп',
      coefficient: p.finalCoefficient,
      ...area,
      condition: `радиус ${dist(r(p.finalRadius))}`,
    }),
  ],
  toxic_volley: (p, { r }) => [
    hit({
      key: 'arrow',
      label: 'Стрела',
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
      label: 'Ядовитое пятно',
      effectType: 'poison',
      damage: p.patchPoisonDamage,
      duration: p.poisonDuration,
      condition: `каждые ${fmt(p.patchTick)} с, радиус ${dist(r(p.patchRadius))}, ${fmt(p.patchDuration)} с`,
    }),
  ],
  piercing_arrow: (p, { r }) => [
    hit({ key: 'arrow', label: 'Пробивающая стрела', coefficient: p.coefficient, ...area }),
    info('note', 'pierce', `Пробивает до ${p.pierce} врагов`),
    hit({
      key: 'splash',
      label: 'Всплеск у последней цели',
      coefficient: p.splashCoefficient,
      ...area,
      secondary: true,
      condition: `радиус ${dist(r(p.splashRadius))}`,
    }),
  ],
  split_shot: (p) => [
    hit({ key: 'arrow', label: 'Основная стрела', coefficient: p.coefficient, ...one }),
    hit({
      key: 'split',
      label: 'Осколок',
      coefficient: p.splitCoefficient,
      count: p.splits,
      perTarget: false,
      secondary: true,
    }),
    dot({
      key: 'split-poison',
      label: 'Poison осколков',
      effectType: 'poison',
      damage: p.splitPoisonDamage,
      duration: p.splitPoisonDuration,
      condition: 'только по уже отравленным',
    }),
  ],
  poison_trap: (p, { r }) => [
    hit({ key: 'trap', label: 'Срабатывание ловушки', coefficient: p.coefficient, ...area }),
    info(
      'area',
      'radius',
      `Радиус ${dist(r(p.triggerRadius))}, ловушка живёт ${fmt(p.lifetime)} с`,
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
      label: 'Ядовитое облако',
      effectType: 'poison',
      damage: p.cloudPoisonDamage,
      duration: p.poisonDuration,
      condition: `каждые ${fmt(p.cloudTick)} с, радиус ${dist(r(p.cloudRadius))}, ${fmt(p.cloudDuration)} с`,
    }),
  ],
  hunters_mark: (p) => [
    info('buff', 'mark', `Метка: +${p.bonusPercent}% урона по цели на ${fmt(p.duration)} с`),
    ...(p.spreadRange > 0
      ? [info('note', 'spread', `При смерти метка переходит на врага в ${fmt(p.spreadRange)}`)]
      : []),
    hit({
      key: 'bonus-arrow',
      label: 'Бонусная стрела',
      coefficient: p.bonusArrowCoefficient,
      ...one,
      secondary: true,
      condition: `при попадании по отмеченной цели, не чаще раза в ${fmt(p.bonusArrowCooldown)} с`,
    }),
  ],
  // ─────────────── Rogue ───────────────
  blade_flurry: (p) => [
    hit({
      key: 'strike',
      label: 'Удар',
      coefficient: p.coefficient,
      count: p.hits,
      perTarget: false,
      secondary: false,
    }),
    ...(p.lastHitCritBonus > 0
      ? [
          hit({
            key: 'last',
            label: 'Последний удар (+шанс крита)',
            coefficient: p.coefficient,
            ...one,
            critBonus: p.lastHitCritBonus,
            condition: `входит в ${p.hits} удара, +${p.lastHitCritBonus} к шансу крита`,
          }),
        ]
      : []),
  ],
  fan_of_knives: (p) => [
    hit({
      key: 'knife',
      label: 'Нож',
      coefficient: p.coefficient,
      count: p.count,
      perTarget: false,
      secondary: false,
    }),
    info(
      'note',
      'limit',
      `Не больше ${p.maxHitsPerEnemy} нож(а) по одному врагу${p.pierce ? `, пробивание ${p.pierce}` : ''}`,
    ),
  ],
  lacerate: (p) => [
    hit({ key: 'cut', label: 'Рваная рана', coefficient: p.coefficient, ...one }),
    dot({
      key: 'bleed',
      label: 'Bleed',
      effectType: 'bleed',
      damage: p.bleedDamage,
      duration: p.bleedDuration,
    }),
    dot({
      key: 'extra-bleed',
      label: 'Доп. стак Bleed',
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
            `+${p.perStackBonusPercent}% урона удара за каждый стак Bleed на цели (до 10)`,
          ),
        ]
      : []),
  ],
  shadow_strike: (p) => [
    hit({ key: 'blade', label: 'Теневой клинок', coefficient: p.coefficient, ...one }),
    ...(p.pierce > 0 ? [info('note', 'pierce', `Пробивает ещё ${p.pierce} цель`)] : []),
    hit({
      key: 'follow',
      label: 'Повторный клинок',
      coefficient: p.followCoefficient,
      ...one,
      secondary: true,
      condition: `через ${fmt(p.followDelay)} с, не чаще раза в ${fmt(p.followCooldown)} с`,
    }),
  ],
  blood_blades: (p, { r }) => [
    hit({
      key: 'blade',
      label: 'Клинок',
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
      label: 'Bleed соседям',
      effectType: 'bleed',
      damage: p.splashRadius > 0 ? p.bleedDamage : 0,
      duration: p.bleedDuration,
      condition: `если цель уже кровоточит; радиус ${dist(r(p.splashRadius))}`,
    }),
  ],
  death_mark: (p) => [
    info('buff', 'mark', `Метка: +${p.bonusPercent}% урона по цели на ${fmt(p.duration)} с`),
    ...(p.jumpRange > 0
      ? [info('note', 'jump', `При смерти метка один раз прыгает на врага в ${fmt(p.jumpRange)}`)]
      : []),
    hit({
      key: 'execute',
      label: 'Казнь',
      coefficient: p.executeCoefficient,
      ...one,
      secondary: true,
      condition: `по отмеченной цели ниже ${p.executeThresholdPercent}% HP, не чаще раза в ${fmt(p.executeCooldown)} с`,
    }),
  ],
  // ─────────────── Passives with direct effects ───────────────
  multishot: (p, { ctx }) => [
    hit({
      key: 'copy',
      label: 'Доп. стрела базовой атаки',
      coefficient: (ctx.weaponCoefficient ?? 1) * p.coefficientFactor,
      count: p.extraArrows,
      perTarget: false,
      secondary: false,
      damageType: 'physical',
      condition: `${pct(p.coefficientFactor)} коэффициента лука${p.distinctTargets ? ', в разные цели' : ''}`,
    }),
  ],
  battle_fury: (p) => [
    info(
      'buff',
      'stacks',
      `За убийство в ближнем бою: +${p.damagePerStack}% физ. урона за стак, до ${p.maxStacks} стаков, ${fmt(p.duration)} с`,
    ),
    ...(p.empowerMultiplier > 1
      ? [
          info(
            'note',
            'empower',
            `На максимуме стаков: усиленный удар ×${fmt(p.empowerMultiplier)} (доп. экземпляр ×${fmt(p.empowerMultiplier - 1)} от удара)`,
          ),
        ]
      : []),
  ],
  serrated_blades: (p) => [
    dot({
      key: 'bleed',
      label: 'Bleed от базовых ударов кинжалами',
      effectType: 'bleed',
      damage: p.bleedDamage,
      duration: p.bleedDuration,
      chance: p.bleedChance,
    }),
    ...(p.critExtraStack > 0
      ? [info('note', 'crit', `Крит базового удара: +${p.critExtraStack} стак Bleed`)]
      : []),
  ],
  elemental_mastery: (p) => [
    info(
      'buff',
      'elemental',
      `+${p.elementalDamagePercent}% к коэффициентам огненных и ледяных навыков (уже учтено в их уроне)`,
    ),
    ...(p.burnDamagePercent > 0
      ? [info('buff', 'burn', `Burn +${p.burnDamagePercent}% урона за тик`)]
      : []),
    ...(p.slowBonus > 0
      ? [info('control', 'slow', `Slow ледяных навыков +${pct(p.slowBonus)}`)]
      : []),
    ...(p.alternateBonusPercent > 0
      ? [
          info(
            'note',
            'alternate',
            `Чередование огня и льда: +${p.alternateBonusPercent}% за стак, до ${p.alternateMaxStacks}, ${fmt(p.alternateDuration)} с`,
          ),
        ]
      : []),
  ],
};
/** Universal passives: truthful modifier descriptions (already contained in `stats`). */
const PASSIVE_TEXT: Readonly<Record<string, (p: SkillParams) => string>> = {
  power: (p) => `+${p.damagePercent}% физ. и маг. урона (уже в характеристиках)`,
  haste: (p) => `+${p.attackSpeed} Attack Speed`,
  vitality: (p) => `+${p.maxHpPercent}% Max HP`,
  fortitude: (p) => `+${p.resistance} Resistance`,
  precision: (p) => `+${p.criticalChance} к шансу крита (предел 75%)`,
  deadly_strikes: (p) => `+${p.criticalDamage} к Crit Damage`,
  swiftness: (p) => `+${p.movementSpeed} Movement Speed`,
  toxic_mastery: (p) => `+${p.dotDamagePercent}% урона Poison/Burn/Bleed за тик`,
  lingering_effects: (p) => `+${p.dotDurationPercent}% длительности Poison/Burn/Bleed`,
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
