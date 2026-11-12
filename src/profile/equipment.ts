import type { CharacterClass } from '../character-stats';
import { equip, highestClearedMap, purchase, unequip, upgradeItem } from '../equipment';
import type { EquipmentState, GearSlot, Loadouts } from '../equipment';
import type { PlayerProfile } from './profile';

/**
 * Task 11 profile-level gear actions (pure). They map the profile onto the pure equipment rules and
 * back; the caller saves the returned profile once (validated save = one atomic change).
 */
export function equipmentStateOf(profile: PlayerProfile): EquipmentState {
  return Object.freeze({
    gold: profile.gold,
    ownedItems: profile.ownedItems,
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
    ownedItems: s.ownedItems,
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
/** Buys an item: Gold deducted and the item owned (throws EquipmentError, profile unchanged). */
export function buyItem(profile: PlayerProfile, itemId: string): PlayerProfile {
  return withState(
    profile,
    purchase(equipmentStateOf(profile), itemId, highestClearedMap(profile.completedMaps)),
  );
}
export function equipItem(
  profile: PlayerProfile,
  c: CharacterClass,
  itemId: string,
): PlayerProfile {
  return withState(profile, equip(equipmentStateOf(profile), c, itemId));
}
export function unequipSlot(
  profile: PlayerProfile,
  c: CharacterClass,
  slot: GearSlot,
): PlayerProfile {
  return withState(profile, unequip(equipmentStateOf(profile), c, slot));
}
/**
 * Task 19 forge: upgrades an owned item by one level — Gold, ore and the new level change together
 * in one new profile (the caller saves it once). Throws UpgradeError; the profile is unchanged.
 */
export function upgradeProfileItem(profile: PlayerProfile, itemId: string): PlayerProfile {
  const next = upgradeItem(
    {
      gold: profile.gold,
      ore: profile.ore,
      ownedItems: profile.ownedItems,
      itemLevels: profile.itemLevels,
    },
    itemId,
  );
  return Object.freeze({
    ...profile,
    gold: next.gold,
    ore: next.ore,
    itemLevels: next.itemLevels,
  });
}
