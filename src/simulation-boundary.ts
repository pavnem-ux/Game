/** A read-only hint. Recompute after any geometry or Core change; never cache as a command. */
export interface SimulationBoundary {
  readonly time: number;
  readonly priority: number;
}
export function sameInstant(a: number, b: number): boolean {
  return Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));
}
export function validateAdvance(now: number, time: number, next: number | null): void {
  if (!Number.isFinite(time) || time < now)
    throw new RangeError('Boundary time must be finite and cannot move backwards.');
  if (next !== null && next < time && !sameInstant(next, time))
    throw new RangeError('Cannot advance past an unresolved simulation boundary.');
}
