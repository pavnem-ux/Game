import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  SAVE_SCHEMA_VERSION,
  createSaveStore,
  exportProfile,
  parseProfileJson,
  prepareImport,
} from '../../src/persistence';
import { migrateV9toV10 } from '../../src/persistence/saveSchema';
import { NO_SLOT_LEVELS, defaultLoadout } from '../../src/equipment';
import {
  addClassXp,
  applyRunResult,
  buyOffer,
  createProfile,
  equipItem,
  grantItem,
  shopOffersOf,
  shopSaltOf,
  xpToNextLevel,
} from '../../src/profile';
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
const NOW = '2026-11-26T12:00:00.000Z';
const json = (p: unknown) => JSON.parse(JSON.stringify(p));
const ITEM_FIELDS = ['items', 'nextItemNumber', 'shopSalt', 'shopBought'];

/** A real Task 19–39 save: schema v9 with old tiered items, item levels and loadouts. */
function v9Save() {
  let p = createProfile('v9', NOW);
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
  p = { ...p, classes: { ...p.classes, rogue: addClassXp(p.classes.rogue, 3000).progress } };
  const data = json(p);
  for (const k of ITEM_FIELDS) delete data[k];
  // Task 41 fields (v11) did not exist in v9.
  delete data.newItems;
  for (const c of Object.keys(data.classes)) delete data.classes[c].slotLevels;
  data.schemaVersion = 9;
  data.gold = 1234;
  data.ore = 57;
  data.ownedItems = ['plate-t1', 'flame_staff-t1', 'ring_fury-t1'];
  data.itemLevels = { 'plate-t1': 3, 'flame_staff-t1': 10 };
  data.classes.mage.loadout = {
    ...data.classes.mage.loadout,
    weapon: 'flame_staff-t1',
    armor: 'plate-t1',
    ring: 'ring_fury-t1',
  };
  data.classes.warrior.loadout.armor = 'plate-t1';
  // On the old (cheaper) curve the mage held more XP than its next level now costs.
  data.classes.mage.xp = 5000;
  return data;
}
/** A v10 profile with every Task 40 field used. */
function v10Profile(): PlayerProfile {
  const r = parseProfileJson(JSON.stringify(v9Save()));
  if (!r.ok) throw r.error;
  let p = buyOffer(r.profile, 'mage', 'armor:common');
  p = grantItem(p, { slot: 'weapon', rarity: 'epic', itemLevel: 1, characterClass: 'mage' });
  p = grantItem(p, { slot: 'amulet', rarity: 'legendary', itemLevel: 3, characterClass: 'mage' });
  return equipItem(equipItem(p, 'mage', 'i1'), 'mage', 'i2');
}

describe('Task 40 — save schema v10 (equipment reset)', () => {
  it('a v9 save migrates: equipment reset to the starter weapons, everything else kept', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(11); // then v10 → v11 (Task 41: slot levels, «new»)
    const v9 = v9Save();
    const r = parseProfileJson(JSON.stringify(v9));
    if (!r.ok) throw r.error;
    expect(r.migratedFrom).toBe(9);
    const p = r.profile;
    expect([p.items, p.nextItemNumber, p.shopSalt, p.shopBought]).toEqual([
      [],
      1,
      shopSaltOf('v9'),
      {},
    ]);
    expect('ownedItems' in p || 'itemLevels' in p).toBe(false);
    for (const c of ['warrior', 'mage', 'rogue', 'archer'] as const) {
      const { loadout, xp, slotLevels, ...rest } = p.classes[c];
      expect(slotLevels).toEqual(NO_SLOT_LEVELS);
      expect(loadout).toEqual(defaultLoadout(c));
      const { loadout: _o, xp: oldXp, ...restOld } = v9.classes[c];
      expect(rest).toEqual(restOld);
      // XP is kept unless it already pays for the next level on the new curve (then cost − 1).
      const cost = xpToNextLevel(rest.level)!;
      expect(xp).toBe(oldXp >= cost ? cost - 1 : oldXp);
    }
    expect(p.classes.mage.xp).toBe(xpToNextLevel(p.classes.mage.level)! - 1);
    expect(p.classes.rogue.xp).toBe(v9.classes.rogue.xp);
    // Gold, Ore, maps, runs, pets, quests: unchanged.
    const { classes: _a, schemaVersion: _b, ...others } = json(p);
    const { classes: _a2, schemaVersion: _b2, ownedItems: _c, itemLevels: _d, ...othersOld } = v9;
    for (const k of [...ITEM_FIELDS, 'newItems']) delete others[k];
    expect(others).toEqual(othersOld);
    expect(p.gold).toBe(1234);
    expect(p.ore).toBe(57);
    // The migration itself replaces exactly the old item fields.
    const migrated = migrateV9toV10(v9);
    expect(Object.keys(migrated).sort()).toEqual(
      [
        ...Object.keys(v9).filter((k) => k !== 'ownedItems' && k !== 'itemLevels'),
        ...ITEM_FIELDS,
      ].sort(),
    );
  });
  it('round-trip: save store reload, backup, export → import and bug reports keep the items', () => {
    const p = v10Profile();
    expect(p.items.map((i) => i.uid)).toEqual(['i1', 'i2', 'i3']);
    expect(p.shopBought.mage).toEqual({ level: p.classes.mage.level, offers: ['armor:common'] });
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
    // The derived shop stock is the same after a reload (the bought offer stays gone).
    expect(shopOffersOf(loaded.profile, 'mage')).toEqual(shopOffersOf(p, 'mage'));
    expect(JSON.parse(storage.getItem(BACKUP_KEY)!)).toMatchObject({ nextItemNumber: 4 });
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
    expect(report.save).toMatchObject({ ok: true, profile: { items: json(p.items) } });
  });
  it('validation: item instances, uids, loadouts and the shop record', () => {
    const base = json(v10Profile());
    const withItem = (i: number, patch: Record<string, unknown>) => ({
      ...base,
      items: base.items.map((it: object, k: number) => (k === i ? { ...it, ...patch } : it)),
    });
    const withLoadout = (patch: Record<string, unknown>) => ({
      ...base,
      classes: {
        ...base.classes,
        mage: { ...base.classes.mage, loadout: { ...base.classes.mage.loadout, ...patch } },
      },
    });
    const bad: [string, unknown][] = [
      ['items not an array', { ...base, items: {} }],
      ['duplicate uid', withItem(1, { uid: 'i1' })],
      ['uid ≥ nextItemNumber', { ...base, nextItemNumber: 3 }],
      ['starter uid as item', withItem(0, { uid: 'starter_staff' })],
      ['unknown slot', withItem(0, { slot: 'boots' })],
      ['item level 0', withItem(0, { itemLevel: 0 })],
      ['item level 51', withItem(0, { itemLevel: 51 })],
      ['unknown rarity', withItem(0, { rarity: 'mythic' })],
      ['common with an affix', withItem(0, { affixes: [{ stat: 'maxHpPercent', value: 1 }] })],
      ['weapon without a class', withItem(1, { characterClass: undefined })],
      ['armor with a class', withItem(0, { characterClass: 'mage' })],
      [
        'affix above its maximum',
        withItem(2, {
          affixes: base.items[2].affixes.map((a: { stat: string }, k: number) =>
            k === 0 ? { ...a, value: 10_000 } : a,
          ),
        }),
      ],
      ['unknown uid in a loadout', withLoadout({ ring: 'i99' })],
      ['item in the wrong slot', withLoadout({ helmet: 'i1' })],
      ['another class’s weapon', withLoadout({ weapon: 'starter_sword' })],
      ['empty weapon slot', withLoadout({ weapon: null })],
      ['item above the class level', withLoadout({ amulet: 'i3' })],
      [
        'shopBought of an unknown class',
        { ...base, shopBought: { bard: { level: 1, offers: [] } } },
      ],
      [
        'duplicate bought offer',
        { ...base, shopBought: { mage: { level: 1, offers: ['ring:common', 'ring:common'] } } },
      ],
      ['shopSalt negative', { ...base, shopSalt: -1 }],
    ];
    expect(base.classes.mage.level).toBeLessThan(3); // the level-3 amulet is above the mage
    for (const [label, data] of bad) {
      const r = parseProfileJson(JSON.stringify(data));
      expect(r.ok, label).toBe(false);
      expect(!r.ok && r.error.code, label).toBe('invalid');
    }
    expect(parseProfileJson(JSON.stringify(base)).ok).toBe(true);
  });
});
