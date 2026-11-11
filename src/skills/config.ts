import type { BonusRewardId, RankTuple, SkillParams } from './types';

/** Task 07 run rules. Slot/reroll/rank limits are approved design; reward amounts are provisional. */
export const SKILL_RULES = Object.freeze({
  maxRank: 5,
  autoSlots: 4,
  passiveSlots: 6,
  rerollsPerRun: 3,
  /** Task 14 (provisional): «Изгнать» uses per run. «Пропустить» is unlimited. */
  banishesPerRun: 2,
  offerSize: 3,
});

/** Provisional repeatable rewards offered only after the normal pool is exhausted. */
export const BONUS_REWARDS: Readonly<
  Record<BonusRewardId, Readonly<{ name: string; icon: string; summary: string }>>
> = Object.freeze({
  recovery: Object.freeze({
    name: 'Восстановление',
    icon: '✚',
    summary: 'Лечение на 30% от Max HP (не выше Max HP).',
  }),
  barrier: Object.freeze({
    name: 'Барьер',
    icon: '◈',
    summary: 'Временный щит на 20% от Max HP на 12 с.',
  }),
  gold: Object.freeze({ name: 'Золото', icon: '◎', summary: '+25 золота забега.' }),
});
export const BONUS_TUNING = Object.freeze({
  recoveryMaxHpPercent: 30,
  barrierMaxHpPercent: 20,
  barrierDuration: 12,
  gold: 25,
});

/** Provisional Slow/Stun limits; Slow and Stun are timed and never permanent. */
export const CONTROL_RULES = Object.freeze({
  /** Strongest active slow wins; never stacks additively. */
  maxSlow: 0.6,
  maxStunDuration: 1.5,
  /** After a stun ends the enemy cannot be stunned again for this long (no perpetual stunlock). */
  stunImmunity: 1.2,
});

/** Provisional proc tuning for the 12 synergies. Per-target cooldowns are in seconds. */
export const SYNERGY_TUNING = Object.freeze({
  thermalShock: Object.freeze({ coefficient: 0.55, cooldown: 1.5 }),
  wildfire: Object.freeze({
    radius: 130,
    maxTargets: 3,
    burnDamage: 3,
    burnDuration: 3,
  }),
  shatteredIce: Object.freeze({ coefficient: 0.45, cooldown: 1 }),
  skullCrusher: Object.freeze({ coefficient: 0.5, cooldown: 1 }),
  battleMomentum: Object.freeze({ attackSpeed: 15, duration: 3 }),
  seismicImpact: Object.freeze({ coefficient: 0.5, radius: 90, cooldown: 1.5 }),
  toxicBarrage: Object.freeze({
    window: 1.5,
    projectiles: 3,
    coefficient: 0.6,
    poisonDamage: 3,
    poisonDuration: 4,
    cooldown: 3,
  }),
  plagueChain: Object.freeze({
    radius: 130,
    maxTargets: 3,
    poisonDamage: 3,
    poisonDuration: 4,
  }),
  deadlyPrecision: Object.freeze({ window: 2, hits: 3, bonusPercent: 15, duration: 3 }),
  bloodFrenzy: Object.freeze({ attackSpeed: 15, duration: 2.5 }),
  deepWounds: Object.freeze({ bleedDamage: 3, bleedDuration: 4, cooldown: 0.5 }),
  finalCut: Object.freeze({ hpThresholdPercent: 30, coefficient: 1.2, cooldown: 2 }),
});

/** Builds five cumulative rank tables: each rank inherits the previous one and applies its overrides. */
export function cumulativeRanks(
  base: SkillParams,
  r2: SkillParams,
  r3: SkillParams,
  r4: SkillParams,
  r5: SkillParams,
): RankTuple<SkillParams> {
  const one = Object.freeze({ ...base });
  const two = Object.freeze({ ...one, ...r2 });
  const three = Object.freeze({ ...two, ...r3 });
  const four = Object.freeze({ ...three, ...r4 });
  const five = Object.freeze({ ...four, ...r5 });
  return Object.freeze([one, two, three, four, five] as const);
}
