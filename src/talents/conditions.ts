import type { EffectType } from '../status-effects';

/**
 * Task 09.1 §1.1 condition helpers (pure reads; no state). They read the live combat state the
 * Skill Engine already exposes, so a condition is always evaluated at the moment of the hit.
 */
export interface DotReader {
  getGroup(targetId: string, type: EffectType): { readonly stacks: readonly unknown[] } | null;
}
export const DOT_TYPES: readonly EffectType[] = Object.freeze(['poison', 'burn', 'bleed']);
export const dotStacks = (statuses: DotReader, targetId: string, type: EffectType): number =>
  statuses.getGroup(targetId, type)?.stacks.length ?? 0;
export const distinctDotTypes = (statuses: DotReader, targetId: string): number =>
  DOT_TYPES.filter((t) => dotStacks(statuses, targetId, t) > 0).length;
/** HP as a percentage of Max HP (0 for an empty or dead entity). */
export function hpPercent(entity: { readonly currentHp: number; readonly maxHp: number }): number {
  return entity.maxHp > 0 ? (entity.currentHp / entity.maxHp) * 100 : 0;
}
/** «HP below X%»: strictly below. */
export const hpBelow = (entity: { currentHp: number; maxHp: number }, percent: number) =>
  hpPercent(entity) < percent;
/** «HP above X%»: strictly above. */
export const hpAbove = (entity: { currentHp: number; maxHp: number }, percent: number) =>
  hpPercent(entity) > percent;
/** Target control/mark state as captured by the Skill Engine's pre-hit snapshot. */
export interface TargetState {
  readonly stunned: boolean;
  readonly slowed: boolean;
  readonly mark: unknown | null;
}
export const isStunned = (s: TargetState) => s.stunned;
export const isSlowed = (s: TargetState) => s.slowed;
export const isMarked = (s: TargetState) => s.mark !== null;
/** Player moving = a non-zero movement input this step. */
export const isMoving = (input: { readonly x: number; readonly y: number }) =>
  input.x !== 0 || input.y !== 0;
