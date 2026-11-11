import { describe, expect, it } from 'vitest';
import {
  MAX_PROCESSED_RUN_IDS,
  MAX_RECENT_RUNS,
  applyRunResult,
  createProfile,
  isMapUnlocked,
  talentPoints,
} from '../../src/profile';
import type { PlayerProfile, RunResult } from '../../src/profile';
import { getCampaignMap } from '../../src/campaign';

const NOW = '2026-11-02T10:00:00.000Z';
const fresh = () => createProfile('profile-test', NOW);
let seq = 0;
const run = (over: Partial<RunResult> = {}): RunResult => ({
  runId: `run-${++seq}`,
  mapId: 1,
  characterClass: 'warrior',
  outcome: 'victory',
  elapsed: 600,
  kills: 300,
  eliteKills: 4,
  bossKilled: true,
  runLevel: 12,
  // Task 11: Gold = collected coins + victory bonus; 45 + 30 = 75 on map 1.
  coins: 45,
  ...over,
});
const win = (p: PlayerProfile, over: Partial<RunResult> = {}) =>
  applyRunResult(p, run(over), NOW).profile;

describe('applyRunResult (Task 08 §1.3, step 3.3)', () => {
  it('a new profile: all classes level 1, Map 1 unlocked only, no Gold', () => {
    const p = fresh();
    expect(p.highestUnlockedMap).toBe(1);
    expect(Object.values(p.classes).every((c) => c.level === 1 && c.xp === 0)).toBe(true);
    expect(p.gold).toBe(0);
    expect(isMapUnlocked(p, 1)).toBe(true);
    expect(isMapUnlocked(p, 2)).toBe(false);
    expect(Object.isFrozen(p)).toBe(true);
  });
  it('victory: full XP to the class, Gold to the profile, next map unlocked, stats/recent runs', () => {
    const { profile, summary } = applyRunResult(fresh(), run({ runId: 'r-win' }), NOW);
    expect(summary).toMatchObject({
      outcome: 'victory',
      xpGained: 150,
      goldGained: 75,
      levelBefore: 1,
      levelAfter: 2,
      levelsGained: 1,
      talentPointsGained: 1,
      newlyUnlockedMap: 2,
      duplicate: false,
    });
    expect(profile.classes.warrior).toMatchObject({ level: 2, xp: 50, lifetimeXp: 150 });
    expect(profile.gold).toBe(75);
    expect(profile.highestUnlockedMap).toBe(2);
    expect(profile.completedMaps).toEqual([1]);
    expect(profile.stats).toEqual({
      runs: 1,
      wins: 1,
      defeats: 0,
      enemiesKilled: 300,
      bestSurvivalTime: 600,
    });
    expect(profile.bestResults['1']).toEqual({
      victories: 1,
      bestClearTime: 600,
      bestSurvivalTime: 600,
      bestKills: 300,
    });
    expect(profile.recentRuns[0]).toMatchObject({
      runId: 'r-win',
      finishedAt: NOW,
      unlockedMap: 2,
    });
    expect(profile.processedRunIds).toEqual(['r-win']);
  });
  it('exactly once: re-applying the same runId changes nothing and returns the original summary', () => {
    const first = applyRunResult(fresh(), run({ runId: 'r-once' }), NOW);
    const again = applyRunResult(first.profile, run({ runId: 'r-once' }), NOW);
    expect(again.profile).toBe(first.profile);
    expect(again.summary).toEqual({ ...first.summary, duplicate: true });
    // Also after many other runs (summary rebuilt from the recent-run record).
    let p = first.profile;
    for (let i = 0; i < 5; i++) p = win(p);
    const later = applyRunResult(p, run({ runId: 'r-once' }), NOW);
    expect(later.profile).toBe(p);
    expect(later.summary).toMatchObject({
      xpGained: 150,
      levelBefore: 1,
      levelAfter: 2,
      duplicate: true,
    });
  });
  it('defeat: partial rewards, never unlocks; abandoned: nothing at all', () => {
    const d = applyRunResult(
      fresh(),
      run({ outcome: 'defeat', bossKilled: false, elapsed: 300 }),
      NOW,
    );
    // Task 11: defeat Gold = 50% of the collected coins (⌊45 / 2⌋ = 22), no bonus; XP unchanged.
    expect(d.summary).toMatchObject({ xpGained: 18, goldGained: 22, newlyUnlockedMap: null });
    expect(d.profile.highestUnlockedMap).toBe(1);
    expect(d.profile.completedMaps).toEqual([]);
    expect(d.profile.stats).toMatchObject({ runs: 1, wins: 0, defeats: 1 });
    const a = applyRunResult(
      fresh(),
      run({ outcome: 'abandoned', bossKilled: false, elapsed: 500 }),
      NOW,
    );
    expect(a.summary).toMatchObject({ xpGained: 0, goldGained: 0, levelsGained: 0 });
    expect(a.profile.gold).toBe(0);
    expect(a.profile.classes.warrior).toEqual(fresh().classes.warrior);
    expect(a.profile.highestUnlockedMap).toBe(1);
    expect(a.profile.stats).toMatchObject({ runs: 1, wins: 0, defeats: 0, enemiesKilled: 0 });
    expect(a.profile.bestResults).toEqual({});
    expect(a.profile.processedRunIds).toHaveLength(1);
  });
  it('per-class XP/levels, shared Gold and shared unlocks', () => {
    let p = win(fresh(), { characterClass: 'warrior' });
    p = win(p, { characterClass: 'mage', mapId: 2, elapsed: 600 });
    expect(p.classes.warrior).toMatchObject({ level: 2, lifetimeXp: 150 });
    expect(p.classes.mage).toMatchObject({ level: 2, lifetimeXp: 200, xp: 100 });
    expect(p.classes.archer.level).toBe(1);
    expect(p.gold).toBe(75 + (45 + 40)); // Task 11: map 2 bonus 40 + 45 coins
    expect(p.highestUnlockedMap).toBe(3);
  });
  it('replaying a completed map never lowers unlocks; the last map unlocks nothing new', () => {
    // Task 10: 40 maps; map 10 now unlocks map 11 and map 40 is the last.
    let p = fresh();
    for (let m = 1; m <= 40; m++)
      p = win(p, { mapId: m, elapsed: getCampaignMap(m).durationSeconds });
    expect(p.highestUnlockedMap).toBe(40);
    expect(p.completedMaps).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    const replay = applyRunResult(p, run({ mapId: 3, elapsed: 660 }), NOW);
    expect(replay.summary.newlyUnlockedMap).toBeNull();
    expect(replay.profile.highestUnlockedMap).toBe(40);
    const last = applyRunResult(p, run({ mapId: 40, elapsed: 900, runId: 'again-40' }), NOW);
    expect(last.summary.newlyUnlockedMap).toBeNull();
  });
  it('locked maps cannot be applied; invalid results are rejected without changes', () => {
    const p = fresh();
    expect(() => applyRunResult(p, run({ mapId: 2 }), NOW)).toThrow(/locked/);
    expect(() => applyRunResult(p, run({ runId: '' }), NOW)).toThrow();
    expect(() => applyRunResult(p, run({ kills: -1 }), NOW)).toThrow();
    expect(() => applyRunResult(p, run({ bossKilled: false }), NOW)).toThrow();
    expect(() => applyRunResult(p, run({ characterClass: 'bard' as never }), NOW)).toThrow();
    expect(p).toEqual(fresh());
  });
  it('level cap, overflow across levels and talent points via many victories', () => {
    let p = fresh();
    for (let m = 1; m <= 10; m++) p = win(p, { mapId: m, elapsed: 900 });
    for (let i = 0; i < 400; i++) p = win(p, { mapId: 10, elapsed: 900 });
    const w = p.classes.warrior;
    expect(w.level).toBe(50);
    expect(w.xp).toBe(0);
    expect(talentPoints(w.level)).toBe(26);
    expect(w.lifetimeXp).toBe(
      [...Array(10)].reduce((s, _, i) => s + 100 + 50 * (i + 1), 0) + 400 * 600,
    );
  });
  it('recent runs and processed ids are bounded; the original profile is never mutated', () => {
    const start = fresh();
    const snapshot = JSON.stringify(start);
    let p = start;
    for (let i = 0; i < 70; i++) p = win(p);
    expect(p.recentRuns).toHaveLength(MAX_RECENT_RUNS);
    expect(p.processedRunIds).toHaveLength(MAX_PROCESSED_RUN_IDS);
    expect(p.recentRuns[0].runId).toBe(p.processedRunIds.at(-1));
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
