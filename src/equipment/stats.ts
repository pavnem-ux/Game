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

/** Task 44: one line of the Bag «Stats» panel (final run-start value and the gear share). */
export interface StatSummaryLine {
  readonly key: StatSummaryKey;
  readonly label: string;
  readonly value: number;
  /** The part that comes from gear (final with gear − final without gear). */
  readonly gear: number;
  /** Task 45: the part that comes from the active pet's aura (0 without one). */
  readonly pet: number;
  /** «%» or '' (plain number). */
  readonly unit: '%' | '';
  readonly decimals: number;
}
export type StatSummaryKey =
  | 'damage'
  | 'maxHp'
  | 'resistance'
  | 'attackSpeed'
  | 'criticalChance'
  | 'criticalDamage'
  | 'cooldownReduction'
  | 'dodgeChance'
  | 'movementSpeed'
  | 'pickupRadiusPercent'
  | 'runXpPercent'
  | 'goldFindPercent';
/**
 * Task 44 (display only): the class's final run-start values — damage of its type, max HP, armor,
 * attack speed, crit chance / damage, cooldown reduction, dodge, movement speed (composed once
 * with the caps) and the gear run stats (pickup radius, run XP, gold find) — each with its gear
 * share. No rule changes: the same functions the run uses.
 */
export function statSummary(
  characterClass: CharacterClass,
  level: number,
  talents: TalentRanks,
  loadout: Loadout | null,
  items: readonly ItemInstance[] = [],
  slotLevels?: SlotLevels,
  /** Task 45: the active pet's aura (joins the same composition, so caps apply once). */
  petAura?: Partial<RunStatModifiers>,
): readonly StatSummaryLine[] {
  const withGear = permanentStats(characterClass, level, talents, loadout, items, slotLevels);
  const without = permanentStats(characterClass, level, talents, null, items);
  const talentMods = talentLoadout(characterClass, level, talents).modifiers;
  const gear = gearModifiers(loadout, items, characterClass, slotLevels);
  const withPet = petAura
    ? composeRunStats(
        calculateCharacterStats(characterClass, level).primaryAttributes,
        addModifiers(addModifiers(talentMods, gear), { ...NO_MODIFIERS, ...petAura }),
      )
    : withGear;
  const damageKey = characterClass === 'mage' ? 'magicalDamage' : 'physicalDamage';
  const combat = (
    key: StatSummaryKey,
    stat: keyof CombatAttributes,
    label: string,
    unit: '%' | '',
    decimals: number,
  ): StatSummaryLine =>
    Object.freeze({
      key,
      label,
      value: withPet[stat],
      gear: withGear[stat] - without[stat],
      pet: withPet[stat] - withGear[stat],
      unit,
      decimals,
    });
  const runStat = (
    key: 'pickupRadiusPercent' | 'runXpPercent' | 'goldFindPercent',
    label: string,
  ): StatSummaryLine =>
    Object.freeze({
      key,
      label,
      value: talentMods[key] + gear[key],
      gear: gear[key],
      pet: 0,
      unit: '%',
      decimals: 1,
    });
  return Object.freeze([
    combat('damage', damageKey, 'Damage', '', 0),
    combat('maxHp', 'maxHp', 'Max HP', '', 0),
    combat('resistance', 'resistance', 'Armor', '', 0),
    combat('attackSpeed', 'attackSpeed', 'Attack speed', '%', 1),
    combat('criticalChance', 'criticalChance', 'Crit chance', '%', 1),
    combat('criticalDamage', 'criticalDamage', 'Crit damage', '%', 0),
    combat('cooldownReduction', 'cooldownReduction', 'Cooldown reduction', '%', 1),
    combat('dodgeChance', 'dodgeChance', 'Dodge', '%', 1),
    combat('movementSpeed', 'movementSpeed', 'Movement speed', '%', 0),
    runStat('pickupRadiusPercent', 'Pickup radius'),
    runStat('runXpPercent', 'Run XP'),
    runStat('goldFindPercent', 'Gold find'),
  ]);
}
