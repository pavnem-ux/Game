import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';
import { REPORT_FORMAT, buildBugReport, reportFilename } from '../../src/gameplay-ui/bug-report';
import { recordError, readErrors } from '../../src/gameplay-ui/error-log';
import { play } from '../skills/helpers';

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const build = { version: '0.1.0', commit: 'abc1234', label: 'v0.1.0 · abc1234' };
const profile = (): PlayerProfile =>
  applyRunResult(
    createProfile('pid', '2026-11-02T10:00:00.000Z'),
    {
      runId: 'r1',
      mapId: 1,
      characterClass: 'warrior',
      outcome: 'defeat',
      elapsed: 100,
      kills: 4,
      eliteKills: 0,
      bossKilled: false,
      runLevel: 2,
    },
    null,
  ).profile;

describe('Task 08.5 §3.3 bug report', () => {
  it('contains version, seed, map, class, run time, run stats, errors, save and user agent', () => {
    const w = new GameplayWorld({
      characterClass: 'mage',
      seed: 4242,
      campaign: { mapId: 2, runId: 'run-x' },
    });
    w.setTestProtection(true);
    play(w, 20);
    const storage = new MemoryStorage();
    recordError(new Error('first'), 'error', { storage, build: build.label });
    recordError(new Error('second'), 'render', { storage, build: build.label });
    const p = profile();
    const report = buildBugReport({
      createdAt: '2026-11-02T13:07:00.000Z',
      build,
      userAgent: 'TestBrowser/1.0',
      world: w.getSnapshot(),
      screen: 'paused',
      profile: p,
      errors: readErrors(storage),
    });
    expect(report).toMatchObject({
      format: REPORT_FORMAT,
      formatVersion: 1,
      createdAt: '2026-11-02T13:07:00.000Z',
      build,
      userAgent: 'TestBrowser/1.0',
      run: {
        runId: 'run-x',
        seed: 4242,
        mapId: 2,
        mapName: expect.any(String),
        characterClass: 'mage',
        status: 'active',
        screen: 'paused',
      },
      save: { ok: true },
    });
    expect(report.run!.time).toBeCloseTo(w.time, 9);
    expect(report.run!.stats).toEqual(w.getSnapshot().runStats);
    expect(report.run!.stats.damageDealt).toBeGreaterThan(0);
    expect(report.errors.map((e) => e.message)).toEqual(['Error: first', 'Error: second']);
    expect(report.save.ok && report.save.profile).toEqual(p);
    // The file is plain JSON with exactly these top-level fields.
    expect(Object.keys(JSON.parse(JSON.stringify(report))).sort()).toEqual(
      [
        'build',
        'createdAt',
        'errors',
        'format',
        'formatVersion',
        'run',
        'save',
        'userAgent',
      ].sort(),
    );
  });
  it('an invalid or missing profile is never embedded; no run → run null', () => {
    const broken = { ...profile(), gold: -5 } as PlayerProfile;
    const base = {
      createdAt: '2026-11-02T13:07:00.000Z',
      build,
      userAgent: 'x',
      world: null,
      screen: 'menu',
      errors: [],
    };
    expect(buildBugReport({ ...base, profile: broken }).save).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(buildBugReport({ ...base, profile: null }).save).toEqual({
      ok: false,
      error: 'no-profile',
    });
    expect(buildBugReport({ ...base, profile: null }).run).toBeNull();
  });
  it('file name is skazki-report-YYYY-MM-DD-HHMM.json', () => {
    expect(reportFilename('2026-11-02T09:05:59.000Z')).toBe('skazki-report-2026-11-02-0905.json');
    expect(() => reportFilename('soon')).toThrow(TypeError);
  });
});
