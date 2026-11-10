import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MAPS } from '../../src/campaign';
import { runRewards } from '../../src/profile';

describe('run rewards (Task 08 §1.3)', () => {
  it('victory gives the full map XP and (Act I) Gold = XP / 2', () => {
    for (const m of CAMPAIGN_MAPS.slice(0, 10))
      expect(runRewards({ mapId: m.id, outcome: 'victory', elapsed: m.durationSeconds })).toEqual({
        xp: 100 + 50 * m.id,
        gold: (100 + 50 * m.id) / 2,
      });
  });
  it('defeat gives floor(reward × 0.25 × min(elapsed/duration, 1)) for XP and Gold', () => {
    // Map 1: 150 XP / 75 Gold over 600 s.
    expect(runRewards({ mapId: 1, outcome: 'defeat', elapsed: 300 })).toEqual({ xp: 18, gold: 9 });
    expect(runRewards({ mapId: 1, outcome: 'defeat', elapsed: 0 })).toEqual({ xp: 0, gold: 0 });
    expect(runRewards({ mapId: 1, outcome: 'defeat', elapsed: 600 })).toEqual({ xp: 37, gold: 18 });
    expect(runRewards({ mapId: 1, outcome: 'defeat', elapsed: 5000 })).toEqual({
      xp: 37,
      gold: 18,
    });
    // Map 10: 600 XP / 300 Gold over 900 s; 450 s → 25% × 50%.
    expect(runRewards({ mapId: 10, outcome: 'defeat', elapsed: 450 })).toEqual({
      xp: 75,
      gold: 37,
    });
  });
  it('abandoned runs give nothing', () => {
    for (const elapsed of [0, 300, 600])
      expect(runRewards({ mapId: 4, outcome: 'abandoned', elapsed })).toEqual({ xp: 0, gold: 0 });
  });
  it('rejects invalid input', () => {
    expect(() => runRewards({ mapId: 41, outcome: 'victory', elapsed: 1 })).toThrow();
    expect(() => runRewards({ mapId: 1, outcome: 'victory', elapsed: -1 })).toThrow();
    expect(() => runRewards({ mapId: 1, outcome: 'victory', elapsed: NaN })).toThrow();
    expect(() => runRewards({ mapId: 1, outcome: 'won' as never, elapsed: 1 })).toThrow();
  });
});
