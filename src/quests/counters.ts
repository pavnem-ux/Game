import { CAMPAIGN_MAPS } from '../campaign/config';
import { SYNERGY_RULES } from '../skills/synergies';
import type { ActivityType } from '../gameplay/activities';

/**
 * Task 21 lifetime quest counters (stored in the profile). Total kills stay in `stats.enemiesKilled`
 * (Task 08). Everything here only grows: run counters are added once per finalized run (the run-ID
 * de-duplication of `applyRunResult`), `bestTierLoadout` after gear actions.
 */
export interface QuestCounters {
  readonly killsByType: Readonly<{ swift: number; brute: number; bombard: number }>;
  readonly eliteKills: number;
  /** Map ids whose boss was defeated (each map has its own boss) — distinct, ascending. */
  readonly bossesDefeated: readonly number[];
  readonly chestsOpened: number;
  /** Synergy ids opened (level ≥ 1) / awakened (level 3) in any finalized run — distinct, sorted. */
  readonly synergiesOpened: readonly string[];
  readonly synergiesAwakened: readonly string[];
  /** Most tier-4+ items one class has worn at once (forge quest; never decreases). */
  readonly bestTierLoadout: number;
  /** Task 24: map activities completed, by type (lifetime; retroactively 0 for older saves). */
  readonly activities: ActivityCounts;
}
export type ActivityCounts = Readonly<Record<ActivityType, number>>;
export const NO_ACTIVITY_COUNTS: ActivityCounts = Object.freeze({
  shrine: 0,
  lantern: 0,
  thief: 0,
  nest: 0,
});
export const ACTIVITY_COUNTER_TYPES: readonly ActivityType[] = Object.freeze([
  'shrine',
  'lantern',
  'thief',
  'nest',
]);
export const NO_QUEST_COUNTERS: QuestCounters = Object.freeze({
  killsByType: Object.freeze({ swift: 0, brute: 0, bombard: 0 }),
  eliteKills: 0,
  bossesDefeated: Object.freeze([]),
  chestsOpened: 0,
  synergiesOpened: Object.freeze([]),
  synergiesAwakened: Object.freeze([]),
  bestTierLoadout: 0,
  activities: NO_ACTIVITY_COUNTS,
});
/** What one finalized run adds (built from the world snapshot by the UI; validated). */
export interface RunQuestSummary {
  readonly killsByType: Readonly<{ swift: number; brute: number; bombard: number }>;
  readonly chestsOpened: number;
  readonly synergiesOpened: readonly string[];
  readonly synergiesAwakened: readonly string[];
  /** Task 24: activities completed in this run, by type (absent in older summaries = none). */
  readonly activities?: ActivityCounts;
}
export const SYNERGY_IDS: ReadonlySet<string> = new Set(SYNERGY_RULES.map((r) => r.id));
const whole = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
/** Throws on an invalid run summary (unknown synergies, negative or fractional counts). */
export function validateRunQuestSummary(raw: unknown): RunQuestSummary {
  const fail = (what: string): never => {
    throw new RangeError(`Invalid quest summary: ${what}.`);
  };
  if (!raw || typeof raw !== 'object') fail('object');
  const v = raw as Record<string, unknown>;
  const k = (v.killsByType ?? fail('killsByType')) as Record<string, unknown>;
  for (const t of ['swift', 'brute', 'bombard']) if (!whole(k[t])) fail(`killsByType.${t}`);
  if (!whole(v.chestsOpened)) fail('chestsOpened');
  const ids = (list: unknown, what: string) => {
    if (!Array.isArray(list) || list.some((id) => !SYNERGY_IDS.has(id as string))) fail(what);
    return Object.freeze([...new Set(list as string[])].sort());
  };
  const opened = ids(v.synergiesOpened, 'synergiesOpened');
  const awakened = ids(v.synergiesAwakened, 'synergiesAwakened');
  if (awakened.some((id) => !opened.includes(id))) fail('awakened ⊄ opened');
  let activities: ActivityCounts | undefined;
  if (v.activities !== undefined) {
    const a = v.activities as Record<string, unknown>;
    if (!a || typeof a !== 'object') fail('activities');
    for (const t of ACTIVITY_COUNTER_TYPES) if (!whole(a[t])) fail(`activities.${t}`);
    activities = Object.freeze(
      Object.fromEntries(ACTIVITY_COUNTER_TYPES.map((t) => [t, a[t] as number])),
    ) as ActivityCounts;
  }
  return Object.freeze({
    killsByType: Object.freeze({
      swift: k.swift as number,
      brute: k.brute as number,
      bombard: k.bombard as number,
    }),
    chestsOpened: v.chestsOpened as number,
    synergiesOpened: opened,
    synergiesAwakened: awakened,
    ...(activities ? { activities } : {}),
  });
}
const union = (a: readonly string[], b: readonly string[]) =>
  Object.freeze([...new Set([...a, ...b])].sort());
/**
 * Adds one finalized run to the counters (pure). Abandoned runs add nothing (like the Task 08 kill
 * statistics); the boss counts once per map.
 */
export function addRunToCounters(
  c: QuestCounters,
  run: Readonly<{
    outcome: 'victory' | 'defeat' | 'abandoned';
    mapId: number;
    eliteKills: number;
    bossKilled: boolean;
    quest?: RunQuestSummary;
  }>,
): QuestCounters {
  if (run.outcome === 'abandoned') return c;
  const s = run.quest;
  const bosses =
    run.bossKilled && !c.bossesDefeated.includes(run.mapId)
      ? Object.freeze([...c.bossesDefeated, run.mapId].sort((a, b) => a - b))
      : c.bossesDefeated;
  return Object.freeze({
    killsByType: Object.freeze({
      swift: c.killsByType.swift + (s?.killsByType.swift ?? 0),
      brute: c.killsByType.brute + (s?.killsByType.brute ?? 0),
      bombard: c.killsByType.bombard + (s?.killsByType.bombard ?? 0),
    }),
    eliteKills: c.eliteKills + run.eliteKills,
    bossesDefeated: bosses,
    chestsOpened: c.chestsOpened + (s?.chestsOpened ?? 0),
    synergiesOpened: s ? union(c.synergiesOpened, s.synergiesOpened) : c.synergiesOpened,
    synergiesAwakened: s ? union(c.synergiesAwakened, s.synergiesAwakened) : c.synergiesAwakened,
    bestTierLoadout: c.bestTierLoadout,
    activities: s?.activities
      ? (Object.freeze(
          Object.fromEntries(
            ACTIVITY_COUNTER_TYPES.map((t) => [t, c.activities[t] + s.activities![t]]),
          ),
        ) as ActivityCounts)
      : c.activities,
  });
}
export const MAP_COUNT = CAMPAIGN_MAPS.length;
