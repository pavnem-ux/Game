import { calculateCharacterStats } from '../character-stats';
import type { CharacterClass, CombatAttributes } from '../character-stats';
import { NO_MODIFIERS, composeRunStats } from '../skills/stats';
import type { RunStatModifiers } from '../skills/stats';
import { talentLoadout } from '../talents';
import type { TalentRanks } from '../talents';
import { GOLD_FIND_CAP, LEGENDARY_RULES } from './config';
import { slottedStats } from './slots';
import type { SlotLevels } from './slots';
import type { ItemInstance } from './items';
import { equippedItems } from './logic';
import type { Loadout } from './logic';

/**
 * Task 40 gear in the attribute pipeline: main stats are FLAT modifiers (added to the class
 * attributes before every percent modifier), secondary stats are run-modifier points; both join the
 * talent stat layer in one permanent layer composed once by `composeRunStats` (central caps once).
 * Gold find from gear is capped at 25% here. Task 41: the class's slot levels scale the slotted
 * item's own stats (main every level, secondary at milestones) before everything else (additive
 * optional parameter: absent = level 0 everywhere, the Task 40 behaviour).
 */
export function gearModifiers(
  loadout: Loadout | null | undefined,
  items: readonly ItemInstance[],
  characterClass: CharacterClass,
  slotLevels?: SlotLevels,
): RunStatModifiers {
  const m: Record<keyof RunStatModifiers, number> = { ...NO_MODIFIERS };
  if (loadout)
    for (const item of equippedItems(loadout, items, characterClass)) {
      const { main, affixes } = slottedStats(item, characterClass, slotLevels?.[item.slot] ?? 0);
      m.flatPhysicalDamage += main.physicalDamage;
      m.flatMagicalDamage += main.magicalDamage;
      m.flatMaxHp += main.maxHp;
      m.resistance += main.resistance;
      for (const a of affixes) m[a.stat] += a.value;
      // Task 43: Stride of the Ash Wolf's movement speed (a gear modifier; caps once).
      if (item.legendaryId === 'ash_wolf_stride')
        m.movementSpeedPercent += LEGENDARY_RULES.stride.movementSpeedPercent;
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
  slotLevels?: SlotLevels,
): CombatAttributes {
  const primary = calculateCharacterStats(characterClass, level).primaryAttributes;
  const talentMods = talentLoadout(characterClass, level, talents).modifiers;
  return composeRunStats(
    primary,
    addModifiers(talentMods, gearModifiers(loadout, items, characterClass, slotLevels)),
  );
}
