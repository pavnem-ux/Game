import { getCampaignMap, victoryGold } from '../campaign/config';
import { campaignSchedule } from '../campaign/schedule';

/**
 * Task 11 §1.4 Gold coins — the single place for coin numbers. PROVISIONAL (tuned in 6.1).
 *
 * Target: on an average victory the collected coins ≈ 60% of the map's Task 10 victory Gold
 * (the victory bonus is the other 40%). The coin target of a map is split between the boss (one
 * pile), its elites (together, whatever their number on that map) and the normal enemies (the
 * rest, as a small chance per death). Measured in 6.1: a won run is effectively a full clear and
 * kills ≈ 4.7 × spawnRate × duration normal enemies (map 1: ≈ 2500, maps 10–40: ≈ 7300), so the
 * chance of a map is set for that expected kill count.
 */
export const COIN_RULES = Object.freeze({
  /** Share of the map's victory Gold the collected coins aim at on an average victory. */
  coinTargetShare: 0.6,
  /** Shares of that coin target paid by the boss pile and by all elite piles together. */
  bossShare: 0.2,
  eliteShare: 0.2,
  /** Value of a normal pile at scale 1 (map 1); multiplied by the map scale. */
  normalValue: 1,
  /** Normal kills of a won run per (spawn-rate × second), measured in 6.1 (4.2 on map 1, 4.7 on 10). */
  killsPerSpawnSecond: 4.7,
  /** Separate pile cap (crystals have their own); at the cap piles merge, nothing is lost. */
  pileCap: 256,
  /** Victory pays all collected coins + this share of the map's victory Gold as a bonus. */
  victoryBonusShare: 0.4,
  /** Defeat pays this share of the collected coins (rounded down), no bonus. Abandoned: nothing. */
  defeatCoinShare: 0.5,
  /** Task 14 «Пропустить» (provisional): coins = this share of the map's victory Gold, at least min. */
  skipShare: 0.02,
  skipMin: 3,
});
/** Task 14: coins for skipping a level-up offer on this map. */
export function skipCoins(mapId: number): number {
  return Math.max(COIN_RULES.skipMin, Math.round(victoryGold(mapId) * COIN_RULES.skipShare));
}
/** Map scale of normal piles, like the Task 10 Gold table: victoryGold(map) / victoryGold(1). */
export function coinScale(mapId: number): number {
  return victoryGold(mapId) / victoryGold(1);
}
/** Coins the collected piles aim at on an average victory of the map (60% of its victory Gold). */
export function coinTarget(mapId: number): number {
  return victoryGold(mapId) * COIN_RULES.coinTargetShare;
}
/**
 * Chance (0–1) that a normal enemy of the map drops a pile: the normal share of the coin target
 * spread over the expected normal kills of a won run (map 1: ≈ 0.96%, maps 10–40: ≈ 0.37%).
 */
export function normalChance(mapId: number): number {
  const map = getCampaignMap(mapId);
  const share = 1 - COIN_RULES.bossShare - COIN_RULES.eliteShare;
  const piles = (coinTarget(mapId) * share) / (COIN_RULES.normalValue * coinScale(mapId));
  const kills = COIN_RULES.killsPerSpawnSecond * map.difficulty.spawnRate * map.durationSeconds;
  return Math.min(1, piles / kills);
}
const eliteCounts = new Map<number, number>();
function eliteCount(mapId: number): number {
  let n = eliteCounts.get(mapId);
  if (n === undefined) {
    n = campaignSchedule(getCampaignMap(mapId)).filter((e) => e.kind === 'elite').length;
    eliteCounts.set(mapId, n);
  }
  return n;
}
/** Whole coins of one drop kind on a map (at least 1). */
export function coinValue(kind: 'normal' | 'elite' | 'boss', mapId: number): number {
  const value =
    kind === 'normal'
      ? COIN_RULES.normalValue * coinScale(mapId)
      : kind === 'boss'
        ? coinTarget(mapId) * COIN_RULES.bossShare
        : (coinTarget(mapId) * COIN_RULES.eliteShare) / Math.max(1, eliteCount(mapId));
  return Math.max(1, Math.round(value));
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

/**
 * Task 19 §1.2 Ore («Руда») — second profile currency. PROVISIONAL. Victory only:
 * `base + floor(mapId / perMaps)` (map 1: 2, map 4: 3, map 40: 12); the first victory on a map pays
 * ×firstVictoryMultiplier. Defeat / abandoned: 0.
 */
export const ORE_RULES = Object.freeze({ base: 2, perMaps: 4, firstVictoryMultiplier: 3 });
export function runOre(
  outcome: 'victory' | 'defeat' | 'abandoned',
  mapId: number,
  firstVictory: boolean,
): number {
  if (!Number.isInteger(mapId) || mapId < 1) throw new RangeError('Invalid map id.');
  if (outcome !== 'victory') return 0;
  const ore = ORE_RULES.base + Math.floor(mapId / ORE_RULES.perMaps);
  return firstVictory ? ore * ORE_RULES.firstVictoryMultiplier : ore;
}
