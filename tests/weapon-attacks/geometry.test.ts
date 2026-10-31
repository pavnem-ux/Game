import { describe, expect, it } from 'vitest';
import {
  circleIntersectsSector,
  segmentCircleIntersection,
  edgeDistance,
} from '../../src/weapon-attacks';
const origin = { x: 0, y: 0 },
  direction = { x: 1, y: 0 };
describe('circle against filled sector geometry', () => {
  it.each([
    [{ x: 50, y: 0, radius: 1 }, true],
    [{ x: -50, y: 0, radius: 1 }, false],
    [{ x: 95, y: 0, radius: 5 }, true],
    [{ x: 96, y: 0, radius: 5 }, false],
    [{ x: 0, y: 0, radius: 0 }, true],
    [{ x: -3, y: 0, radius: 4 }, true],
    [{ x: 0, y: 60, radius: 1 }, false],
  ])('checks %j -> %s', (circle, expected) =>
    expect(circleIntersectsSector(circle, origin, direction, 90, 100)).toBe(expected),
  );
  it('includes exact angular boundary with zero target radius', () => {
    const angle = (50 * Math.PI) / 180;
    expect(
      circleIntersectsSector(
        { x: 60 * Math.cos(angle), y: 60 * Math.sin(angle), radius: 0 },
        origin,
        direction,
        90,
        100,
      ),
    ).toBe(true);
  });
  it('includes a circle crossing the radial edge even when its center is outside the sector', () => {
    const angle = (55 * Math.PI) / 180,
      circle = { x: 50 * Math.cos(angle), y: 50 * Math.sin(angle), radius: 5 };
    expect(circleIntersectsSector(circle, origin, direction, 90, 100)).toBe(true);
    expect(circleIntersectsSector({ ...circle, radius: 3 }, origin, direction, 90, 100)).toBe(
      false,
    );
  });
  it('includes partial arc-corner overlap but rejects the enclosing-circle false positive', () => {
    const a = (53 * Math.PI) / 180,
      c = { x: 92 * Math.cos(a), y: 92 * Math.sin(a), radius: 6 };
    expect(circleIntersectsSector(c, origin, direction, 90, 100)).toBe(true);
    expect(circleIntersectsSector({ ...c, radius: 4 }, origin, direction, 90, 100)).toBe(false);
  });
  it('handles 360-degree and reflex sectors and rotated origins', () => {
    expect(circleIntersectsSector({ x: -50, y: 0, radius: 1 }, origin, direction, 90, 360)).toBe(
      true,
    );
    expect(circleIntersectsSector({ x: 0, y: 50, radius: 1 }, origin, direction, 90, 270)).toBe(
      true,
    );
    expect(
      circleIntersectsSector({ x: 10, y: 50, radius: 1 }, { x: 10, y: 10 }, { x: 0, y: 1 }, 50, 70),
    ).toBe(true);
  });
  it('uses center to target edge, including origin overlap', () => {
    expect(edgeDistance(origin, { x: 120, y: 0, radius: 30 })).toBe(90);
    expect(edgeDistance(origin, { x: 3, y: 4, radius: 10 })).toBe(0);
  });
});
describe('swept segment-circle collision', () => {
  it('does not tunnel through a small circle in a long update', () =>
    expect(segmentCircleIntersection(origin, { x: 1000, y: 0 }, { x: 500, y: 0 }, 2)).toBeCloseTo(
      0.498,
    ));
  it('returns first contact, includes tangency and starting overlap', () => {
    expect(segmentCircleIntersection(origin, { x: 100, y: 0 }, { x: 50, y: 0 }, 10)).toBe(0.4);
    expect(segmentCircleIntersection(origin, { x: 100, y: 0 }, { x: 50, y: 10 }, 10)).toBe(0.5);
    expect(segmentCircleIntersection(origin, { x: 100, y: 0 }, origin, 1)).toBe(0);
  });
  it('rejects misses and handles zero-length segments', () => {
    expect(segmentCircleIntersection(origin, { x: 100, y: 0 }, { x: 50, y: 11 }, 10)).toBeNull();
    expect(segmentCircleIntersection(origin, origin, { x: 50, y: 0 }, 1)).toBeNull();
    expect(segmentCircleIntersection(origin, origin, origin, 1)).toBe(0);
  });
});
