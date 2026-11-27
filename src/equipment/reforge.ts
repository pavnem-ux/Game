import type { CharacterClass } from '../character-stats';
import type { RandomSource } from '../combat-core';
import { ITEM_LEVEL_RANGE, RARITY_CONFIG, REFORGE_RULES } from './config';
import type { AffixStat } from './config';
import { affixPool, affixValue } from './items';
import type { ItemInstance } from './items';

/**
 * Task 42 reforge (pure): Rare, Epic and Legendary items can swap one secondary stat for another
 * stat of the slot's pool the item doesn't have, with a new roll in the rarity's range. The
 * Legendary unique effect (`legendaryId`, Task 43) is never touched.
 */
export const canReforge = (item: ItemInstance) => REFORGE_RULES.base[item.rarity] !== undefined;
/** Gold for the next reforge of an item. */
export function reforgeCost(item: ItemInstance): number {
  const base = REFORGE_RULES.base[item.rarity];
  if (base === undefined) throw new RangeError('Only Rare and better items can be reforged.');
  const share = Math.max(REFORGE_RULES.minLevelShare, item.itemLevel / ITEM_LEVEL_RANGE.max);
  return Math.round(base * share * REFORGE_RULES.growth ** (item.reforges ?? 0));
}
/** The stats `stat` can turn into: the slot's pool minus the item's current stats. */
export function reforgeChoices(item: ItemInstance, characterClass: CharacterClass): AffixStat[] {
  const owned = new Set(item.affixes.map((a) => a.stat));
  return affixPool(item.slot, item.characterClass ?? characterClass).filter((s) => !owned.has(s));
}
/** Replaces `stat` (two draws: the new stat, then its roll). Throws on an invalid request. */
export function reforgeItem(
  random: RandomSource,
  item: ItemInstance,
  stat: AffixStat,
  characterClass: CharacterClass,
): ItemInstance {
  if (!canReforge(item)) throw new RangeError('Only Rare and better items can be reforged.');
  const index = item.affixes.findIndex((a) => a.stat === stat);
  if (index < 0) throw new RangeError('The item has no such secondary stat.');
  const choices = reforgeChoices(item, characterClass);
  if (!choices.length) throw new RangeError('No other secondary stat is available.');
  const next = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
  const rc = RARITY_CONFIG[item.rarity];
  const roll = rc.rollMin + (rc.rollMax - rc.rollMin) * random();
  const affixes = item.affixes.map((a, i) =>
    i === index ? Object.freeze({ stat: next, value: affixValue(next, item.itemLevel, roll) }) : a,
  );
  return Object.freeze({
    ...item,
    affixes: Object.freeze(affixes),
    reforges: (item.reforges ?? 0) + 1,
  });
}
