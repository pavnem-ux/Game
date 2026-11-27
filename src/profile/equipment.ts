import type { CharacterClass } from '../character-stats';
import {
  EquipmentError,
  GEAR_SLOTS,
  SLOT_UPGRADE_RULES,
  bagCapacity,
  refreshesAt,
  shopRefreshCost,
  canReforge,
  reforgeCost,
  reforgeItem,
  bagFull,
  salvageOre,
  nextExpansionPrice,
  equippedBy,
  salvageTotal,
  slotUpgradeCost,
  availableOffers,
  equip,
  generateItem,
  offerItem,
  shopStock,
  unequip,
} from '../equipment';
import type {
  AffixStat,
  LegendaryId,
  EquipmentState,
  GearSlot,
  ItemInstance,
  Loadouts,
  Rarity,
  ShopOffer,
} from '../equipment';
import { lcgStream } from '../gameplay/rng';
import type { PlayerProfile } from './profile';

/**
 * Task 40 profile-level gear actions (pure). They map the profile onto the pure equipment rules and
 * back; the caller saves the returned profile once (validated save = one atomic change).
 */
export function equipmentStateOf(profile: PlayerProfile): EquipmentState {
  return Object.freeze({
    gold: profile.gold,
    items: profile.items,
    loadouts: Object.freeze(
      Object.fromEntries(
        Object.entries(profile.classes).map(([c, progress]) => [c, progress.loadout]),
      ),
    ) as Loadouts,
  });
}
function withState(profile: PlayerProfile, s: EquipmentState): PlayerProfile {
  return Object.freeze({
    ...profile,
    gold: s.gold,
    items: s.items,
    classes: Object.freeze(
      Object.fromEntries(
        Object.entries(profile.classes).map(([c, progress]) => [
          c,
          Object.freeze({ ...progress, loadout: s.loadouts[c as CharacterClass] }),
        ]),
      ),
    ) as PlayerProfile['classes'],
  });
}
/** Task 42: the class's whole stock at its level (with the refreshes bought at that level). */
export function stockOf(profile: PlayerProfile, c: CharacterClass): readonly ShopOffer[] {
  const level = profile.classes[c].level;
  return shopStock(profile.shopSalt, c, level, refreshesAt(profile.shopRefreshes[c], level));
}
/** Task 42: Gold for the class's next shop refresh at its current level. */
export const nextRefreshCost = (profile: PlayerProfile, c: CharacterClass) =>
  shopRefreshCost(
    profile.classes[c].level,
    refreshesAt(profile.shopRefreshes[c], profile.classes[c].level),
  );
/**
 * Task 42: a paid new stock for the class at the same level — the count joins the stock seed and
 * the bought offers are cleared. One new profile (throws `gold`).
 */
export function refreshShop(profile: PlayerProfile, c: CharacterClass): PlayerProfile {
  const progress = profile.classes[c];
  if (!progress) throw new EquipmentError('unknown-class');
  const cost = nextRefreshCost(profile, c);
  if (profile.gold < cost) throw new EquipmentError('gold');
  const done = refreshesAt(profile.shopRefreshes[c], progress.level);
  const bought = { ...profile.shopBought };
  delete bought[c];
  return Object.freeze({
    ...profile,
    gold: profile.gold - cost,
    shopBought: Object.freeze(bought),
    shopRefreshes: Object.freeze({
      ...profile.shopRefreshes,
      [c]: Object.freeze({ level: progress.level, count: done + 1 }),
    }),
  });
}
/** The class's shop offers still for sale at its current level (derived, never stored). */
export function shopOffersOf(profile: PlayerProfile, c: CharacterClass): readonly ShopOffer[] {
  const level = profile.classes[c].level;
  return availableOffers(stockOf(profile, c), profile.shopBought[c], level);
}
/**
 * Adds an item instance to the owned list with the next uid (`i<n>`), marked «new» (Task 41).
 * Throws `bag-full` at the bag capacity (60).
 */
function addItem(
  profile: PlayerProfile,
  make: (uid: string) => ItemInstance,
): { profile: PlayerProfile; item: ItemInstance } {
  if (bagFull(profile.items, profile.bagExpansions)) throw new EquipmentError('bag-full');
  const item = make(`i${profile.nextItemNumber}`);
  return {
    item,
    profile: Object.freeze({
      ...profile,
      items: Object.freeze([...profile.items, item]),
      newItems: Object.freeze([...profile.newItems, item.uid]),
      nextItemNumber: profile.nextItemNumber + 1,
    }),
  };
}
/**
 * Buys a shop offer of a class: Gold deducted, the item owned, the offer gone until the next
 * level-up — one new profile (throws EquipmentError, profile unchanged).
 */
export function buyOffer(
  profile: PlayerProfile,
  c: CharacterClass,
  offerId: string,
): PlayerProfile {
  const level = profile.classes[c]?.level;
  if (level === undefined) throw new EquipmentError('unknown-class');
  const offer = shopOffersOf(profile, c).find((o) => o.id === offerId);
  if (!offer) {
    const exists = stockOf(profile, c).some((o) => o.id === offerId);
    throw new EquipmentError(exists ? 'sold-out' : 'unknown-offer');
  }
  if (profile.gold < offer.price) throw new EquipmentError('gold');
  if (bagFull(profile.items, profile.bagExpansions)) throw new EquipmentError('bag-full');
  const prev = profile.shopBought[c];
  const bought = prev && prev.level === level ? prev.offers : [];
  const added = addItem(profile, (uid) => offerItem(offer, c, uid));
  return Object.freeze({
    ...added.profile,
    gold: profile.gold - offer.price,
    shopBought: Object.freeze({
      ...profile.shopBought,
      [c]: Object.freeze({ level, offers: Object.freeze([...bought, offer.id]) }),
    }),
  });
}
export function equipItem(profile: PlayerProfile, c: CharacterClass, uid: string): PlayerProfile {
  return withState(profile, equip(equipmentStateOf(profile), c, uid, profile.classes[c].level));
}
export function unequipSlot(
  profile: PlayerProfile,
  c: CharacterClass,
  slot: GearSlot,
): PlayerProfile {
  return withState(profile, unequip(equipmentStateOf(profile), c, slot));
}
/**
 * Task 40 DEV / QA hook (and Task 42 drops later): grants a random item of a slot, rarity and item
 * level, drawn from a seeded `items` stream (seeded by the profile's shop salt and next uid, so the
 * same profile state always grants the same item).
 */
export function grantItem(
  profile: PlayerProfile,
  spec: Readonly<{
    slot: GearSlot;
    rarity: Rarity;
    itemLevel: number;
    characterClass: CharacterClass;
    /** Task 43 (DEV / QA): a Legendary's unique effect. */
    legendaryId?: LegendaryId;
  }>,
): PlayerProfile {
  const seed = (profile.shopSalt ^ Math.imul(profile.nextItemNumber, 0x9e3779b1)) >>> 0;
  return addItem(profile, (uid) =>
    generateItem(lcgStream(seed), {
      uid,
      slot: spec.slot,
      itemLevel: spec.itemLevel,
      rarity: spec.rarity,
      characterClass: spec.characterClass,
      ...(spec.legendaryId ? { legendaryId: spec.legendaryId } : {}),
    }),
  ).profile;
}

/**
 * Task 41: upgrades one slot of a class by one level — Gold and Ore deducted and the level raised in
 * one new profile (throws `max`, `gold` or `ore`, profile unchanged). No class-level gate.
 */
export function upgradeSlot(
  profile: PlayerProfile,
  c: CharacterClass,
  slot: GearSlot,
): PlayerProfile {
  const progress = profile.classes[c];
  if (!progress) throw new EquipmentError('unknown-class');
  if (!GEAR_SLOTS.includes(slot)) throw new EquipmentError('unknown');
  const level = progress.slotLevels[slot];
  if (level >= SLOT_UPGRADE_RULES.maxLevel) throw new EquipmentError('max');
  const cost = slotUpgradeCost(level + 1);
  if (profile.gold < cost.gold) throw new EquipmentError('gold');
  if (profile.ore < cost.ore) throw new EquipmentError('ore');
  return Object.freeze({
    ...profile,
    gold: profile.gold - cost.gold,
    ore: profile.ore - cost.ore,
    classes: Object.freeze({
      ...profile.classes,
      [c]: Object.freeze({
        ...progress,
        slotLevels: Object.freeze({ ...progress.slotLevels, [slot]: level + 1 }),
      }),
    }),
  });
}
/**
 * Task 41: salvages owned items — they are removed and their Ore paid, in one new profile. Throws
 * `not-owned` (unknown / starter / duplicate uid) or `equipped` (worn by any class); nothing changes.
 */
export function salvageItems(profile: PlayerProfile, uids: readonly string[]): PlayerProfile {
  if (!uids.length || new Set(uids).size !== uids.length) throw new EquipmentError('not-owned');
  const loadouts = equipmentStateOf(profile).loadouts;
  const picked = uids.map((uid) => {
    const item = profile.items.find((i) => i.uid === uid);
    if (!item) throw new EquipmentError('not-owned');
    if (equippedBy(loadouts, uid).length) throw new EquipmentError('equipped');
    return item;
  });
  const gone = new Set(uids);
  return Object.freeze({
    ...profile,
    ore: profile.ore + salvageTotal(picked),
    items: Object.freeze(profile.items.filter((i) => !gone.has(i.uid))),
    newItems: Object.freeze(profile.newItems.filter((u) => !gone.has(u))),
  });
}
/** Task 41: clears the «new» marker of viewed items (unknown uids are ignored). */
export function markItemsSeen(profile: PlayerProfile, uids: readonly string[]): PlayerProfile {
  const seen = new Set(uids);
  if (!profile.newItems.some((u) => seen.has(u))) return profile;
  return Object.freeze({
    ...profile,
    newItems: Object.freeze(profile.newItems.filter((u) => !seen.has(u))),
  });
}

/** Task 42: buys the next bag expansion (+10 slots) for Gold — one new profile (throws `max` / `gold`). */
export function buyBagExpansion(profile: PlayerProfile): PlayerProfile {
  const price = nextExpansionPrice(profile.bagExpansions);
  if (price === null) throw new EquipmentError('max');
  if (profile.gold < price) throw new EquipmentError('gold');
  return Object.freeze({
    ...profile,
    gold: profile.gold - price,
    bagExpansions: profile.bagExpansions + 1,
  });
}

/** Task 42: one item of a run's loot as it reached the profile. */
export interface LootEntry {
  /** The item with its profile uid (an auto-salvaged item keeps its run-local uid). */
  readonly item: ItemInstance;
  /** Ore paid when a full bag auto-salvaged it (Common / Uncommon only); null = in the bag. */
  readonly salvagedOre: number | null;
}
/**
 * Task 42 §3: a run's loot into the profile, in order. Each item gets the next uid and the «new»
 * marker. When the bag is full, Common and Uncommon items are salvaged automatically (their Ore
 * paid); Rare and better always go in, even past capacity (never lost).
 */
export function receiveLoot(
  profile: PlayerProfile,
  loot: readonly ItemInstance[],
): { profile: PlayerProfile; loot: readonly LootEntry[] } {
  const capacity = bagCapacity(profile.bagExpansions);
  const items = [...profile.items];
  const newItems = [...profile.newItems];
  let next = profile.nextItemNumber;
  let ore = profile.ore;
  const entries: LootEntry[] = [];
  for (const raw of loot) {
    const low = raw.rarity === 'common' || raw.rarity === 'uncommon';
    if (low && items.length >= capacity) {
      const paid = salvageOre(raw);
      ore += paid;
      entries.push(Object.freeze({ item: raw, salvagedOre: paid }));
      continue;
    }
    const item = Object.freeze({ ...raw, uid: `i${next++}` });
    items.push(item);
    newItems.push(item.uid);
    entries.push(Object.freeze({ item, salvagedOre: null }));
  }
  return {
    profile: Object.freeze({
      ...profile,
      items: Object.freeze(items),
      newItems: Object.freeze(newItems),
      nextItemNumber: next,
      ore,
    }),
    loot: Object.freeze(entries),
  };
}

/** A 32-bit seed for a profile action draw (FNV-1a of the parts). */
function actionSeed(parts: readonly (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join(':')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/**
 * Task 42: reforges one secondary stat of an owned Rare+ item for Gold (seeded by the profile's
 * shop salt, the uid and the item's reforge count, so the same state always gives the same
 * result). One new profile; throws `not-owned` / `not-eligible` / `gold` (profile unchanged).
 */
export function reforgeProfileItem(
  profile: PlayerProfile,
  uid: string,
  stat: AffixStat,
  characterClass: CharacterClass,
): PlayerProfile {
  const index = profile.items.findIndex((i) => i.uid === uid);
  if (index < 0) throw new EquipmentError('not-owned');
  const item = profile.items[index];
  if (!canReforge(item) || !item.affixes.some((a) => a.stat === stat))
    throw new EquipmentError('not-eligible');
  const cost = reforgeCost(item);
  if (profile.gold < cost) throw new EquipmentError('gold');
  const random = lcgStream(actionSeed([profile.shopSalt, uid, item.reforges ?? 0, 'reforge']));
  const next = reforgeItem(random, item, stat, characterClass);
  const items = [...profile.items];
  items[index] = next;
  return Object.freeze({ ...profile, gold: profile.gold - cost, items: Object.freeze(items) });
}
