import { PERMANENT_LEVEL_RANGE } from '../character-stats';

/**
 * Task 08 permanent class XP (pure). Level L → L+1 costs 100 + 50·(L − 1) XP. Overflow carries
 * across levels; at the cap (50) `xp` stays 0 and further XP only grows `lifetimeXp`. Levels feed
 * only the existing Character Stats calculation (`calculateCharacterStats(class, level)`).
 */
export const MAX_CLASS_LEVEL = PERMANENT_LEVEL_RANGE.max;

export interface ClassProgress {
  /** XP inside the current level (0 at the cap). */
  readonly xp: number;
  readonly level: number;
  /** Every permanent XP point ever granted to this class (including past the cap). */
  readonly lifetimeXp: number;
  /** Reserved for future talent spending (always 0 in Task 08). */
  readonly talentsSpent: number;
}
export const NEW_CLASS_PROGRESS: ClassProgress = Object.freeze({
  xp: 0,
  level: 1,
  lifetimeXp: 0,
  talentsSpent: 0,
});

/** XP needed to go from `level` to `level + 1` (null at the cap). */
export function xpToNextLevel(level: number): number | null {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CLASS_LEVEL)
    throw new RangeError(`Invalid class level: ${level}.`);
  return level >= MAX_CLASS_LEVEL ? null : 100 + 50 * (level - 1);
}

export interface ClassXpResult {
  readonly progress: ClassProgress;
  readonly levelsGained: number;
}
export function addClassXp(progress: ClassProgress, amount: number): ClassXpResult {
  if (!Number.isInteger(amount) || amount < 0)
    throw new RangeError('XP must be a whole number ≥ 0.');
  let { xp, level } = progress;
  const start = level;
  xp += amount;
  for (let cost = xpToNextLevel(level); cost !== null && xp >= cost; cost = xpToNextLevel(level)) {
    xp -= cost;
    level++;
  }
  if (level >= MAX_CLASS_LEVEL) xp = 0; // extra XP at the cap only counts as lifetime XP
  return Object.freeze({
    progress: Object.freeze({ ...progress, xp, level, lifetimeXp: progress.lifetimeXp + amount }),
    levelsGained: level - start,
  });
}

/**
 * Talent points are always derived from the level, never stored: +1 per even level, +1 bonus at
 * level 30, so 26 at level 50. No spending in Task 08.
 */
export function talentPoints(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CLASS_LEVEL)
    throw new RangeError(`Invalid class level: ${level}.`);
  return Math.floor(level / 2) + (level >= 30 ? 1 : 0);
}
