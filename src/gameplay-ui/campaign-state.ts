import type { CharacterClass } from '../character-stats';
import { getCampaignMap } from '../campaign';
import { isMapUnlocked } from '../profile';
import {
  createProgressionService,
  createSaveStore,
  exportProfile,
  generateRunId,
  prepareImport,
} from '../persistence';
import type { PlayerProfile } from '../profile';
import { LOAD_ERROR_TEXT, SAVE_FAILURE_TEXT } from './save-messages';
import type { CommitResult, ProgressionService, ProgressionState } from '../persistence';
import type { GameplaySnapshot, RunStatsSnapshot } from '../gameplay';
import type { RunResult, RunStatsSummary } from '../profile';
import { RUN_STATS_SUMMARY_LIMITS } from '../profile';
import { alphaBridge } from './store';

/**
 * Task 08 campaign UI state (framework-free). Owns the progression service, menu navigation and
 * the selected class/map. React components only read this state and call these actions; all
 * reward, save and scheduling logic lives in the campaign/profile/persistence modules.
 */
export type MenuPage = 'play' | 'character' | 'maps' | 'progression' | 'settings';
export interface CampaignUiState {
  readonly page: MenuPage;
  readonly selectedMapId: number;
  readonly progression: ProgressionState;
  /** Validated import waiting for the player's confirmation (nothing replaced yet). */
  readonly pendingImport: Readonly<{ profile: PlayerProfile; fileName: string }> | null;
  /** Last save-management message for the player (null = none). */
  readonly saveMessage: Readonly<{ tone: 'ok' | 'error'; text: string }> | null;
  /** Commit result of the latest finished campaign run (results screen). */
  readonly lastResult: Readonly<{ runId: string; result: RunResult; commit: CommitResult }> | null;
}

/** Task 08.5: the persisted part of the in-memory run statistics (whole-number damage). */
export function summarizeRunStats(stats: RunStatsSnapshot): RunStatsSummary {
  return Object.freeze({
    damageDealt: Math.round(stats.damageDealt),
    damageTaken: Math.round(stats.damageTaken),
    topSources: Object.freeze(
      stats.bySource
        .slice(0, RUN_STATS_SUMMARY_LIMITS.topSources)
        .map((s) => Object.freeze({ source: s.source, damage: Math.round(s.damage) })),
    ),
    deathTime: stats.deathTime,
    reviveUsed: stats.reviveUsed,
    lowHpMoments: stats.lowHpMoments,
  });
}
/** World snapshot → profile run result (elapsed capped at the map duration). */
export function runResultFrom(
  world: GameplaySnapshot,
  outcome?: RunResult['outcome'],
): RunResult | null {
  const c = world.campaign;
  if (!c || !c.runId) return null;
  const status = outcome ?? c.status;
  if (status === 'active') return null;
  return Object.freeze({
    runId: c.runId,
    mapId: c.mapId,
    characterClass: world.character.characterClass,
    outcome: status,
    elapsed: Math.min(c.resolvedAt ?? world.time, c.duration),
    kills: world.kills,
    eliteKills: c.eliteKills,
    bossKilled: c.bossKilled,
    runLevel: world.progression.level,
    stats: summarizeRunStats(world.runStats),
  });
}

let service: ProgressionService | null = null;
let state: CampaignUiState | null = null;
const listeners = new Set<() => void>();

function ensure(): CampaignUiState {
  if (!service) {
    service = createProgressionService(createSaveStore());
    const initial = service.getState();
    state = Object.freeze({
      page: 'play',
      selectedMapId: initial.profile?.highestUnlockedMap ?? 1,
      progression: initial,
      lastResult: null,
      pendingImport: null,
      saveMessage: null,
    });
    service.subscribe((progression) => update({ progression }));
    // Commit each resolved campaign run exactly once (also idempotent in applyRunResult).
    alphaBridge.subscribe(() => {
      const world = alphaBridge.getSnapshot().world;
      if (world) commitResolved(world);
    });
    // Reload/close during a run abandons it; commit that synchronously before the page goes away.
    globalThis.addEventListener?.('pagehide', () => {
      const world = alphaBridge.getSnapshot().world;
      if (world?.campaign?.status === 'active') commitResolved(world, 'abandoned');
    });
  }
  return state!;
}
const committed = new Set<string>();
function commitResolved(world: GameplaySnapshot, outcome?: RunResult['outcome']) {
  const result = runResultFrom(world, outcome);
  if (!result || committed.has(result.runId) || !service) return;
  if (!service.getState().profile) return; // load error: nothing may change
  committed.add(result.runId);
  const commit = service.commitRun(result, new Date().toISOString());
  update({ lastResult: Object.freeze({ runId: result.runId, result, commit }) });
}
function update(patch: Partial<CampaignUiState>) {
  state = Object.freeze({ ...ensure(), ...patch });
  listeners.forEach((fn) => fn());
}

export const campaignStore = {
  getSnapshot: (): CampaignUiState => ensure(),
  subscribe(fn: () => void) {
    ensure();
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  service(): ProgressionService {
    ensure();
    return service!;
  },
  setPage(page: MenuPage) {
    update({ page });
  },
  selectMap(mapId: number) {
    const profile = ensure().progression.profile;
    if (profile && isMapUnlocked(profile, mapId)) update({ selectedMapId: mapId });
  },
  selectClass(characterClass: CharacterClass) {
    campaignStore.service().selectClass(characterClass);
  },
  /**
   * Quit to the menu. An active campaign run is resolved as abandoned (no rewards) first; the
   * world, not the UI, decides the outcome. Finished runs just return to the menu.
   */
  quitToMenu() {
    const world = alphaBridge.getSnapshot().world;
    if (world?.campaign?.status === 'active') alphaBridge.send({ type: 'abandon' });
    update({ page: 'play' });
    alphaBridge.send({ type: 'menu' });
  },
  /** Export: validated profile → JSON download. Read-only; nothing is changed. */
  exportSave(): boolean {
    const profile = ensure().progression.profile;
    if (!profile) return false;
    const out = exportProfile(profile, new Date().toISOString());
    if (!out.ok) {
      update({ saveMessage: { tone: 'error', text: LOAD_ERROR_TEXT[out.error.code] } });
      return false;
    }
    try {
      const url = URL.createObjectURL(new Blob([out.json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = out.filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      update({ saveMessage: { tone: 'error', text: 'Не удалось скачать файл.' } });
      return false;
    }
    update({ saveMessage: { tone: 'ok', text: `Сохранение экспортировано: ${out.filename}` } });
    return true;
  },
  /** Import step 1: parse → validate → migrate. Nothing is replaced until confirmImport(). */
  stageImport(text: string, fileName: string) {
    const parsed = prepareImport(text);
    if (!parsed.ok)
      update({
        pendingImport: null,
        saveMessage: {
          tone: 'error',
          text: `Файл не импортирован: ${LOAD_ERROR_TEXT[parsed.error.code]} Текущее сохранение не изменено.`,
        },
      });
    else update({ pendingImport: { profile: parsed.profile, fileName }, saveMessage: null });
  },
  cancelImport() {
    update({ pendingImport: null, saveMessage: null });
  },
  /** Import step 2 (after confirmation): replace the profile; any failure changes nothing. */
  confirmImport() {
    const pending = ensure().pendingImport;
    if (!pending) return;
    const r = campaignStore.service().replaceProfile(pending.profile);
    update({
      pendingImport: null,
      selectedMapId: r.ok ? pending.profile.highestUnlockedMap : ensure().selectedMapId,
      saveMessage: r.ok
        ? { tone: 'ok', text: 'Сохранение импортировано.' }
        : {
            tone: 'error',
            text: `Импорт не выполнен: ${r.failure ? SAVE_FAILURE_TEXT[r.failure] : ''} Текущее сохранение не изменено.`,
          },
    });
  },
  retrySave() {
    const ok = campaignStore.service().retrySave();
    update({
      saveMessage: ok
        ? { tone: 'ok', text: 'Прогресс сохранён.' }
        : { tone: 'error', text: 'Сохранить всё ещё не удаётся.' },
    });
  },
  /** Starts a campaign run on an unlocked map with the class's permanent level. */
  startRun(mapId = ensure().selectedMapId, characterClass?: CharacterClass): boolean {
    const profile = ensure().progression.profile;
    if (!profile || !isMapUnlocked(profile, mapId)) return false;
    getCampaignMap(mapId);
    const cls = characterClass ?? profile.selectedClass;
    if (cls !== profile.selectedClass) campaignStore.service().selectClass(cls);
    update({ selectedMapId: mapId });
    alphaBridge.send({
      type: 'start',
      options: {
        characterClass: cls,
        level: profile.classes[cls].level,
        campaign: { mapId, runId: generateRunId() },
      },
    });
    return true;
  },
};
