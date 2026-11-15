import { CHARACTER_CLASSES } from '../character-stats';
import { CAMPAIGN_MAPS, getCampaignMap } from '../campaign';
import { addClassXp, talentPoints } from './class-xp';
import { MAX_PROCESSED_RUN_IDS, MAX_RECENT_RUNS } from './profile';
import type { MapBest, PlayerProfile, RecentRun } from './profile';
import { runRewards, validateRunStatsSummary } from './rewards';
import { runOre } from '../equipment/economy';
import { addRunToCounters, validateRunQuestSummary } from '../quests/counters';
import type { RunResult } from './rewards';

/**
 * Task 08 map unlocks + run application (pure, idempotent). Applies a finished run's rewards,
 * class levels, unlocks, stats, recent runs and run-id de-duplication to a COPY of the profile;
 * the caller commits the returned profile as one snapshot. Applying the same runId again returns
 * the profile unchanged (`duplicate: true`), so results revisits, repeated events or a reload can
 * never grant rewards twice.
 */
export interface RunSummary {
  readonly runId: string;
  readonly mapId: number;
  readonly characterClass: RunResult['characterClass'];
  readonly outcome: RunResult['outcome'];
  readonly xpGained: number;
  readonly goldGained: number;
  /** Task 19: ore credited (victory only; ×3 on the first victory on the map). */
  readonly oreGained: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly levelsGained: number;
  readonly talentPointsGained: number;
  readonly newlyUnlockedMap: number | null;
  /** True if this run had already been applied: nothing changed. */
  readonly duplicate: boolean;
}
export interface ApplyRunOutcome {
  readonly profile: PlayerProfile;
  readonly summary: RunSummary;
}

export const isMapUnlocked = (profile: PlayerProfile, mapId: number) =>
  Number.isInteger(mapId) && mapId >= 1 && mapId <= profile.highestUnlockedMap;
/** The map unlocked by winning `mapId` (null after the last map). */
export const nextMapAfter = (mapId: number) => (mapId < CAMPAIGN_MAPS.length ? mapId + 1 : null);

export function validateRunResult(result: RunResult): void {
  if (!result || typeof result !== 'object') throw new TypeError('Run result required.');
  if (typeof result.runId !== 'string' || !result.runId.trim() || result.runId.length > 100)
    throw new TypeError('Run result needs a runId (1–100 chars).');
  getCampaignMap(result.mapId);
  if (!CHARACTER_CLASSES.includes(result.characterClass)) throw new TypeError('Unknown class.');
  if (!['victory', 'defeat', 'abandoned'].includes(result.outcome))
    throw new TypeError('Unknown outcome.');
  for (const key of ['elapsed', 'kills', 'eliteKills', 'runLevel'] as const)
    if (!Number.isFinite(result[key]) || result[key] < 0) throw new RangeError(`Invalid ${key}.`);
  for (const key of ['kills', 'eliteKills', 'runLevel'] as const)
    if (!Number.isInteger(result[key])) throw new RangeError(`${key} must be an integer.`);
  if (typeof result.bossKilled !== 'boolean') throw new TypeError('bossKilled must be boolean.');
  if (result.outcome === 'victory' && !result.bossKilled)
    throw new RangeError('A victory requires the boss to be killed.');
  if (result.stats !== undefined) validateRunStatsSummary(result.stats);
  if (result.coins !== undefined && (!Number.isSafeInteger(result.coins) || result.coins < 0))
    throw new RangeError('coins must be a whole number ≥ 0.');
  if (
    result.activityOre !== undefined &&
    (!Number.isSafeInteger(result.activityOre) ||
      result.activityOre < 0 ||
      result.activityOre > 1000)
  )
    throw new RangeError('activityOre must be a whole number 0–1000.');
  if (result.quest !== undefined) validateRunQuestSummary(result.quest);
}

function summaryFromRecent(run: RecentRun): RunSummary {
  return Object.freeze({
    runId: run.runId,
    mapId: run.mapId,
    characterClass: run.characterClass,
    outcome: run.outcome,
    xpGained: run.xp,
    goldGained: run.gold,
    oreGained: run.ore ?? 0,
    levelBefore: run.levelBefore,
    levelAfter: run.levelAfter,
    levelsGained: run.levelsGained,
    talentPointsGained: talentPoints(run.levelAfter) - talentPoints(run.levelBefore),
    newlyUnlockedMap: run.unlockedMap,
    duplicate: true,
  });
}

export function applyRunResult(
  profile: PlayerProfile,
  result: RunResult,
  finishedAt: string | null = null,
): ApplyRunOutcome {
  validateRunResult(result);
  if (profile.processedRunIds.includes(result.runId)) {
    const previous = profile.recentRuns.find((r) => r.runId === result.runId);
    const summary: RunSummary = previous
      ? summaryFromRecent(previous)
      : Object.freeze({
          runId: result.runId,
          mapId: result.mapId,
          characterClass: result.characterClass,
          outcome: result.outcome,
          xpGained: 0,
          goldGained: 0,
          oreGained: 0,
          levelBefore: profile.classes[result.characterClass].level,
          levelAfter: profile.classes[result.characterClass].level,
          levelsGained: 0,
          talentPointsGained: 0,
          newlyUnlockedMap: null,
          duplicate: true,
        });
    return Object.freeze({ profile, summary });
  }
  if (!isMapUnlocked(profile, result.mapId))
    throw new RangeError(`Map ${result.mapId} is locked for this profile.`);

  const map = getCampaignMap(result.mapId);
  const elapsed = Math.min(result.elapsed, map.durationSeconds);
  const rewards = runRewards({
    mapId: result.mapId,
    outcome: result.outcome,
    elapsed,
    coins: result.coins ?? 0,
  });
  const before = profile.classes[result.characterClass];
  const { progress, levelsGained } = addClassXp(before, rewards.xp);
  const victory = result.outcome === 'victory';
  const finished = result.outcome !== 'abandoned';
  // Task 19: ore in the same snapshot as XP / Gold (×3 when the map had never been won).
  // Task 24: Ore banked from map activities joins it only with a victory (no first-win ×3).
  const ore =
    runOre(result.outcome, result.mapId, !profile.completedMaps.includes(result.mapId)) +
    (result.outcome === 'victory' ? (result.activityOre ?? 0) : 0);

  // Unlocks: only a victory unlocks the next map; unlocked maps stay unlocked.
  const next = victory ? nextMapAfter(result.mapId) : null;
  const highestUnlockedMap =
    next !== null ? Math.max(profile.highestUnlockedMap, next) : profile.highestUnlockedMap;
  const newlyUnlockedMap =
    highestUnlockedMap > profile.highestUnlockedMap ? highestUnlockedMap : null;
  const completedMaps = victory
    ? [...new Set([...profile.completedMaps, result.mapId])].sort((a, b) => a - b)
    : [...profile.completedMaps];

  const key = String(result.mapId);
  const prevBest: MapBest = profile.bestResults[key] ?? {
    victories: 0,
    bestClearTime: null,
    bestSurvivalTime: 0,
    bestKills: 0,
  };
  const best: MapBest = finished
    ? Object.freeze({
        victories: prevBest.victories + (victory ? 1 : 0),
        bestClearTime: victory
          ? Math.min(prevBest.bestClearTime ?? Infinity, result.elapsed)
          : prevBest.bestClearTime,
        bestSurvivalTime: Math.max(prevBest.bestSurvivalTime, elapsed),
        bestKills: Math.max(prevBest.bestKills, result.kills),
      })
    : prevBest;

  const recent: RecentRun = Object.freeze({
    runId: result.runId,
    mapId: result.mapId,
    characterClass: result.characterClass,
    outcome: result.outcome,
    elapsed,
    kills: result.kills,
    eliteKills: result.eliteKills,
    bossKilled: result.bossKilled,
    xp: rewards.xp,
    gold: rewards.gold,
    ore,
    levelBefore: before.level,
    levelAfter: progress.level,
    levelsGained,
    unlockedMap: newlyUnlockedMap,
    finishedAt,
    ...(result.stats ? { stats: validateRunStatsSummary(result.stats) } : {}),
  });
  const s = profile.stats;
  const next_: PlayerProfile = Object.freeze({
    ...profile,
    classes: Object.freeze({ ...profile.classes, [result.characterClass]: progress }),
    gold: profile.gold + rewards.gold,
    ore: profile.ore + ore,
    highestUnlockedMap,
    completedMaps: Object.freeze(completedMaps),
    bestResults: finished
      ? Object.freeze({ ...profile.bestResults, [key]: best })
      : profile.bestResults,
    stats: Object.freeze({
      runs: s.runs + 1,
      wins: s.wins + (victory ? 1 : 0),
      defeats: s.defeats + (result.outcome === 'defeat' ? 1 : 0),
      // Abandoned runs grant nothing: their kills/survival do not count either.
      enemiesKilled: s.enemiesKilled + (finished ? result.kills : 0),
      bestSurvivalTime: finished ? Math.max(s.bestSurvivalTime, elapsed) : s.bestSurvivalTime,
    }),
    recentRuns: Object.freeze([recent, ...profile.recentRuns].slice(0, MAX_RECENT_RUNS)),
    processedRunIds: Object.freeze(
      [...profile.processedRunIds, result.runId].slice(-MAX_PROCESSED_RUN_IDS),
    ),
    // Task 21: quest counters, once per finalized run (same snapshot and run-ID de-duplication).
    questCounters: addRunToCounters(profile.questCounters, {
      ...result,
      ...(result.quest ? { quest: validateRunQuestSummary(result.quest) } : {}),
    }),
  });
  return Object.freeze({
    profile: next_,
    summary: Object.freeze({
      runId: result.runId,
      mapId: result.mapId,
      characterClass: result.characterClass,
      outcome: result.outcome,
      xpGained: rewards.xp,
      goldGained: rewards.gold,
      oreGained: ore,
      levelBefore: before.level,
      levelAfter: progress.level,
      levelsGained,
      talentPointsGained: talentPoints(progress.level) - talentPoints(before.level),
      newlyUnlockedMap,
      duplicate: false,
    }),
  });
}
