import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { BAG_CAPACITY, GEAR_SLOTS, RARITIES, SALVAGE_ORE } from './config';
import type { GearSlot, Rarity } from './config';
import type { ItemInstance } from './items';
import { findOwned } from './logic';
import type { Loadouts } from './logic';
import { slottedStats } from './slots';

/**
 * Task 41 bag rules (pure): capacity, salvage (Ore by rarity; equipped items are locked) and the
 * «better» comparison shared by the Bag and the Shop.
 */
export const bagCount = (items: readonly ItemInstance[]) => items.length;
export const bagFull = (items: readonly ItemInstance[]) => items.length >= BAG_CAPACITY;
/** The classes whose loadout holds this uid (in class order). */
export function equippedBy(loadouts: Loadouts, uid: string): readonly CharacterClass[] {
  return CHARACTER_CLASSES.filter((c) => GEAR_SLOTS.some((s) => loadouts[c][s] === uid));
}
export const salvageOre = (item: ItemInstance) => SALVAGE_ORE[item.rarity];
/** Ore of salvaging these items. */
export const salvageTotal = (items: readonly ItemInstance[]) =>
  items.reduce((sum, i) => sum + salvageOre(i), 0);
/** Uids of every unequipped Common and Uncommon item («Salvage all Common and Uncommon»). */
export function lowRaritySalvage(items: readonly ItemInstance[], loadouts: Loadouts): string[] {
  return items
    .filter(
      (i) =>
        (i.rarity === 'common' || i.rarity === 'uncommon') && !equippedBy(loadouts, i.uid).length,
    )
    .map((i) => i.uid);
}
/**
 * Is `item` better than what `characterClass` wears in its slot? Compared on the main stat with the
 * slot bonus (the same level applies to both): every main value ≥ and at least one higher. An empty
 * slot makes any fitting item better.
 */
export function isBetter(
  item: ItemInstance,
  loadouts: Loadouts,
  items: readonly ItemInstance[],
  characterClass: CharacterClass,
  slotLevel = 0,
): boolean {
  if (item.slot === 'weapon' && item.characterClass !== characterClass) return false;
  const worn = loadouts[characterClass][item.slot];
  if (worn === item.uid) return false;
  const current = worn ? findOwned(items, worn, characterClass) : null;
  if (!current) return true;
  const a = slottedStats(item, characterClass, slotLevel).main;
  const b = slottedStats(current, characterClass, slotLevel).main;
  const keys = ['physicalDamage', 'magicalDamage', 'maxHp', 'resistance'] as const;
  return keys.every((k) => a[k] >= b[k]) && keys.some((k) => a[k] > b[k]);
}
/** Main-stat difference of `item` against what the class wears in that slot (with slot bonuses). */
export function mainDelta(
  item: ItemInstance,
  loadouts: Loadouts,
  items: readonly ItemInstance[],
  characterClass: CharacterClass,
  slotLevel = 0,
): Readonly<Record<'physicalDamage' | 'magicalDamage' | 'maxHp' | 'resistance', number>> {
  const slot: GearSlot = item.slot;
  const worn = loadouts[characterClass][slot];
  const current = worn ? findOwned(items, worn, characterClass) : null;
  const a = slottedStats(item, characterClass, slotLevel).main;
  const b = current ? slottedStats(current, characterClass, slotLevel).main : null;
  return Object.freeze({
    physicalDamage: a.physicalDamage - (b?.physicalDamage ?? 0),
    magicalDamage: a.magicalDamage - (b?.magicalDamage ?? 0),
    maxHp: a.maxHp - (b?.maxHp ?? 0),
    resistance: a.resistance - (b?.resistance ?? 0),
  });
}

export type BagSort = 'level' | 'rarity' | 'newest';
export interface BagFilter {
  readonly characterClass: CharacterClass;
  readonly rarity: Rarity | 'all';
  readonly slot: GearSlot | 'all';
  /** Other classes' weapons are shown only with the Weapon slot filter and this toggle. */
  readonly showAllClasses: boolean;
  readonly sort: BagSort;
}
const uidNumber = (uid: string) => Number(/^i(\d+)$/.exec(uid)?.[1] ?? 0);
const rank = (r: Rarity) => RARITIES.indexOf(r);
/** The bag grid: filtered and sorted owned items (pure; starter weapons are not in the bag). */
export function bagView(items: readonly ItemInstance[], f: BagFilter): readonly ItemInstance[] {
  const shown = items.filter(
    (i) =>
      (f.rarity === 'all' || i.rarity === f.rarity) &&
      (f.slot === 'all' || i.slot === f.slot) &&
      (i.slot !== 'weapon' ||
        i.characterClass === f.characterClass ||
        (f.slot === 'weapon' && f.showAllClasses)),
  );
  const by = {
    level: (a: ItemInstance, b: ItemInstance) =>
      b.itemLevel - a.itemLevel || rank(b.rarity) - rank(a.rarity),
    rarity: (a: ItemInstance, b: ItemInstance) =>
      rank(b.rarity) - rank(a.rarity) || b.itemLevel - a.itemLevel,
    newest: () => 0,
  }[f.sort];
  return Object.freeze([...shown].sort((a, b) => by(a, b) || uidNumber(b.uid) - uidNumber(a.uid)));
}
