import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MAPS } from '../../src/campaign';
import { runRewards } from '../../src/profile';

describe('run rewards (Task 08 §1.3; Task 11 §1.4 Gold from coins)', () => {
  it('victory: full map XP; Task 11 Gold = collected coins + 40% of the map Gold as a bonus', () => {
    for (const m of CAMPAIGN_MAPS)
      for (const coins of [0, 45, 1000]) {
        const bonus = Math.round(m.victoryGold * 0.4);
        expect(
          runRewards({ mapId: m.id, outcome: 'victory', elapsed: m.durationSeconds, coins }),
        ).toEqual({ xp: 100 + 50 * m.id, gold: coins + bonus, coins, bonus });
      }
    // Map 1: 75 Gold → bonus 30; map 40: 750 → bonus 300. No coins field = 0 coins.
    expect(runRewards({ mapId: 1, outcome: 'victory', elapsed: 600 }).gold).toBe(30);
    expect(runRewards({ mapId: 40, outcome: 'victory', elapsed: 900, coins: 450 }).gold).toBe(750);
  });
  it('defeat: XP = floor(reward × 0.25 × min(elapsed/duration, 1)); Gold = 50% of the coins, no bonus', () => {
    // Map 1: 150 XP over 600 s.
    const d = (elapsed: number, coins: number, mapId = 1) =>
      runRewards({ mapId, outcome: 'defeat', elapsed, coins });
    expect(d(300, 45)).toEqual({ xp: 18, gold: 22, coins: 22, bonus: 0 });
    expect(d(0, 0)).toEqual({ xp: 0, gold: 0, coins: 0, bonus: 0 });
    expect(d(600, 9)).toEqual({ xp: 37, gold: 4, coins: 4, bonus: 0 });
    expect(d(5000, 10).xp).toBe(37);
    // Map 10: 600 XP over 900 s; 450 s → 25% × 50%.
    expect(d(450, 120, 10)).toEqual({ xp: 75, gold: 60, coins: 60, bonus: 0 });
  });
  it('abandoned runs give nothing (not even the collected coins)', () => {
    for (const elapsed of [0, 300, 600])
      expect(runRewards({ mapId: 4, outcome: 'abandoned', elapsed, coins: 99 })).toEqual({
        xp: 0,
        gold: 0,
        coins: 0,
        bonus: 0,
      });
  });
  it('rejects invalid input', () => {
    expect(() => runRewards({ mapId: 41, outcome: 'victory', elapsed: 1 })).toThrow();
    expect(() => runRewards({ mapId: 1, outcome: 'victory', elapsed: -1 })).toThrow();
    expect(() => runRewards({ mapId: 1, outcome: 'victory', elapsed: NaN })).toThrow();
    expect(() => runRewards({ mapId: 1, outcome: 'won' as never, elapsed: 1 })).toThrow();
    expect(() => runRewards({ mapId: 1, outcome: 'victory', elapsed: 1, coins: -1 })).toThrow();
    expect(() => runRewards({ mapId: 1, outcome: 'victory', elapsed: 1, coins: 1.5 })).toThrow();
  });
});
