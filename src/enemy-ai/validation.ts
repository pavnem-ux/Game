import type { CombatBody, Point, ProjectileConfig } from '../weapon-attacks';
import type { EnemyConfig, SeparationConfig } from './types';
export const EPS = 1e-9;
export const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
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
export function point(value: Point, name: string): Point {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must be a point.`);
  finite(value.x, `${name}.x`);
  finite(value.y, `${name}.y`);
  return Object.freeze({ x: value.x, y: value.y });
}
export function body(value: CombatBody): CombatBody {
  const p = point(value, 'player body');
  nonNegative(value.radius, 'player radius');
  return Object.freeze({ ...p, radius: value.radius });
}
export function unit(value: Point): Point {
  const p = point(value, 'direction'),
    length = Math.hypot(p.x, p.y);
  positive(length, 'direction length');
  return Object.freeze({ x: p.x / length, y: p.y / length });
}
export function projectile(value: ProjectileConfig): ProjectileConfig {
  if (!value || typeof value !== 'object') throw new TypeError('projectile config is required.');
  positive(value.speed, 'projectile.speed');
  nonNegative(value.radius, 'projectile.radius');
  positive(value.maxTravelDistance, 'maxTravelDistance');
  return Object.freeze({
    speed: value.speed,
    radius: value.radius,
    maxTravelDistance: value.maxTravelDistance,
  });
}
export function enemyConfig(value: EnemyConfig): EnemyConfig {
  if (!value || typeof value !== 'object') throw new TypeError('Enemy config is required.');
  if (value.behavior !== 'melee' && value.behavior !== 'ranged')
    throw new TypeError('behavior must be melee or ranged.');
  nonNegative(value.movementSpeed, 'movementSpeed');
  nonNegative(value.radius, 'radius');
  positive(value.attackInterval, 'attackInterval');
  nonNegative(value.attackCoefficient, 'attackCoefficient');
  if (value.damageType !== 'physical' && value.damageType !== 'magical')
    throw new TypeError('damageType must be physical or magical.');
  if (value.behavior === 'melee') return Object.freeze({ ...value });
  positive(value.attackRange, 'attackRange');
  nonNegative(value.retreatDistance, 'retreatDistance');
  nonNegative(value.hysteresis, 'hysteresis');
  if (
    value.retreatDistance >= value.attackRange ||
    value.hysteresis * 2 >= value.attackRange - value.retreatDistance
  )
    throw new RangeError(
      'Ranged thresholds need retreatDistance < attackRange and a nonempty hysteresis band.',
    );
  return Object.freeze({ ...value, projectile: projectile(value.projectile) });
}
export function separationConfig(value: SeparationConfig): SeparationConfig {
  if (!value || typeof value !== 'object') throw new TypeError('separation config is required.');
  positive(value.cellSize, 'cellSize');
  nonNegative(value.padding, 'separation.padding');
  nonNegative(value.strength, 'separation.strength');
  if (value.strength > 1)
    throw new RangeError('separation.strength must be a fraction from 0 to 1.');
  return Object.freeze({ ...value });
}
export function sameTime(a: number, b: number) {
  return Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));
}
export function policyResult(value: unknown): boolean {
  if (typeof value !== 'boolean')
    throw new TypeError('canResolveDirectDamage must return boolean.');
  return value;
}
