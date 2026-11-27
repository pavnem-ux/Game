import type { ItemInstance } from '../equipment';
import type { CharacterClass } from '../character-stats';
import { CAMPAIGN_BALANCE, getCampaignMap } from '../campaign';
import type { CampaignDifficulty } from '../campaign';
import { runGold } from '../equipment/economy';
import type { RunQuestSummary } from '../quests/counters';

/**
 * Task 08 run rewards (pure). Victory: full map XP to the class and Gold to the profile. Defeat:
 * floor(reward × 0.25 × min(elapsed / duration, 1)) each. Abandoned: nothing. Run XP (in-run
 * levels) is never converted into permanent XP — only these map rewards are.
 */
export type RunOutcome = 'victory' | 'defeat' | 'abandoned';
export interface RunResult {
  /** Unique per run; rewards are applied at most once per id. */
  readonly runId: string;
  readonly mapId: number;
  readonly characterClass: CharacterClass;
  readonly outcome: RunOutcome;
  /** Simulation seconds survived (the world caps it at the map duration). */
  readonly elapsed: number;
  readonly kills: number;
  readonly eliteKills: number;
  readonly bossKilled: boolean;
  /** In-run level reached (display only; never converted to permanent XP). */
  readonly runLevel: number;
  /** Task 08.5: optional run-statistics summary, stored with the recent run (display only). */
  readonly stats?: RunStatsSummary;
  /** Task 11: Gold coins collected during the run (absent = 0). */
  readonly coins?: number;
  /** Task 21: quest counters of this run (kills by type, chests, synergies; absent = none). */
  readonly quest?: RunQuestSummary;
  /** Task 24: Ore earned from map activities (paid only with a victory; absent = 0). */
  readonly activityOre?: number;
  /** Task 39: the map's difficulty tier (absent = Normal). */
  readonly difficulty?: CampaignDifficulty;
  /**
   * Task 42: items collected this run (victory: + the boss item; defeat: elite items kept).
   * Run-local uids; the profile assigns real ones. Abandoned runs grant nothing.
   */
  readonly loot?: readonly ItemInstance[];
}
/**
 * Task 08.5 §2: the only run statistics that are persisted (in `recentRuns`). Whole numbers for
 * damage; source ids as produced by the run-stats collector. Never affects rewards.
 */
export interface RunStatsSummary {
  readonly damageDealt: number;
  readonly damageTaken: number;
  /** Up to 3 highest damage sources. */
  readonly topSources: readonly Readonly<{ source: string; damage: number }>[];
  readonly deathTime: number | null;
  readonly reviveUsed: boolean;
  readonly lowHpMoments: number;
}
export const RUN_STATS_SUMMARY_LIMITS = Object.freeze({ topSources: 3, sourceLength: 64 });
const SOURCE_ID = /^[a-z]+([:.][a-z0-9_.-]+)?$/; // Task 09: `talent:<class>.b<n>.n0<m>`; Task 20: `pet.<id>`
/** Throws on an invalid summary (shared by run results and save parsing). */
export function validateRunStatsSummary(stats: unknown, what = 'stats'): RunStatsSummary {
  const fail = (field: string): never => {
    throw new RangeError(`Invalid ${what}.${field}.`);
  };
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) fail('summary');
  const v = stats as Record<string, unknown>;
  const whole = (x: unknown, field: string) =>
    Number.isSafeInteger(x) && (x as number) >= 0 ? (x as number) : fail(field);
  const sources = Array.isArray(v.topSources) ? v.topSources : fail('topSources');
  if (sources.length > RUN_STATS_SUMMARY_LIMITS.topSources) fail('topSources');
  const death = v.deathTime ?? null;
  if (death !== null && !(Number.isFinite(death) && (death as number) >= 0)) fail('deathTime');
  if (typeof v.reviveUsed !== 'boolean') fail('reviveUsed');
  return Object.freeze({
    damageDealt: whole(v.damageDealt, 'damageDealt'),
    damageTaken: whole(v.damageTaken, 'damageTaken'),
    topSources: Object.freeze(
      sources.map((s: unknown, i: number) => {
        const e = (s && typeof s === 'object' ? s : fail(`topSources[${i}]`)) as Record<
          string,
          unknown
        >;
        const source =
          typeof e.source === 'string' &&
          e.source.length <= RUN_STATS_SUMMARY_LIMITS.sourceLength &&
          SOURCE_ID.test(e.source)
            ? e.source
            : fail(`topSources[${i}].source`);
        return Object.freeze({ source, damage: whole(e.damage, `topSources[${i}].damage`) });
      }),
    ),
    deathTime: death as number | null,
    reviveUsed: v.reviveUsed as boolean,
    lowHpMoments: whole(v.lowHpMoments, 'lowHpMoments'),
  });
}
export interface RunRewards {
  readonly xp: number;
  /** Total Gold credited (= coins + bonus). */
  readonly gold: number;
  /** Task 11: Gold from collected coins (victory: all; defeat: 50%) and the victory bonus. */
  readonly coins: number;
  readonly bonus: number;
}

/**
 * Rewards of a finished run. XP as in Task 08 (victory XP; defeat share by time survived).
 * Task 11: Gold = collected coins + victory bonus (victory), 50% of the coins (defeat), nothing
 * when abandoned — see `runGold` in the economy config.
 */
export function runRewards(
  result: Pick<RunResult, 'mapId' | 'outcome' | 'elapsed' | 'coins' | 'difficulty'>,
): RunRewards {
  // Task 39: the tier's duration (defeat XP share) and its victory Gold multiplier.
  const map = getCampaignMap(result.mapId, result.difficulty ?? 'normal');
  if (!Number.isFinite(result.elapsed) || result.elapsed < 0)
    throw new RangeError('elapsed must be a finite, non-negative number of seconds.');
  let xp: number;
  switch (result.outcome) {
    // Task 40: the tier's XP scale (Elite Trial 20%; also for its defeat share, so a lost Trial
    // never pays more class XP than a won one).
    case 'victory':
      xp = Math.round(map.victoryXp * map.xpScale);
      break;
    case 'defeat':
      xp = Math.floor(
        map.victoryXp *
          map.xpScale *
          CAMPAIGN_BALANCE.rewards.defeatShare *
          Math.min(result.elapsed / map.durationSeconds, 1),
      );
      break;
    case 'abandoned':
      xp = 0;
      break;
    default:
      throw new TypeError(`Unknown run outcome: ${String(result.outcome)}.`);
  }
  const gold = runGold(result.outcome, map.id, result.coins ?? 0);
  // Task 39: a victory on a harder tier pays its whole Gold (coins + bonus) × the tier's scale.
  if (result.outcome === 'victory' && map.goldScale !== 1) {
    const total = Math.round(gold.total * map.goldScale);
    return Object.freeze({ xp, gold: total, coins: gold.coins, bonus: total - gold.coins });
  }
  return Object.freeze({ xp, gold: gold.total, coins: gold.coins, bonus: gold.bonus });
}
