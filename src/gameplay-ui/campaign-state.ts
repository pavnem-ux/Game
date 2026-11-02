import type { CharacterClass } from '../character-stats';
import { getCampaignMap } from '../campaign';
import { isMapUnlocked } from '../profile';
import { createProgressionService, createSaveStore, generateRunId } from '../persistence';
import type { ProgressionService, ProgressionState } from '../persistence';
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
    });
    service.subscribe((progression) => update({ progression }));
  }
  return state!;
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
