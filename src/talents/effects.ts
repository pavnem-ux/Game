import type { RunStatModifiers } from '../skills/stats';

/**
 * Task 09 §1.2 talent effect descriptors (data, no logic). A rank's effects are its complete
 * effect at that rank (catalog ranks state totals, e.g. «Ранг II: +4 п.п.»), so only the current
 * rank of a node applies — never ranks I+II+III together.
 *
 * Kinds available to the pipeline (Phase 3). Conditional, proc and secondary-attack kinds are
 * added with the catalog effects that need them (Phases 5–6), only once those ranks are defined.
 */
export type TalentStat = keyof RunStatModifiers;
export interface TalentStatEffect {
  readonly kind: 'stat';
  readonly stat: TalentStat;
  /** Same unit as `RunStatModifiers` (percent or percentage points), from the catalog. */
  readonly value: number;
}
export type TalentEffect = TalentStatEffect;
export const TALENT_STATS: readonly TalentStat[] = Object.freeze([
  'damagePercent',
  'physicalDamagePercent',
  'magicalDamagePercent',
  'attackSpeed',
  'maxHpPercent',
  'resistance',
  'criticalChance',
  'criticalDamage',
  'movementSpeed',
  'dodgeChance',
  'cooldownReduction',
]);
export function validateTalentEffect(effect: TalentEffect, where: string): void {
  if (effect.kind !== 'stat') throw new Error(`${where}: unknown effect kind.`);
  if (!TALENT_STATS.includes(effect.stat)) throw new Error(`${where}: unknown stat.`);
  if (!Number.isFinite(effect.value)) throw new Error(`${where}: invalid value.`);
}
