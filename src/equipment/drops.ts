import type { CharacterClass } from '../character-stats';
import type { RandomSource } from '../combat-core';
import { DROP_RULES, GEAR_SLOTS, ITEM_LEVEL_RANGE, RARITIES } from './config';
import type { DropDifficulty, LegendaryId, Rarity } from './config';
import { classLegendaryPool, legendaryChance, legendaryDef } from './legendaries';
import { generateItem } from './items';
import type { ItemInstance } from './items';

/**
 * Task 42 item drops (pure, seeded): boss and elite rarity rolls, the drop item level and the item
 * itself (slot among the 7, a weapon always for the played class; affixes by the Task 40 rules).
 * Every draw comes from the caller's seeded stream (the run's `items` stream).
 */
export function dropItemLevel(
  classLevel: number,
  mapId: number,
  difficulty: DropDifficulty,
): number {
  const cap = DROP_RULES.capOffset[difficulty] + mapId;
  return Math.max(ITEM_LEVEL_RANGE.min, Math.min(classLevel, cap, ITEM_LEVEL_RANGE.max));
}
/** A weighted pick from `{ rarity: weight }` (weights in rarity order; one draw). */
function pick(random: RandomSource, weights: Readonly<Partial<Record<Rarity, number>>>): Rarity {
  const entries = RARITIES.filter((r) => (weights[r] ?? 0) > 0).map(
    (r) => [r, weights[r]!] as const,
  );
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = random() * total;
  for (const [r, w] of entries) {
    if (roll < w) return r;
    roll -= w;
  }
  return entries[entries.length - 1][0];
}
/**
 * Task 43: the Legendary roll of a boss item (elite drops never become Legendary). One draw for the
 * chance; on success a second picks uniformly from the map's pool without other classes' weapons.
 */
export function legendaryRoll(
  random: RandomSource,
  difficulty: DropDifficulty,
  mapId: number,
  characterClass: CharacterClass,
): LegendaryId | null {
  if (!(random() * 100 < legendaryChance(difficulty))) return null;
  const pool = classLegendaryPool(mapId, characterClass);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id;
}
/** The boss item's rarity for a difficulty (one draw). */
export const bossDropRarity = (random: RandomSource, difficulty: DropDifficulty): Rarity =>
  pick(random, DROP_RULES.bossRarity[difficulty]);
/** An elite kill's item rarity, or null (one draw; a second only when it drops). */
export function eliteDropRarity(random: RandomSource): Rarity | null {
  if (!(random() < DROP_RULES.eliteChance)) return null;
  return pick(random, DROP_RULES.eliteRarity);
}
/**
 * A dropped item: a random slot (one draw), then the Task 40 generation from the same stream.
 * Task 43: a Legendary takes its own slot (no slot draw) and its unique effect.
 */
export function rollDropItem(
  random: RandomSource,
  spec: Readonly<{
    uid: string;
    rarity: Rarity;
    itemLevel: number;
    characterClass: CharacterClass;
    legendaryId?: LegendaryId;
  }>,
): ItemInstance {
  if (spec.legendaryId) {
    const def = legendaryDef(spec.legendaryId)!;
    return generateItem(random, { ...spec, rarity: 'legendary', slot: def.slot });
  }
  const slot =
    GEAR_SLOTS[Math.min(GEAR_SLOTS.length - 1, Math.floor(random() * GEAR_SLOTS.length))];
  return generateItem(random, { ...spec, slot });
}
