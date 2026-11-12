import { findItem } from './items';
import type { GearItem } from './items';
import type { GearStat } from './config';

/**
 * Task 19 §1.3 item upgrades («Кузница») — pure rules, numbers PROVISIONAL. Every owned item
 * (weapons included, starter weapons excluded) has one account-wide level +0…+10. Each level adds
 * +5% of the item's base stats (+10 = ×1.5). An upgrade always succeeds: no randomness, no failure,
 * no downgrade. Cost of reaching level L: Gold = ⌈price × 0.1 × L⌉, Ore = ⌈tier × L / 2⌉.
 */
export const UPGRADE_RULES = Object.freeze({
  maxLevel: 10,
  /** Stat bonus per level, as a share of the item's base stats. */
  statPerLevel: 0.05,
  /** Gold of level L = ⌈price × goldShare × L⌉. */
  goldShare: 0.1,
  /** Ore of level L = ⌈tier × L / oreDivisor⌉. */
  oreDivisor: 2,
});
/** Upgrade levels by item id; an absent id means +0. */
export type ItemLevels = Readonly<Record<string, number>>;
export const NO_ITEM_LEVELS: ItemLevels = Object.freeze({});

export const isUpgradeable = (item: GearItem) => !item.starter && item.tier > 0;
/** Current level of an item (0 when not upgraded). */
export const itemLevel = (levels: ItemLevels | null | undefined, id: string): number =>
  levels?.[id] ?? 0;

/** Gold and ore to go from level L − 1 to `toLevel` = L (1…10). */
export function upgradeCost(
  item: GearItem,
  toLevel: number,
): Readonly<{ gold: number; ore: number }> {
  if (!isUpgradeable(item)) throw new RangeError(`Item ${item.id} cannot be upgraded.`);
  if (!Number.isInteger(toLevel) || toLevel < 1 || toLevel > UPGRADE_RULES.maxLevel)
    throw new RangeError(`Invalid upgrade level: ${toLevel}.`);
  return Object.freeze({
    // Rounded to 6 decimals first so 80 × 0.1 × 3 is 24, not ⌈24.000…004⌉ = 25.
    gold: Math.ceil(Math.round(item.price * UPGRADE_RULES.goldShare * toLevel * 1e6) / 1e6),
    ore: Math.ceil((item.tier * toLevel) / UPGRADE_RULES.oreDivisor),
  });
}
/** Stats of an item at an upgrade level: base × (1 + 0.05 × level), 3 decimals. */
export function upgradedStats(
  item: GearItem,
  level: number,
): Readonly<Partial<Record<GearStat, number>>> {
  if (!Number.isInteger(level) || level < 0 || level > UPGRADE_RULES.maxLevel)
    throw new RangeError(`Invalid item level: ${level}.`);
  if (level === 0) return item.stats;
  const k = 1 + UPGRADE_RULES.statPerLevel * level;
  const out: Partial<Record<GearStat, number>> = {};
  for (const [stat, v] of Object.entries(item.stats) as [GearStat, number][])
    out[stat] = Math.round(v * k * 1000) / 1000;
  return Object.freeze(out);
}
/** «Кольцо точности +3» (no suffix at +0). */
export const itemDisplayName = (item: GearItem, level: number) =>
  level > 0 ? `${item.name} +${level}` : item.name;

export interface UpgradeState {
  readonly gold: number;
  readonly ore: number;
  readonly ownedItems: readonly string[];
  readonly itemLevels: ItemLevels;
}
export type UpgradeBlock = 'unknown' | 'starter' | 'not-owned' | 'max' | 'gold' | 'ore';
export type UpgradeCheck =
  | Readonly<{ ok: true; item: GearItem; toLevel: number; gold: number; ore: number }>
  | Readonly<{ ok: false; reason: UpgradeBlock; item?: GearItem; toLevel?: number }>;
/** Can this item be upgraded by one level now? Reasons in priority order. */
export function checkUpgrade(state: UpgradeState, itemId: string): UpgradeCheck {
  const item = findItem(itemId);
  if (!item) return Object.freeze({ ok: false, reason: 'unknown' });
  if (!isUpgradeable(item)) return Object.freeze({ ok: false, reason: 'starter', item });
  if (!state.ownedItems.includes(item.id))
    return Object.freeze({ ok: false, reason: 'not-owned', item });
  const level = itemLevel(state.itemLevels, item.id);
  if (level >= UPGRADE_RULES.maxLevel) return Object.freeze({ ok: false, reason: 'max', item });
  const toLevel = level + 1;
  const cost = upgradeCost(item, toLevel);
  if (state.gold < cost.gold) return Object.freeze({ ok: false, reason: 'gold', item, toLevel });
  if (state.ore < cost.ore) return Object.freeze({ ok: false, reason: 'ore', item, toLevel });
  return Object.freeze({ ok: true, item, toLevel, gold: cost.gold, ore: cost.ore });
}
export class UpgradeError extends Error {
  constructor(readonly reason: UpgradeBlock) {
    super(`Upgrade refused: ${reason}.`);
    this.name = 'UpgradeError';
  }
}
/**
 * Upgrades one item by one level: Gold and ore deducted and the new level set in ONE new state
 * (or throws, nothing changed). Always succeeds when allowed — no randomness.
 */
export function upgradeItem<S extends UpgradeState>(state: S, itemId: string): S {
  const check = checkUpgrade(state, itemId);
  if (!check.ok) throw new UpgradeError(check.reason);
  return Object.freeze({
    ...state,
    gold: state.gold - check.gold,
    ore: state.ore - check.ore,
    itemLevels: Object.freeze({ ...state.itemLevels, [check.item.id]: check.toLevel }),
  });
}
