import { claimQuest, withLoadoutCounter } from '../quests/logic';
import type { PlayerProfile } from './profile';

/**
 * Task 21 profile-level quest actions (pure). The caller saves the returned profile once
 * (validated save = one atomic change). `claimProfileQuest` throws QuestError, profile unchanged.
 */
export const claimProfileQuest = (p: PlayerProfile, questId: string): PlayerProfile =>
  claimQuest(p, questId);
/** After gear actions: the best tier-4+ loadout ever worn only grows. */
export const withProfileLoadoutCounter = (p: PlayerProfile): PlayerProfile => withLoadoutCounter(p);
