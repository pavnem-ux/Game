import { getCampaignMap } from '../campaign';
import type { GameplaySnapshot, RunStatsSnapshot } from '../gameplay';
import { parseProfile } from '../persistence';
import type { PlayerProfile } from '../profile';
import type { ErrorEntry } from './error-log';

/**
 * Task 08.5 §3.3 bug report (framework-free, pure). Everything a playtester's report needs to
 * reproduce a problem; the save is embedded only after the normal save validation.
 */
export const REPORT_FORMAT = 'skazki-report';
export const REPORT_FORMAT_VERSION = 1;
export interface BugReportRun {
  readonly runId: string | null;
  readonly seed: number;
  readonly mapId: number | null;
  readonly mapName: string | null;
  readonly characterClass: string;
  readonly permanentLevel: number;
  readonly runLevel: number;
  /** Simulation seconds elapsed in the run. */
  readonly time: number;
  readonly status: string;
  readonly screen: string;
  readonly kills: number;
  readonly stats: RunStatsSnapshot;
  /** Task 12: chest buffs active when the report was made (remaining seconds). */
  readonly activeBuffs: readonly Readonly<{ id: string; name: string; remaining: number }>[];
}
export interface BugReport {
  readonly format: typeof REPORT_FORMAT;
  readonly formatVersion: typeof REPORT_FORMAT_VERSION;
  readonly createdAt: string;
  readonly build: Readonly<{ version: string; commit: string; label: string }>;
  readonly userAgent: string;
  /** null when the report is made outside a run (e.g. from the crash screen in the menu). */
  readonly run: BugReportRun | null;
  readonly errors: readonly ErrorEntry[];
  readonly save:
    | Readonly<{ ok: true; profile: PlayerProfile }>
    | Readonly<{ ok: false; error: string }>;
}
export interface ReportInput {
  readonly createdAt: string;
  readonly build: BugReport['build'];
  readonly userAgent: string;
  readonly world: GameplaySnapshot | null;
  readonly screen: string;
  readonly profile: PlayerProfile | null;
  readonly errors: readonly ErrorEntry[];
}

export function buildBugReport(input: ReportInput): BugReport {
  const w = input.world;
  const campaign = w?.campaign ?? null;
  const checked = input.profile ? parseProfile(input.profile) : null;
  return Object.freeze({
    format: REPORT_FORMAT,
    formatVersion: REPORT_FORMAT_VERSION,
    createdAt: input.createdAt,
    build: input.build,
    userAgent: input.userAgent,
    run: w
      ? Object.freeze({
          runId: campaign?.runId ?? null,
          seed: w.seed,
          mapId: campaign?.mapId ?? null,
          mapName: campaign ? getCampaignMap(campaign.mapId).name : null,
          characterClass: w.character.characterClass,
          permanentLevel: w.character.permanentLevel,
          runLevel: w.progression.level,
          time: w.time,
          status: campaign?.status ?? 'sandbox',
          screen: input.screen,
          kills: w.kills,
          stats: w.runStats,
          activeBuffs: Object.freeze(
            (w.chests?.buffs ?? []).map((b) =>
              Object.freeze({ id: b.id, name: b.name, remaining: b.remaining }),
            ),
          ),
        })
      : null,
    errors: input.errors,
    save: checked?.ok
      ? Object.freeze({ ok: true as const, profile: checked.profile })
      : Object.freeze({
          ok: false as const,
          error: checked ? checked.error.code : 'no-profile',
        }),
  });
}
/** `skazki-report-YYYY-MM-DD-HHMM.json` (UTC, like the save export file name). */
export function reportFilename(isoNow: string): string {
  const t = Date.parse(isoNow);
  if (Number.isNaN(t)) throw new TypeError('A report needs an ISO timestamp.');
  const iso = new Date(t).toISOString();
  return `skazki-report-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}.json`;
}
