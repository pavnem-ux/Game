import { NO_QUEST_COUNTERS } from '../../src/quests';
import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  createSaveStore,
  exportProfile,
  parseProfile,
  parseProfileJson,
  prepareImport,
} from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';
import { defaultLoadout, equip, purchase } from '../../src/equipment';
import type { EquipmentState } from '../../src/equipment';
import { buildBugReport } from '../../src/gameplay-ui/bug-report';

class MemoryStorage implements StorageLike {
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
const NOW = '2026-11-10T12:00:00.000Z';
/** A played profile (maps 1–9 won, 900 Gold extra) with some gear bought and equipped. */
function geared(): PlayerProfile {
  let p = createProfile('gear', NOW);
  for (let id = 1; id <= 9; id++)
    p = applyRunResult(
      p,
      {
        runId: `r${id}`,
        mapId: id,
        characterClass: 'warrior',
        outcome: 'victory',
        elapsed: 900,
        kills: 10,
        eliteKills: 1,
        bossKilled: true,
        runLevel: 5,
      },
      NOW,
    ).profile;
  let s: EquipmentState = {
    gold: p.gold,
    ownedItems: p.ownedItems,
    loadouts: Object.fromEntries(
      Object.entries(p.classes).map(([c, v]) => [c, v.loadout]),
    ) as EquipmentState['loadouts'],
  };
  for (const id of ['plate-t2', 'heavy_sword-t1', 'ring_fury-t1']) s = purchase(s, id, 9);
  s = equip(
    equip(equip(s, 'warrior', 'heavy_sword-t1'), 'warrior', 'plate-t2'),
    'mage',
    'ring_fury-t1',
  );
  return {
    ...p,
    gold: s.gold,
    ownedItems: s.ownedItems,
    classes: Object.fromEntries(
      Object.entries(p.classes).map(([c, v]) => [c, { ...v, loadout: s.loadouts[c as never] }]),
    ) as PlayerProfile['classes'],
  };
}
const json = (p: unknown) => JSON.parse(JSON.stringify(p));

describe('Task 11 Phase 2 — gear in the save (schema v4)', () => {
  it('an old v3 save migrates without loss: ownedItems [], starter loadouts; Gold, XP, maps, talents kept', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(7); // Task 21
    const current = json(geared());
    const v3 = json(current);
    v3.schemaVersion = 3;
    // Task 19: v3 had no ore / item levels (v5 fields): the migrated profile gets 0 / {}.
    delete v3.ore;
    delete v3.itemLevels;
    delete v3.questCounters; // Task 21 (v7) fields
    delete v3.questsClaimed;
    delete v3.ownedItems;
    for (const c of Object.keys(v3.classes)) delete v3.classes[c].loadout;
    const r = parseProfileJson(JSON.stringify(v3));
    if (!r.ok) throw r.error;
    expect(r.migratedFrom).toBe(3);
    expect(r.profile.ownedItems).toEqual([]);
    for (const c of ['warrior', 'mage', 'rogue', 'archer'] as const) {
      expect(r.profile.classes[c].loadout).toEqual(defaultLoadout(c));
      const { loadout: _a, ...restNew } = r.profile.classes[c];
      const { loadout: _b, ...restOld } = current.classes[c];
      expect(restNew).toEqual(restOld);
    }
    const { ownedItems: _o, classes: _c, schemaVersion: _v, ...others } = r.profile;
    const { ownedItems: _o2, classes: _c2, schemaVersion: _v2, ...othersOld } = current;
    expect(others).toEqual({
      ...othersOld,
      ore: 0,
      itemLevels: {},
      questCounters: NO_QUEST_COUNTERS,
      questsClaimed: [],
    });
  });
  it('purchases and loadouts survive a reload (save store) and export → import', () => {
    const p = geared();
    expect(p.ownedItems).toEqual(['plate-t2', 'heavy_sword-t1', 'ring_fury-t1']);
    const storage = new MemoryStorage();
    const store = createSaveStore({ storage, now: () => NOW, newProfileId: () => 'x' });
    expect(store.save(p).ok).toBe(true);
    const loaded = createSaveStore({ storage, now: () => NOW }).load();
    expect(loaded.status).toBe('loaded');
    if (loaded.status !== 'loaded') return;
    expect(loaded.profile.ownedItems).toEqual(p.ownedItems);
    expect(loaded.profile.classes.warrior.loadout).toEqual({
      weapon: 'heavy_sword-t1',
      armor: 'plate-t2',
      helmet: null,
      gloves: null,
      pants: null,
      amulet: null,
      ring: null,
    });
    expect(loaded.profile.classes.mage.loadout.ring).toBe('ring_fury-t1');
    const exported = exportProfile(p, NOW);
    if (!exported.ok) throw exported.error;
    const imported = prepareImport(exported.json);
    expect(imported.ok && imported.profile.ownedItems).toEqual(p.ownedItems);
    expect(imported.ok && imported.profile.classes).toEqual(json(p.classes));
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).ownedItems).toEqual(p.ownedItems);
  });
  it('invalid gear data is rejected (unknown ids, duplicates, not owned, wrong slot/class, Gold < 0)', () => {
    const base = json(geared());
    const withClass = (c: string, loadout: object) => ({
      ...base,
      classes: { ...base.classes, [c]: { ...base.classes[c], loadout } },
    });
    const w = base.classes.warrior.loadout;
    const cases: unknown[] = [
      { ...base, ownedItems: ['excalibur-t9'] },
      { ...base, ownedItems: ['plate-t2', 'plate-t2'] },
      { ...base, ownedItems: ['starter_sword'] },
      { ...base, ownedItems: 'all' },
      withClass('warrior', { ...w, amulet: 'amulet_power-t1' }), // equipped but not owned
      withClass('warrior', { ...w, weapon: 'flame_staff-t1' }), // another class's weapon
      withClass('mage', { ...base.classes.mage.loadout, weapon: 'starter_sword' }),
      withClass('warrior', { ...w, armor: 'ring_fury-t1' }), // wrong slot
      withClass('warrior', { ...w, weapon: null }), // the weapon slot is never empty
      withClass('warrior', { ...w, ring: 'nope' }),
      withClass('warrior', 'heavy'),
      { ...base, gold: -1 },
    ];
    for (const c of cases) expect(parseProfile(c).ok, JSON.stringify(c).slice(0, 80)).toBe(false);
    // An invalid import never produces a profile to overwrite a valid save with.
    expect(prepareImport(JSON.stringify(cases[0])).ok).toBe(false);
  });
  it('bug reports include the gear (validated save)', () => {
    const report = buildBugReport({
      createdAt: NOW,
      build: { version: '0.1.0', commit: 'abc1234', label: 'v0.1.0 · abc1234' },
      userAgent: 'test',
      world: null,
      screen: 'menu',
      profile: geared(),
      errors: [],
    });
    expect(report.save.ok && report.save.profile.ownedItems).toEqual(geared().ownedItems);
    expect(report.save.ok && report.save.profile.classes.warrior.loadout.weapon).toBe(
      'heavy_sword-t1',
    );
  });
});
