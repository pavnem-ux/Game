import { CHARACTER_CLASSES, PERMANENT_LEVEL_RANGE } from './config';
import type { CharacterClass } from './types';

export function assertCharacterClass(value: unknown): asserts value is CharacterClass {
  if (typeof value !== 'string' || !CHARACTER_CLASSES.some((id) => id === value)) {
    throw new TypeError(
      `Invalid character class: ${String(value)}. Expected warrior, mage, archer, or rogue.`,
    );
  }
}

export function assertPermanentLevel(value: unknown): asserts value is number {
  const { min, max } = PERMANENT_LEVEL_RANGE;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(
      `Invalid permanent character level: ${String(value)}. Expected an integer from ${min} to ${max}.`,
    );
  }
}
