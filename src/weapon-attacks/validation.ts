import { applyCombatAttributeCaps, BASE_COMBAT_ATTRIBUTES } from '../character-stats';
import type { Point, WeaponConfig } from './types';
export function finite(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
}
export function nonNegative(value: unknown, name: string): asserts value is number {
  finite(value, name);
  if (value < 0) throw new RangeError(`${name} must be non-negative.`);
}
export function positive(value: unknown, name: string): asserts value is number {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive.`);
}
export function validatePoint(value: Point, name: string) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must be a point.`);
  finite(value.x, `${name}.x`);
  finite(value.y, `${name}.y`);
}
export function normalizedDirection(value: Point): Point {
  validatePoint(value, 'direction');
  const length = Math.hypot(value.x, value.y);
  positive(length, 'direction length');
  return Object.freeze({ x: value.x / length, y: value.y / length });
}
export function cappedAttackSpeed(value: number): number {
  positive(value, 'attackSpeedPercent');
  return applyCombatAttributeCaps({ ...BASE_COMBAT_ATTRIBUTES, attackSpeed: value }).attackSpeed;
}
const categories = {
  sword: { allowedClass: 'warrior', pattern: 'melee_arc', damageType: 'physical' },
  staff: { allowedClass: 'mage', pattern: 'projectile', damageType: 'magical' },
  bow: { allowedClass: 'archer', pattern: 'projectile', damageType: 'physical' },
  dual_daggers: { allowedClass: 'rogue', pattern: 'dual_melee', damageType: 'physical' },
} as const;
/** Copy and freeze: mutating a caller's configuration cannot alter an equipped instance. */
export function validateWeaponConfig(weapon: WeaponConfig): WeaponConfig {
  if (!weapon || typeof weapon !== 'object') throw new TypeError('weapon must be an object.');
  if (typeof weapon.id !== 'string' || !weapon.id.trim())
    throw new TypeError('weapon.id must be non-empty.');
  if (!Object.hasOwn(categories, weapon.category))
    throw new TypeError('Unsupported weapon category.');
  const rule = categories[weapon.category];
  if (
    weapon.allowedClass !== rule.allowedClass ||
    weapon.pattern !== rule.pattern ||
    weapon.damageType !== rule.damageType
  )
    throw new TypeError('Weapon class, pattern and fixed damage type must match its category.');
  nonNegative(weapon.damageCoefficient, 'damageCoefficient');
  positive(weapon.baseAttackInterval, 'baseAttackInterval');
  nonNegative(weapon.attackRange, 'attackRange');
  if (weapon.pattern === 'projectile') {
    if (!weapon.projectile) throw new TypeError('projectile configuration is required.');
    positive(weapon.projectile.speed, 'projectile.speed');
    nonNegative(weapon.projectile.radius, 'projectile.radius');
    positive(weapon.projectile.maxTravelDistance, 'maxTravelDistance');
    return Object.freeze({ ...weapon, projectile: Object.freeze({ ...weapon.projectile }) });
  }
  positive(weapon.arcDegrees, 'arcDegrees');
  if (weapon.arcDegrees > 360) throw new RangeError('arcDegrees must not exceed 360.');
  if (weapon.pattern === 'dual_melee') {
    positive(weapon.secondStrikeFraction, 'secondStrikeFraction');
    if (weapon.secondStrikeFraction >= 1)
      throw new RangeError('secondStrikeFraction must be below 1.');
  }
  return Object.freeze({ ...weapon });
}
