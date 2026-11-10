import { beforeAll, describe, expect, it, vi } from 'vitest';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';

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
const storage = new MemoryStorage();
let debug: typeof import('../../src/gameplay-ui/campaign-debug');
let campaign: typeof import('../../src/gameplay-ui/campaign-state');
let report: typeof import('../../src/gameplay-ui/bug-report');
let SAVE_KEY: string;
beforeAll(async () => {
  vi.stubGlobal('localStorage', storage);
  debug = await import('../../src/gameplay-ui/campaign-debug');
  campaign = await import('../../src/gameplay-ui/campaign-state');
  report = await import('../../src/gameplay-ui/bug-report');
  ({ SAVE_KEY } = await import('../../src/persistence'));
});
const reported = (): PlayerProfile =>
  applyRunResult(
    createProfile('tester', '2026-11-01T10:00:00.000Z'),
    {
      runId: 'tester-run',
      mapId: 1,
      characterClass: 'rogue',
      outcome: 'victory',
      elapsed: 600,
      kills: 90,
      eliteKills: 4,
      bossKilled: true,
      runLevel: 9,
    },
    null,
  ).profile;
const reportText = (profile: unknown, saveOk = true) =>
  JSON.stringify(
    saveOk
      ? report.buildBugReport({
          createdAt: '2026-11-02T10:00:00.000Z',
          build: { version: '0.1.0', commit: 'abc1234', label: 'v0.1.0 · abc1234' },
          userAgent: 'x',
          world: null,
          screen: 'menu',
          profile: profile as PlayerProfile,
          errors: [],
        })
      : { format: 'skazki-report', save: { ok: false, error: 'invalid' } },
  );

describe('Task 08.5 §3.4 debug: load a report → import its save (validated)', () => {
  it('a valid report stages its save; nothing changes until confirmation', () => {
    const store = campaign.campaignStore;
    store.getSnapshot(); // first launch: a new profile is created and saved
    const before = storage.getItem(SAVE_KEY);
    expect(before).toBeTruthy();
    expect(debug.campaignDebug.stageReport(reportText(reported()), 'r.json')).toBe(true);
    expect(store.getSnapshot().page).toBe('settings');
    expect(store.getSnapshot().pendingImport?.profile.profileId).toBe('tester');
    expect(storage.getItem(SAVE_KEY)).toBe(before);
    store.confirmImport();
    const now = store.service().getState().profile!;
    expect(now).toMatchObject({ profileId: 'tester', highestUnlockedMap: 2 });
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).profileId).toBe('tester');
  });
  it('non-reports, reports without a valid save and tampered saves change nothing', () => {
    const store = campaign.campaignStore;
    const before = storage.getItem(SAVE_KEY);
    const tampered = JSON.parse(reportText(reported()));
    tampered.save.profile.gold = -10;
    for (const text of [
      '{not json',
      JSON.stringify({ hello: 1 }),
      JSON.stringify(reported()), // a plain save file is not a report
      reportText(null, false),
      JSON.stringify(tampered),
      'x'.repeat(1_000_001),
    ]) {
      expect(debug.campaignDebug.stageReport(text, 'bad.json')).toBe(false);
      expect(store.getSnapshot().pendingImport).toBeNull();
      expect(store.getSnapshot().saveMessage?.tone).toBe('error');
      expect(storage.getItem(SAVE_KEY)).toBe(before);
    }
    expect(debug.saveFromReport(JSON.stringify(tampered)).ok).toBe(true); // envelope only…
    // …the save itself is rejected by the normal import validation (checked above).
  });
});
