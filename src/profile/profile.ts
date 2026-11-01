import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import type { ClassProgress } from './class-xp';
import { NEW_CLASS_PROGRESS } from './class-xp';
import type { RunOutcome } from './rewards';

/**
 * Task 08 player profile (persisted as one JSON document by the save store in Phase 4).
 * Only source data is stored — never derived values (combat stats, talent points).
 */
export const PROFILE_SCHEMA_VERSION = 1;
export const MAX_RECENT_RUNS = 20;
export const MAX_PROCESSED_RUN_IDS = 50;

export interface MapBest {
  readonly victories: number;
  /** Fastest victory (simulation seconds), null until the first win. */
  readonly bestClearTime: number | null;
  readonly bestSurvivalTime: number;
  readonly bestKills: number;
}
export interface RecentRun {
  readonly runId: string;
  readonly mapId: number;
  readonly characterClass: CharacterClass;
  readonly outcome: RunOutcome;
  readonly elapsed: number;
  readonly kills: number;
  readonly eliteKills: number;
  readonly bossKilled: boolean;
  readonly xp: number;
  readonly gold: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly levelsGained: number;
  readonly unlockedMap: number | null;
  /** ISO timestamp supplied by the caller (null when unknown). */
  readonly finishedAt: string | null;
}
export interface ProfileStats {
  readonly runs: number;
  readonly wins: number;
  readonly defeats: number;
  readonly enemiesKilled: number;
  readonly bestSurvivalTime: number;
}
export interface PlayerProfile {
  readonly schemaVersion: number;
  readonly profileId: string;
  readonly createdAt: string;
  readonly lastSavedAt: string | null;
  readonly selectedClass: CharacterClass;
  readonly classes: Readonly<Record<CharacterClass, ClassProgress>>;
  readonly gold: number;
  /** Highest playable map id (Map 1 is always unlocked). */
  readonly highestUnlockedMap: number;
  readonly completedMaps: readonly number[];
  /** Keyed by map id as a string ("1".."10"). */
  readonly bestResults: Readonly<Record<string, MapBest>>;
  readonly stats: ProfileStats;
  /** Newest first, at most MAX_RECENT_RUNS. */
  readonly recentRuns: readonly RecentRun[];
  /** Oldest first, at most MAX_PROCESSED_RUN_IDS (reward de-duplication). */
  readonly processedRunIds: readonly string[];
}

/** A brand-new profile. Identity and time are supplied by the caller (no hidden clock/RNG). */
export function createProfile(profileId: string, createdAt: string): PlayerProfile {
  if (typeof profileId !== 'string' || !profileId.trim())
    throw new TypeError('profileId required.');
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt)))
    throw new TypeError('createdAt must be an ISO timestamp.');
  return Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profileId,
    createdAt,
    lastSavedAt: null,
    selectedClass: 'warrior',
    classes: Object.freeze(
      Object.fromEntries(CHARACTER_CLASSES.map((c) => [c, NEW_CLASS_PROGRESS])) as Record<
        CharacterClass,
        ClassProgress
      >,
    ),
    gold: 0,
    highestUnlockedMap: 1,
    completedMaps: Object.freeze([]),
    bestResults: Object.freeze({}),
    stats: Object.freeze({ runs: 0, wins: 0, defeats: 0, enemiesKilled: 0, bestSurvivalTime: 0 }),
    recentRuns: Object.freeze([]),
    processedRunIds: Object.freeze([]),
  });
}
