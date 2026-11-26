import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { lcgStream } from '../gameplay/rng';
import { GEAR_SLOTS, ITEM_LEVEL_RANGE, SHARED_SLOTS, SHOP_RULES } from './config';
import type { AffixStat, GearSlot, Rarity } from './config';
import { affixPool, generateItem, isStarterUid, starterWeapon } from './items';
import type { ItemInstance } from './items';

/**
 * Task 40 pure ownership / loadout / shop rules (no storage, no UI). The profile owns item
 * instances (account-wide); each class's loadout references instance uids per slot (an instance may
 * be equipped by several classes). Equipping needs class level ≥ item level; weapons are
 * class-only; the weapon slot always holds a weapon (the starter weapon is always owned).
 */
export type Loadout = Readonly<Record<GearSlot, string | null>>;
export type Loadouts = Readonly<Record<CharacterClass, Loadout>>;
export interface EquipmentState {
  readonly gold: number;
  /** Owned item instances (never starter weapons), in acquisition order. */
  readonly items: readonly ItemInstance[];
  readonly loadouts: Loadouts;
}
export const defaultLoadout = (c: CharacterClass): Loadout =>
  Object.freeze({
    weapon: starterWeapon(c).uid,
    helmet: null,
    armor: null,
    gloves: null,
    pants: null,
    amulet: null,
    ring: null,
  });
export const defaultLoadouts = (): Loadouts =>
  Object.freeze(
    Object.fromEntries(CHARACTER_CLASSES.map((c) => [c, defaultLoadout(c)])) as Record<
      CharacterClass,
      Loadout
    >,
  );

/** An owned item (or a class's starter weapon) by uid, null if unknown. */
export function findOwned(
  items: readonly ItemInstance[],
  uid: string,
  characterClass?: CharacterClass,
): ItemInstance | null {
  if (isStarterUid(uid)) {
    const owner = CHARACTER_CLASSES.find((c) => starterWeapon(c).uid === uid)!;
    return characterClass === undefined || owner === characterClass ? starterWeapon(owner) : null;
  }
  return items.find((i) => i.uid === uid) ?? null;
}
export type EquipBlock = 'unknown' | 'not-eligible' | 'level';
/** Can this class equip this item (slot / class / level)? Null = yes. */
export function equipBlock(
  item: ItemInstance,
  characterClass: CharacterClass,
  classLevel: number,
): EquipBlock | null {
  if (item.slot === 'weapon' && item.characterClass !== characterClass) return 'not-eligible';
  if (classLevel < item.itemLevel) return 'level';
  return null;
}
export class EquipmentError extends Error {
  constructor(
    readonly reason:
      | EquipBlock
      | 'not-owned'
      | 'unknown-class'
      | 'sold-out'
      | 'gold'
      | 'unknown-offer',
  ) {
    super(`Equipment action refused: ${reason}.`);
    this.name = 'EquipmentError';
  }
}
function setSlot(
  state: EquipmentState,
  c: CharacterClass,
  slot: GearSlot,
  uid: string | null,
): EquipmentState {
  if (!CHARACTER_CLASSES.includes(c)) throw new EquipmentError('unknown-class');
  return Object.freeze({
    ...state,
    loadouts: Object.freeze({
      ...state.loadouts,
      [c]: Object.freeze({ ...state.loadouts[c], [slot]: uid }),
    }),
  });
}
/** Equips an owned item into its slot for one class (only this class's loadout changes). */
export function equip(
  state: EquipmentState,
  c: CharacterClass,
  uid: string,
  classLevel: number,
): EquipmentState {
  const item = findOwned(state.items, uid, c);
  if (!item) throw new EquipmentError(isStarterUid(uid) ? 'not-eligible' : 'not-owned');
  const block = equipBlock(item, c, classLevel);
  if (block) throw new EquipmentError(block);
  return setSlot(state, c, item.slot, item.uid);
}
/** Unequips a slot: the weapon goes back to the starter weapon, other slots become empty. */
export function unequip(state: EquipmentState, c: CharacterClass, slot: GearSlot): EquipmentState {
  return setSlot(state, c, slot, slot === 'weapon' ? starterWeapon(c).uid : null);
}
/** Equipped items of a loadout (unknown uids are skipped; validation rejects them earlier). */
export function equippedItems(
  loadout: Loadout,
  items: readonly ItemInstance[],
  characterClass: CharacterClass,
): readonly ItemInstance[] {
  return GEAR_SLOTS.map((s) => loadout[s])
    .filter((uid): uid is string => uid !== null)
    .map((uid) => findOwned(items, uid, characterClass))
    .filter((i): i is ItemInstance => i !== null);
}
/** Rejects a loadout: unknown / not owned uids, wrong slot or class, empty weapon, item level. */
export function validateLoadout(
  characterClass: CharacterClass,
  loadout: Loadout,
  items: readonly ItemInstance[],
  classLevel: number,
): void {
  for (const slot of GEAR_SLOTS) {
    const uid = loadout[slot];
    if (uid === null) {
      if (slot === 'weapon') throw new RangeError('The weapon slot cannot be empty.');
      continue;
    }
    const item = findOwned(items, uid, characterClass);
    if (!item || item.slot !== slot || equipBlock(item, characterClass, classLevel))
      throw new RangeError(`Item ${uid} cannot be equipped by ${characterClass} in ${slot}.`);
  }
}

// ── Shop (§5): a derived, seeded stock ──

export interface ShopOffer {
  /** Stable id within the class's stock at this class level (bought offers are saved by id). */
  readonly id: string;
  readonly slot: GearSlot;
  readonly rarity: Extract<Rarity, 'common' | 'uncommon'>;
  readonly itemLevel: number;
  /** Uncommon: its secondary stat. */
  readonly stat: AffixStat | null;
  readonly price: number;
}
/** Bought offers of a class at a class level (they reset on the next level-up). */
export interface ShopBought {
  readonly level: number;
  readonly offers: readonly string[];
}
export function shopPrice(rarity: 'common' | 'uncommon', level: number, slot: GearSlot): number {
  const base = rarity === 'common' ? SHOP_RULES.commonBase : SHOP_RULES.uncommonBase;
  return Math.round(
    base *
      (1 + level / SHOP_RULES.levelDivisor) *
      (slot === 'weapon' ? SHOP_RULES.weaponFactor : 1),
  );
}
/** 32-bit hash of the shop draw inputs (FNV-1a). */
function shopSeed(salt: number, c: CharacterClass, level: number): number {
  let h = 0x811c9dc5 ^ (salt >>> 0);
  for (const ch of `${c}:${level}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/**
 * The class's stock at a class level: per slot (6 shared + the class weapon) one Common and three
 * Uncommon offers with three different stats drawn from the slot's pool — a seeded draw from (the
 * profile's shop salt, class, level), so it is the same after a reload and new after a level-up.
 */
export function shopStock(
  salt: number,
  c: CharacterClass,
  classLevel: number,
): readonly ShopOffer[] {
  const level = Math.min(ITEM_LEVEL_RANGE.max, Math.max(ITEM_LEVEL_RANGE.min, classLevel));
  const random = lcgStream(shopSeed(salt, c, level));
  const offers: ShopOffer[] = [];
  for (const slot of ['weapon', ...SHARED_SLOTS] as GearSlot[]) {
    offers.push(
      Object.freeze({
        id: `${slot}:common`,
        slot,
        rarity: 'common' as const,
        itemLevel: level,
        stat: null,
        price: shopPrice('common', level, slot),
      }),
    );
    const pool = [...affixPool(slot, c)];
    for (let i = 0; i < SHOP_RULES.uncommonPerSlot; i++) {
      const stat = pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0];
      offers.push(
        Object.freeze({
          id: `${slot}:uncommon:${stat}`,
          slot,
          rarity: 'uncommon' as const,
          itemLevel: level,
          stat,
          price: shopPrice('uncommon', level, slot),
        }),
      );
    }
  }
  return Object.freeze(offers);
}
/** Offers still for sale (bought ones are gone until the next level-up). */
export function availableOffers(
  stock: readonly ShopOffer[],
  bought: ShopBought | undefined,
  classLevel: number,
): readonly ShopOffer[] {
  const gone = bought && bought.level === classLevel ? new Set(bought.offers) : new Set<string>();
  return Object.freeze(stock.filter((o) => !gone.has(o.id)));
}
/** The item a shop offer creates (Uncommon: its stat at the fixed 75% roll). */
export function offerItem(offer: ShopOffer, c: CharacterClass, uid: string): ItemInstance {
  return generateItem(() => 0, {
    uid,
    slot: offer.slot,
    itemLevel: offer.itemLevel,
    rarity: offer.rarity,
    characterClass: c,
    ...(offer.stat ? { stats: [offer.stat] } : {}),
  });
}
