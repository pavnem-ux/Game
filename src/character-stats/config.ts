import type {
  CharacterClass,
  ClassStatsConfig,
  CombatAttributes,
  PrimaryAttributes,
} from './types';

export const PERMANENT_LEVEL_RANGE = Object.freeze({ min: 1, max: 50 });
export const CHARACTER_CLASSES = Object.freeze(['warrior', 'mage', 'archer', 'rogue'] as const);
export const PRIMARY_ATTRIBUTE_KEYS = Object.freeze([
  'strength',
  'intelligence',
  'dexterity',
  'vitality',
  'agility',
] as const satisfies readonly (keyof PrimaryAttributes)[]);
export const COMBAT_ATTRIBUTE_KEYS = Object.freeze([
  'maxHp',
  'physicalDamage',
  'magicalDamage',
  'resistance',
  'attackSpeed',
  'criticalChance',
  'criticalDamage',
  'movementSpeed',
  'dodgeChance',
  'cooldownReduction',
  'areaSize',
] as const satisfies readonly (keyof CombatAttributes)[]);

export const BASE_COMBAT_ATTRIBUTES: CombatAttributes = Object.freeze({
  maxHp: 100,
  physicalDamage: 10,
  magicalDamage: 10,
  resistance: 0,
  attackSpeed: 100,
  criticalChance: 10,
  criticalDamage: 200,
  movementSpeed: 100,
  dodgeChance: 5,
  cooldownReduction: 0,
  areaSize: 100,
});

/** Only these five stats have maximums; all other combat attributes remain uncapped. */
export const COMBAT_ATTRIBUTE_CAPS = Object.freeze({
  criticalChance: 75,
  dodgeChance: 60,
  cooldownReduction: 50,
  attackSpeed: 300,
  movementSpeed: 200,
} as const satisfies Partial<CombatAttributes>);

/** Missing conversions are exactly zero. */
export const ATTRIBUTE_CONVERSIONS: Readonly<
  Record<keyof PrimaryAttributes, Readonly<Partial<CombatAttributes>>>
> = Object.freeze({
  strength: Object.freeze({ physicalDamage: 5, resistance: 1 }),
  intelligence: Object.freeze({ magicalDamage: 5, cooldownReduction: 0.1, areaSize: 0.3 }),
  dexterity: Object.freeze({ attackSpeed: 0.5, criticalChance: 0.2, criticalDamage: 0.5 }),
  vitality: Object.freeze({ maxHp: 10, resistance: 1 }),
  agility: Object.freeze({ movementSpeed: 0.5, dodgeChance: 0.1 }),
});

function config(
  initialAttributes: PrimaryAttributes,
  growthPerLevel: PrimaryAttributes,
): ClassStatsConfig {
  return Object.freeze({
    initialAttributes: Object.freeze(initialAttributes),
    growthPerLevel: Object.freeze(growthPerLevel),
  });
}

export const CLASS_STATS_CONFIG: Readonly<Record<CharacterClass, ClassStatsConfig>> = Object.freeze(
  {
    warrior: config(
      { strength: 3, intelligence: 1, dexterity: 1, vitality: 3, agility: 1 },
      { strength: 3, intelligence: 1, dexterity: 1, vitality: 3, agility: 1 },
    ),
    mage: config(
      { strength: 1, intelligence: 5, dexterity: 1, vitality: 2, agility: 1 },
      { strength: 1, intelligence: 5, dexterity: 2, vitality: 2, agility: 1 },
    ),
    archer: config(
      { strength: 5, intelligence: 1, dexterity: 2, vitality: 1, agility: 2 },
      { strength: 5, intelligence: 1, dexterity: 2, vitality: 1, agility: 2 },
    ),
    rogue: config(
      { strength: 3, intelligence: 1, dexterity: 3, vitality: 2, agility: 3 },
      { strength: 3, intelligence: 1, dexterity: 3, vitality: 2, agility: 3 },
    ),
  },
);
