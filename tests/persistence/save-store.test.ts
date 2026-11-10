import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, QUARANTINE_KEY, SAVE_KEY, createSaveStore } from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';
import { applyRunResult } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';

class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  failWrites: false | 'quota' | 'denied' = false;
  failReads = false;
  writes = 0;
  getItem(k: string) {
    if (this.failReads) throw new Error('SecurityError');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites === 'quota')
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    if (this.failWrites === 'denied') throw new Error('denied');
    this.writes++;
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
let tick = 0;
const clock = () => `2026-11-02T10:${String(tick++ % 60).padStart(2, '0')}:00.000Z`;
const make = (storage: StorageLike | null) =>
  createSaveStore({ storage, now: clock, newProfileId: () => 'profile-xyz' });
const winOn = (p: PlayerProfile, runId: string) =>
  applyRunResult(p, {
    runId,
    mapId: 1,
    characterClass: 'archer',
    outcome: 'victory',
    elapsed: 600,
    kills: 99,
    eliteKills: 4,
    bossKilled: true,
    runLevel: 9,
    coins: 45, // Task 11: 45 coins + 30 victory bonus = 75 Gold on map 1
  }).profile;

describe('saveStore (Task 08 §1.4, step 4.2)', () => {
  it('first launch: no save → a new profile; nothing is written until the first save', () => {
    const s = new FakeStorage();
    const r = make(s).load();
    expect(r.status).toBe('new');
    expect(r.profile).toMatchObject({ profileId: 'profile-xyz', highestUnlockedMap: 1 });
    expect(s.writes).toBe(0);
  });
  it('save → reload round-trip; lastSavedAt is stamped; one JSON document under one key', () => {
    const s = new FakeStorage();
    const store = make(s);
    const p = winOn(store.load().profile!, 'r1');
    const saved = store.save(p);
    expect(saved.ok).toBe(true);
    expect(JSON.parse(s.data.get(SAVE_KEY)!).gold).toBe(75);
    const again = make(s).load();
    expect(again.status).toBe('loaded');
    expect(again.profile).toEqual(saved.ok && saved.profile);
    expect(again.profile!.lastSavedAt).not.toBeNull();
  });
  it('no duplicate rewards after reload: the saved processed run id blocks re-application', () => {
    const s = new FakeStorage();
    const store = make(s);
    const p = winOn(store.load().profile!, 'r-dup');
    store.save(p);
    const reloaded = make(s).load().profile!;
    const again = applyRunResult(reloaded, {
      runId: 'r-dup',
      mapId: 1,
      characterClass: 'archer',
      outcome: 'victory',
      elapsed: 600,
      kills: 99,
      eliteKills: 4,
      bossKilled: true,
      runLevel: 9,
      coins: 45,
    });
    expect(again.summary.duplicate).toBe(true);
    expect(again.profile.gold).toBe(75);
  });
  it('before each write the previous valid snapshot is copied to the backup key', () => {
    const s = new FakeStorage();
    const store = make(s);
    const first = store.save(winOn(store.load().profile!, 'a'));
    expect(s.data.has(BACKUP_KEY)).toBe(false);
    const firstText = s.data.get(SAVE_KEY)!;
    store.save(winOn(first.ok ? first.profile : (null as never), 'b'));
    expect(s.data.get(BACKUP_KEY)).toBe(firstText);
  });
  it('corrupt save + valid backup → recovered from the backup; the original is quarantined, not lost', () => {
    const s = new FakeStorage();
    const store = make(s);
    const one = store.save(winOn(store.load().profile!, 'a'));
    store.save(winOn(one.ok ? one.profile : (null as never), 'b'));
    s.data.set(SAVE_KEY, '{"schemaVersion":1, broken');
    const r = make(s).load();
    expect(r.status).toBe('recovered');
    expect(r.status === 'recovered' && r.error.code).toBe('malformed-json');
    expect(r.profile!.processedRunIds).toEqual(['a']);
    expect(s.data.get(QUARANTINE_KEY)).toBe('{"schemaVersion":1, broken');
  });
  it.each([
    ['malformed JSON', '{not json', 'malformed-json'],
    [
      'invalid values',
      JSON.stringify({ schemaVersion: 1, profileId: 'x', createdAt: 'bad' }),
      'invalid',
    ],
    ['newer version', JSON.stringify({ schemaVersion: 99 }), 'newer-version'],
  ])('%s without a usable backup: error, writes blocked, data untouched', (_label, text, code) => {
    const s = new FakeStorage();
    s.data.set(SAVE_KEY, text);
    const store = make(s);
    const r = store.load();
    expect(r.status).toBe('error');
    expect(r.status === 'error' && r.error.code).toBe(code);
    expect(store.writesBlocked).toBe(true);
    const attempt = store.save(winOn(make(new FakeStorage()).load().profile!, 'z'));
    expect(attempt).toEqual({ ok: false, reason: 'blocked' });
    expect(s.data.get(SAVE_KEY)).toBe(text);
    expect(s.writes).toBe(0);
  });
  it('write failures (quota / denied) are reported and change nothing stored', () => {
    for (const mode of ['quota', 'denied'] as const) {
      const s = new FakeStorage();
      const store = make(s);
      const ok = store.save(winOn(store.load().profile!, 'a'));
      const before = s.data.get(SAVE_KEY);
      s.failWrites = mode;
      const r = store.save(winOn(ok.ok ? ok.profile : (null as never), 'b'));
      expect(r).toEqual({ ok: false, reason: mode === 'quota' ? 'quota' : 'unavailable' });
      expect(s.data.get(SAVE_KEY)).toBe(before);
    }
  });
  it('storage unavailable (missing or throwing): in-memory profile, saves report unavailable', () => {
    const none = make(null);
    expect(none.load().status).toBe('unavailable');
    expect(none.save(none.load().profile!)).toEqual({ ok: false, reason: 'unavailable' });
    const s = new FakeStorage();
    s.failReads = true;
    expect(make(s).load().status).toBe('unavailable');
  });
  it('never writes an invalid profile', () => {
    const s = new FakeStorage();
    const store = make(s);
    const p = store.load().profile!;
    expect(store.save({ ...p, gold: -5 })).toEqual({ ok: false, reason: 'invalid' });
    expect(s.writes).toBe(0);
  });
  it('dev-only clear removes the profile, backup and quarantine', () => {
    const s = new FakeStorage();
    const store = make(s);
    store.save(store.load().profile!);
    store.save(store.load().profile!);
    expect(store.clearForDev()).toBe(true);
    expect([...s.data.keys()]).toEqual([]);
  });
});
