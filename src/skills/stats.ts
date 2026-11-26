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
  /** Task 09.1: percent movement-speed bonus (talents «movement speed +X%»). */
  readonly movementSpeedPercent: number;
  /** Task 11 (additive; 0 for every earlier source): percent area size (gear «area size»). */
  readonly areaSizePercent: number;
  /**
   * Task 40 (additive; gear only, 0 for every earlier source): flat main stats, added to the class
   * attributes before every percent modifier and before the caps.
   */
  readonly flatPhysicalDamage: number;
  readonly flatMagicalDamage: number;
  readonly flatMaxHp: number;
  /** Task 40 run stats (not combat attributes; read by the world): see `RUN_BONUS_KEYS`. */
  readonly eliteDamagePercent: number;
  readonly hpRegenPercent: number;
  readonly pickupRadiusPercent: number;
  readonly runXpPercent: number;
  readonly goldFindPercent: number;
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
  movementSpeedPercent: 0,
  areaSizePercent: 0,
  flatPhysicalDamage: 0,
  flatMagicalDamage: 0,
  flatMaxHp: 0,
  eliteDamagePercent: 0,
  hpRegenPercent: 0,
  pickupRadiusPercent: 0,
  runXpPercent: 0,
  goldFindPercent: 0,
});

/**
 * Character Stats boundary: uncapped permanent attributes + run modifiers, then the existing central
 * caps exactly once. With no modifiers this equals calculateCharacterStats().combatAttributes.
 */
export function composeRunStats(primary: PrimaryAttributes, m: RunStatModifiers): CombatAttributes {
  const base = deriveUncappedCombatAttributes(primary);
  return applyCombatAttributeCaps({
    ...base,
    // Task 40: flat gear main stats first, then the percent modifiers, then the caps (once).
    maxHp: (base.maxHp + m.flatMaxHp) * (1 + m.maxHpPercent / 100),
    physicalDamage:
      (base.physicalDamage + m.flatPhysicalDamage) *
      (1 + (m.damagePercent + m.physicalDamagePercent) / 100),
    magicalDamage:
      (base.magicalDamage + m.flatMagicalDamage) *
      (1 + (m.damagePercent + m.magicalDamagePercent) / 100),
    resistance: base.resistance + m.resistance,
    attackSpeed: base.attackSpeed + m.attackSpeed,
    criticalChance: base.criticalChance + m.criticalChance,
    criticalDamage: base.criticalDamage + m.criticalDamage,
    movementSpeed: (base.movementSpeed + m.movementSpeed) * (1 + m.movementSpeedPercent / 100),
    dodgeChance: base.dodgeChance + m.dodgeChance,
    cooldownReduction: base.cooldownReduction + m.cooldownReduction,
    areaSize: base.areaSize * (1 + m.areaSizePercent / 100),
  });
}
