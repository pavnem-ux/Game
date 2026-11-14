import type { CharacterClass } from '../character-stats';

/**
 * Task 11 equipment / economy configuration — the single place for gear and shop numbers.
 * Every value here is PROVISIONAL (owner-controlled; see docs/task-11-equipment-shop.md §1.2).
 * Framework-independent: no Phaser/React/storage imports. Gear only changes existing combat
 * attributes, through the same run-modifier keys the talents use (`RunStatModifiers`).
 */
/** Task 19 adds the shared «Helmet», «Gloves», «Legs» slots (7 slots in total). */
export type GearSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'pants' | 'amulet' | 'ring';
export const GEAR_SLOTS: readonly GearSlot[] = Object.freeze([
  'weapon',
  'helmet',
  'armor',
  'gloves',
  'pants',
  'amulet',
  'ring',
]);
export const SLOT_LABELS: Readonly<Record<GearSlot, string>> = Object.freeze({
  weapon: 'Weapon',
  helmet: 'Helmet',
  armor: 'Armor',
  gloves: 'Gloves',
  pants: 'Legs',
  amulet: 'Amulet',
  ring: 'Ring',
});

/** Gear stats = existing combat attributes, named after their run-modifier keys. */
export type GearStat =
  | 'physicalDamagePercent'
  | 'magicalDamagePercent'
  | 'maxHpPercent'
  | 'resistance'
  | 'criticalChance'
  | 'criticalDamage'
  | 'attackSpeed'
  | 'dodgeChance'
  | 'movementSpeedPercent'
  | 'cooldownReduction'
  | 'areaSizePercent';
export const GEAR_STAT_LABELS: Readonly<Record<GearStat, { label: string; unit: string }>> =
  Object.freeze({
    physicalDamagePercent: { label: 'Physical damage', unit: '%' },
    magicalDamagePercent: { label: 'Magic damage', unit: '%' },
    maxHpPercent: { label: 'Health', unit: '%' },
    resistance: { label: 'Resistance', unit: '' },
    criticalChance: { label: 'Crit chance', unit: ' pp' },
    criticalDamage: { label: 'Crit damage', unit: ' pp' },
    attackSpeed: { label: 'Attack speed', unit: '' },
    dodgeChance: { label: 'Dodge', unit: ' pp' },
    movementSpeedPercent: { label: 'Movement speed', unit: '%' },
    cooldownReduction: { label: 'Cooldown reduction', unit: ' pp' },
    areaSizePercent: { label: 'Area size', unit: '%' },
  });

/** Tier-1 base value of each stat (spec §1.2). */
export const TIER1_STAT_VALUES: Readonly<Record<GearStat, number>> = Object.freeze({
  physicalDamagePercent: 4,
  magicalDamagePercent: 4,
  maxHpPercent: 5,
  resistance: 2,
  criticalChance: 1,
  criticalDamage: 5,
  attackSpeed: 2,
  dodgeChance: 1,
  movementSpeedPercent: 2,
  cooldownReduction: 1,
  areaSizePercent: 2,
});

export type Tier = 1 | 2 | 3 | 4 | 5;
export const TIERS: readonly Tier[] = Object.freeze([1, 2, 3, 4, 5]);
type Gender = 'm' | 'f' | 'n' | 'pl';
export const TIER_CONFIG: Readonly<
  Record<
    Tier,
    {
      readonly name: string;
      readonly multiplier: number;
      readonly price: number;
      /** Shop unlock: the highest cleared map must be ≥ this (0 = from the start). */
      readonly unlockAfterMap: number;
      readonly color: string;
      readonly adjective: Readonly<Record<Gender, string>>;
    }
  >
> = Object.freeze({
  1: {
    name: 'Common',
    multiplier: 1,
    price: 80,
    unlockAfterMap: 0,
    color: '#c9c9c0',
    adjective: { m: 'Common', f: 'Common', n: 'Common', pl: 'Common' },
  },
  2: {
    name: 'Uncommon',
    multiplier: 2,
    price: 300,
    unlockAfterMap: 8,
    color: '#7fc77a',
    adjective: { m: 'Uncommon', f: 'Uncommon', n: 'Uncommon', pl: 'Uncommon' },
  },
  3: {
    name: 'Rare',
    multiplier: 3.5,
    price: 700,
    unlockAfterMap: 16,
    color: '#6fa8e8',
    adjective: { m: 'Rare', f: 'Rare', n: 'Rare', pl: 'Rare' },
  },
  4: {
    name: 'Epic',
    multiplier: 5,
    price: 1400,
    unlockAfterMap: 24,
    color: '#b67ae6',
    adjective: { m: 'Epic', f: 'Epic', n: 'Epic', pl: 'Epic' },
  },
  5: {
    name: 'Legendary',
    multiplier: 7,
    price: 2500,
    unlockAfterMap: 32,
    color: '#f0b54a',
    adjective: { m: 'Legendary', f: 'Legendary', n: 'Legendary', pl: 'Legendary' },
  },
});
/** Weapons cost ×1.25; the second weapon stat counts ×0.6 (spec §1.2). */
export const WEAPON_PRICE_FACTOR = 1.25;
export const WEAPON_SECOND_STAT_FACTOR = 0.6;
/**
 * Slots whose second stat counts ×WEAPON_SECOND_STAT_FACTOR (Task 19 §1.1: the new two-stat slots
 * follow the weapon rule; Task 11 armor keeps both stats at ×1.0). Only weapons cost ×1.25.
 */
export const SECOND_STAT_REDUCED_SLOTS: readonly GearSlot[] = Object.freeze([
  'weapon',
  'helmet',
  'gloves',
  'pants',
]);

export interface GearTemplate {
  readonly id: string;
  readonly name: string;
  readonly gender: Gender;
  readonly slot: GearSlot;
  /** Weapons only: the class that can use it. Other slots are shared by all classes. */
  readonly characterClass?: CharacterClass;
  readonly stats: readonly GearStat[];
}
const t = (
  id: string,
  name: string,
  gender: Gender,
  slot: GearSlot,
  stats: readonly GearStat[],
  characterClass?: CharacterClass,
): GearTemplate =>
  Object.freeze({
    id,
    name,
    gender,
    slot,
    stats: Object.freeze([...stats]),
    ...(characterClass ? { characterClass } : {}),
  });
/** Spec §1.2 templates: 8 class weapons + 9 shared items; Task 19 §1.1: + 9 helmet/gloves/pants. */
export const GEAR_TEMPLATES: readonly GearTemplate[] = Object.freeze([
  t(
    'heavy_sword',
    'Heavy Sword',
    'm',
    'weapon',
    ['physicalDamagePercent', 'criticalDamage'],
    'warrior',
  ),
  t('quick_sword', 'Quick Sword', 'm', 'weapon', ['attackSpeed', 'criticalChance'], 'warrior'),
  t(
    'assassin_dagger',
    "Assassin's Dagger",
    'm',
    'weapon',
    ['criticalChance', 'criticalDamage'],
    'rogue',
  ),
  t(
    'shadow_dagger',
    'Shadow Dagger',
    'm',
    'weapon',
    ['physicalDamagePercent', 'dodgeChance'],
    'rogue',
  ),
  t('long_bow', 'Longbow', 'm', 'weapon', ['physicalDamagePercent', 'criticalDamage'], 'archer'),
  t('short_bow', 'Shortbow', 'm', 'weapon', ['attackSpeed', 'movementSpeedPercent'], 'archer'),
  t(
    'flame_staff',
    'Staff of Flame',
    'm',
    'weapon',
    ['magicalDamagePercent', 'areaSizePercent'],
    'mage',
  ),
  t(
    'wisdom_staff',
    'Staff of Wisdom',
    'm',
    'weapon',
    ['cooldownReduction', 'magicalDamagePercent'],
    'mage',
  ),
  t('plate', 'Plate Armor', 'pl', 'armor', ['maxHpPercent', 'resistance']),
  t('leather_armor', 'Leather Armor', 'm', 'armor', ['dodgeChance', 'movementSpeedPercent']),
  t('robe', 'Robe', 'f', 'armor', ['cooldownReduction', 'areaSizePercent']),
  t('amulet_power', 'Amulet of Might', 'm', 'amulet', ['physicalDamagePercent']),
  t('amulet_magic', 'Amulet of Magic', 'm', 'amulet', ['magicalDamagePercent']),
  t('amulet_life', 'Amulet of Life', 'm', 'amulet', ['maxHpPercent']),
  t('ring_precision', 'Ring of Precision', 'n', 'ring', ['criticalChance']),
  t('ring_fury', 'Ring of Fury', 'n', 'ring', ['criticalDamage']),
  t('ring_speed', 'Ring of Speed', 'n', 'ring', ['attackSpeed']),
  // Task 19 §1.1 (shared by all classes; second stat ×0.6).
  t('guard_helm', "Guard's Helm", 'm', 'helmet', ['maxHpPercent', 'resistance']),
  t('hunter_hood', "Hunter's Hood", 'm', 'helmet', ['criticalChance', 'dodgeChance']),
  t('mage_circlet', "Mage's Circlet", 'm', 'helmet', ['cooldownReduction', 'magicalDamagePercent']),
  t('plate_gauntlets', 'Plate Gauntlets', 'pl', 'gloves', ['physicalDamagePercent', 'resistance']),
  t('trickster_gloves', "Trickster's Gloves", 'pl', 'gloves', ['attackSpeed', 'criticalChance']),
  t('sorcerer_gloves', "Sorcerer's Gloves", 'pl', 'gloves', [
    'magicalDamagePercent',
    'areaSizePercent',
  ]),
  t('plate_greaves', 'Plate Greaves', 'pl', 'pants', ['maxHpPercent', 'resistance']),
  t('leather_pants', 'Leather Trousers', 'pl', 'pants', ['movementSpeedPercent', 'dodgeChance']),
  t('mystic_trousers', "Mystic's Breeches", 'pl', 'pants', ['cooldownReduction', 'maxHpPercent']),
]);

/** Starting weapons: owned tier-0 items with no bonus, equipped by default (spec §1.1). */
export const STARTER_WEAPONS: Readonly<Record<CharacterClass, { id: string; name: string }>> =
  Object.freeze({
    warrior: { id: 'starter_sword', name: "Novice's Sword" },
    rogue: { id: 'starter_daggers', name: "Novice's Daggers" },
    archer: { id: 'starter_bow', name: "Novice's Bow" },
    mage: { id: 'starter_staff', name: "Novice's Staff" },
  });
