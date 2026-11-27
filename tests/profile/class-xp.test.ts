import { describe, expect, it } from 'vitest';
import {
  MAX_CLASS_LEVEL,
  NEW_CLASS_PROGRESS,
  addClassXp,
  talentPoints,
  xpToNextLevel,
} from '../../src/profile';

const totalToReach = (level: number) => {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += 100 + 6 * l * l; // Task 40 curve
  return sum;
};

describe('class XP (Task 08 §1.3)', () => {
  // Task 40: 100 + 6·L² (was 100 + 50·(L − 1)); 247 450 XP from level 1 to 50.
  it('level L → L+1 costs 100 + 6·L²; none at the cap', () => {
    expect(xpToNextLevel(1)).toBe(106);
    expect(xpToNextLevel(2)).toBe(124);
    expect(xpToNextLevel(49)).toBe(14506);
    expect(totalToReach(MAX_CLASS_LEVEL)).toBe(247450);
    expect(xpToNextLevel(50)).toBeNull();
    expect(() => xpToNextLevel(0)).toThrow();
    expect(() => xpToNextLevel(51)).toThrow();
  });
  it('overflow carries across several levels at once', () => {
    const r = addClassXp(NEW_CLASS_PROGRESS, 106 + 124 + 30);
    expect(r.progress).toEqual({ xp: 30, level: 3, lifetimeXp: 260, talents: {} });
    expect(r.levelsGained).toBe(2);
    const exact = addClassXp(NEW_CLASS_PROGRESS, 106);
    expect(exact.progress).toMatchObject({ xp: 0, level: 2 });
    const partial = addClassXp(exact.progress, 123);
    expect(partial).toMatchObject({ levelsGained: 0, progress: { xp: 123, level: 2 } });
  });
  it('caps at 50; extra XP goes only to the lifetime counter', () => {
    const toCap = totalToReach(MAX_CLASS_LEVEL);
    const r = addClassXp(NEW_CLASS_PROGRESS, toCap + 999);
    expect(r.progress).toEqual({ xp: 0, level: 50, lifetimeXp: toCap + 999, talents: {} });
    expect(r.levelsGained).toBe(49);
    const more = addClassXp(r.progress, 5000);
    expect(more).toMatchObject({ levelsGained: 0, progress: { xp: 0, level: 50 } });
    expect(more.progress.lifetimeXp).toBe(toCap + 999 + 5000);
  });
  it('is pure: inputs are not mutated; invalid amounts are rejected', () => {
    const before = { ...NEW_CLASS_PROGRESS };
    addClassXp(NEW_CLASS_PROGRESS, 500);
    expect(NEW_CLASS_PROGRESS).toEqual(before);
    expect(() => addClassXp(NEW_CLASS_PROGRESS, -1)).toThrow();
    expect(() => addClassXp(NEW_CLASS_PROGRESS, 1.5)).toThrow();
    expect(() => addClassXp(NEW_CLASS_PROGRESS, NaN)).toThrow();
  });
  it('talent points: +1 per even level, +1 bonus at 30, 26 at 50', () => {
    expect([1, 2, 3, 4, 28, 29, 30, 31, 49, 50].map(talentPoints)).toEqual([
      0, 1, 1, 2, 14, 14, 16, 16, 25, 26,
    ]);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => talentPoints(i + 1)))).toBe(26);
    expect(() => talentPoints(0)).toThrow();
  });
});
