import type { CharacterClass } from '../character-stats';
import { CAMPAIGN_BALANCE, getCampaignMap } from '../campaign';

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
const SOURCE_ID = /^[a-z]+(:[a-z0-9_-]+)?$/;
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
  readonly gold: number;
}

export function runRewards(result: Pick<RunResult, 'mapId' | 'outcome' | 'elapsed'>): RunRewards {
  const map = getCampaignMap(result.mapId);
  if (!Number.isFinite(result.elapsed) || result.elapsed < 0)
    throw new RangeError('elapsed must be a finite, non-negative number of seconds.');
  switch (result.outcome) {
    case 'victory':
      return Object.freeze({ xp: map.victoryXp, gold: map.victoryGold });
    case 'defeat': {
      const share =
        CAMPAIGN_BALANCE.rewards.defeatShare * Math.min(result.elapsed / map.durationSeconds, 1);
      return Object.freeze({
        xp: Math.floor(map.victoryXp * share),
        gold: Math.floor(map.victoryGold * share),
      });
    }
    case 'abandoned':
      return Object.freeze({ xp: 0, gold: 0 });
    default:
      throw new TypeError(`Unknown run outcome: ${String(result.outcome)}.`);
  }
}
