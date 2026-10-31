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
  warrior: 'Воин',
  mage: 'Маг',
  archer: 'Лучник',
  rogue: 'Разбойник',
};
export const WEAPON_LABELS: Record<CharacterClass, string> = {
  warrior: 'Меч',
  mage: 'Посох',
  archer: 'Лук',
  rogue: 'Парные кинжалы',
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
export const ALPHA_ENEMIES: Readonly<Record<'melee' | 'ranged', EnemyConfig>> = {
  melee: {
    behavior: 'melee',
    movementSpeed: 100,
    radius: 14,
    attackInterval: 0.9,
    attackCoefficient: 1,
    damageType: 'physical',
  },
  ranged: {
    behavior: 'ranged',
    movementSpeed: 82,
    radius: 15,
    attackInterval: 1.7,
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
