import type { CombatAttributes } from '../character-stats';
import type { EnemyConfig } from '../enemy-ai';
import { actOf } from '../campaign/config';
import { ALPHA_BALANCE, ALPHA_ENEMIES } from './config';
import { XP_RULES } from './experience';

/**
 * Task 12 §1.2 — normal enemy kinds (data-driven). PROVISIONAL, owner-controlled.
 *
 * `melee` and `ranged` are the existing alpha enemies (unchanged). The new kinds start from the
 * existing melee enemy's stats and speed (map multipliers apply on top), changed by the factors
 * below; damage applies to the kind's damage type. Elites and bosses keep the melee/ranged
 * profiles (unchanged).
 */
export type EnemyKind = 'melee' | 'ranged' | 'swift' | 'brute' | 'bombard';
export type NewEnemyKind = Exclude<EnemyKind, 'melee' | 'ranged'>;
export const ENEMY_KINDS: readonly EnemyKind[] = Object.freeze([
  'melee',
  'ranged',
  'swift',
  'brute',
  'bombard',
]);
export const NEW_ENEMY_KINDS: readonly NewEnemyKind[] = Object.freeze([
  'swift',
  'brute',
  'bombard',
]);

export interface NewEnemyType {
  readonly name: string;
  readonly hp: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  /** Run XP of one kill (crystal value). */
  readonly xp: number;
  /** Attack interval multiplier on the melee enemy's interval (brute ×1.4). */
  readonly attackIntervalScale: number;
}
export const NEW_ENEMY_TYPES: Readonly<Record<NewEnemyKind, NewEnemyType>> = Object.freeze({
  swift: Object.freeze({
    name: 'Стремительный бес',
    hp: 0.4,
    damage: 0.6,
    speed: 1.8,
    radius: 11,
    xp: 5,
    attackIntervalScale: 1,
  }),
  brute: Object.freeze({
    name: 'Каменный тролль',
    hp: 3.5,
    damage: 1.8,
    speed: 0.55,
    radius: 22,
    xp: 20,
    attackIntervalScale: 1.4,
  }),
  bombard: Object.freeze({
    name: 'Колдун-бомбардир',
    hp: 0.8,
    damage: 1.2,
    speed: 0.7,
    radius: 15,
    xp: 12,
    /** Unused for artillery: its own interval is `ARTILLERY.interval` (below). */
    attackIntervalScale: 1,
  }),
});
/**
 * `artillery` behaviour of the bombard: keeps range like the ranged enemy (attack range 420),
 * marks the player's position every 3.2 s × the alpha attack-interval multiplier, strikes the
 * marked circle (radius 70) 1.0 s later with magical damage.
 */
export const ARTILLERY = Object.freeze({
  attackRange: 420,
  retreatDistance: 150,
  hysteresis: 18,
  interval: 3.2,
  telegraphRadius: 70,
  telegraphDelay: 1,
});

/**
 * Spawn mix (shares of normal spawns, deterministic like `rangedShare`): each kind appears from
 * its first map; per act the kind's share (Act I «max» = its share once unlocked). The rest stays
 * melee/ranged as now (the ranged share is unchanged).
 */
export const ENEMY_MIX = Object.freeze({
  firstMap: Object.freeze({ swift: 2, brute: 4, bombard: 6 }) as Readonly<
    Record<NewEnemyKind, number>
  >,
  acts: Object.freeze({
    1: Object.freeze({ swift: 0.15, brute: 0.08, bombard: 0.05 }),
    2: Object.freeze({ swift: 0.2, brute: 0.1, bombard: 0.08 }),
    3: Object.freeze({ swift: 0.2, brute: 0.12, bombard: 0.1 }),
    4: Object.freeze({ swift: 0.22, brute: 0.14, bombard: 0.12 }),
  }) as Readonly<Record<1 | 2 | 3 | 4, Readonly<Record<NewEnemyKind, number>>>>,
});
/** Shares of the new kinds on a campaign map (0 before a kind's first map). */
export function enemyMix(mapId: number): Readonly<Record<NewEnemyKind, number>> {
  const act = ENEMY_MIX.acts[actOf(mapId).id as 1 | 2 | 3 | 4];
  return Object.freeze({
    swift: mapId >= ENEMY_MIX.firstMap.swift ? act.swift : 0,
    brute: mapId >= ENEMY_MIX.firstMap.brute ? act.brute : 0,
    bombard: mapId >= ENEMY_MIX.firstMap.bombard ? act.bombard : 0,
  });
}

/** Behaviour profile of a kind (before the map's speed modifier). */
export function enemyKindConfig(kind: EnemyKind): EnemyConfig {
  return KIND_CONFIGS[kind];
}
const melee = ALPHA_ENEMIES.melee;
const KIND_CONFIGS: Readonly<Record<EnemyKind, EnemyConfig>> = Object.freeze({
  melee,
  ranged: ALPHA_ENEMIES.ranged,
  swift: Object.freeze({
    ...melee,
    movementSpeed: melee.movementSpeed * NEW_ENEMY_TYPES.swift.speed,
    radius: NEW_ENEMY_TYPES.swift.radius,
  }),
  brute: Object.freeze({
    ...melee,
    movementSpeed: melee.movementSpeed * NEW_ENEMY_TYPES.brute.speed,
    radius: NEW_ENEMY_TYPES.brute.radius,
    attackInterval: melee.attackInterval * NEW_ENEMY_TYPES.brute.attackIntervalScale,
  }),
  bombard: Object.freeze({
    behavior: 'artillery',
    movementSpeed: melee.movementSpeed * NEW_ENEMY_TYPES.bombard.speed,
    radius: NEW_ENEMY_TYPES.bombard.radius,
    attackInterval: ARTILLERY.interval * ALPHA_BALANCE.enemyAttackIntervalMultiplier,
    attackCoefficient: 1,
    damageType: 'magical',
    attackRange: ARTILLERY.attackRange,
    retreatDistance: ARTILLERY.retreatDistance,
    hysteresis: ARTILLERY.hysteresis,
    telegraph: Object.freeze({
      radius: ARTILLERY.telegraphRadius,
      delay: ARTILLERY.telegraphDelay,
    }),
  }),
});

/**
 * Combat attributes of a kind from the run's (map-scaled) normal enemy stats. melee / ranged:
 * unchanged. New kinds: HP × hp; the damage stat of their type = the melee physical damage ×
 * damage (the bombard's magical damage is the melee damage × 1.2).
 */
export function enemyKindStats(kind: EnemyKind, base: CombatAttributes): CombatAttributes {
  if (kind === 'melee' || kind === 'ranged') return base;
  const t = NEW_ENEMY_TYPES[kind];
  const damage = base.physicalDamage * t.damage;
  return Object.freeze({
    ...base,
    maxHp: base.maxHp * t.hp,
    ...(kind === 'bombard' ? { magicalDamage: damage } : { physicalDamage: damage }),
  });
}
/** Run XP of a normal kill of this kind. */
export function enemyKindXp(kind: EnemyKind): number {
  if (kind === 'melee') return XP_RULES.meleeReward;
  if (kind === 'ranged') return XP_RULES.rangedReward;
  return NEW_ENEMY_TYPES[kind].xp;
}
export function isEnemyKind(value: unknown): value is EnemyKind {
  return typeof value === 'string' && (ENEMY_KINDS as readonly string[]).includes(value);
}
