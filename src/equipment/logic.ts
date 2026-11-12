import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { GEAR_SLOTS, TIER_CONFIG } from './config';
import type { GearSlot, GearStat, Tier } from './config';
import { findItem, isEligible, starterWeapon } from './items';
import type { GearItem } from './items';

/**
 * Task 11 pure ownership / loadout rules (no storage, no UI). Buying unlocks an item permanently
 * for the profile (no copies, no inventory limit); every eligible class may equip an owned item;
 * each class has its own loadout. Starter weapons are always owned (tier 0, no bonus).
 */
export type Loadout = Readonly<Record<GearSlot, string | null>>;
export type Loadouts = Readonly<Record<CharacterClass, Loadout>>;
export interface EquipmentState {
  readonly gold: number;
  /** Bought shop item ids (never starter weapons), in purchase order. */
  readonly ownedItems: readonly string[];
  readonly loadouts: Loadouts;
}
export const defaultLoadout = (c: CharacterClass): Loadout =>
  Object.freeze({
    weapon: starterWeapon(c).id,
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

/** Highest cleared map (0 = none) from the profile's completed maps. */
export const highestClearedMap = (completedMaps: readonly number[]) =>
  completedMaps.reduce((m, id) => Math.max(m, id), 0);
export const isTierUnlocked = (tier: Tier, highestCleared: number) =>
  highestCleared >= TIER_CONFIG[tier].unlockAfterMap;
export const isOwned = (state: Pick<EquipmentState, 'ownedItems'>, item: GearItem) =>
  item.starter || state.ownedItems.includes(item.id);

export type PurchaseBlock = 'unknown' | 'starter' | 'owned' | 'locked' | 'gold';
export type PurchaseCheck =
  | Readonly<{ ok: true; item: GearItem }>
  | Readonly<{ ok: false; reason: PurchaseBlock }>;
export function checkPurchase(
  state: EquipmentState,
  itemId: string,
  highestCleared: number,
): PurchaseCheck {
  const item = findItem(itemId);
  if (!item) return Object.freeze({ ok: false, reason: 'unknown' });
  if (item.starter) return Object.freeze({ ok: false, reason: 'starter' });
  if (isOwned(state, item)) return Object.freeze({ ok: false, reason: 'owned' });
  if (!isTierUnlocked(item.tier as Tier, highestCleared))
    return Object.freeze({ ok: false, reason: 'locked' });
  if (state.gold < item.price) return Object.freeze({ ok: false, reason: 'gold' });
  return Object.freeze({ ok: true, item });
}
export class EquipmentError extends Error {
  constructor(readonly reason: PurchaseBlock | 'not-owned' | 'not-eligible' | 'unknown-class') {
    super(`Equipment action refused: ${reason}.`);
    this.name = 'EquipmentError';
  }
}
/** Buys one item: Gold deducted and the item owned in one new state (or throws, unchanged). */
export function purchase(
  state: EquipmentState,
  itemId: string,
  highestCleared: number,
): EquipmentState {
  const check = checkPurchase(state, itemId, highestCleared);
  if (!check.ok) throw new EquipmentError(check.reason);
  return Object.freeze({
    ...state,
    gold: state.gold - check.item.price,
    ownedItems: Object.freeze([...state.ownedItems, check.item.id]),
  });
}
function setSlot(
  state: EquipmentState,
  c: CharacterClass,
  slot: GearSlot,
  id: string | null,
): EquipmentState {
  if (!CHARACTER_CLASSES.includes(c)) throw new EquipmentError('unknown-class');
  return Object.freeze({
    ...state,
    loadouts: Object.freeze({
      ...state.loadouts,
      [c]: Object.freeze({ ...state.loadouts[c], [slot]: id }),
    }),
  });
}
/** Equips an owned item eligible for this class into its slot (only this class's loadout changes). */
export function equip(state: EquipmentState, c: CharacterClass, itemId: string): EquipmentState {
  const item = findItem(itemId);
  if (!item) throw new EquipmentError('unknown');
  if (!isOwned(state, item)) throw new EquipmentError('not-owned');
  if (!isEligible(item, c, item.slot)) throw new EquipmentError('not-eligible');
  return setSlot(state, c, item.slot, item.id);
}
/** Unequips a slot: the weapon goes back to the starter weapon, other slots become empty. */
export function unequip(state: EquipmentState, c: CharacterClass, slot: GearSlot): EquipmentState {
  return setSlot(state, c, slot, slot === 'weapon' ? starterWeapon(c).id : null);
}
/** Equipped items of a loadout (unknown ids are skipped; validation rejects them earlier). */
export function equippedItems(loadout: Loadout): readonly GearItem[] {
  return GEAR_SLOTS.map((s) => loadout[s])
    .filter((id): id is string => id !== null)
    .map((id) => findItem(id))
    .filter((i): i is GearItem => i !== null);
}
/** Summed gear stat bonuses of a loadout (run-modifier units). */
export function loadoutStats(loadout: Loadout): Readonly<Partial<Record<GearStat, number>>> {
  const out: Partial<Record<GearStat, number>> = {};
  for (const item of equippedItems(loadout))
    for (const [stat, v] of Object.entries(item.stats) as [GearStat, number][])
      out[stat] = (out[stat] ?? 0) + v;
  return Object.freeze(out);
}
