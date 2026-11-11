import type { CharacterClass } from '../character-stats';

/**
 * Task 11 equipment / economy configuration — the single place for gear and shop numbers.
 * Every value here is PROVISIONAL (owner-controlled; see docs/task-11-equipment-shop.md §1.2).
 * Framework-independent: no Phaser/React/storage imports. Gear only changes existing combat
 * attributes, through the same run-modifier keys the talents use (`RunStatModifiers`).
 */
export type GearSlot = 'weapon' | 'armor' | 'amulet' | 'ring';
export const GEAR_SLOTS: readonly GearSlot[] = Object.freeze(['weapon', 'armor', 'amulet', 'ring']);
export const SLOT_LABELS: Readonly<Record<GearSlot, string>> = Object.freeze({
  weapon: 'Оружие',
  armor: 'Броня',
  amulet: 'Амулет',
  ring: 'Кольцо',
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
    physicalDamagePercent: { label: 'Физический урон', unit: '%' },
    magicalDamagePercent: { label: 'Магический урон', unit: '%' },
    maxHpPercent: { label: 'Здоровье', unit: '%' },
    resistance: { label: 'Сопротивление', unit: '' },
    criticalChance: { label: 'Шанс крита', unit: ' п.п.' },
    criticalDamage: { label: 'Крит. урон', unit: ' п.п.' },
    attackSpeed: { label: 'Скорость атаки', unit: '' },
    dodgeChance: { label: 'Уклонение', unit: ' п.п.' },
    movementSpeedPercent: { label: 'Скорость движения', unit: '%' },
    cooldownReduction: { label: 'Сокращение перезарядки', unit: ' п.п.' },
    areaSizePercent: { label: 'Размер области', unit: '%' },
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
    name: 'Обычный',
    multiplier: 1,
    price: 80,
    unlockAfterMap: 0,
    color: '#c9c9c0',
    adjective: { m: 'Обычный', f: 'Обычная', n: 'Обычное', pl: 'Обычные' },
  },
  2: {
    name: 'Добротный',
    multiplier: 2,
    price: 300,
    unlockAfterMap: 8,
    color: '#7fc77a',
    adjective: { m: 'Добротный', f: 'Добротная', n: 'Добротное', pl: 'Добротные' },
  },
  3: {
    name: 'Редкий',
    multiplier: 3.5,
    price: 700,
    unlockAfterMap: 16,
    color: '#6fa8e8',
    adjective: { m: 'Редкий', f: 'Редкая', n: 'Редкое', pl: 'Редкие' },
  },
  4: {
    name: 'Эпический',
    multiplier: 5,
    price: 1400,
    unlockAfterMap: 24,
    color: '#b67ae6',
    adjective: { m: 'Эпический', f: 'Эпическая', n: 'Эпическое', pl: 'Эпические' },
  },
  5: {
    name: 'Легендарный',
    multiplier: 7,
    price: 2500,
    unlockAfterMap: 32,
    color: '#f0b54a',
    adjective: { m: 'Легендарный', f: 'Легендарная', n: 'Легендарное', pl: 'Легендарные' },
  },
});
/** Weapons cost ×1.25; the second weapon stat counts ×0.6 (spec §1.2). */
export const WEAPON_PRICE_FACTOR = 1.25;
export const WEAPON_SECOND_STAT_FACTOR = 0.6;

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
/** Spec §1.2 templates: 8 class weapons + 9 shared items. */
export const GEAR_TEMPLATES: readonly GearTemplate[] = Object.freeze([
  t(
    'heavy_sword',
    'Тяжёлый меч',
    'm',
    'weapon',
    ['physicalDamagePercent', 'criticalDamage'],
    'warrior',
  ),
  t('quick_sword', 'Быстрый меч', 'm', 'weapon', ['attackSpeed', 'criticalChance'], 'warrior'),
  t(
    'assassin_dagger',
    'Кинжал убийцы',
    'm',
    'weapon',
    ['criticalChance', 'criticalDamage'],
    'rogue',
  ),
  t(
    'shadow_dagger',
    'Кинжал теней',
    'm',
    'weapon',
    ['physicalDamagePercent', 'dodgeChance'],
    'rogue',
  ),
  t(
    'long_bow',
    'Длинный лук',
    'm',
    'weapon',
    ['physicalDamagePercent', 'criticalDamage'],
    'archer',
  ),
  t('short_bow', 'Короткий лук', 'm', 'weapon', ['attackSpeed', 'movementSpeedPercent'], 'archer'),
  t(
    'flame_staff',
    'Посох пламени',
    'm',
    'weapon',
    ['magicalDamagePercent', 'areaSizePercent'],
    'mage',
  ),
  t(
    'wisdom_staff',
    'Посох мудрости',
    'm',
    'weapon',
    ['cooldownReduction', 'magicalDamagePercent'],
    'mage',
  ),
  t('plate', 'Латы', 'pl', 'armor', ['maxHpPercent', 'resistance']),
  t('leather_armor', 'Кожаный доспех', 'm', 'armor', ['dodgeChance', 'movementSpeedPercent']),
  t('robe', 'Мантия', 'f', 'armor', ['cooldownReduction', 'areaSizePercent']),
  t('amulet_power', 'Амулет силы', 'm', 'amulet', ['physicalDamagePercent']),
  t('amulet_magic', 'Амулет магии', 'm', 'amulet', ['magicalDamagePercent']),
  t('amulet_life', 'Амулет жизни', 'm', 'amulet', ['maxHpPercent']),
  t('ring_precision', 'Кольцо точности', 'n', 'ring', ['criticalChance']),
  t('ring_fury', 'Кольцо ярости', 'n', 'ring', ['criticalDamage']),
  t('ring_speed', 'Кольцо скорости', 'n', 'ring', ['attackSpeed']),
]);

/** Starting weapons: owned tier-0 items with no bonus, equipped by default (spec §1.1). */
export const STARTER_WEAPONS: Readonly<Record<CharacterClass, { id: string; name: string }>> =
  Object.freeze({
    warrior: { id: 'starter_sword', name: 'Меч новичка' },
    rogue: { id: 'starter_daggers', name: 'Парные кинжалы новичка' },
    archer: { id: 'starter_bow', name: 'Лук новичка' },
    mage: { id: 'starter_staff', name: 'Посох новичка' },
  });
