import { PERMANENT_LEVEL_RANGE } from '../character-stats';
import type { Loadout } from '../equipment';

/**
 * Task 08 permanent class XP (pure). Level L → L+1 costs 100 + 50·(L − 1) XP. Overflow carries
 * across levels; at the cap (50) `xp` stays 0 and further XP only grows `lifetimeXp`. Levels feed
 * only the existing Character Stats calculation (`calculateCharacterStats(class, level)`).
 */
export const MAX_CLASS_LEVEL = PERMANENT_LEVEL_RANGE.max;

/** XP and talents of one class (everything except its equipment). */
export interface ClassProgressCore {
  /** XP inside the current level (0 at the cap). */
  readonly xp: number;
  readonly level: number;
  /** Every permanent XP point ever granted to this class (including past the cap). */
  readonly lifetimeXp: number;
  /**
   * Task 09: allocated talent ranks of this class tree (node id → rank 1–3). Only ranks are
   * stored; points are derived from the level (replaces the Task 08 `talentsSpent` placeholder).
   */
  readonly talents: Readonly<Record<string, number>>;
}
export interface ClassProgress extends ClassProgressCore {
  /** Task 11: this class's equipment (starter weapon + empty slots by default). */
  readonly loadout: Loadout;
}
export const NEW_CLASS_PROGRESS: ClassProgressCore = Object.freeze({
  xp: 0,
  level: 1,
  lifetimeXp: 0,
  talents: Object.freeze({}),
});

/** XP needed to go from `level` to `level + 1` (null at the cap). */
export function xpToNextLevel(level: number): number | null {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CLASS_LEVEL)
    throw new RangeError(`Invalid class level: ${level}.`);
  // Task 40: 100 + 6·L² (was 100 + 50·(L − 1)); 247 450 XP from level 1 to 50. PROVISIONAL.
  return level >= MAX_CLASS_LEVEL ? null : 100 + 6 * level * level;
}

export interface ClassXpResult<P extends ClassProgressCore = ClassProgress> {
  readonly progress: P;
  readonly levelsGained: number;
}
/** Adds permanent XP; every other field of `progress` (talents, loadout) is kept. */
export function addClassXp<P extends ClassProgressCore>(
  progress: P,
  amount: number,
): ClassXpResult<P> {
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
