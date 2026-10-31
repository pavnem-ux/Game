import type { EnemyAIOptions, MeleeEnemyConfig, RangedEnemyConfig } from '../../src/enemy-ai';
// TEST PROFILES ONLY: these values are not approved gameplay balance.
export const NORMAL_MELEE = {
  behavior: 'melee',
  movementSpeed: 100,
  radius: 10,
  attackInterval: 1,
  attackCoefficient: 1,
  damageType: 'physical',
} as const satisfies MeleeEnemyConfig;
export const FAST_MELEE = {
  ...NORMAL_MELEE,
  movementSpeed: 160,
  attackInterval: 0.5,
  attackCoefficient: 0.5,
} as const satisfies MeleeEnemyConfig;
export const RANGED = {
  behavior: 'ranged',
  movementSpeed: 80,
  radius: 10,
  attackInterval: 1.2,
  attackCoefficient: 0.75,
  damageType: 'magical',
  attackRange: 200,
  retreatDistance: 70,
  hysteresis: 5,
  projectile: { speed: 300, radius: 5, maxTravelDistance: 400 },
} as const satisfies RangedEnemyConfig;
export const AI_OPTIONS = {
  playerId: 'player',
  movementStep: 0.05,
  separation: { cellSize: 64, padding: 12, strength: 0 },
} as const satisfies EnemyAIOptions;
