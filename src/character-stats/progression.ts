import { PERMANENT_LEVEL_RANGE } from './config';
import { calculateCharacterStats } from './calculations';
import type { CharacterClass, CharacterProgressionData, ClassProgression } from './types';
import { assertCharacterClass, assertPermanentLevel } from './validation';

const initialClassProgression = (): ClassProgression =>
  Object.freeze({ permanentLevel: PERMANENT_LEVEL_RANGE.min });

export function createCharacterProgression(
  selectedClass: CharacterClass = 'warrior',
): CharacterProgressionData {
  assertCharacterClass(selectedClass);
  return Object.freeze({
    version: 1,
    selectedClass,
    classes: Object.freeze({
      warrior: initialClassProgression(),
      mage: initialClassProgression(),
      archer: initialClassProgression(),
      rogue: initialClassProgression(),
    }),
  });
}

/** An immutable level assignment, not a reward/XP or leveling policy. */
export function setPermanentCharacterLevel(
  progression: CharacterProgressionData,
  characterClass: CharacterClass,
  permanentLevel: number,
): CharacterProgressionData {
  assertCharacterClass(characterClass);
  assertPermanentLevel(permanentLevel);
  return Object.freeze({
    ...progression,
    classes: Object.freeze({
      ...progression.classes,
      [characterClass]: Object.freeze({ permanentLevel }),
    }),
  });
}

export function selectCharacterClass(
  progression: CharacterProgressionData,
  selectedClass: CharacterClass,
): CharacterProgressionData {
  assertCharacterClass(selectedClass);
  return Object.freeze({ ...progression, selectedClass });
}

export function getSelectedCharacterStats(progression: CharacterProgressionData) {
  return calculateCharacterStats(
    progression.selectedClass,
    progression.classes[progression.selectedClass].permanentLevel,
  );
}
