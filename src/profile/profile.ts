import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import type { ClassProgress } from './class-xp';
import { NEW_CLASS_PROGRESS } from './class-xp';
import { defaultLoadout } from '../equipment';
import type { RunOutcome, RunStatsSummary } from './rewards';
import { NO_QUEST_COUNTERS } from '../quests/counters';
import type { QuestCounters } from '../quests/counters';
import type { CampaignDifficulty } from '../campaign/config';

/**
 * Task 08 player profile (persisted as one JSON document by the save store in Phase 4).
 * Only source data is stored — never derived values (combat stats, talent points).
 */
/** v2 (Task 09): per-class `talents` ranks replace the `talentsSpent` placeholder. */
/** v3 (Task 10): 40 maps; a completed map 10 now unlocks map 11 (see migrateV2toV3). */
/** v4 (Task 11): `ownedItems` and per-class `loadout` (see migrateV3toV4). */
/** v5 (Task 19): `ore`, `itemLevels`, loadout slots helmet/gloves/pants (see migrateV4toV5). */
/** v6 (Task 20): `ownedPets`, `petLevels`, `activePet` (see migrateV5toV6). */
/** v7 (Task 21): `questCounters`, `questsClaimed` (see migrateV6toV7). */
/** v8 (Task 24): `questCounters.activities` — map activities completed by type (migrateV7toV8). */
export const PROFILE_SCHEMA_VERSION = 9;
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
  /** Task 19: ore credited by this run (absent in older saves = 0). */
  readonly ore?: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly levelsGained: number;
  readonly unlockedMap: number | null;
  /** Task 39: the map's difficulty tier (absent = Normal) and the tier it opened (absent = none). */
  readonly difficulty?: CampaignDifficulty;
  readonly unlockedTier?: CampaignDifficulty;
  /** ISO timestamp supplied by the caller (null when unknown). */
  readonly finishedAt: string | null;
  /** Task 08.5 (additive, optional): run-statistics summary; absent in older saves. */
  readonly stats?: RunStatsSummary;
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
  /** Task 19: second currency «Ore» (victory rewards; spent in the forge). */
  readonly ore: number;
  /** Highest playable map id (Map 1 is always unlocked). */
  readonly highestUnlockedMap: number;
  readonly completedMaps: readonly number[];
  /**
   * Task 39: the hardest tier won per map above Normal ("hard" / "nightmare" / "trial"), keyed by
   * map id as a string. A Normal win is `completedMaps`. Each won tier opens the next on that map.
   */
  readonly mapTiers: Readonly<Record<string, Exclude<CampaignDifficulty, 'normal'>>>;
  /** Keyed by map id as a string ("1".."40"). */
  readonly bestResults: Readonly<Record<string, MapBest>>;
  readonly stats: ProfileStats;
  /** Newest first, at most MAX_RECENT_RUNS. */
  readonly recentRuns: readonly RecentRun[];
  /** Oldest first, at most MAX_PROCESSED_RUN_IDS (reward de-duplication). */
  readonly processedRunIds: readonly string[];
  /** Task 11: bought shop items (permanent, no copies), in purchase order. */
  readonly ownedItems: readonly string[];
  /** Task 19: forge upgrade level (1–10) per owned item id; absent id = +0. Account-wide. */
  readonly itemLevels: Readonly<Record<string, number>>;
  /** Task 20: unlocked pets (account-wide), in unlock order. */
  readonly ownedPets: readonly string[];
  /** Task 20: pet level 2–5 per owned pet id; absent = level 1. */
  readonly petLevels: Readonly<Record<string, number>>;
  /** Task 20: the one active pet (shared by every class) or null. */
  readonly activePet: string | null;
  /** Task 21: lifetime quest counters (total kills stay in `stats.enemiesKilled`). */
  readonly questCounters: QuestCounters;
  /** Task 21: quests whose reward was claimed, in claim order. */
  readonly questsClaimed: readonly string[];
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
      Object.fromEntries(
        CHARACTER_CLASSES.map((c) => [
          c,
          Object.freeze({ ...NEW_CLASS_PROGRESS, loadout: defaultLoadout(c) }),
        ]),
      ) as Record<CharacterClass, ClassProgress>,
    ),
    gold: 0,
    ore: 0,
    highestUnlockedMap: 1,
    completedMaps: Object.freeze([]),
    mapTiers: Object.freeze({}),
    bestResults: Object.freeze({}),
    stats: Object.freeze({ runs: 0, wins: 0, defeats: 0, enemiesKilled: 0, bestSurvivalTime: 0 }),
    recentRuns: Object.freeze([]),
    processedRunIds: Object.freeze([]),
    ownedItems: Object.freeze([]),
    itemLevels: Object.freeze({}),
    ownedPets: Object.freeze([]),
    petLevels: Object.freeze({}),
    activePet: null,
    questCounters: NO_QUEST_COUNTERS,
    questsClaimed: Object.freeze([]),
  });
}
