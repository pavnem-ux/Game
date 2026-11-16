import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  createSaveStore,
  exportProfile,
  migrateV4toV5,
  parseProfileJson,
  prepareImport,
} from '../../src/persistence';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';
import { buildBugReport } from '../../src/gameplay-ui/bug-report';

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
const NOW = '2026-11-12T12:00:00.000Z';
const json = (p: unknown) => JSON.parse(JSON.stringify(p));

/** A real Task 11–18 save: schema v4, 4-slot loadouts, items, no ore / item levels. */
function v4Save() {
  let p = createProfile('v4', NOW);
  p = applyRunResult(
    p,
    {
      runId: 'w1',
      mapId: 1,
      characterClass: 'mage',
      outcome: 'victory',
      elapsed: 600,
      kills: 300,
      eliteKills: 3,
      bossKilled: true,
      runLevel: 9,
      coins: 40,
    },
    NOW,
  ).profile;
  const data = json(p);
  data.schemaVersion = 4;
  data.gold = 1234;
  data.ownedItems = ['plate-t1', 'flame_staff-t1', 'ring_fury-t1'];
  delete data.ore;
  delete data.itemLevels;
  // Task 21: quest counters / claims are v7 fields (a real v4 save has none).
  delete data.questCounters;
  delete data.questsClaimed;
  for (const run of data.recentRuns) delete run.ore;
  for (const c of Object.keys(data.classes))
    data.classes[c].loadout = {
      weapon: data.classes[c].loadout.weapon,
      armor: null,
      amulet: null,
      ring: null,
    };
  data.classes.mage.loadout = {
    weapon: 'flame_staff-t1',
    armor: 'plate-t1',
    amulet: null,
    ring: 'ring_fury-t1',
  };
  data.classes.warrior.loadout.armor = 'plate-t1';
  return data;
}
/** A v5 profile with every Task 19 field used. */
function v5Profile(): PlayerProfile {
  const r = parseProfileJson(JSON.stringify(v4Save()));
  if (!r.ok) throw r.error;
  const p = r.profile;
  return {
    ...p,
    ore: 57,
    ownedItems: [...p.ownedItems, 'guard_helm-t1', 'leather_pants-t1'],
    itemLevels: { 'plate-t1': 3, 'flame_staff-t1': 10, 'guard_helm-t1': 1 },
    classes: {
      ...p.classes,
      mage: {
        ...p.classes.mage,
        loadout: { ...p.classes.mage.loadout, helmet: 'guard_helm-t1', pants: 'leather_pants-t1' },
      },
    },
  };
}

describe('Task 19 §1.4 — save schema v5', () => {
  it('a v4 save migrates without loss: ore 0, item levels {}, empty helmet/gloves/pants', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(8); // Task 20/21/24: v5 → … → v8 add pets / quests only
    const v4 = v4Save();
    const r = parseProfileJson(JSON.stringify(v4));
    if (!r.ok) throw r.error;
    expect(r.migratedFrom).toBe(4);
    expect(r.profile.ore).toBe(0);
    expect(r.profile.itemLevels).toEqual({});
    for (const c of ['warrior', 'mage', 'rogue', 'archer'] as const) {
      const { loadout, ...rest } = r.profile.classes[c];
      expect(loadout).toEqual({
        ...v4.classes[c].loadout,
        helmet: null,
        gloves: null,
        pants: null,
      });
      const { loadout: _old, ...restOld } = v4.classes[c];
      expect(rest).toEqual(restOld);
    }
    // Everything else is unchanged.
    const {
      classes: _a,
      schemaVersion: _b,
      ore: _c,
      itemLevels: _d,
      questCounters: _e,
      questsClaimed: _f,
      ...others
    } = r.profile;
    const { classes: _a2, schemaVersion: _b2, ...othersOld } = v4;
    expect(others).toEqual(othersOld);
    // The migration itself only adds the new fields.
    const migrated = migrateV4toV5(v4);
    expect(Object.keys(migrated).sort()).toEqual([...Object.keys(v4), 'itemLevels', 'ore'].sort());
  });
  it('round-trip: save store reload, backup, export → import and bug reports keep the new fields', () => {
    const p = v5Profile();
    const storage = new MemoryStorage();
    const first = createSaveStore({ storage, now: () => NOW });
    expect(first.save(p).ok).toBe(true);
    expect(first.save(p).ok).toBe(true); // the second write copies the first to the backup
    const loaded = createSaveStore({ storage, now: () => NOW }).load();
    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    const { lastSavedAt: _l, ...a } = loaded.profile;
    const { lastSavedAt: _l2, ...b } = json(p);
    expect(a).toEqual(b);
    expect(JSON.parse(storage.getItem(BACKUP_KEY)!)).toMatchObject({
      ore: 57,
      itemLevels: p.itemLevels,
    });
    const exported = exportProfile(p, NOW);
    if (!exported.ok) throw exported.error;
    const imported = prepareImport(exported.json);
    expect(imported.ok && imported.profile).toEqual(json(p));
    const report = buildBugReport({
      createdAt: NOW,
      build: { version: '0.1.0', commit: 'abc1234', label: 'v0.1.0 · abc1234' },
      userAgent: 'Test',
      world: null,
      screen: 'menu',
      profile: p,
      errors: [],
    });
    expect(report.save).toMatchObject({
      ok: true,
      profile: { ore: 57, itemLevels: p.itemLevels },
    });
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).classes.mage.loadout.helmet).toBe(
      'guard_helm-t1',
    );
  });
  it('validation: levels 0–10 of owned upgradeable items only; ore ≥ 0; new slots checked', () => {
    const base = json(v5Profile());
    const bad: [string, unknown][] = [
      ['level 11', { ...base, itemLevels: { 'plate-t1': 11 } }],
      ['level −1', { ...base, itemLevels: { 'plate-t1': -1 } }],
      ['level 2.5', { ...base, itemLevels: { 'plate-t1': 2.5 } }],
      ['level as text', { ...base, itemLevels: { 'plate-t1': '3' } }],
      ['not owned', { ...base, itemLevels: { 'plate-t5': 1 } }],
      ['starter weapon', { ...base, itemLevels: { starter_staff: 1 } }],
      ['unknown id', { ...base, itemLevels: { nope: 1 } }],
      ['levels not an object', { ...base, itemLevels: [1] }],
      ['ore < 0', { ...base, ore: -1 }],
      ['ore fraction', { ...base, ore: 0.5 }],
      [
        'helmet item in the gloves slot',
        {
          ...base,
          classes: {
            ...base.classes,
            mage: {
              ...base.classes.mage,
              loadout: { ...base.classes.mage.loadout, gloves: 'guard_helm-t1' },
            },
          },
        },
      ],
      [
        'unowned item in a new slot',
        {
          ...base,
          classes: {
            ...base.classes,
            rogue: {
              ...base.classes.rogue,
              loadout: { ...base.classes.rogue.loadout, gloves: 'plate_gauntlets-t1' },
            },
          },
        },
      ],
    ];
    for (const [label, data] of bad)
      expect(parseProfileJson(JSON.stringify(data)).ok, label).toBe(false);
    // Level 0 is valid and simply not kept.
    const zero = parseProfileJson(JSON.stringify({ ...base, itemLevels: { 'plate-t1': 0 } }));
    expect(zero.ok && zero.profile.itemLevels).toEqual({});
  });
  it('invalid data never overwrites a valid save (import rejected, stored save untouched)', () => {
    const storage = new MemoryStorage();
    const store = createSaveStore({ storage, now: () => NOW });
    expect(store.save(v5Profile()).ok).toBe(true);
    const before = storage.getItem(SAVE_KEY);
    const broken = { ...json(v5Profile()), itemLevels: { 'plate-t1': 99 } };
    const imported = prepareImport(JSON.stringify(broken));
    expect(imported.ok).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(before);
    // A corrupt v5 document on disk is not loaded as valid data.
    storage.setItem(SAVE_KEY, JSON.stringify({ ...broken }));
    const loaded = createSaveStore({ storage, now: () => NOW }).load();
    expect(loaded.status).not.toBe('loaded');
  });
});
