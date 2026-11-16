import type { CharacterClass } from '../character-stats';

/** Shared display helpers for the campaign screens (presentation only). */
export const CLASS_SYMBOLS: Record<CharacterClass, string> = {
  warrior: '⚔',
  mage: '✦',
  archer: '➶',
  rogue: '⟐',
};
export const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
export const factor = (m: number) => `×${(Math.round(m * 100) / 100).toFixed(2)}`;
