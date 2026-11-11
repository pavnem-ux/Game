import type { Point } from '../weapon-attacks';

/**
 * Task 12: shared hit test of telegraphed ground circles (boss circle AoE and the bombard's
 * artillery strike): the player's body overlaps the circle.
 */
export function circleHitsBody(
  center: Point,
  radius: number,
  body: Point & { readonly radius: number },
): boolean {
  return Math.hypot(body.x - center.x, body.y - center.y) <= radius + body.radius;
}
