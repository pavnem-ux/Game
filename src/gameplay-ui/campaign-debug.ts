import type { CharacterClass } from '../character-stats';
import { CAMPAIGN_MAPS } from '../campaign';
import { BACKUP_KEY, QUARANTINE_KEY, SAVE_KEY, createSaveStore } from '../persistence';
import { NEW_CLASS_PROGRESS, addClassXp, createProfile } from '../profile';
import type { PlayerProfile } from '../profile';
import { campaignStore } from './campaign-state';

/**
 * Task 08 profile debug tools. Imported only by the DEV/QA DeveloperPanel (lazy, gated), so none
 * of this is reachable in production. Every change goes through the validated save path
 * (`replaceProfile`), so a debug edit can never write an invalid profile.
 */
function edit(change: (p: PlayerProfile) => PlayerProfile): boolean {
  const profile = campaignStore.getSnapshot().progression.profile;
  if (!profile) return false;
  return campaignStore.service().replaceProfile(change(profile)).ok;
}
export const campaignDebug = {
  unlockMaps(upTo = CAMPAIGN_MAPS.length) {
    return edit((p) => ({
      ...p,
      highestUnlockedMap: Math.max(p.highestUnlockedMap, Math.min(CAMPAIGN_MAPS.length, upTo)),
    }));
  },
  setClassLevel(characterClass: CharacterClass, level: number) {
    const toReach = Array.from({ length: level - 1 }, (_, i) => 100 + 50 * i).reduce(
      (a, b) => a + b,
      0,
    );
    return edit((p) => ({
      ...p,
      classes: {
        ...p.classes,
        [characterClass]: addClassXp(NEW_CLASS_PROGRESS, toReach).progress,
      },
    }));
  },
  grantXp(characterClass: CharacterClass, amount: number) {
    return edit((p) => ({
      ...p,
      classes: {
        ...p.classes,
        [characterClass]: addClassXp(p.classes[characterClass], amount).progress,
      },
    }));
  },
  grantGold(amount: number) {
    return edit((p) => ({ ...p, gold: p.gold + amount }));
  },
  /** Removes the profile, backup and quarantine, then starts a fresh test profile. */
  resetProgress() {
    createSaveStore().clearForDev();
    const now = new Date().toISOString();
    return campaignStore.service().replaceProfile(createProfile(`dev-${Date.now()}`, now)).ok;
  },
  /** Read-only view of the stored keys (inspection only). */
  inspectSave(): string {
    try {
      const read = (k: string) => localStorage.getItem(k);
      const main = read(SAVE_KEY);
      return [
        `${SAVE_KEY}: ${main ? `${main.length} B` : '—'}`,
        `${BACKUP_KEY}: ${read(BACKUP_KEY) ? 'есть' : '—'}`,
        `${QUARANTINE_KEY}: ${read(QUARANTINE_KEY) ? 'есть' : '—'}`,
        '',
        main ? JSON.stringify(JSON.parse(main), null, 2) : '',
      ].join('\n');
    } catch {
      return 'Хранилище недоступно.';
    }
  },
};
