import { describe, expect, it } from 'vitest';
import {
  applyResistance,
  calculateCriticalDamage,
  scaleAttackFrequency,
  scaleMovementSpeed,
  scaleCooldown,
  scaleCircularAoeRadius,
} from '../../src/character-stats';

describe('pure usage-boundary formulas', () => {
  it.each([
    [0, 100],
    [100, 50],
    [300, 25],
  ])('100 incoming damage with RES %s becomes %s', (resistance, expected) =>
    expect(applyResistance(100, resistance)).toBeCloseTo(expected, 12),
  );
  it('does not invent a minimum damage floor or a resistance cap', () => {
    expect(applyResistance(0, 300)).toBe(0);
    expect(applyResistance(1, 10000)).toBeCloseTo(1 / 101, 12);
  });
  it.each([
    [200, 200],
    [250, 250],
    [275, 275],
    [249.5, 249.5],
  ])('critical damage %s percent gives %s damage from 100', (percent, expected) =>
    expect(calculateCriticalDamage(100, percent)).toBeCloseTo(expected, 12),
  );
  it.each([
    [100, 1],
    [150, 1.5],
    [200, 2],
    [300, 3],
  ])('attack speed %s percent gives %s attacks/sec', (percent, expected) =>
    expect(scaleAttackFrequency(1, percent)).toBeCloseTo(expected, 12),
  );
  it('uses the supplied weapon frequency without assigning a class frequency', () =>
    expect(scaleAttackFrequency(2, 149.5)).toBeCloseTo(2.99, 12));
  it.each([
    [100, 80],
    [150, 120],
    [200, 160],
  ])('movement speed %s percent scales a caller-supplied base', (percent, expected) =>
    expect(scaleMovementSpeed(80, percent)).toBeCloseTo(expected, 12),
  );
  it.each([
    [0, 10],
    [25, 7.5],
    [50, 5],
  ])('cooldown reduction %s percent gives %s seconds', (percent, expected) =>
    expect(scaleCooldown(10, percent)).toBeCloseTo(expected, 12),
  );
  it.each([
    [100, 100],
    [150, 150],
    [175, 175],
  ])('area size %s percent scales radius to %s', (percent, expected) =>
    expect(scaleCircularAoeRadius(100, percent)).toBeCloseTo(expected, 12),
  );
  it('scales radius rather than geometric area', () => {
    const radius = scaleCircularAoeRadius(100, 150);
    expect((Math.PI * radius ** 2) / (Math.PI * 100 ** 2)).toBeCloseTo(2.25, 12);
  });
  it('has no random rolls or mutable state', () => {
    for (let i = 0; i < 10; i++) {
      expect(calculateCriticalDamage(17.25, 249.5)).toBeCloseTo(43.03875, 12);
      expect(applyResistance(17.25, 150)).toBeCloseTo(6.9, 12);
    }
  });
});
