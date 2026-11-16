import { describe, expect, it } from 'vitest';
import { arrowDistanceLabel, edgeArrow } from '../../src/engine/activity-arrows';

const view = { x: 1000, y: 1000, width: 1280, height: 720 };
const player = { x: 1640, y: 1360 };

describe('Task 24 — off-screen activity arrows (pure geometry)', () => {
  it('no arrow while the activity is on screen', () => {
    expect(edgeArrow(view, { x: 1700, y: 1400 }, player)).toBeNull();
    expect(edgeArrow(view, { x: 1000 - 10, y: 1400 }, player)).toBeNull(); // within the margin
  });
  it('right of the view: on the right edge, inset, pointing right', () => {
    const a = edgeArrow(view, { x: 3000, y: 1360 }, player)!;
    expect(a.x).toBeCloseTo(1280 - 34, 6);
    expect(a.y).toBeCloseTo(360, 6);
    expect(a.angle).toBeCloseTo(0, 6);
    expect(a.distance).toBeCloseTo(1360, 6);
  });
  it('diagonal targets stay inside the inset rectangle', () => {
    for (const target of [
      { x: 0, y: 0 },
      { x: 3600, y: 0 },
      { x: 0, y: 3600 },
      { x: 3600, y: 3600 },
      { x: 1640, y: 100 },
    ]) {
      const a = edgeArrow(view, target, player)!;
      expect(a.x).toBeGreaterThanOrEqual(34 - 1e-9);
      expect(a.x).toBeLessThanOrEqual(1280 - 34 + 1e-9);
      expect(a.y).toBeGreaterThanOrEqual(34 - 1e-9);
      expect(a.y).toBeLessThanOrEqual(720 - 34 + 1e-9);
      // On the inset rectangle's border (one coordinate at its limit).
      const onX = Math.abs(a.x - 34) < 1e-6 || Math.abs(a.x - (1280 - 34)) < 1e-6;
      const onY = Math.abs(a.y - 34) < 1e-6 || Math.abs(a.y - (720 - 34)) < 1e-6;
      expect(onX || onY).toBe(true);
    }
  });
  it('distance label rounds to 10 units', () => {
    expect(arrowDistanceLabel(617)).toBe('620');
    expect(arrowDistanceLabel(904.9)).toBe('900');
  });
});
