import { CHARACTER_CLASSES } from '../character-stats';
import { findItem } from '../equipment/items';
import { GEAR_SLOTS } from '../equipment/config';
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
  readonly classes: Readonly<Record<string, Readonly<{ level: number; loadout: Loadout }>>>;
  readonly stats: Readonly<{ enemiesKilled: number }>;
  readonly ownedItems: readonly string[];
  readonly itemLevels: Readonly<Record<string, number>>;
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
/** Tier-4+ items one loadout wears (starter weapons are tier 0). */
export function tierItemsWorn(loadout: Loadout, tier = 4): number {
  let n = 0;
  for (const slot of GEAR_SLOTS) {
    const id = loadout[slot];
    const item = id ? findItem(id) : null;
    if (item && item.tier >= tier) n++;
  }
  return n;
}
/** The best tier-4+ loadout of the profile right now (any class). */
export function bestTierLoadoutNow(p: Pick<QuestProfileView, 'classes'>): number {
  return Math.max(0, ...CHARACTER_CLASSES.map((c) => tierItemsWorn(p.classes[c].loadout)));
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
    case 'item-level':
      return {
        current: Math.max(0, ...Object.values(p.itemLevels)),
        target: goal.level,
      };
    case 'tier-loadout':
      return {
        current: Math.max(c.bestTierLoadout, bestTierLoadoutNow(p)),
        target: goal.items,
      };
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
export const allQuestProgress = (p: QuestProfileView): readonly QuestProgress[] =>
  Object.freeze(QUESTS.map((quest) => questProgress(p, quest)));
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
/** What a claim gives now: Gold (incl. owned-reward fallbacks), ore, the item / pet unlocked. */
export interface QuestPayout {
  readonly gold: number;
  readonly ore: number;
  readonly item: string | null;
  readonly pet: string | null;
  /** Gold paid instead of an already-owned item / pet. */
  readonly fallbackGold: number;
}
export function questPayout(
  p: Pick<QuestProfileView, 'ownedItems' | 'ownedPets'>,
  quest: QuestDefinition,
): QuestPayout {
  const r = quest.reward;
  let fallbackGold = 0;
  let item: string | null = null;
  let pet: string | null = null;
  if (r.item) {
    if (p.ownedItems.includes(r.item)) fallbackGold += findItem(r.item)!.price;
    else item = r.item;
  }
  if (r.pet) {
    if (p.ownedPets.includes(r.pet)) {
      const source = PET_CONFIG[r.pet].source;
      fallbackGold += source.kind === 'shop' ? source.price : QUEST_PET_FALLBACK_GOLD;
    } else pet = r.pet;
  }
  return Object.freeze({
    gold: (r.gold ?? 0) + fallbackGold,
    ore: r.ore ?? 0,
    item,
    pet,
    fallbackGold,
  });
}
/** Claims a completed quest once: rewards and the claim mark in one new profile view. */
export function claimQuest<P extends QuestProfileView>(p: P, questId: string): P {
  const quest = QUEST_BY_ID.get(questId);
  if (!quest) throw new QuestError('unknown');
  const progress = questProgress(p, quest);
  if (progress.state === 'claimed') throw new QuestError('claimed');
  if (progress.state !== 'complete') throw new QuestError('incomplete');
  const pay = questPayout(p, quest);
  return Object.freeze({
    ...p,
    gold: p.gold + pay.gold,
    ore: p.ore + pay.ore,
    ownedItems: pay.item ? Object.freeze([...p.ownedItems, pay.item]) : p.ownedItems,
    ownedPets: pay.pet ? Object.freeze([...p.ownedPets, pay.pet]) : p.ownedPets,
    questsClaimed: Object.freeze([...p.questsClaimed, questId]),
  });
}
/** After a gear action: keeps the best tier-4+ loadout ever worn (the counter never decreases). */
export function withLoadoutCounter<P extends QuestProfileView>(p: P): P {
  const now = bestTierLoadoutNow(p);
  const c = p.questCounters ?? NO_QUEST_COUNTERS;
  return now > c.bestTierLoadout
    ? Object.freeze({ ...p, questCounters: Object.freeze({ ...c, bestTierLoadout: now }) })
    : p;
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
    if (!r.gold && !r.ore && !r.item && !r.pet) throw new Error(`Quest ${quest.id}: no reward.`);
    for (const v of [r.gold, r.ore])
      if (v !== undefined && !positive(v)) throw new Error(`Quest ${quest.id}: reward amount.`);
    if (r.item && (!findItem(r.item) || findItem(r.item)!.starter))
      throw new Error(`Quest ${quest.id}: unknown item.`);
    if (r.pet && !(r.pet in PET_CONFIG)) throw new Error(`Quest ${quest.id}: unknown pet.`);
  }
}
validateQuestConfig();
