import type { CharacterClass } from '../character-stats';

/**
 * Task 40 (items rework 1/4) equipment configuration — the single place for gear and shop numbers.
 * Every value here is PROVISIONAL (owner-controlled; see docs/task-40-items-model.md). Items are
 * instances with an item level (1–50) and a rarity: a flat main stat by slot and level, and 0–3
 * secondary stats (affixes) by rarity. Framework-independent: no Phaser/React/storage imports.
 */
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
/** The six slots every class shares (weapons are class-only). */
export const SHARED_SLOTS: readonly GearSlot[] = Object.freeze(
  GEAR_SLOTS.filter((s) => s !== 'weapon'),
);
export const SLOT_LABELS: Readonly<Record<GearSlot, string>> = Object.freeze({
  weapon: 'Weapon',
  helmet: 'Helmet',
  armor: 'Armor',
  gloves: 'Gloves',
  pants: 'Legs',
  amulet: 'Amulet',
  ring: 'Ring',
});

export const ITEM_LEVEL_RANGE = Object.freeze({ min: 1, max: 50 });

// ── Rarity (§2) ──

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: readonly Rarity[] = Object.freeze([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]);
export const RARITY_CONFIG: Readonly<
  Record<
    Rarity,
    Readonly<{
      name: string;
      /** Number of secondary stats. */
      affixes: number;
      /** Main stat multiplier. */
      mainScale: number;
      /** Roll range of each secondary stat (share of its maximum at the item level). */
      rollMin: number;
      rollMax: number;
      color: string;
    }>
  >
> = Object.freeze({
  common: Object.freeze({
    name: 'Common',
    affixes: 0,
    mainScale: 1,
    rollMin: 0,
    rollMax: 0,
    color: '#c9c9c0',
  }),
  // The shop sells Uncommon at a fixed 75% roll (generation uses the same fixed value).
  uncommon: Object.freeze({
    name: 'Uncommon',
    affixes: 1,
    mainScale: 1.05,
    rollMin: 0.75,
    rollMax: 0.75,
    color: '#7fc77a',
  }),
  rare: Object.freeze({
    name: 'Rare',
    affixes: 2,
    mainScale: 1.1,
    rollMin: 0.6,
    rollMax: 1,
    color: '#6fa8e8',
  }),
  epic: Object.freeze({
    name: 'Epic',
    affixes: 3,
    mainScale: 1.15,
    rollMin: 0.7,
    rollMax: 1,
    color: '#b67ae6',
  }),
  // + a unique effect from Task 43 (`legendaryId`).
  legendary: Object.freeze({
    name: 'Legendary',
    affixes: 3,
    mainScale: 1.2,
    rollMin: 0.8,
    rollMax: 1,
    color: '#f0b54a',
  }),
});

// ── Main stats (§3), flat, L = item level, Common values before the rarity factor ──

export const MAIN_STAT_RULES = Object.freeze({
  /** Weapon flat damage of the class damage type = base + perLevel × L. */
  weaponDamageBase: 4,
  weaponDamagePerLevel: 1,
  /** Gloves / ring flat damage = this share of the weapon value. */
  glovesDamageShare: 0.4,
  ringDamageShare: 0.25,
  /** Armor flat max HP and resistance. */
  armorHpBase: 10,
  armorHpPerLevel: 2.5,
  armorResistanceBase: 2,
  armorResistancePerLevel: 0.6,
  /** Helmet / amulet flat HP = this share of the armor HP; legs resistance = share of armor's. */
  helmetHpShare: 0.6,
  amuletHpShare: 0.4,
  pantsResistanceShare: 1.2,
});

// ── Secondary stats (§4) ──

export type AffixStat =
  | 'physicalDamagePercent'
  | 'magicalDamagePercent'
  | 'damagePercent'
  | 'attackSpeed'
  | 'criticalChance'
  | 'criticalDamage'
  | 'cooldownReduction'
  | 'eliteDamagePercent'
  | 'areaSizePercent'
  | 'maxHpPercent'
  | 'hpRegenPercent'
  | 'dodgeChance'
  | 'movementSpeedPercent'
  | 'pickupRadiusPercent'
  | 'runXpPercent'
  | 'goldFindPercent';
export const AFFIX_RULES: Readonly<
  Record<
    AffixStat,
    Readonly<{
      /** Value of a 100% roll at item level 50. */
      max: number;
      label: string;
      unit: string;
      suffix: string;
      decimals: number;
    }>
  >
> = Object.freeze({
  physicalDamagePercent: Object.freeze({
    max: 18,
    label: 'Physical damage',
    unit: '%',
    suffix: 'of Power',
    decimals: 1,
  }),
  magicalDamagePercent: Object.freeze({
    max: 18,
    label: 'Magic damage',
    unit: '%',
    suffix: 'of Sorcery',
    decimals: 1,
  }),
  damagePercent: Object.freeze({
    max: 12,
    label: 'Damage',
    unit: '%',
    suffix: 'of Might',
    decimals: 1,
  }),
  attackSpeed: Object.freeze({
    max: 10,
    label: 'Attack speed',
    unit: '',
    suffix: 'of Speed',
    decimals: 1,
  }),
  criticalChance: Object.freeze({
    max: 6,
    label: 'Crit chance',
    unit: ' pp',
    suffix: 'of Precision',
    decimals: 1,
  }),
  criticalDamage: Object.freeze({
    max: 25,
    label: 'Crit damage',
    unit: ' pp',
    suffix: 'of Fury',
    decimals: 1,
  }),
  cooldownReduction: Object.freeze({
    max: 5,
    label: 'Cooldown reduction',
    unit: ' pp',
    suffix: 'of Haste',
    decimals: 1,
  }),
  eliteDamagePercent: Object.freeze({
    max: 15,
    label: 'Elite & boss damage',
    unit: '%',
    suffix: 'of the Slayer',
    decimals: 1,
  }),
  areaSizePercent: Object.freeze({
    max: 12,
    label: 'Area size',
    unit: '%',
    suffix: 'of Reach',
    decimals: 1,
  }),
  maxHpPercent: Object.freeze({
    max: 12,
    label: 'Max HP',
    unit: '%',
    suffix: 'of Life',
    decimals: 1,
  }),
  hpRegenPercent: Object.freeze({
    max: 0.5,
    label: 'HP regen',
    unit: '% max HP/s',
    suffix: 'of Renewal',
    decimals: 2,
  }),
  dodgeChance: Object.freeze({
    max: 4,
    label: 'Dodge',
    unit: ' pp',
    suffix: 'of Evasion',
    decimals: 1,
  }),
  movementSpeedPercent: Object.freeze({
    max: 8,
    label: 'Movement speed',
    unit: '%',
    suffix: 'of the Wind',
    decimals: 1,
  }),
  pickupRadiusPercent: Object.freeze({
    max: 25,
    label: 'Pickup radius',
    unit: '%',
    suffix: 'of Gathering',
    decimals: 1,
  }),
  runXpPercent: Object.freeze({
    max: 10,
    label: 'Run XP',
    unit: '%',
    suffix: 'of Insight',
    decimals: 1,
  }),
  goldFindPercent: Object.freeze({
    max: 8,
    label: 'Gold find',
    unit: '%',
    suffix: 'of Fortune',
    decimals: 1,
  }),
});
/** Secondary stat value = max × (levelBase + levelGrowth × (L − 1) / 49) × roll. */
export const AFFIX_LEVEL_RULES = Object.freeze({ levelBase: 0.3, levelGrowth: 0.7 });
/** Total Gold find from gear is capped (percent). */
export const GOLD_FIND_CAP = 25;
/**
 * Secondary stat pool of each slot (6 per slot), in pool order (suffix ties take the first).
 * The weapon's «class damage %» is physical or magical by the class's damage type.
 */
export const SLOT_AFFIX_POOLS: Readonly<
  Record<Exclude<GearSlot, 'weapon'>, readonly AffixStat[]> & {
    weapon: readonly (AffixStat | 'classDamagePercent')[];
  }
> = Object.freeze({
  weapon: Object.freeze([
    'classDamagePercent',
    'attackSpeed',
    'criticalChance',
    'criticalDamage',
    'cooldownReduction',
    'eliteDamagePercent',
  ] as const),
  gloves: Object.freeze([
    'damagePercent',
    'attackSpeed',
    'criticalChance',
    'criticalDamage',
    'eliteDamagePercent',
    'areaSizePercent',
  ] as const),
  ring: Object.freeze([
    'damagePercent',
    'criticalChance',
    'criticalDamage',
    'cooldownReduction',
    'runXpPercent',
    'goldFindPercent',
  ] as const),
  amulet: Object.freeze([
    'damagePercent',
    'cooldownReduction',
    'areaSizePercent',
    'maxHpPercent',
    'pickupRadiusPercent',
    'runXpPercent',
  ] as const),
  helmet: Object.freeze([
    'cooldownReduction',
    'maxHpPercent',
    'hpRegenPercent',
    'dodgeChance',
    'pickupRadiusPercent',
    'runXpPercent',
  ] as const),
  armor: Object.freeze([
    'damagePercent',
    'areaSizePercent',
    'maxHpPercent',
    'hpRegenPercent',
    'dodgeChance',
    'movementSpeedPercent',
  ] as const),
  pants: Object.freeze([
    'maxHpPercent',
    'hpRegenPercent',
    'dodgeChance',
    'movementSpeedPercent',
    'pickupRadiusPercent',
    'goldFindPercent',
  ] as const),
});

// ── Names and icons (§1a) ──

/** The 26 gear templates kept for names and icons (the old tier stats are gone). */
export interface GearTemplate {
  readonly id: string;
  readonly name: string;
  readonly slot: GearSlot;
  /** Weapons only: the class that can use it. */
  readonly characterClass?: CharacterClass;
}
const t = (
  id: string,
  name: string,
  slot: GearSlot,
  characterClass?: CharacterClass,
): GearTemplate => Object.freeze({ id, name, slot, ...(characterClass ? { characterClass } : {}) });
export const GEAR_TEMPLATES: readonly GearTemplate[] = Object.freeze([
  t('heavy_sword', 'Heavy Sword', 'weapon', 'warrior'),
  t('quick_sword', 'Quick Sword', 'weapon', 'warrior'),
  t('assassin_dagger', "Assassin's Dagger", 'weapon', 'rogue'),
  t('shadow_dagger', 'Shadow Dagger', 'weapon', 'rogue'),
  t('long_bow', 'Longbow', 'weapon', 'archer'),
  t('short_bow', 'Shortbow', 'weapon', 'archer'),
  t('flame_staff', 'Flame Staff', 'weapon', 'mage'),
  t('wisdom_staff', 'Wisdom Staff', 'weapon', 'mage'),
  t('plate', 'Plate Armor', 'armor'),
  t('leather_armor', 'Leather Armor', 'armor'),
  t('robe', 'Robe', 'armor'),
  t('amulet_power', 'Royal Amulet', 'amulet'),
  t('amulet_magic', 'Runed Amulet', 'amulet'),
  t('amulet_life', 'Simple Amulet', 'amulet'),
  t('ring_precision', 'Silver Ring', 'ring'),
  t('ring_fury', 'Gold Ring', 'ring'),
  t('ring_speed', 'Iron Ring', 'ring'),
  t('guard_helm', "Guard's Helm", 'helmet'),
  t('hunter_hood', "Hunter's Hood", 'helmet'),
  t('mage_circlet', "Mage's Circlet", 'helmet'),
  t('plate_gauntlets', 'Plate Gauntlets', 'gloves'),
  t('trickster_gloves', "Trickster's Gloves", 'gloves'),
  t('sorcerer_gloves', "Sorcerer's Gloves", 'gloves'),
  t('plate_greaves', 'Plate Greaves', 'pants'),
  t('leather_pants', 'Leather Trousers', 'pants'),
  t('mystic_trousers', "Mystic's Breeches", 'pants'),
]);
/** Band bases: [first item level, template id], ascending. */
export const SHARED_BANDS: Readonly<
  Record<Exclude<GearSlot, 'weapon'>, readonly (readonly [number, string])[]>
> = Object.freeze({
  helmet: Object.freeze([
    [1, 'hunter_hood'],
    [16, 'mage_circlet'],
    [33, 'guard_helm'],
  ] as const),
  armor: Object.freeze([
    [1, 'robe'],
    [16, 'leather_armor'],
    [33, 'plate'],
  ] as const),
  gloves: Object.freeze([
    [1, 'trickster_gloves'],
    [16, 'sorcerer_gloves'],
    [33, 'plate_gauntlets'],
  ] as const),
  pants: Object.freeze([
    [1, 'leather_pants'],
    [16, 'mystic_trousers'],
    [33, 'plate_greaves'],
  ] as const),
  amulet: Object.freeze([
    [1, 'amulet_life'],
    [16, 'amulet_magic'],
    [33, 'amulet_power'],
  ] as const),
  ring: Object.freeze([
    [1, 'ring_speed'],
    [16, 'ring_precision'],
    [33, 'ring_fury'],
  ] as const),
});
export const WEAPON_BANDS: Readonly<
  Record<CharacterClass, readonly (readonly [number, string])[]>
> = Object.freeze({
  warrior: Object.freeze([
    [1, 'quick_sword'],
    [25, 'heavy_sword'],
  ] as const),
  rogue: Object.freeze([
    [1, 'shadow_dagger'],
    [25, 'assassin_dagger'],
  ] as const),
  archer: Object.freeze([
    [1, 'short_bow'],
    [25, 'long_bow'],
  ] as const),
  mage: Object.freeze([
    [1, 'wisdom_staff'],
    [25, 'flame_staff'],
  ] as const),
});

/** Starting weapons: always owned, item level 1, Common, no affixes (their own names / icons). */
export const STARTER_WEAPONS: Readonly<Record<CharacterClass, { id: string; name: string }>> =
  Object.freeze({
    warrior: { id: 'starter_sword', name: "Novice's Sword" },
    rogue: { id: 'starter_daggers', name: "Novice's Daggers" },
    archer: { id: 'starter_bow', name: "Novice's Bow" },
    mage: { id: 'starter_staff', name: "Novice's Staff" },
  });

// ── Shop (§5) ──

export const SHOP_RULES = Object.freeze({
  /** Price = round(base × (1 + L / levelDivisor)); weapons × weaponFactor. */
  commonBase: 40,
  uncommonBase: 60,
  levelDivisor: 5,
  weaponFactor: 1.25,
  /** Uncommon offers per slot (each with a different stat from the slot's pool). */
  uncommonPerSlot: 3,
});

// ── Task 41: slot upgrades, salvage, bag (PROVISIONAL; docs/task-41-bag-slots.md) ──

/**
 * Slot upgrades belong to a class's slot (not the item) and stay forever. Level 0–30. Every level:
 * the slotted item's main stat ×(1 + mainPerLevel · level). Every `milestoneEvery` levels: its
 * secondary stats ×(1 + secondaryPerMilestone · milestones). Cost of level n: Gold
 * goldBase + goldPerSquare · n², Ore oreBase + orePerLevel · n. No class-level gate.
 */
export const SLOT_UPGRADE_RULES = Object.freeze({
  maxLevel: 30,
  mainPerLevel: 0.04,
  milestoneEvery: 5,
  secondaryPerMilestone: 0.2,
  goldBase: 250,
  goldPerSquare: 4,
  oreBase: 8,
  orePerLevel: 4,
});
/** Ore paid for salvaging an item, by rarity. */
export const SALVAGE_ORE: Readonly<Record<Rarity, number>> = Object.freeze({
  common: 0,
  uncommon: 1,
  rare: 3,
  epic: 8,
  legendary: 25,
});
/**
 * Task 42 (replaces Task 41's 60): owned items the bag holds — base 25 (starter weapons don't
 * count; equipped items do), +10 per Gold expansion, up to 5 expansions (75). Account-wide.
 */
export const BAG_RULES = Object.freeze({
  base: 25,
  perExpansion: 10,
  expansionPrices: Object.freeze([5000, 12000, 25000, 40000, 60000]),
});

// ── Task 42: item drops (PROVISIONAL; docs/task-42-drops-reforge.md) ──

export type DropDifficulty = 'normal' | 'hard' | 'nightmare' | 'trial';
/**
 * Boss (victory only): one guaranteed item, rarity weights by difficulty. Elites: a chance per kill
 * (kept on defeat) with their own rarity weights. Item level = min(class level, cap), cap =
 * capOffset[difficulty] + map id, never above 50.
 */
export const DROP_RULES = Object.freeze({
  bossRarity: Object.freeze({
    normal: Object.freeze({ uncommon: 60, rare: 35, epic: 5 }),
    hard: Object.freeze({ uncommon: 30, rare: 55, epic: 15 }),
    nightmare: Object.freeze({ uncommon: 10, rare: 55, epic: 35 }),
    trial: Object.freeze({ uncommon: 10, rare: 55, epic: 35 }),
  }) as Readonly<Record<DropDifficulty, Readonly<Partial<Record<Rarity, number>>>>>,
  eliteChance: 0.05,
  eliteRarity: Object.freeze({ rare: 80, epic: 20 }) as Readonly<Partial<Record<Rarity, number>>>,
  capOffset: Object.freeze({ normal: 5, hard: 10, nightmare: 15, trial: 15 }) as Readonly<
    Record<DropDifficulty, number>
  >,
});

/**
 * Task 42 reforge (Rare and better): one secondary stat is replaced by a random stat of the slot's
 * pool the item doesn't have, rolled in the rarity's range. Cost = base × max(minLevelShare,
 * itemLevel / 50) × growth^n Gold (rounded), n = the item's earlier reforges.
 */
export const REFORGE_RULES = Object.freeze({
  base: Object.freeze({ rare: 300, epic: 450, legendary: 600 }) as Readonly<
    Partial<Record<Rarity, number>>
  >,
  minLevelShare: 0.2,
  growth: 1.25,
});
/**
 * Task 42 shop refresh: a new stock for the same class level. Cost = firstFactor × the Uncommon
 * price at the class level, doubled for each further refresh at that level (resets on level-up).
 */
export const SHOP_REFRESH_RULES = Object.freeze({ firstFactor: 2, growth: 2 });
