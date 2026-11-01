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
