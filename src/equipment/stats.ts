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

/**
 * Task 11 §1.3 gear in the attribute pipeline: gear stats are run-modifier points, summed with the
 * talent stat layer into one permanent layer, then composed with the class attributes by
 * `composeRunStats` — central caps once, never stored as final stats.
 */
export function gearModifiers(loadout: Loadout | null | undefined): RunStatModifiers {
  const m: Record<keyof RunStatModifiers, number> = { ...NO_MODIFIERS };
  if (loadout)
    for (const [stat, v] of Object.entries(loadoutStats(loadout)))
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
/**
 * Final permanent stats of a class (Character screen): class level + talents + gear, composed once.
 * Pass `loadout: null` for the «без снаряжения» comparison.
 */
export function permanentStats(
  characterClass: CharacterClass,
  level: number,
  talents: TalentRanks,
  loadout: Loadout | null,
): CombatAttributes {
  const primary = calculateCharacterStats(characterClass, level).primaryAttributes;
  const talentMods = talentLoadout(characterClass, level, talents).modifiers;
  return composeRunStats(primary, addModifiers(talentMods, gearModifiers(loadout)));
}
