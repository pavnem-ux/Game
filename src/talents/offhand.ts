import type { CombatTag } from '../skills/types';

/**
 * Task 09.1 G6: the Warrior superpower's second one-handed sword (alpha virtual weapon, no loot).
 * Geometry and base period from G6; the coefficient (×0.45/0.60/0.75) and the talent speed bonus
 * (G7: interval = 1.4 / (1 + bonus)) come from the effect data.
 */
export const OFFHAND_WEAPON = Object.freeze({
  id: 'alpha-offhand',
  baseAttackInterval: 1.4,
  attackRange: 100,
  arcDegrees: 100,
});
/** Off-hand hits are talent-created secondary hits (never procs/synergies); `offhand` marks them. */
export const OFFHAND_TAGS: readonly CombatTag[] = Object.freeze([
  'talent',
  'secondary',
  'offhand',
  'physical',
  'melee',
]);
