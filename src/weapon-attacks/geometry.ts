import type { CombatBody, Point } from './types';
const EPS = 1e-9;
export function edgeDistance(origin: Point, body: CombatBody): number {
  return Math.max(0, Math.hypot(body.x - origin.x, body.y - origin.y) - body.radius);
}
export function aimDirection(origin: Point, target: Point, fallback: Point): Point {
  const dx = target.x - origin.x,
    dy = target.y - origin.y,
    length = Math.hypot(dx, dy);
  return length === 0 ? fallback : Object.freeze({ x: dx / length, y: dy / length });
}
function pointSegmentDistanceSquared(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    l2 = dx * dx + dy * dy;
  const t =
    l2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / l2));
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}
/** Circle vs filled circular sector, including radial edges, arc and origin. */
export function circleIntersectsSector(
  body: CombatBody,
  origin: Point,
  direction: Point,
  range: number,
  arcDegrees: number,
): boolean {
  const dx = body.x - origin.x,
    dy = body.y - origin.y,
    d = Math.hypot(dx, dy);
  if (d <= body.radius + EPS) return true;
  if (d > range + body.radius + EPS) return false;
  const angle = Math.atan2(direction.y, direction.x),
    relative = Math.atan2(
      Math.sin(Math.atan2(dy, dx) - angle),
      Math.cos(Math.atan2(dy, dx) - angle),
    );
  const half = (arcDegrees * Math.PI) / 360;
  if (Math.abs(relative) <= half + EPS) return true;
  for (const a of [angle - half, angle + half]) {
    const end = { x: origin.x + Math.cos(a) * range, y: origin.y + Math.sin(a) * range };
    if (pointSegmentDistanceSquared(body, origin, end) <= body.radius ** 2 + EPS) return true;
  }
  return false;
}
/** First intersection fraction on a swept segment; start overlap and tangency count. */
export function segmentCircleIntersection(
  start: Point,
  end: Point,
  center: Point,
  radius: number,
): number | null {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    fx = start.x - center.x,
    fy = start.y - center.y;
  const a = dx * dx + dy * dy,
    c = fx * fx + fy * fy - radius * radius;
  // EPS is a distance in world units, consistent with melee/contact eligibility.
  // Testing squared distance against a linear EPS can predict a rounded-to-now hit
  // for a long sweep that disappears when the same boundary is resolved at dt=0.
  if (Math.hypot(fx, fy) <= radius + EPS) return 0;
  if (a === 0) return null;
  const b = fx * dx + fy * dy,
    discriminant = b * b - a * c;
  const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(b * b), Math.abs(a * c));
  if (discriminant < -tolerance) return null;
  const t = (-b - Math.sqrt(Math.max(0, discriminant))) / a;
  return t >= -EPS && t <= 1 + EPS ? Math.max(0, Math.min(1, t)) : null;
}
