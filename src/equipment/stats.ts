import { calculateCharacterStats } from '../character-stats';
import type { CharacterClass, CombatAttributes } from '../character-stats';
import { NO_MODIFIERS, composeRunStats } from '../skills/stats';
import type { RunStatModifiers } from '../skills/stats';
import { talentLoadout } from '../talents';
import type { TalentRanks } from '../talents';
import { GEAR_SLOTS } from './config';
import { findItem, isEligible } from './items';
import { loadoutStats } from './logic';
import type { Loadout } from './logic';
import { NO_ITEM_LEVELS, UPGRADE_RULES, isUpgradeable } from './upgrades';
import type { ItemLevels } from './upgrades';

/**
 * Task 11 §1.3 gear in the attribute pipeline: gear stats are run-modifier points, summed with the
 * talent stat layer into one permanent layer, then composed with the class attributes by
 * `composeRunStats` — central caps once, never stored as final stats.
 */
export function gearModifiers(
  loadout: Loadout | null | undefined,
  levels: ItemLevels = NO_ITEM_LEVELS,
): RunStatModifiers {
  const m: Record<keyof RunStatModifiers, number> = { ...NO_MODIFIERS };
  if (loadout)
    for (const [stat, v] of Object.entries(loadoutStats(loadout, levels)))
      m[stat as keyof RunStatModifiers] += v as number;
  return Object.freeze(m);
}
export function addModifiers(a: RunStatModifiers, b: RunStatModifiers): RunStatModifiers {
  const m = { ...a } as Record<keyof RunStatModifiers, number>;
  for (const k of Object.keys(b) as (keyof RunStatModifiers)[]) m[k] += b[k];
  return Object.freeze(m);
}
/** Rejects a loadout with unknown items or items the class cannot use in that slot. */
export function validateLoadout(characterClass: CharacterClass, loadout: Loadout): void {
  for (const slot of GEAR_SLOTS) {
    const id = loadout[slot];
    if (id === null) {
      if (slot === 'weapon') throw new RangeError('The weapon slot cannot be empty.');
      continue;
    }
    const item = findItem(id);
    if (!item || !isEligible(item, characterClass, slot))
      throw new RangeError(`Item ${id} cannot be equipped by ${characterClass} in ${slot}.`);
  }
}
/** Task 19: rejects item levels that are not whole numbers 1–10 of known upgradeable items. */
export function validateItemLevels(levels: unknown): ItemLevels {
  if (!levels || typeof levels !== 'object' || Array.isArray(levels))
    throw new RangeError('Item levels must be an object.');
  for (const [id, level] of Object.entries(levels)) {
    const item = findItem(id);
    if (!item || !isUpgradeable(item)) throw new RangeError(`Item ${id} cannot have a level.`);
    if (!Number.isInteger(level) || level < 1 || level > UPGRADE_RULES.maxLevel)
      throw new RangeError(`Invalid level of ${id}.`);
  }
  return levels as ItemLevels;
}
/**
 * Final permanent stats of a class (Character screen): class level + talents + gear, composed once.
 * Pass `loadout: null` for the «no equipment» comparison.
 */
export function permanentStats(
  characterClass: CharacterClass,
  level: number,
  talents: TalentRanks,
  loadout: Loadout | null,
  itemLevels: ItemLevels = NO_ITEM_LEVELS,
): CombatAttributes {
  const primary = calculateCharacterStats(characterClass, level).primaryAttributes;
  const talentMods = talentLoadout(characterClass, level, talents).modifiers;
  return composeRunStats(primary, addModifiers(talentMods, gearModifiers(loadout, itemLevels)));
}
