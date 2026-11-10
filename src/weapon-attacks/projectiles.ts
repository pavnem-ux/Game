import type { CombatCore, EntityAffiliation } from '../combat-core';
import type { CombatBody, Point, ProjectileSnapshot } from './types';
import { segmentCircleIntersection } from './geometry';
import { compareIds, validTarget } from './targeting';
export interface ProjectileState {
  readonly data: Omit<ProjectileSnapshot, 'x' | 'y' | 'distanceTraveled'>;
  readonly origin: Point;
  readonly affiliation: EntityAffiliation;
  readonly sequence: number;
  /** Task 07: remaining extra targets and already-hit IDs for piercing projectiles. */
  pierceRemaining?: number;
  hitIds?: Set<string>;
  distanceTraveled: number;
  x: number;
  y: number;
}
export interface FlightEvent {
  readonly at: number;
  readonly priority: 0 | 1;
  readonly order: number;
  readonly kind: 'collision' | 'expiry';
  readonly projectile: ProjectileState;
  readonly targetId?: string;
}
export function nextFlightEvent(
  p: ProjectileState,
  now: number,
  core: CombatCore,
  bodies: ReadonlyMap<string, CombatBody>,
  velocities?: ReadonlyMap<string, Point>,
): FlightEvent {
  const remaining = Math.max(0, p.data.maxTravelDistance - p.distanceTraveled);
  const end = { x: p.x + p.data.direction.x * remaining, y: p.y + p.data.direction.y * remaining };
  let fraction = Infinity,
    targetId: string | undefined;
  for (const [id, body] of bodies) {
    if (p.hitIds?.has(id) || !validTarget(core, p.data.sourceId, p.affiliation, id)) continue;
    const velocity = velocities?.get(id) ?? { x: 0, y: 0 };
    const duration = remaining / p.data.speed;
    const relativeEnd = { x: end.x - velocity.x * duration, y: end.y - velocity.y * duration };
    const t = segmentCircleIntersection(p, relativeEnd, body, p.data.radius + body.radius);
    if (
      t !== null &&
      (t < fraction || (t === fraction && (targetId === undefined || compareIds(id, targetId) < 0)))
    ) {
      fraction = t;
      targetId = id;
    }
  }
  if (targetId !== undefined)
    return {
      at: now + (remaining * fraction) / p.data.speed,
      priority: 0,
      order: p.sequence,
      kind: 'collision',
      projectile: p,
      targetId,
    };
  return {
    at: now + remaining / p.data.speed,
    priority: 1,
    order: p.sequence,
    kind: 'expiry',
    projectile: p,
  };
}
export function advanceProjectile(p: ProjectileState, dt: number) {
  p.distanceTraveled = Math.min(p.data.maxTravelDistance, p.distanceTraveled + p.data.speed * dt);
  p.x = p.origin.x + p.data.direction.x * p.distanceTraveled;
  p.y = p.origin.y + p.data.direction.y * p.distanceTraveled;
}
export function projectileSnapshot(p: ProjectileState): ProjectileSnapshot {
  return Object.freeze({ ...p.data, x: p.x, y: p.y, distanceTraveled: p.distanceTraveled });
}
