import {
  ATTRIBUTE_CONVERSIONS,
  BASE_COMBAT_ATTRIBUTES,
  CLASS_STATS_CONFIG,
  COMBAT_ATTRIBUTE_CAPS,
  COMBAT_ATTRIBUTE_KEYS,
  PRIMARY_ATTRIBUTE_KEYS,
  PERMANENT_LEVEL_RANGE,
} from './config';
import type {
  CharacterClass,
  CharacterStatsSnapshot,
  CombatAttributes,
  PrimaryAttributes,
} from './types';
import { assertCharacterClass, assertPermanentLevel } from './validation';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function calculatePrimaryAttributes(
  characterClass: CharacterClass,
  permanentLevel: number,
): PrimaryAttributes {
  assertCharacterClass(characterClass);
  assertPermanentLevel(permanentLevel);
  const { initialAttributes, growthPerLevel } = CLASS_STATS_CONFIG[characterClass];
  const attributes: Mutable<PrimaryAttributes> = { ...initialAttributes };
  for (const key of PRIMARY_ATTRIBUTE_KEYS) {
    attributes[key] += (permanentLevel - PERMANENT_LEVEL_RANGE.min) * growthPerLevel[key];
  }
  return Object.freeze(attributes);
}

/** Includes base values exactly once; leaves stats uncapped for the future modifier boundary. */
export function deriveUncappedCombatAttributes(primary: PrimaryAttributes): CombatAttributes {
  const attributes: Mutable<CombatAttributes> = { ...BASE_COMBAT_ATTRIBUTES };
  for (const primaryKey of PRIMARY_ATTRIBUTE_KEYS) {
    const conversions = ATTRIBUTE_CONVERSIONS[primaryKey];
    for (const combatKey of COMBAT_ATTRIBUTE_KEYS) {
      attributes[combatKey] += primary[primaryKey] * (conversions[combatKey] ?? 0);
    }
  }
  return Object.freeze(attributes);
}

/** Future systems combine their bonuses first, then call this finalization boundary once. */
export function applyCombatAttributeCaps(combined: CombatAttributes): CombatAttributes {
  const attributes: Mutable<CombatAttributes> = { ...combined };
  for (const key of Object.keys(COMBAT_ATTRIBUTE_CAPS) as (keyof typeof COMBAT_ATTRIBUTE_CAPS)[]) {
    attributes[key] = Math.min(attributes[key], COMBAT_ATTRIBUTE_CAPS[key]);
  }
  return Object.freeze(attributes);
}

export function calculateCharacterStats(
  characterClass: CharacterClass,
  permanentLevel: number,
): CharacterStatsSnapshot {
  const primaryAttributes = calculatePrimaryAttributes(characterClass, permanentLevel);
  return Object.freeze({
    characterClass,
    permanentLevel,
    primaryAttributes,
    combatAttributes: applyCombatAttributeCaps(deriveUncappedCombatAttributes(primaryAttributes)),
  });
}
