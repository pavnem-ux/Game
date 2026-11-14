import { BASE_COMBAT_ATTRIBUTES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import type { WeaponConfig } from '../weapon-attacks';
import type { EnemyConfig } from '../enemy-ai';
import type { EffectDefinition } from '../status-effects';
/** Provisional alpha content, NOT permanent balance or class progression. World units = pixels. */
export const ALPHA = Object.freeze({
  arenaSize: 3600,
  playerRadius: 13,
  baseMovementSpeed: 185,
  controlStep: 1 / 60,
  enemyCap: 120,
  eventHistoryLimit: 160,
});
export const CLASS_LABELS: Record<CharacterClass, string> = {
  warrior: 'Warrior',
  mage: 'Mage',
  archer: 'Archer',
  rogue: 'Rogue',
};
export const WEAPON_LABELS: Record<CharacterClass, string> = {
  warrior: 'Sword',
  mage: 'Staff',
  archer: 'Bow',
  rogue: 'Twin Daggers',
};
export const ALPHA_WEAPONS: Readonly<Record<CharacterClass, WeaponConfig>> = {
  warrior: {
    id: 'alpha-sword',
    category: 'sword',
    allowedClass: 'warrior',
    damageType: 'physical',
    pattern: 'melee_arc',
    damageCoefficient: 1.3,
    baseAttackInterval: 0.8,
    attackRange: 115,
    arcDegrees: 130,
  },
  mage: {
    id: 'alpha-staff',
    category: 'staff',
    allowedClass: 'mage',
    damageType: 'magical',
    pattern: 'projectile',
    damageCoefficient: 1,
    baseAttackInterval: 0.65,
    attackRange: 520,
    projectile: { speed: 470, radius: 6, maxTravelDistance: 650 },
  },
  archer: {
    id: 'alpha-bow',
    category: 'bow',
    allowedClass: 'archer',
    damageType: 'physical',
    pattern: 'projectile',
    damageCoefficient: 1,
    baseAttackInterval: 0.6,
    attackRange: 580,
    projectile: { speed: 650, radius: 4, maxTravelDistance: 720 },
  },
  rogue: {
    id: 'alpha-daggers',
    category: 'dual_daggers',
    allowedClass: 'rogue',
    damageType: 'physical',
    pattern: 'dual_melee',
    damageCoefficient: 0.85,
    baseAttackInterval: 0.8,
    attackRange: 90,
    arcDegrees: 100,
    secondStrikeFraction: 0.4,
  },
};
export const ALPHA_BALANCE = Object.freeze({
  enemyMovementMultiplier: 0.8,
  enemyAttackIntervalMultiplier: 1.3,
  runLevelHealingFraction: 0.15,
});
export const ALPHA_ENEMIES: Readonly<Record<'melee' | 'ranged', EnemyConfig>> = {
  melee: {
    behavior: 'melee',
    movementSpeed: 100 * ALPHA_BALANCE.enemyMovementMultiplier,
    radius: 14,
    attackInterval: 0.9 * ALPHA_BALANCE.enemyAttackIntervalMultiplier,
    attackCoefficient: 1,
    damageType: 'physical',
  },
  ranged: {
    behavior: 'ranged',
    movementSpeed: 82 * ALPHA_BALANCE.enemyMovementMultiplier,
    radius: 15,
    attackInterval: 1.7 * ALPHA_BALANCE.enemyAttackIntervalMultiplier,
    attackCoefficient: 1,
    damageType: 'magical',
    attackRange: 360,
    retreatDistance: 150,
    hysteresis: 18,
    projectile: { speed: 240, radius: 6, maxTravelDistance: 700 },
  },
};
export const ALPHA_ENEMY_STATS = Object.freeze({
  ...BASE_COMBAT_ATTRIBUTES,
  maxHp: 90,
  physicalDamage: 18,
  magicalDamage: 22,
  resistance: 5,
  criticalChance: 8,
  dodgeChance: 0,
});
export function defaultOnHit(characterClass: CharacterClass): readonly EffectDefinition[] {
  if (characterClass === 'warrior') return [];
  return [
    {
      effectType:
        characterClass === 'mage' ? 'burn' : characterClass === 'archer' ? 'poison' : 'bleed',
      rawDamagePerTick: 3,
      probabilityPercent: 100,
      duration: 4,
    },
  ];
}

/**
 * Task 14 dash (provisional): Space / Shift dashes `distance` units in the current movement
 * direction (last direction when standing; right at the start) over `duration` seconds; `cooldown`
 * from the dash start; `invulnerability` seconds of the existing Player Survival hit protection.
 */
export const DASH_RULES = Object.freeze({
  distance: 140,
  duration: 0.15,
  cooldown: 3,
  invulnerability: 0.2,
});
