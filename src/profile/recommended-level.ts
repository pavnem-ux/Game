import { CAMPAIGN_MAPS, getCampaignMap } from '../campaign';
import { NEW_CLASS_PROGRESS, addClassXp } from './class-xp';

/**
 * Task 10 §1.4 «Recommended level» (pure): the permanent class level reached by clearing maps
 * 1 … (mapId − 1) once each with their victory XP, from level 1, on the existing XP curve
 * (`addClassXp`). Map 1 → 1. Values are cached once (the inputs are static config).
 */
const LEVELS: readonly number[] = (() => {
  const levels = [1];
  let progress = NEW_CLASS_PROGRESS;
  for (const map of CAMPAIGN_MAPS.slice(0, -1)) {
    progress = addClassXp(progress, map.victoryXp).progress;
    levels.push(progress.level);
  }
  return Object.freeze(levels);
})();
export function recommendedLevel(mapId: number): number {
  getCampaignMap(mapId); // validates the id
  return LEVELS[mapId - 1];
}
/** The level after clearing every map once (for docs/tests). */
export function levelAfterAllMaps(): number {
  let progress = NEW_CLASS_PROGRESS;
  for (const map of CAMPAIGN_MAPS) progress = addClassXp(progress, map.victoryXp).progress;
  return progress.level;
}
