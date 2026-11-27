import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_SLOT_LEVELS, defaultLoadout } from '../../src/equipment';
import { shopSaltOf } from '../../src/profile';
import type { CharacterClass } from '../../src/character-stats';
import {
  SAVE_KEY,
  createSaveStore,
  exportProfile,
  parseProfileJson,
  prepareImport,
} from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';

/**
 * Task 23: saves store ids, never display names, so switching the UI to English must not change
 * how an existing save loads. Both fixtures were written by the pre-Task-23 (Russian) code at
 * commit f3116ee: a schema-v7 save (gear levels, ore, a pet, quest counters) and its export file.
 * Task 24 bumped the schema to v8: the only change on load is the v7 → v8 migration (activity
 * counters at 0); Task 39's v8 → v9 adds an empty `mapTiers`; Task 40's v9 → v10 resets the
 * equipment (items-rework branch rule).
 */
const FIXTURES = join(__dirname, '..', 'fixtures');
const SAVE = readFileSync(join(FIXTURES, 'pre-task23-save-v7.json'), 'utf8');
const EXPORT = readFileSync(join(FIXTURES, 'pre-task23-export-v7.json'), 'utf8');

const MIGRATED = () => {
  const p = JSON.parse(SAVE);
  const out = {
    ...p,
    schemaVersion: 11,
    // Task 40 (v9 → v10): equipment resets — every class back to its starter weapon.
    classes: Object.fromEntries(
      Object.entries(p.classes as Record<string, Record<string, unknown>>).map(([c, v]) => [
        c,
        { ...v, loadout: defaultLoadout(c as CharacterClass), slotLevels: NO_SLOT_LEVELS },
      ]),
    ),
    questCounters: {
      ...p.questCounters,
      activities: { shrine: 0, lantern: 0, thief: 0, nest: 0 },
    },
  };
  // The export keeps the profile's key order: Task 39 `mapTiers` right after `completedMaps`;
  // Task 40's item fields replace `ownedItems` / `itemLevels`.
  return Object.fromEntries(
    Object.entries(out).flatMap(([k, v]) =>
      k === 'completedMaps'
        ? [
            [k, v],
            ['mapTiers', {}],
          ]
        : k === 'ownedItems'
          ? [
              ['items', []],
              ['newItems', []],
              ['bagExpansions', 0],
              ['nextItemNumber', 1],
              ['shopSalt', shopSaltOf(p.profileId)],
              ['shopBought', {}],
              ['shopRefreshes', {}],
            ]
          : k === 'itemLevels'
            ? []
            : [[k, v]],
    ),
  );
};
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

describe('Task 23 — an old (Russian-era) save loads unchanged', () => {
  it('the fixtures hold ids only (no display text in any language)', () => {
    expect(SAVE).not.toMatch(/[Ѐ-ӿ]/);
    expect(JSON.parse(SAVE).schemaVersion).toBe(7);
  });
  it('the save store loads it: same profile except the v7 → v8 migration; nothing renamed', () => {
    const storage = new FakeStorage();
    storage.setItem(SAVE_KEY, SAVE);
    const loaded = createSaveStore({ storage, now: () => 'x', newProfileId: () => 'y' }).load();
    expect(loaded.status).toBe('loaded');
    expect(loaded.profile).toEqual(MIGRATED());
    expect(storage.getItem(SAVE_KEY)).toBe(SAVE); // loading never rewrites the stored text
  });
  it('the old export file imports, and a fresh export round-trips to the same profile', () => {
    const imported = prepareImport(EXPORT);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.profile).toEqual(MIGRATED());
    const again = exportProfile(imported.profile, '2026-11-15T10:00:00.000Z');
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.json).toBe(JSON.stringify(MIGRATED(), null, 2));
    const back = parseProfileJson(again.json);
    expect(back.ok && back.profile).toEqual(imported.profile);
  });
});
