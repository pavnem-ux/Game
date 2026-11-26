import type { CharacterClass } from '../character-stats';
import {
  EquipmentError,
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
/** Adds an item instance to the owned list with the next uid (`i<n>`). */
function addItem(
  profile: PlayerProfile,
  make: (uid: string) => ItemInstance,
): { profile: PlayerProfile; item: ItemInstance } {
  const item = make(`i${profile.nextItemNumber}`);
  return {
    item,
    profile: Object.freeze({
      ...profile,
      items: Object.freeze([...profile.items, item]),
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
