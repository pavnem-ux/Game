import type { Loadout } from '../equipment/logic';
import { PET_CONFIG } from '../pets/config';
import { QUESTS, QUEST_BY_ID, QUEST_PET_FALLBACK_GOLD } from './config';
import type { QuestDefinition, QuestGoal } from './config';
import { MAP_COUNT, NO_ACTIVITY_COUNTS, NO_QUEST_COUNTERS } from './counters';
import type { QuestCounters } from './counters';

/**
 * Task 21 pure quest evaluation and claiming. Reads only a structural view of the profile (no
 * storage, no UI); `claimQuest` returns the new profile view (Gold, ore, items, pets and the claim
 * in ONE change) or throws `QuestError` with the profile unchanged.
 */
export interface QuestProfileView {
  readonly gold: number;
  readonly ore: number;
  readonly completedMaps: readonly number[];
  readonly classes: Readonly<
    Record<
      string,
      Readonly<{ level: number; loadout: Loadout; slotLevels?: Readonly<Record<string, number>> }>
    >
  >;
  readonly stats: Readonly<{ enemiesKilled: number }>;
  readonly ownedPets: readonly string[];
  readonly questCounters: QuestCounters;
  readonly questsClaimed: readonly string[];
}
export type QuestState = 'in-progress' | 'complete' | 'claimed';
export interface QuestProgress {
  readonly quest: QuestDefinition;
  readonly current: number;
  readonly target: number;
  readonly state: QuestState;
}
/**
 * Tier-4+ items one OLD (pre-Task 40) loadout wore — legacy save migration v6 → v7 only. Old item
 * ids were `<template>-t<tier>` (starter weapons tier 0).
 */
export function legacyTierItemsWorn(loadout: Readonly<Record<string, unknown>>, tier = 4): number {
  let n = 0;
  for (const id of Object.values(loadout)) {
    const m = typeof id === 'string' ? /-t([1-5])$/.exec(id) : null;
    if (m && Number(m[1]) >= tier) n++;
  }
  return n;
}
function measure(p: QuestProfileView, goal: QuestGoal): { current: number; target: number } {
  const c = p.questCounters ?? NO_QUEST_COUNTERS;
  switch (goal.kind) {
    case 'map-win':
      return { current: p.completedMaps.includes(goal.mapId) ? 1 : 0, target: 1 };
    case 'kills':
      return { current: p.stats.enemiesKilled, target: goal.count };
    case 'type-kills':
      return {
        current: goal.type === 'elite' ? c.eliteKills : c.killsByType[goal.type],
        target: goal.count,
      };
    case 'bosses':
      return { current: c.bossesDefeated.length, target: goal.count };
    case 'class-level':
      return { current: p.classes[goal.characterClass].level, target: goal.level };
    case 'synergies-opened':
      return { current: c.synergiesOpened.length, target: goal.count };
    case 'synergies-awakened':
      return { current: c.synergiesAwakened.length, target: goal.count };
    case 'chests':
      return { current: c.chestsOpened, target: goal.count };
    // Task 41: the highest slot upgrade of any class (slot levels never drop).
    case 'slot-level':
      return {
        current: Math.max(
          0,
          ...Object.values(p.classes).flatMap((c) => Object.values(c.slotLevels ?? {})),
        ),
        target: goal.level,
      };
    case 'tier-loadout':
      return { current: Math.min(c.bestTierLoadout, goal.items), target: goal.items };
    case 'activities':
      return { current: (c.activities ?? NO_ACTIVITY_COUNTS)[goal.activity], target: goal.count };
  }
}
export function questProgress(p: QuestProfileView, quest: QuestDefinition): QuestProgress {
  const { current, target } = measure(p, quest.goal);
  const state: QuestState = p.questsClaimed.includes(quest.id)
    ? 'claimed'
    : current >= target
      ? 'complete'
      : 'in-progress';
  return Object.freeze({ quest, current: Math.min(current, target), target, state });
}
/** Visible quests only (Task 40: the hidden Forge quests are left out). */
export const allQuestProgress = (p: QuestProfileView): readonly QuestProgress[] =>
  Object.freeze(QUESTS.filter((q) => !q.hidden).map((quest) => questProgress(p, quest)));
/** Quests completed but not yet claimed (hub badge). */
export const claimableQuests = (p: QuestProfileView): readonly string[] =>
  allQuestProgress(p)
    .filter((q) => q.state === 'complete')
    .map((q) => q.quest.id);

export type QuestBlock = 'unknown' | 'incomplete' | 'claimed';
export class QuestError extends Error {
  constructor(readonly reason: QuestBlock) {
    super(`Quest claim refused: ${reason}.`);
    this.name = 'QuestError';
  }
}
/** What a claim gives now: Gold (incl. the owned-pet fallback), ore, the pet unlocked. */
export interface QuestPayout {
  readonly gold: number;
  readonly ore: number;
  readonly pet: string | null;
  /** Gold paid instead of an already-owned pet. */
  readonly fallbackGold: number;
}
export function questPayout(
  p: Pick<QuestProfileView, 'ownedPets'>,
  quest: QuestDefinition,
): QuestPayout {
  const r = quest.reward;
  let fallbackGold = 0;
  let pet: string | null = null;
  if (r.pet) {
    if (p.ownedPets.includes(r.pet)) {
      const source = PET_CONFIG[r.pet].source;
      fallbackGold += source.kind === 'shop' ? source.price : QUEST_PET_FALLBACK_GOLD;
    } else pet = r.pet;
  }
  return Object.freeze({
    gold: (r.gold ?? 0) + fallbackGold,
    ore: r.ore ?? 0,
    pet,
    fallbackGold,
  });
}
/** Claims a completed quest once: rewards and the claim mark in one new profile view. */
export function claimQuest<P extends QuestProfileView>(p: P, questId: string): P {
  const quest = QUEST_BY_ID.get(questId);
  if (!quest || quest.hidden) throw new QuestError('unknown');
  const progress = questProgress(p, quest);
  if (progress.state === 'claimed') throw new QuestError('claimed');
  if (progress.state !== 'complete') throw new QuestError('incomplete');
  const pay = questPayout(p, quest);
  return Object.freeze({
    ...p,
    gold: p.gold + pay.gold,
    ore: p.ore + pay.ore,
    ownedPets: pay.pet ? Object.freeze([...p.ownedPets, pay.pet]) : p.ownedPets,
    questsClaimed: Object.freeze([...p.questsClaimed, questId]),
  });
}
/**
 * After a gear action. Task 40: the old tier-4+ loadout counter no longer grows (no tiers); kept as
 * an identity so the call sites stay until Tasks 41–42 retarget the Forge quests.
 */
export function withLoadoutCounter<P extends QuestProfileView>(p: P): P {
  return p;
}

/** Number of quests: Task 21's 50 + Task 24's 8 activity quests. */
export const QUEST_COUNT = 58;
/** Startup validation of the catalogue: 58 unique quests, valid goals and rewards. */
export function validateQuestConfig(list: readonly QuestDefinition[] = QUESTS): void {
  if (list.length !== QUEST_COUNT)
    throw new Error(`Quest catalogue must have ${QUEST_COUNT} quests (${list.length}).`);
  const ids = new Set<string>();
  for (const quest of list) {
    if (ids.has(quest.id)) throw new Error(`Duplicate quest ${quest.id}.`);
    ids.add(quest.id);
    if (!quest.title.trim()) throw new Error(`Quest ${quest.id} needs a title.`);
    const g = quest.goal;
    const positive = (v: number) => Number.isSafeInteger(v) && v > 0;
    if (g.kind === 'map-win' && !(positive(g.mapId) && g.mapId <= MAP_COUNT))
      throw new Error(`Quest ${quest.id}: unknown map.`);
    if ('count' in g && !positive(g.count)) throw new Error(`Quest ${quest.id}: count.`);
    if (g.kind === 'class-level' && !(positive(g.level) && g.level <= 50))
      throw new Error(`Quest ${quest.id}: level.`);
    const r = quest.reward;
    if (!r.gold && !r.ore && !r.pet) throw new Error(`Quest ${quest.id}: no reward.`);
    for (const v of [r.gold, r.ore])
      if (v !== undefined && !positive(v)) throw new Error(`Quest ${quest.id}: reward amount.`);
    if (r.pet && !(r.pet in PET_CONFIG)) throw new Error(`Quest ${quest.id}: unknown pet.`);
  }
}
validateQuestConfig();
