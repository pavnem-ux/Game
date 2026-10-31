/** Percentage fields use human-readable percentage points: 150 means 150%. */
export type CharacterClass = 'warrior' | 'mage' | 'archer' | 'rogue';

export interface PrimaryAttributes {
  readonly strength: number;
  readonly intelligence: number;
  readonly dexterity: number;
  readonly vitality: number;
  readonly agility: number;
}

export interface CombatAttributes {
  readonly maxHp: number;
  readonly physicalDamage: number;
  readonly magicalDamage: number;
  readonly resistance: number;
  readonly attackSpeed: number;
  readonly criticalChance: number;
  readonly criticalDamage: number;
  readonly movementSpeed: number;
  readonly dodgeChance: number;
  readonly cooldownReduction: number;
  readonly areaSize: number;
}

export interface ClassStatsConfig {
  readonly initialAttributes: PrimaryAttributes;
  readonly growthPerLevel: PrimaryAttributes;
}

export interface CharacterStatsSnapshot {
  readonly characterClass: CharacterClass;
  readonly permanentLevel: number;
  readonly primaryAttributes: PrimaryAttributes;
  readonly combatAttributes: CombatAttributes;
}

export interface ClassProgression {
  readonly permanentLevel: number;
}

/** Save-ready data only: calculated attributes are deliberately not authoritative save fields. */
export interface CharacterProgressionData {
  readonly version: 1;
  readonly selectedClass: CharacterClass;
  readonly classes: Readonly<Record<CharacterClass, ClassProgression>>;
}
