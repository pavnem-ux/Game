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
}
export function desiredState(actor: EnemyActor, player: CombatBody): EnemyBehaviorState {
  if (actor.config.behavior === 'melee') return 'chase';
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
    speed = actor.config.movementSpeed;
  if (actor.state === 'attack' || actor.state === 'idle' || actor.state === 'dead')
    return { x: 0, y: 0 };
  if (d <= EPS) return actor.state === 'retreat' ? { x: speed, y: 0 } : { x: 0, y: 0 };
  const sign = actor.state === 'retreat' ? -1 : 1;
  return { x: (dx / d) * speed * sign, y: (dy / d) * speed * sign };
}
export function separatedVelocity(
  actor: EnemyActor,
  base: Point,
  actors: ReadonlyMap<string, EnemyActor>,
  grid: SpatialGrid,
  maxRadius: number,
  config: SeparationConfig,
): { velocity: Point; checks: number } {
  if (config.strength === 0) return { velocity: base, checks: 0 };
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
  x = base.x + x * actor.config.movementSpeed * config.strength;
  y = base.y + y * actor.config.movementSpeed * config.strength;
  const speed = Math.hypot(x, y),
    limit = actor.config.movementSpeed;
  if (speed > limit) {
    x = (x / speed) * limit;
    y = (y / speed) * limit;
  }
  return { velocity: { x, y }, checks };
}
/** Positive crossing times of a moving point and circle, for steering thresholds/arrival. */
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
