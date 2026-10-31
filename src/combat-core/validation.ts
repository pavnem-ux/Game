import { applyCombatAttributeCaps, BASE_COMBAT_ATTRIBUTES } from '../character-stats';
import type { CombatEntityStats, DamageType, RandomSource } from './types';

export function finiteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

export function nonNegative(value: unknown, name: string): asserts value is number {
  finiteNumber(value, name);
  if (value < 0) throw new RangeError(`${name} must be non-negative.`);
}

export function identifier(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

export function damageType(value: unknown): asserts value is DamageType {
  if (value !== 'physical' && value !== 'magical') {
    throw new TypeError('damageType must be physical or magical.');
  }
}

/** Accepts a full Character Stats snapshot's combatAttributes or its relevant subset. */
export function normalizeEntityStats(stats: CombatEntityStats): CombatEntityStats {
  if (!stats || typeof stats !== 'object') throw new TypeError('stats must be an object.');
  for (const key of [
    'maxHp',
    'physicalDamage',
    'magicalDamage',
    'resistance',
    'criticalChance',
    'criticalDamage',
    'dodgeChance',
  ] as const) {
    nonNegative(stats[key], `stats.${key}`);
  }
  if (stats.maxHp < 1) throw new RangeError('stats.maxHp must be at least 1 HP.');
  // Fill unrelated fields only to reuse the existing central cap boundary.
  // Their values are not exposed by this minimal entity model.
  const final = applyCombatAttributeCaps({ ...BASE_COMBAT_ATTRIBUTES, ...stats });
  return Object.freeze({
    maxHp: final.maxHp,
    physicalDamage: final.physicalDamage,
    magicalDamage: final.magicalDamage,
    resistance: final.resistance,
    criticalChance: final.criticalChance,
    criticalDamage: final.criticalDamage,
    dodgeChance: final.dodgeChance,
  });
}

/** Exactly one draw per check, including a zero chance; [0, 1) matches Math.random. */
export function rollChance(chance: number, random: RandomSource): boolean {
  const roll = random();
  if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('Random source must return a finite number in [0, 1).');
  }
  return roll < chance / 100;
}
