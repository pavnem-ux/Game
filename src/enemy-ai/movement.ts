import type { CombatBody, Point } from '../weapon-attacks';
import { edgeDistance } from '../weapon-attacks';
import type { EnemyBehaviorState, EnemyConfig, SeparationConfig } from './types';
import { EPS, compareIds } from './validation';
import type { SpatialGrid } from './SpatialGrid';
export interface EnemyActor {
  id: string;
  config: EnemyConfig;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: EnemyBehaviorState;
  nextAttackAt: number;
  /** Task 07 crowd control: 1 = unaffected; 0 while stunned. Changed only at boundaries. */
  speedFactor?: number;
  stunned?: boolean;
  /** Task 08 boss abilities (charge, speed buff): multiplier ≥ 1, independent of Slow. */
  speedBoost?: number;
}
/** Effective movement speed after Slow/Stun and any boss speed boost. */
export function actorSpeed(actor: EnemyActor): number {
  return actor.stunned
    ? 0
    : actor.config.movementSpeed * (actor.speedFactor ?? 1) * (actor.speedBoost ?? 1);
}
export function desiredState(actor: EnemyActor, player: CombatBody): EnemyBehaviorState {
  if (actor.config.behavior === 'melee') return 'chase';
  // Task 24: the thief always runs; the nest always holds its ground (velocity 0).
  if (actor.config.behavior === 'flee') return 'retreat';
  if (actor.config.behavior === 'stationary') return 'attack';
  const d = edgeDistance(actor, player),
    c = actor.config;
  if (d < c.retreatDistance - EPS) return 'retreat';
  if (d > c.attackRange + EPS) return 'approach';
  if (actor.state === 'approach' && d > c.attackRange - c.hysteresis + EPS) return 'approach';
  if (actor.state === 'retreat' && d < c.retreatDistance + c.hysteresis - EPS) return 'retreat';
  return 'attack';
}
export function goalVelocity(actor: EnemyActor, player: CombatBody): Point {
  const dx = player.x - actor.x,
    dy = player.y - actor.y,
    d = Math.hypot(dx, dy),
    speed = actorSpeed(actor);
  if (actor.state === 'attack' || actor.state === 'idle' || actor.state === 'dead')
    return { x: 0, y: 0 };
  if (actor.config.behavior === 'flee') return fleeVelocity(actor, player, speed);
  if (d <= EPS) return actor.state === 'retreat' ? { x: speed, y: 0 } : { x: 0, y: 0 };
  const sign = actor.state === 'retreat' ? -1 : 1;
  return { x: (dx / d) * speed * sign, y: (dy / d) * speed * sign };
}
/**
 * Task 24 flee steering: away from the player, plus a push away from each arena edge closer than
 * `edgeMargin` (stronger the closer it is), normalized to the actor's speed. Deterministic.
 */
export function fleeVelocity(actor: EnemyActor, player: CombatBody, speed: number): Point {
  if (actor.config.behavior !== 'flee' || speed === 0) return { x: 0, y: 0 };
  const { bounds, edgeMargin } = actor.config;
  let dx = actor.x - player.x,
    dy = actor.y - player.y;
  const d = Math.hypot(dx, dy);
  if (d <= EPS) {
    dx = 1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  const push = (distance: number) =>
    edgeMargin > 0 && distance < edgeMargin ? (1 - Math.max(0, distance) / edgeMargin) * 2 : 0;
  dx += push(actor.x - bounds.min) - push(bounds.max - actor.x);
  dy += push(actor.y - bounds.min) - push(bounds.max - actor.y);
  // Cornered (the pushes cancel the flight direction): slide along the wall, clockwise.
  if (Math.hypot(dx, dy) <= EPS) {
    dx = -(actor.y - player.y) || 1;
    dy = actor.x - player.x;
  }
  const length = Math.hypot(dx, dy);
  return { x: (dx / length) * speed, y: (dy / length) * speed };
}
export function separatedVelocity(
  actor: EnemyActor,
  base: Point,
  actors: ReadonlyMap<string, EnemyActor>,
  grid: SpatialGrid,
  maxRadius: number,
  config: SeparationConfig,
): { velocity: Point; checks: number } {
  if (config.strength === 0 || actor.stunned) return { velocity: base, checks: 0 };
  let x = 0,
    y = 0,
    checks = 0;
  for (const id of grid.query(actor, actor.config.radius + maxRadius + config.padding)) {
    if (id === actor.id) continue;
    checks++;
    const other = actors.get(id)!;
    const dx = actor.x - other.x,
      dy = actor.y - other.y,
      d = Math.hypot(dx, dy),
      reach = actor.config.radius + other.config.radius + config.padding;
    if (d > reach || (reach === 0 && d > 0)) continue;
    const weight = reach === 0 ? 1 : Math.max(0, 1 - d / reach);
    x += (d <= EPS ? compareIds(actor.id, other.id) : dx / d) * weight;
    y += (d <= EPS ? 0 : dy / d) * weight;
  }
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  const limit = actorSpeed(actor);
  x = base.x + x * limit * config.strength;
  y = base.y + y * limit * config.strength;
  const speed = Math.hypot(x, y);
  if (speed > limit) {
    x = (x / speed) * limit;
    y = (y / speed) * limit;
  }
  return { velocity: { x, y }, checks };
}
/** Positive crossing times of a moving point and circle, for steering thresholds/arrival. */
/**
 * Crossing offsets that are a representable later instant than `clock`. A root closer than the
 * clock's resolution (e.g. an enemy sitting on the player's centre with a separation velocity at
 * t ≈ 368 s) cannot advance time; resolving it would re-create the same root forever. Regular
 * steering (every movementStep) already handles such an actor.
 */
export function futureCrossings(clock: number, crossings: readonly number[]): readonly number[] {
  return crossings.filter((t) => !sameTimeAbs(clock + t, clock));
}
function sameTimeAbs(a: number, b: number) {
  return Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));
}
export function circleCrossings(
  actor: EnemyActor,
  center: Point,
  radius: number,
  horizon: number,
): readonly number[] {
  const x = actor.x - center.x,
    y = actor.y - center.y,
    a = actor.vx ** 2 + actor.vy ** 2;
  if (a === 0) return [];
  const b = x * actor.vx + y * actor.vy,
    c = x * x + y * y - radius * radius,
    disc = b * b - a * c;
  if (disc < -Number.EPSILON * 8 * Math.max(1, Math.abs(b * b), Math.abs(a * c))) return [];
  const root = Math.sqrt(Math.max(0, disc));
  return [(-b - root) / a, (-b + root) / a].filter(
    (t) => t > Number.EPSILON * 8 * Math.max(1, horizon) && t <= horizon + EPS,
  );
}
