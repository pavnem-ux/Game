import type { CharacterClass } from '../character-stats';
import {
  EquipmentError,
  GEAR_SLOTS,
  SLOT_UPGRADE_RULES,
  bagFull,
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
/** The class's shop offers still for sale at its current level (derived, never stored). */
export function shopOffersOf(profile: PlayerProfile, c: CharacterClass): readonly ShopOffer[] {
  const level = profile.classes[c].level;
  return availableOffers(shopStock(profile.shopSalt, c, level), profile.shopBought[c], level);
}
/**
 * Adds an item instance to the owned list with the next uid (`i<n>`), marked «new» (Task 41).
 * Throws `bag-full` at the bag capacity (60).
 */
function addItem(
  profile: PlayerProfile,
  make: (uid: string) => ItemInstance,
): { profile: PlayerProfile; item: ItemInstance } {
  if (bagFull(profile.items)) throw new EquipmentError('bag-full');
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
    const exists = shopStock(profile.shopSalt, c, level).some((o) => o.id === offerId);
    throw new EquipmentError(exists ? 'sold-out' : 'unknown-offer');
  }
  if (profile.gold < offer.price) throw new EquipmentError('gold');
  if (bagFull(profile.items)) throw new EquipmentError('bag-full');
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
