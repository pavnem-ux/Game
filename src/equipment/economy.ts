import { victoryGold } from '../campaign/config';

/**
 * Task 11 §1.4 Gold coins — the single place for coin numbers. PROVISIONAL (tuned in 6.1 towards
 * «collected coins ≈ 60% of the map's Task 10 victory Gold on an average victory»).
 *
 * Values scale with the map like the Task 10 victory Gold table: scale(map) = victoryGold(map) /
 * victoryGold(1) (map 1 → 1, map 10 → 4, map 40 → 10).
 */
export const COIN_RULES = Object.freeze({
  /** Chance (0–1) that a normal enemy drops a pile, and its value at scale 1. */
  normalChance: 0.06,
  normalValue: 1,
  /** Guaranteed piles. */
  eliteValue: 4,
  bossValue: 12,
  /** Separate pile cap (crystals have their own); at the cap piles merge, nothing is lost. */
  pileCap: 256,
  /** Victory pays all collected coins + this share of the map's victory Gold as a bonus. */
  victoryBonusShare: 0.4,
  /** Defeat pays this share of the collected coins (rounded down), no bonus. Abandoned: nothing. */
  defeatCoinShare: 0.5,
});
export function coinScale(mapId: number): number {
  return victoryGold(mapId) / victoryGold(1);
}
/** Whole coins of one drop kind on a map (at least 1). */
export function coinValue(kind: 'normal' | 'elite' | 'boss', mapId: number): number {
  const base =
    kind === 'normal'
      ? COIN_RULES.normalValue
      : kind === 'elite'
        ? COIN_RULES.eliteValue
        : COIN_RULES.bossValue;
  return Math.max(1, Math.round(base * coinScale(mapId)));
}
export function victoryBonus(mapId: number): number {
  return Math.round(victoryGold(mapId) * COIN_RULES.victoryBonusShare);
}
/** Gold of a finished run: victory = coins + bonus; defeat = ⌊coins × 0.5⌋; abandoned = 0. */
export function runGold(
  outcome: 'victory' | 'defeat' | 'abandoned',
  mapId: number,
  coins: number,
): Readonly<{ coins: number; bonus: number; total: number }> {
  if (!Number.isSafeInteger(coins) || coins < 0) throw new RangeError('Invalid coin count.');
  if (outcome === 'victory') {
    const bonus = victoryBonus(mapId);
    return Object.freeze({ coins, bonus, total: coins + bonus });
  }
  if (outcome === 'defeat') {
    const paid = Math.floor(coins * COIN_RULES.defeatCoinShare);
    return Object.freeze({ coins: paid, bonus: 0, total: paid });
  }
  return Object.freeze({ coins: 0, bonus: 0, total: 0 });
}
