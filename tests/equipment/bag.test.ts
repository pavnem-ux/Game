import { describe, expect, it } from 'vitest';
import {
  NO_SLOT_LEVELS,
  bagView,
  defaultLoadouts,
  equippedBy,
  generateItem,
  isBetter,
  lowRaritySalvage,
  salvageTotal,
} from '../../src/equipment';
import type { GearSlot, ItemInstance, Loadouts, Rarity } from '../../src/equipment';
import type { CharacterClass } from '../../src/character-stats';
import { lcgStream } from '../../src/gameplay/rng';

let n = 0;
const item = (slot: GearSlot, rarity: Rarity, itemLevel: number, c: CharacterClass = 'mage') =>
  generateItem(lcgStream(++n), { uid: `i${n}`, slot, rarity, itemLevel, characterClass: c });
const wear = (l: Loadouts, c: CharacterClass, i: ItemInstance): Loadouts => ({
  ...l,
  [c]: { ...l[c], [i.slot]: i.uid },
});

/** Task 41 — bag rules (pure). */
describe('Task 41 — bag', () => {
  const ring = item('ring', 'legendary', 5);
  const armor = item('armor', 'uncommon', 3);
  const helm = item('helmet', 'common', 1);
  const staff = item('weapon', 'rare', 2, 'mage');
  const bow = item('weapon', 'epic', 9, 'archer');
  const items = [ring, armor, helm, staff, bow];
  const loadouts = wear(wear(defaultLoadouts(), 'warrior', armor), 'mage', armor);
  it('salvage: Ore by rarity; equipped items are skipped by «all Common and Uncommon»', () => {
    expect(salvageTotal([ring, armor, helm, staff, bow])).toBe(25 + 1 + 0 + 3 + 8);
    expect(equippedBy(loadouts, armor.uid)).toEqual(['warrior', 'mage']);
    expect(lowRaritySalvage(items, loadouts)).toEqual([helm.uid]);
  });
  it('view: filters, sort, other classes’ weapons only with Weapon + «Show all classes»', () => {
    const f = { characterClass: 'mage' as const, rarity: 'all' as const, slot: 'all' as const };
    const ids = (v: readonly ItemInstance[]) => v.map((i) => i.uid);
    expect(ids(bagView(items, { ...f, showAllClasses: true, sort: 'level' }))).toEqual(
      ids([ring, armor, staff, helm]),
    );
    expect(ids(bagView(items, { ...f, showAllClasses: false, sort: 'rarity' }))).toEqual(
      ids([ring, staff, armor, helm]),
    );
    expect(ids(bagView(items, { ...f, showAllClasses: false, sort: 'newest' }))).toEqual(
      ids([staff, helm, armor, ring]),
    );
    const weapons = { ...f, slot: 'weapon' as const, sort: 'level' as const };
    expect(ids(bagView(items, { ...weapons, showAllClasses: false }))).toEqual([staff.uid]);
    expect(ids(bagView(items, { ...weapons, showAllClasses: true }))).toEqual([bow.uid, staff.uid]);
    expect(
      ids(bagView(items, { ...f, rarity: 'uncommon', showAllClasses: false, sort: 'level' })),
    ).toEqual([armor.uid]);
  });
  it('«better»: higher main stat than the worn item (empty slot → better; worn item → no)', () => {
    const big = item('armor', 'common', 10);
    const small = item('armor', 'common', 1);
    const all = [...items, big, small];
    expect(isBetter(big, loadouts, all, 'mage', 0)).toBe(true);
    expect(isBetter(small, loadouts, all, 'mage', 0)).toBe(false);
    expect(isBetter(armor, loadouts, all, 'mage', 0)).toBe(false); // the worn item itself
    expect(isBetter(helm, loadouts, all, 'mage', 0)).toBe(true); // empty helmet slot
    expect(isBetter(bow, loadouts, all, 'mage', 0)).toBe(false); // not the mage's weapon
    expect(isBetter(big, loadouts, all, 'mage', NO_SLOT_LEVELS.armor)).toBe(true);
  });
});
