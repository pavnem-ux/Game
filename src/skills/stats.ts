import { applyCombatAttributeCaps, deriveUncappedCombatAttributes } from '../character-stats';
import type { CombatAttributes, PrimaryAttributes } from '../character-stats';

/** Additive run modifiers from passives and temporary buffs. Percent values are percentage points. */
export interface RunStatModifiers {
  readonly damagePercent: number;
  readonly physicalDamagePercent: number;
  readonly attackSpeed: number;
  readonly maxHpPercent: number;
  readonly resistance: number;
  readonly criticalChance: number;
  readonly criticalDamage: number;
  readonly movementSpeed: number;
  /** Task 09 (additive; 0 for every Task 07 source): talent stat modifiers. */
  readonly magicalDamagePercent: number;
  readonly dodgeChance: number;
  readonly cooldownReduction: number;
}
export const NO_MODIFIERS: RunStatModifiers = Object.freeze({
  damagePercent: 0,
  physicalDamagePercent: 0,
  attackSpeed: 0,
  maxHpPercent: 0,
  resistance: 0,
  criticalChance: 0,
  criticalDamage: 0,
  movementSpeed: 0,
  magicalDamagePercent: 0,
  dodgeChance: 0,
  cooldownReduction: 0,
});

/**
 * Character Stats boundary: uncapped permanent attributes + run modifiers, then the existing central
 * caps exactly once. With no modifiers this equals calculateCharacterStats().combatAttributes.
 */
export function composeRunStats(primary: PrimaryAttributes, m: RunStatModifiers): CombatAttributes {
  const base = deriveUncappedCombatAttributes(primary);
  return applyCombatAttributeCaps({
    ...base,
    maxHp: base.maxHp * (1 + m.maxHpPercent / 100),
    physicalDamage: base.physicalDamage * (1 + (m.damagePercent + m.physicalDamagePercent) / 100),
    magicalDamage: base.magicalDamage * (1 + (m.damagePercent + m.magicalDamagePercent) / 100),
    resistance: base.resistance + m.resistance,
    attackSpeed: base.attackSpeed + m.attackSpeed,
    criticalChance: base.criticalChance + m.criticalChance,
    criticalDamage: base.criticalDamage + m.criticalDamage,
    movementSpeed: base.movementSpeed + m.movementSpeed,
    dodgeChance: base.dodgeChance + m.dodgeChance,
    cooldownReduction: base.cooldownReduction + m.cooldownReduction,
  });
}
