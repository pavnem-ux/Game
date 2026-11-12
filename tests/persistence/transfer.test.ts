import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY,
  createProgressionService,
  createSaveStore,
  exportFilename,
  exportProfile,
  prepareImport,
} from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';

class FakeStorage implements StorageLike {
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
const NOW = '2026-11-02T21:30:00.000Z';
const svc = (s: StorageLike, id = 'pid') =>
  createProgressionService(createSaveStore({ storage: s, now: () => NOW, newProfileId: () => id }));
const win = (runId: string) => ({
  runId,
  mapId: 1,
  characterClass: 'mage' as const,
  outcome: 'victory' as const,
  elapsed: 600,
  kills: 50,
  eliteKills: 4,
  bossKilled: true,
  runLevel: 7,
  // Task 11: Gold = collected coins + victory bonus; 45 + 30 = 75 on map 1.
  coins: 45,
});

describe('export / import (Task 08 §1.4, step 4.4)', () => {
  it('export filename is skazki-save-YYYY-MM-DD.json', () => {
    expect(exportFilename(NOW)).toBe('skazki-save-2026-11-02.json');
    expect(() => exportFilename('nope')).toThrow();
  });
  it('export → import round-trip restores the same profile (export is read-only)', () => {
    const s = new FakeStorage();
    const a = svc(s);
    a.commitRun(win('r1'));
    const before = s.data.get(SAVE_KEY);
    const exported = exportProfile(a.getState().profile!, NOW);
    expect(exported.ok).toBe(true);
    expect(s.data.get(SAVE_KEY)).toBe(before);
    const imported = prepareImport(exported.ok ? exported.json : '');
    expect(imported.ok && imported.profile).toEqual(a.getState().profile);
    // Import into another browser profile, after confirmation.
    const other = new FakeStorage();
    const b = svc(other, 'someone-else');
    expect(b.replaceProfile(imported.ok ? imported.profile : (null as never)).ok).toBe(true);
    expect(b.getState().profile).toMatchObject({
      profileId: 'pid',
      gold: 75,
      highestUnlockedMap: 2,
    });
    // Imported processed ids still block duplicate rewards.
    expect(b.commitRun(win('r1')).summary.duplicate).toBe(true);
  });
  it.each([
    ['malformed JSON', '{"profile": ', 'malformed-json'],
    [
      'invalid values',
      JSON.stringify({ schemaVersion: 1, profileId: 'x', createdAt: NOW, gold: -3 }),
      'invalid',
    ],
    ['newer version', JSON.stringify({ schemaVersion: 6 }), 'newer-version'],
    ['not an object', '[1,2,3]', 'not-an-object'],
    ['too large', `"${'x'.repeat(1_000_001)}"`, 'invalid'],
  ])('%s: rejected; the current save stays unchanged', (_label, text, code) => {
    const s = new FakeStorage();
    const a = svc(s);
    a.commitRun(win('keep'));
    const before = s.data.get(SAVE_KEY);
    const r = prepareImport(text);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe(code);
    expect(s.data.get(SAVE_KEY)).toBe(before);
    expect(a.getState().profile!.gold).toBe(75);
  });
  it('a previous valid save becomes the backup when an import replaces it', () => {
    const s = new FakeStorage();
    const a = svc(s);
    a.commitRun(win('mine'));
    const mine = s.data.get(SAVE_KEY);
    const imported = prepareImport(JSON.stringify({ ...a.getState().profile!, gold: 5000 }));
    a.replaceProfile(imported.ok ? imported.profile : (null as never));
    expect(s.data.get('skazki.profile.backup')).toBe(mine);
    expect(a.getState().profile!.gold).toBe(5000);
  });
});
