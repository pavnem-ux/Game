import type { CombatAttributes } from '../character-stats';
import { CAMPAIGN_BALANCE } from './config';
import type { CampaignMap, DifficultyMultipliers, StageId } from './config';

/**
 * Task 08 run timer: pure functions over **simulation** time (the GameplayWorld clock). The world
 * clock does not advance during manual pause, level-up choices or the revival prompt, so neither
 * does the campaign timer. No wall-clock time is ever read here.
 */
export interface CampaignStage {
  readonly id: StageId;
  readonly name: string;
  readonly index: number;
  /** Absolute simulation-second boundaries of this stage. */
  readonly start: number;
  readonly end: number;
}
export interface RunClock {
  readonly elapsed: number;
  readonly duration: number;
  readonly remaining: number;
  readonly durationReached: boolean;
  readonly stage: CampaignStage;
}

/** Stage boundaries for a map, relative to its duration (the boss phase runs past the end). */
export function stageBoundaries(durationSeconds: number): readonly CampaignStage[] {
  const stages = CAMPAIGN_BALANCE.stages;
  return Object.freeze(
    stages.map((stage, index) =>
      Object.freeze({
        id: stage.id,
        name: stage.name,
        index,
        start: stage.start * durationSeconds,
        end: index + 1 < stages.length ? stages[index + 1].start * durationSeconds : Infinity,
      }),
    ),
  );
}
export function stageAt(elapsed: number, durationSeconds: number): CampaignStage {
  const all = stageBoundaries(durationSeconds);
  let current = all[0];
  for (const stage of all) if (elapsed >= stage.start) current = stage;
  return current;
}
export function runClock(map: CampaignMap, elapsed: number): RunClock {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Invalid elapsed time.');
  const duration = map.durationSeconds;
  return Object.freeze({
    elapsed,
    duration,
    remaining: Math.max(0, duration - elapsed),
    durationReached: elapsed >= duration,
    stage: stageAt(elapsed, duration),
  });
}

/**
 * Spawner settings for a map, applied through the existing spawner: spawn rate ×m divides the
 * wave interval (and its floor), the ranged share may be overridden per map, and a few alpha
 * enemy slots stay reserved for scheduled elites and the boss.
 */
export function campaignSpawning(
  map: CampaignMap,
  base: {
    readonly interval: number;
    readonly minimumInterval: number;
    readonly rangedShare: number;
  },
  enemyCap: number,
) {
  const rate = map.difficulty.spawnRate;
  const minimumInterval = Math.max(0.25, base.minimumInterval / rate);
  return Object.freeze({
    interval: Math.max(minimumInterval, base.interval / rate),
    minimumInterval,
    rangedShare: map.rangedShare ?? base.rangedShare,
    maxActive: enemyCap - CAMPAIGN_BALANCE.reservedSlots,
  });
}

/** Scales enemy HP and damage attributes; every other attribute (and its caps) is untouched. */
export function scaleEnemyStats(
  base: CombatAttributes,
  multipliers: Pick<DifficultyMultipliers, 'hp' | 'damage'>,
): CombatAttributes {
  return Object.freeze({
    ...base,
    maxHp: base.maxHp * multipliers.hp,
    physicalDamage: base.physicalDamage * multipliers.damage,
    magicalDamage: base.magicalDamage * multipliers.damage,
  });
}
