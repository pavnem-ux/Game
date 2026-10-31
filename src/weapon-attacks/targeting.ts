import type { CombatCore, EntityAffiliation } from '../combat-core';
import type { CombatBody, Point } from './types';
import { edgeDistance } from './geometry';
export function compareIds(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function validTarget(
  core: CombatCore,
  sourceId: string,
  affiliation: EntityAffiliation,
  targetId: string,
): boolean {
  const target = core.getEntity(targetId);
  return targetId !== sourceId && target.alive && target.affiliation !== affiliation;
}
export function nearestTarget(
  core: CombatCore,
  bodies: ReadonlyMap<string, CombatBody>,
  sourceId: string,
  origin: Point,
  range: number,
): string | null {
  const source = core.getEntity(sourceId);
  if (!source.alive) return null;
  let nearest: string | null = null,
    best = Infinity;
  for (const [id, body] of bodies) {
    if (!validTarget(core, sourceId, source.affiliation, id)) continue;
    const distance = edgeDistance(origin, body);
    if (distance > range) continue;
    if (
      distance < best ||
      (distance === best && (nearest === null || compareIds(id, nearest) < 0))
    ) {
      nearest = id;
      best = distance;
    }
  }
  return nearest;
}
