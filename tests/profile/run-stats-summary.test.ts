import { describe, expect, it } from 'vitest';
import { applyRunResult, createProfile, validateRunStatsSummary } from '../../src/profile';
import type { RunResult, RunStatsSummary } from '../../src/profile';
import { parseProfileJson } from '../../src/persistence';
import { summarizeRunStats } from '../../src/gameplay-ui/campaign-state';
import { arena, play, ring } from '../skills/helpers';

const stats: RunStatsSummary = {
  damageDealt: 1234,
  damageTaken: 56,
  topSources: [
    { source: 'weapon:alpha-staff', damage: 800 },
    { source: 'skill:fireball', damage: 300 },
    { source: 'synergy:thermal_shock', damage: 134 },
  ],
  deathTime: null,
  reviveUsed: false,
  lowHpMoments: 1,
};
const result = (over: Partial<RunResult> = {}): RunResult => ({
  runId: 'run-a',
  mapId: 1,
  characterClass: 'mage',
  outcome: 'defeat',
  elapsed: 200,
  kills: 30,
  eliteKills: 1,
  bossKilled: false,
  runLevel: 6,
  stats,
  ...over,
});
const fresh = () => createProfile('pid', '2026-11-02T12:00:00.000Z');

describe('Task 08.5 run-stats summary (recentRuns, additive)', () => {
  it('is stored with the recent run; rewards are unchanged by it', () => {
    const withStats = applyRunResult(fresh(), result(), null);
    const without = applyRunResult(fresh(), result({ stats: undefined }), null);
    expect(withStats.profile.recentRuns[0].stats).toEqual(stats);
    expect(without.profile.recentRuns[0].stats).toBeUndefined();
    expect(withStats.summary).toEqual(without.summary);
    expect(withStats.profile.gold).toBe(without.profile.gold);
  });
  it('round-trips through the save; old saves without stats still load', () => {
    const { profile } = applyRunResult(fresh(), result(), null);
    const parsed = parseProfileJson(JSON.stringify(profile));
    expect(parsed.ok && parsed.profile.recentRuns[0].stats).toEqual(stats);
    const old = JSON.parse(JSON.stringify(profile));
    delete old.recentRuns[0].stats;
    const legacy = parseProfileJson(JSON.stringify(old));
    expect(legacy.ok).toBe(true);
    expect(legacy.ok && legacy.profile.recentRuns[0].stats).toBeUndefined();
    expect(legacy.ok && legacy.profile.schemaVersion).toBe(profile.schemaVersion);
  });
  it('invalid summaries are rejected (run result and save), never repaired', () => {
    const bad: unknown[] = [
      { ...stats, damageDealt: -1 },
      { ...stats, damageDealt: 1.5 },
      { ...stats, topSources: [...stats.topSources, { source: 'skill:x', damage: 1 }] },
      { ...stats, topSources: [{ source: 'Bad Source!', damage: 1 }] },
      { ...stats, deathTime: -5 },
      { ...stats, reviveUsed: 'no' },
      null,
    ];
    for (const s of bad) {
      expect(() => validateRunStatsSummary(s)).toThrow(RangeError);
      expect(() =>
        applyRunResult(fresh(), result({ stats: s as RunStatsSummary }), null),
      ).toThrow();
      const { profile } = applyRunResult(fresh(), result(), null);
      const raw = JSON.parse(JSON.stringify(profile));
      raw.recentRuns[0].stats = s;
      const parsed = parseProfileJson(JSON.stringify(raw));
      expect(parsed.ok).toBe(false);
      expect(!parsed.ok && parsed.error.code).toBe('invalid');
    }
  });
  it('summarizeRunStats keeps whole numbers and the top 3 sources of a real run', () => {
    const w = arena('mage', { seed: 9 });
    ring(w, 8, 140);
    play(w, 20);
    const live = w.getSnapshot().runStats;
    const summary = summarizeRunStats(live);
    expect(validateRunStatsSummary(summary)).toEqual(summary);
    expect(summary.topSources.length).toBeLessThanOrEqual(3);
    expect(summary.topSources.map((s) => s.source)).toEqual(
      live.bySource.slice(0, 3).map((s) => s.source),
    );
    expect(summary.damageDealt).toBe(Math.round(live.damageDealt));
  });
});
