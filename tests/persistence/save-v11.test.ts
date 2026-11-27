import { describe, expect, it } from 'vitest';
import {
  SAVE_SCHEMA_VERSION,
  migrateV10toV11,
  parseProfileJson,
  prepareImport,
  exportProfile,
} from '../../src/persistence';
import { EquipmentError, bagCapacity, NO_SLOT_LEVELS, slotUpgradeCost } from '../../src/equipment';
import {
  buyOffer,
  createProfile,
  equipItem,
  grantItem,
  markItemsSeen,
  salvageItems,
  upgradeSlot,
} from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';
import { QUEST_BY_ID, questProgress } from '../../src/quests';

const NOW = '2026-11-26T12:00:00.000Z';
const json = (p: unknown) => JSON.parse(JSON.stringify(p));
const rich = (): PlayerProfile => {
  let p: PlayerProfile = { ...createProfile('v11', NOW), gold: 20_000, ore: 500 };
  p = grantItem(p, { slot: 'ring', rarity: 'legendary', itemLevel: 1, characterClass: 'mage' });
  p = grantItem(p, { slot: 'armor', rarity: 'uncommon', itemLevel: 1, characterClass: 'mage' });
  p = grantItem(p, { slot: 'helmet', rarity: 'common', itemLevel: 1, characterClass: 'mage' });
  p = grantItem(p, { slot: 'amulet', rarity: 'epic', itemLevel: 1, characterClass: 'mage' });
  return equipItem(p, 'warrior', 'i2');
};
const fail = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof EquipmentError ? e.reason : 'other';
  }
  return null;
};

describe('Task 41 — slot upgrades, salvage, bag and «new» on the profile', () => {
  it('upgrade: Gold + Ore deducted, the level raised for that class only; refusals change nothing', () => {
    const p = rich();
    const up = upgradeSlot(p, 'mage', 'weapon');
    expect(up.classes.mage.slotLevels).toEqual({ ...NO_SLOT_LEVELS, weapon: 1 });
    expect(up.classes.warrior.slotLevels).toEqual(NO_SLOT_LEVELS);
    expect([up.gold, up.ore]).toEqual([p.gold - 254, p.ore - 12]);
    expect(fail(() => upgradeSlot({ ...p, gold: 253 }, 'mage', 'weapon'))).toBe('gold');
    expect(fail(() => upgradeSlot({ ...p, ore: 11 }, 'mage', 'weapon'))).toBe('ore');
    let top = { ...p, gold: 1e9, ore: 1e9 };
    for (let n = 1; n <= 30; n++) top = upgradeSlot(top, 'rogue', 'ring');
    expect(top.classes.rogue.slotLevels.ring).toBe(30);
    expect(fail(() => upgradeSlot(top, 'rogue', 'ring'))).toBe('max');
    const spent = Array.from({ length: 30 }, (_, i) => slotUpgradeCost(i + 1).gold).reduce(
      (a, b) => a + b,
    );
    expect(top.gold).toBe(1e9 - spent);
  });
  it('salvage: Ore by rarity, items removed; equipped items are locked', () => {
    const p = rich();
    expect(fail(() => salvageItems(p, ['i2']))).toBe('equipped'); // worn by the Warrior
    expect(fail(() => salvageItems(p, ['i99']))).toBe('not-owned');
    expect(fail(() => salvageItems(p, ['i1', 'i1']))).toBe('not-owned');
    expect(fail(() => salvageItems(p, ['starter_staff']))).toBe('not-owned');
    const s = salvageItems(p, ['i1', 'i3', 'i4']); // Legendary 25 + Common 0 + Epic 8
    expect(s.ore).toBe(p.ore + 33);
    expect(s.items.map((i) => i.uid)).toEqual(['i2']);
    expect(s.newItems).toEqual(['i2']);
  });
  it('bag: at capacity (Task 42: base 25) the shop and grants refuse at the cap; new items are marked until seen', () => {
    let p: PlayerProfile = { ...createProfile('bag', NOW), gold: 1e6 };
    for (let i = 0; i < bagCapacity(0); i++)
      p = grantItem(p, { slot: 'ring', rarity: 'common', itemLevel: 1, characterClass: 'mage' });
    expect(p.items).toHaveLength(25);
    expect(fail(() => buyOffer(p, 'mage', 'ring:common'))).toBe('bag-full');
    expect(
      fail(() =>
        grantItem(p, { slot: 'ring', rarity: 'common', itemLevel: 1, characterClass: 'mage' }),
      ),
    ).toBe('bag-full');
    expect(p.newItems).toHaveLength(25);
    const seen = markItemsSeen(p, ['i1', 'i5', 'nope']);
    expect(seen.newItems).toHaveLength(23);
    expect(markItemsSeen(seen, ['i1'])).toBe(seen); // nothing to clear → same profile
    const freed = salvageItems(p, ['i1']);
    expect(buyOffer(freed, 'mage', 'ring:common').newItems.at(-1)).toBe('i26');
  });
  it('quests: «Upgrade any slot to +5 / +10» are back and read the highest slot level', () => {
    for (const id of ['forge.plus5', 'forge.plus10'])
      expect(QUEST_BY_ID.get(id)!.hidden).toBeUndefined();
    expect(QUEST_BY_ID.get('forge.tier4')!.hidden).toBeUndefined(); // Task 42
    let p: PlayerProfile = { ...createProfile('q', NOW), gold: 1e6, ore: 1e6 };
    for (let n = 0; n < 5; n++) p = upgradeSlot(p, 'archer', 'pants');
    expect(questProgress(p, QUEST_BY_ID.get('forge.plus5')!).state).toBe('complete');
    expect(questProgress(p, QUEST_BY_ID.get('forge.plus10')!)).toMatchObject({
      current: 5,
      state: 'in-progress',
    });
  });
});

describe('Task 41 — save v11', () => {
  it('a v10 save migrates: slot levels 0, no «new» items; nothing else changes', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(12); // then v11 → v12 (Task 42)
    const p = rich();
    const v10 = json(p);
    v10.schemaVersion = 10;
    delete v10.newItems;
    for (const c of Object.keys(v10.classes)) delete v10.classes[c].slotLevels;
    const r = parseProfileJson(JSON.stringify(v10));
    if (!r.ok) throw r.error;
    expect(r.migratedFrom).toBe(10);
    expect(json(r.profile)).toEqual({ ...json(p), newItems: [] });
    expect(r.profile.schemaVersion).toBe(12);
    expect(Object.keys(migrateV10toV11(v10)).sort()).toEqual(
      [...Object.keys(v10), 'newItems'].sort(),
    );
  });
  it('round-trip keeps slot levels and «new»; invalid data is rejected', () => {
    const p = upgradeSlot(rich(), 'mage', 'ring');
    const out = exportProfile(p, NOW);
    if (!out.ok) throw out.error;
    const back = prepareImport(out.json);
    expect(back.ok && back.profile).toEqual(json(p));
    const base = json(p);
    const withClass = (slotLevels: unknown) => ({
      ...base,
      classes: { ...base.classes, mage: { ...base.classes.mage, slotLevels } },
    });
    for (const bad of [
      withClass({ ...NO_SLOT_LEVELS, ring: 31 }),
      withClass({ ...NO_SLOT_LEVELS, ring: -1 }),
      withClass({ ...NO_SLOT_LEVELS, ring: 2.5 }),
      withClass({ boots: 1 }),
      withClass([1]),
      { ...base, newItems: ['i99'] },
      { ...base, newItems: ['i1', 'i1'] },
      { ...base, newItems: 'i1' },
    ])
      expect(parseProfileJson(JSON.stringify(bad)).ok).toBe(false);
  });
});
