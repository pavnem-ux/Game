import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY,
  createProgressionService,
  createSaveStore,
  generateRunId,
} from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';
import { createProfile } from '../../src/profile';
import type { RunResult } from '../../src/profile';

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  fail = false;
  writes = 0;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    this.writes++;
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const service = (s: StorageLike | null) =>
  createProgressionService(
    createSaveStore({
      storage: s,
      now: () => '2026-11-02T12:00:00.000Z',
      newProfileId: () => 'pid',
    }),
  );
const result = (over: Partial<RunResult> = {}): RunResult => ({
  runId: 'run-1',
  mapId: 1,
  characterClass: 'rogue',
  outcome: 'victory',
  elapsed: 600,
  kills: 120,
  eliteKills: 4,
  bossKilled: true,
  runLevel: 8,
  // Task 11: Gold = collected coins + victory bonus; 45 + 24 = 69 on map 1 (Task 40: victory Gold ×0.8).
  coins: 45,
  ...over,
});

describe('autosave wiring (Task 08 §1.4, step 4.3)', () => {
  it('first launch persists the new profile once', () => {
    const s = new FakeStorage();
    const svc = service(s);
    expect(svc.getState().status).toMatchObject({ state: 'saved', load: 'new' });
    expect(s.writes).toBe(1);
    expect(JSON.parse(s.data.get(SAVE_KEY)!).profileId).toBe('pid');
  });
  it('a finished run is committed as exactly one save; a duplicate run causes no write', () => {
    const s = new FakeStorage();
    const svc = service(s);
    const writes = s.writes;
    const first = svc.commitRun(result(), '2026-11-02T12:05:00.000Z');
    expect(first).toMatchObject({ saved: true, summary: { goldGained: 69, duplicate: false } });
    // Backup copy + main write = one snapshot commit (two keys, one change).
    expect(s.writes - writes).toBe(2);
    const w2 = s.writes;
    const again = svc.commitRun(result());
    expect(again.summary.duplicate).toBe(true);
    expect(s.writes).toBe(w2);
    expect(svc.getState().profile!.gold).toBe(69);
  });
  it('progress survives a reload (restart browser) without duplicate rewards', () => {
    const s = new FakeStorage();
    service(s).commitRun(result({ runId: 'persist-me' }));
    const reloaded = service(s);
    expect(reloaded.getState().status.load).toBe('loaded');
    expect(reloaded.getState().profile!).toMatchObject({ gold: 69, highestUnlockedMap: 2 });
    expect(reloaded.commitRun(result({ runId: 'persist-me' })).summary.duplicate).toBe(true);
    expect(reloaded.getState().profile!.gold).toBe(69);
  });
  it('write failure: in-memory progress kept, visible warning, never claims saved; retry recovers', () => {
    const s = new FakeStorage();
    const svc = service(s);
    const seen: string[] = [];
    svc.subscribe((st) => seen.push(st.status.state));
    s.fail = true;
    const r = svc.commitRun(result());
    expect(r).toMatchObject({ saved: false, failure: 'quota' });
    expect(svc.getState().status).toMatchObject({ state: 'unsaved', failure: 'quota' });
    expect(svc.getState().profile!.gold).toBe(69); // still in memory for this session
    expect(JSON.parse(s.data.get(SAVE_KEY)!).gold).toBe(0); // not on disk
    expect(seen).toContain('unsaved');
    s.fail = false;
    expect(svc.retrySave()).toBe(true);
    expect(svc.getState().status.state).toBe('saved');
    expect(JSON.parse(s.data.get(SAVE_KEY)!).gold).toBe(69);
  });
  it('storage unavailable: playable in memory, status not-persisted, results never saved', () => {
    const svc = service(null);
    expect(svc.getState().status.state).toBe('not-persisted');
    const r = svc.commitRun(result());
    expect(r.saved).toBe(false);
    expect(svc.getState().status.state).toBe('not-persisted');
  });
  it('class selection is a permanent change saved once; unknown classes are rejected', () => {
    const s = new FakeStorage();
    const svc = service(s);
    expect(svc.selectClass('archer')).toBe(true);
    expect(JSON.parse(s.data.get(SAVE_KEY)!).selectedClass).toBe('archer');
    const w = s.writes;
    svc.selectClass('archer');
    expect(s.writes).toBe(w);
    expect(() => svc.selectClass('bard' as never)).toThrow();
  });
  it('a save that cannot be loaded blocks every change and keeps the original data', () => {
    const s = new FakeStorage();
    s.data.set(SAVE_KEY, '{"schemaVersion": 7}');
    const svc = service(s);
    expect(svc.getState()).toMatchObject({ profile: null, status: { state: 'error' } });
    expect(() => svc.commitRun(result())).toThrow();
    expect(svc.replaceProfile(createProfile('other', '2026-11-02T00:00:00.000Z')).ok).toBe(false);
    expect(s.data.get(SAVE_KEY)).toBe('{"schemaVersion": 7}');
  });
  it('replaceProfile that fails to write leaves the current profile in place', () => {
    const s = new FakeStorage();
    const svc = service(s);
    svc.commitRun(result());
    s.fail = true;
    const r = svc.replaceProfile(createProfile('other', '2026-11-02T00:00:00.000Z'));
    expect(r.ok).toBe(false);
    expect(svc.getState().profile!.profileId).toBe('pid');
    expect(svc.getState().profile!.gold).toBe(69);
  });
  it('run ids are unique', () => {
    const ids = new Set(Array.from({ length: 200 }, generateRunId));
    expect(ids.size).toBe(200);
  });
});
