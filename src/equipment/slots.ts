import type { CharacterClass } from '../character-stats';
import { GEAR_SLOTS, SLOT_UPGRADE_RULES } from './config';
import type { AffixStat, GearSlot } from './config';
import { itemMainStats } from './items';
import type { ItemInstance, MainStats } from './items';

/**
 * Task 41 slot upgrades (pure). Each class has a level 0–30 per slot; the bonus applies to whatever
 * item sits in the slot (the starter weapon included) and stays when the item changes.
 */
export type SlotLevels = Readonly<Record<GearSlot, number>>;
export const NO_SLOT_LEVELS: SlotLevels = Object.freeze(
  Object.fromEntries(GEAR_SLOTS.map((s) => [s, 0])) as Record<GearSlot, number>,
);
const R = SLOT_UPGRADE_RULES;
function checkLevel(level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > R.maxLevel)
    throw new RangeError(`Invalid slot level: ${String(level)}.`);
}
/** Gold and Ore to reach slot level n (1–30). */
export function slotUpgradeCost(n: number): Readonly<{ gold: number; ore: number }> {
  if (!Number.isInteger(n) || n < 1 || n > R.maxLevel)
    throw new RangeError(`Invalid slot upgrade level: ${String(n)}.`);
  return Object.freeze({
    gold: R.goldBase + R.goldPerSquare * n * n,
    ore: R.oreBase + R.orePerLevel * n,
  });
}
/** Milestones reached at a slot level (+5, +10, … +30 → 0–6). */
export function slotMilestones(level: number): number {
  checkLevel(level);
  return Math.floor(level / R.milestoneEvery);
}
/** The next milestone level above `level`, null at the top. */
export function nextSlotMilestone(level: number): number | null {
  const next = (slotMilestones(level) + 1) * R.milestoneEvery;
  return next > R.maxLevel ? null : next;
}
/** Main stat multiplier of a slot level: 1 + 0.04 · level (+30 → ×2.2). */
export function slotMainMultiplier(level: number): number {
  checkLevel(level);
  return 1 + R.mainPerLevel * level;
}
/** Secondary stat multiplier of a slot level: 1 + 0.2 · milestones (+30 → ×2.2). */
export function slotSecondaryMultiplier(level: number): number {
  return 1 + R.secondaryPerMilestone * slotMilestones(level);
}
/** An item's stats in a slot of a given level (main and secondary, unrounded). */
export interface SlottedStats {
  readonly main: MainStats;
  readonly affixes: readonly Readonly<{ stat: AffixStat; value: number }>[];
}
export function slottedStats(
  item: ItemInstance,
  characterClass: CharacterClass,
  slotLevel = 0,
): SlottedStats {
  const km = slotMainMultiplier(slotLevel);
  const ks = slotSecondaryMultiplier(slotLevel);
  const m = itemMainStats(item, characterClass);
  return Object.freeze({
    main: Object.freeze({
      physicalDamage: m.physicalDamage * km,
      magicalDamage: m.magicalDamage * km,
      maxHp: m.maxHp * km,
      resistance: m.resistance * km,
    }),
    affixes: Object.freeze(
      item.affixes.map((a) => Object.freeze({ stat: a.stat, value: a.value * ks })),
    ),
  });
}
/** Rejects malformed slot levels (every slot, whole 0–30); returns a frozen copy. */
export function validateSlotLevels(raw: unknown): SlotLevels {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new RangeError('Invalid slot levels.');
  const v = raw as Record<string, unknown>;
  for (const k of Object.keys(v))
    if (!GEAR_SLOTS.includes(k as GearSlot)) throw new RangeError(`Unknown slot: ${k}.`);
  const out = {} as Record<GearSlot, number>;
  for (const s of GEAR_SLOTS) {
    const level = v[s] ?? 0;
    if (typeof level !== 'number') throw new RangeError(`Invalid slot level of ${s}.`);
    checkLevel(level);
    out[s] = level;
  }
  return Object.freeze(out);
}
