import { describe, expect, it } from 'vitest';
import { applyRunResult, createProfile, hardestTierWon, isTierUnlocked } from '../../src/profile';
import type { PlayerProfile, RunResult } from '../../src/profile';
import { migrateV8toV9, parseProfileJson } from '../../src/persistence/saveSchema';
import { runOre } from '../../src/equipment/economy';

/** Task 39: per-map difficulty tiers — chained unlocks, scaled victory rewards, save v9. */
const NOW = '2026-11-25T10:00:00.000Z';
let seq = 0;
const run = (over: Partial<RunResult> = {}): RunResult => ({
  runId: `tier-${++seq}`,
  mapId: 1,
  characterClass: 'warrior',
  outcome: 'victory',
  elapsed: 600,
  kills: 300,
  eliteKills: 4,
  bossKilled: true,
  runLevel: 12,
  coins: 45,
  ...over,
});
const apply = (p: PlayerProfile, over: Partial<RunResult> = {}) =>
  applyRunResult(p, run(over), NOW);

describe('Task 39 — tier unlocks', () => {
  it('Normal → Hard → Nightmare → Elite Trial, each after a victory on the previous tier', () => {
    let p = createProfile('p', NOW);
    const open = () =>
      (['normal', 'hard', 'nightmare', 'trial'] as const).filter((t) => isTierUnlocked(p, 1, t));
    expect(open()).toEqual(['normal']);
    expect(() => apply(p, { difficulty: 'hard' })).toThrow(RangeError);
    // A defeat opens nothing.
    p = apply(p, { outcome: 'defeat', bossKilled: false, elapsed: 100 }).profile;
    expect(open()).toEqual(['normal']);
    let r = apply(p);
    expect(r.summary).toMatchObject({ difficulty: 'normal', newlyUnlockedTier: 'hard' });
    p = r.profile;
    expect(open()).toEqual(['normal', 'hard']);
    expect(hardestTierWon(p, 1)).toBe('normal');
    r = apply(p, { difficulty: 'hard' });
    expect(r.summary.newlyUnlockedTier).toBe('nightmare');
    p = r.profile;
    p = apply(p, { difficulty: 'nightmare' }).profile;
    expect(open()).toEqual(['normal', 'hard', 'nightmare', 'trial']);
    r = apply(p, { difficulty: 'trial', elapsed: 200 });
    expect(r.summary.newlyUnlockedTier).toBeNull(); // the last tier opens nothing
    p = r.profile;
    expect(p.mapTiers).toEqual({ '1': 'trial' });
    // Winning an easier tier again never lowers the record; map 2 starts at Normal only.
    p = apply(p, { difficulty: 'hard' }).profile;
    expect(hardestTierWon(p, 1)).toBe('trial');
    expect(isTierUnlocked(p, 2, 'normal')).toBe(true);
    expect(isTierUnlocked(p, 2, 'hard')).toBe(false);
    expect(p.recentRuns[0]).toMatchObject({ difficulty: 'hard' });
  });
});

describe('Task 39 — rewards', () => {
  const unlockedAll = () => {
    let p = createProfile('p', NOW);
    for (const difficulty of ['normal', 'hard', 'nightmare'] as const)
      p = apply(p, { difficulty }).profile;
    return p;
  };
  // Task 40: separate scales — Hard 1.5 / 1.5 / XP 1, Nightmare 2 / 2 / 1, Trial Gold 1 / Ore 2 / XP 0.2.
  it('victory Gold, map Ore and class XP by tier (Hard ×1.5, Nightmare ×2, Trial Gold ×1, Ore ×2, XP ×0.2)', () => {
    const p = unlockedAll();
    const normal = apply(p).summary;
    expect(normal.goldGained).toBe(69); // 45 coins + 24 bonus on map 1 (Task 40 Gold ×0.8)
    const ore = runOre('victory', 1, false);
    expect(normal.oreGained).toBe(ore);
    for (const [difficulty, gold, oreScale, xp] of [
      ['hard', 1.5, 1.5, 1],
      ['nightmare', 2, 2, 1],
      ['trial', 1, 2, 0.2],
    ] as const) {
      const s = apply(p, { difficulty, elapsed: difficulty === 'trial' ? 180 : 600 }).summary;
      expect(s.goldGained, difficulty).toBe(Math.round(69 * gold));
      expect(s.oreGained, difficulty).toBe(Math.round(ore * oreScale));
      expect(s.xpGained, difficulty).toBe(Math.round(normal.xpGained * xp));
    }
  });
  it('defeat rewards are not scaled', () => {
    const p = unlockedAll();
    const d = (difficulty: 'normal' | 'hard') =>
      apply(p, { difficulty, outcome: 'defeat', bossKilled: false, elapsed: 300 }).summary;
    expect(d('hard').goldGained).toBe(d('normal').goldGained);
  });
});

describe('Task 39 — save v9', () => {
  it('v8 → v9 adds an empty mapTiers; maps already won count as Normal wins', () => {
    const won = apply(createProfile('p', NOW)).profile;
    const { mapTiers: _t, ...rest } = won;
    void _t;
    const v8 = JSON.parse(JSON.stringify({ ...rest, schemaVersion: 8 }));
    expect(migrateV8toV9(v8).mapTiers).toEqual({});
    const r = parseProfileJson(JSON.stringify(v8));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.schemaVersion).toBe(12); // … then v9 → v10 (Task 40), … v11 → v12 (Task 42)
    expect(isTierUnlocked(r.profile, 1, 'hard')).toBe(true);
    expect(isTierUnlocked(r.profile, 1, 'nightmare')).toBe(false);
  });
  it('invalid tiers are rejected (unknown tier, Normal stored, a map never won)', () => {
    const won = JSON.parse(JSON.stringify(apply(createProfile('p', NOW)).profile));
    for (const mapTiers of [{ '1': 'insane' }, { '1': 'normal' }, { '2': 'hard' }, []]) {
      const r = parseProfileJson(JSON.stringify({ ...won, mapTiers }));
      expect(r.ok, JSON.stringify(mapTiers)).toBe(false);
    }
  });
});
