import { calculateCharacterStats } from '../character-stats';
import type { CharacterClass, CombatAttributes } from '../character-stats';
import { NO_MODIFIERS, composeRunStats } from '../skills/stats';
import type { RunStatModifiers } from '../skills/stats';
import { talentLoadout } from '../talents';
import type { TalentRanks } from '../talents';
import { GOLD_FIND_CAP } from './config';
import { itemMainStats } from './items';
import type { ItemInstance } from './items';
import { equippedItems } from './logic';
import type { Loadout } from './logic';

/**
 * Task 40 gear in the attribute pipeline: main stats are FLAT modifiers (added to the class
 * attributes before every percent modifier), secondary stats are run-modifier points; both join the
 * talent stat layer in one permanent layer composed once by `composeRunStats` (central caps once).
 * Gold find from gear is capped at 25% here.
 */
export function gearModifiers(
  loadout: Loadout | null | undefined,
  items: readonly ItemInstance[],
  characterClass: CharacterClass,
): RunStatModifiers {
  const m: Record<keyof RunStatModifiers, number> = { ...NO_MODIFIERS };
  if (loadout)
    for (const item of equippedItems(loadout, items, characterClass)) {
      const main = itemMainStats(item, characterClass);
      m.flatPhysicalDamage += main.physicalDamage;
      m.flatMagicalDamage += main.magicalDamage;
      m.flatMaxHp += main.maxHp;
      m.resistance += main.resistance;
      for (const a of item.affixes) m[a.stat] += a.value;
    }
  m.goldFindPercent = Math.min(GOLD_FIND_CAP, m.goldFindPercent);
  return Object.freeze(m);
}
export function addModifiers(a: RunStatModifiers, b: RunStatModifiers): RunStatModifiers {
  const m = { ...a } as Record<keyof RunStatModifiers, number>;
  for (const k of Object.keys(b) as (keyof RunStatModifiers)[]) m[k] += b[k];
  return Object.freeze(m);
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
  items: readonly ItemInstance[] = [],
): CombatAttributes {
  const primary = calculateCharacterStats(characterClass, level).primaryAttributes;
  const talentMods = talentLoadout(characterClass, level, talents).modifiers;
  return composeRunStats(
    primary,
    addModifiers(talentMods, gearModifiers(loadout, items, characterClass)),
  );
}
