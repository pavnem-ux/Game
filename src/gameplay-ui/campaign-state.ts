import type { CharacterClass } from '../character-stats';
import { getCampaignMap } from '../campaign';
import { isMapUnlocked } from '../profile';
import { createProgressionService, createSaveStore, generateRunId } from '../persistence';
import type { CommitResult, ProgressionService, ProgressionState } from '../persistence';
import type { GameplaySnapshot } from '../gameplay';
import type { RunResult } from '../profile';
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
  /** Commit result of the latest finished campaign run (results screen). */
  readonly lastResult: Readonly<{ runId: string; result: RunResult; commit: CommitResult }> | null;
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
