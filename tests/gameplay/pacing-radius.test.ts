import { describe, expect, it } from 'vitest';
import { RunExperience, runXpCost, XP_RULES } from '../../src/gameplay/experience';
import { RunCoins } from '../../src/gameplay/coins';

describe('Task 12 Phase 1 — run XP pacing and pickup radius', () => {
  it('level cost = 20 + 10·(L−1) + round(0.25·(L−1)²) for L = 1, 10, 30, 50', () => {
    expect(XP_RULES.costQuadratic).toBe(0.25);
    expect([1, 10, 30, 50].map(runXpCost)).toEqual([20, 130, 520, 1110]);
    for (let level = 1; level <= 200; level++) {
      const cost = runXpCost(level);
      expect(Number.isSafeInteger(cost)).toBe(true);
      if (level > 1) expect(cost).toBeGreaterThan(runXpCost(level - 1));
    }
    // Early levels barely change: the first 5 levels cost at most 4 XP more than before.
    for (let level = 1; level <= 5; level++)
      expect(runXpCost(level) - (20 + 10 * (level - 1))).toBeLessThanOrEqual(4);
  });
  it('total XP is never lost: spent costs + current XP = total, in one grant or many', () => {
    const once = new RunExperience();
    once.grantForTesting(100_000);
    const many = new RunExperience();
    for (let i = 0; i < 1000; i++) many.grantForTesting(100);
    for (const xp of [once, many]) {
      const s = xp.getState();
      let spent = 0;
      for (let l = 1; l < s.level; l++) spent += runXpCost(l);
      expect(spent + s.xp).toBe(100_000);
      expect(s.totalXp).toBe(100_000);
      expect(s.xp).toBeLessThan(s.nextXp);
    }
    expect(many.getState()).toEqual(once.getState());
  });
  it('pickup radius 74: a crystal / coin pile at player radius + 74 + crystal radius is collected, 1 unit farther is not', () => {
    expect(XP_RULES.pickupRadius).toBe(74);
    const player = 13;
    const reach = player + 74 + XP_RULES.crystalRadius;
    const xp = new RunExperience();
    xp.drop({ x: reach, y: 0 }, 5);
    xp.drop({ x: -(reach + 1), y: 0 }, 7);
    const got = xp.collect({ x: 0, y: 0 }, player).filter((e) => e.type === 'xp-collected');
    expect(got.map((e) => e.amount)).toEqual([5]);
    expect(xp.getCrystals().map((c) => c.value)).toEqual([7]);
    const coins = new RunCoins();
    coins.drop({ x: 0, y: reach }, 3);
    coins.drop({ x: 0, y: -(reach + 1) }, 4);
    coins.collect({ x: 0, y: 0 }, player);
    expect(coins.collected).toBe(3);
    expect(coins.onGround).toBe(4);
  });
  it('crystal merging is independent of the pickup radius (64-unit cells)', () => {
    const xp = new RunExperience();
    xp.drop({ x: 10, y: 10 }, 2);
    xp.drop({ x: 60, y: 60 }, 3); // same 64-unit cell
    xp.drop({ x: 70, y: 10 }, 4); // next cell, within the pickup radius of the first
    expect(xp.getCrystals().map((c) => c.value)).toEqual([5, 4]);
  });
});
