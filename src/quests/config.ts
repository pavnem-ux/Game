import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import type { PetId } from '../pets/config';
import type { CountedActivityType } from './counters';

/**
 * Task 21 quest catalogue — data only. Every number is PROVISIONAL (owner-controlled).
 * Quests are permanent (no daily/timed quests): in progress → complete → reward claimed.
 * Every goal reads monotonic profile data (maps won, class levels, lifetime counters, item
 * levels, the best tier-4+ loadout ever worn), so a completed quest never becomes incomplete.
 */
export type QuestGroup =
  | 'campaign'
  | 'hunt'
  | 'types'
  | 'bosses'
  | 'mastery'
  | 'synergy'
  | 'chests'
  | 'forge'
  | 'activities';
export const QUEST_GROUPS: readonly QuestGroup[] = Object.freeze([
  'campaign',
  'hunt',
  'types',
  'bosses',
  'mastery',
  'synergy',
  'chests',
  'forge',
  'activities',
]);
export const QUEST_GROUP_LABELS: Readonly<Record<QuestGroup, string>> = Object.freeze({
  campaign: 'Campaign',
  hunt: 'Hunting',
  types: 'Enemy Types',
  bosses: 'Bosses',
  mastery: 'Mastery',
  synergy: 'Synergies',
  chests: 'Chests',
  forge: 'Forge',
  activities: 'Activities',
});
export type TypeCounter = 'swift' | 'brute' | 'bombard' | 'elite';
export type QuestGoal =
  | Readonly<{ kind: 'map-win'; mapId: number }>
  | Readonly<{ kind: 'kills'; count: number }>
  | Readonly<{ kind: 'type-kills'; type: TypeCounter; count: number }>
  | Readonly<{ kind: 'bosses'; count: number }>
  | Readonly<{ kind: 'class-level'; characterClass: CharacterClass; level: number }>
  | Readonly<{ kind: 'synergies-opened'; count: number }>
  | Readonly<{ kind: 'synergies-awakened'; count: number }>
  | Readonly<{ kind: 'chests'; count: number }>
  /** Task 41: any class's slot upgraded to this level (was the Task 19 item level). */
  | Readonly<{ kind: 'slot-level'; level: number }>
  | Readonly<{ kind: 'tier-loadout'; tier: number; items: number }>
  /** Task 24: map activities of one type completed (lifetime). */
  | Readonly<{ kind: 'activities'; activity: CountedActivityType; count: number }>;
export interface QuestReward {
  readonly gold?: number;
  readonly ore?: number;
  /** Pet to unlock (owned already → its shop price, quest-only pets 2000 Gold). */
  readonly pet?: PetId;
}
export interface QuestDefinition {
  readonly id: string;
  readonly group: QuestGroup;
  readonly title: string;
  readonly goal: QuestGoal;
  readonly reward: QuestReward;
  /**
   * Task 40: kept (ids, claims) but hidden and not claimable — the Forge quests can't be completed
   * in the new item model until Tasks 41–42 retarget them.
   */
  readonly hidden?: true;
}
/** Task 40: quest Gold rewards ×0.8 (rounded), with the map Gold (provisional). */
export const QUEST_GOLD_SCALE = 0.8;
/** Gold given instead of an already-owned quest-only pet. */
export const QUEST_PET_FALLBACK_GOLD = 2000;

const q = (
  id: string,
  group: QuestGroup,
  title: string,
  goal: QuestGoal,
  reward: QuestReward,
  hidden = false,
): QuestDefinition =>
  Object.freeze({
    id,
    group,
    title,
    goal: Object.freeze(goal),
    reward: Object.freeze({
      ...reward,
      ...(reward.gold !== undefined ? { gold: Math.round(reward.gold * QUEST_GOLD_SCALE) } : {}),
    }),
    ...(hidden ? { hidden: true as const } : {}),
  });
const CLASS_NAMES: Readonly<Record<CharacterClass, string>> = {
  warrior: 'Warrior',
  mage: 'Mage',
  archer: 'Archer',
  rogue: 'Rogue',
};
const fmt = (n: number) => n.toLocaleString('en-US');

const CAMPAIGN = [5, 10, 15, 20, 25, 30, 35, 40].map((mapId, i) => {
  const gold = [300, 600, 900, 1200, 1500, 1800, 2100, 2500][i];
  const ore = [10, 20, 30, 40, 50, 60, 70, 100][i];
  const extra: Partial<QuestReward> =
    mapId === 10 ? { pet: 'firefly' } : mapId === 40 ? { pet: 'wolf' } : {};
  return q(
    `campaign.map${mapId}`,
    'campaign',
    `Win on map ${mapId}`,
    { kind: 'map-win', mapId },
    { gold, ore, ...extra },
  );
});
const HUNT = [1000, 5000, 20000, 50000, 100000].map((count, i) =>
  q(
    `hunt.${count}`,
    'hunt',
    `Defeat ${fmt(count)} enemies`,
    { kind: 'kills', count },
    { gold: [200, 500, 1000, 2000, 4000][i], ore: [5, 15, 30, 60, 100][i] },
  ),
);
const TYPES = [
  q(
    'types.swift',
    'types',
    'Defeat 500 swift enemies',
    { kind: 'type-kills', type: 'swift', count: 500 },
    { gold: 400, ore: 15 },
  ),
  q(
    'types.brute',
    'types',
    'Defeat 300 brutes',
    { kind: 'type-kills', type: 'brute', count: 300 },
    { gold: 400, ore: 15 },
  ),
  q(
    'types.bombard',
    'types',
    'Defeat 300 bombards',
    { kind: 'type-kills', type: 'bombard', count: 300 },
    { gold: 400, ore: 15 },
  ),
  // 100 elites → the owlet (its shop price in Gold if already owned), plus the group's Gold + ore.
  q(
    'types.elite',
    'types',
    'Defeat 100 elite enemies',
    { kind: 'type-kills', type: 'elite', count: 100 },
    { gold: 400, ore: 15, pet: 'owlet' },
  ),
];
/** Ore of the 4th boss quest is not in the spec table (3 values for 4 quests): 100, provisional. */
const BOSSES = [5, 15, 30, 40].map((count, i) =>
  q(
    `bosses.${count}`,
    'bosses',
    `Defeat ${count} different bosses`,
    { kind: 'bosses', count },
    { gold: [1000, 2000, 3000, 5000][i], ore: [20, 50, 100, 100][i] },
  ),
);
const MASTERY = CHARACTER_CLASSES.flatMap((characterClass) =>
  [10, 20, 30, 40, 50].map((level, i) =>
    q(
      `mastery.${characterClass}.${level}`,
      'mastery',
      `${CLASS_NAMES[characterClass]}: level ${level}`,
      { kind: 'class-level', characterClass, level },
      { gold: [300, 600, 1000, 1500, 2500][i] },
    ),
  ),
);
const SYNERGY = [
  q(
    'synergy.open',
    'synergy',
    'Unlock any synergy',
    { kind: 'synergies-opened', count: 1 },
    { gold: 200 },
  ),
  q(
    'synergy.awaken',
    'synergy',
    'Awaken any synergy',
    { kind: 'synergies-awakened', count: 1 },
    { ore: 30 },
  ),
  q(
    'synergy.awaken6',
    'synergy',
    'Awaken 6 different synergies',
    { kind: 'synergies-awakened', count: 6 },
    { pet: 'fox' },
  ),
];
const CHESTS = [25, 100, 300].map((count, i) =>
  q(
    `chests.${count}`,
    'chests',
    `Open ${count} chests`,
    { kind: 'chests', count },
    { gold: [300, 800, 2000][i] },
  ),
);
const FORGE = [
  q(
    'forge.plus5',
    'forge',
    'Upgrade any slot to +5',
    { kind: 'slot-level', level: 5 },
    { ore: 20 },
  ),
  q(
    'forge.plus10',
    'forge',
    'Upgrade any slot to +10',
    { kind: 'slot-level', level: 10 },
    { ore: 60 },
  ),
  q(
    'forge.tier4',
    'forge',
    'Equip one hero with 7 items of tier 4 or higher',
    { kind: 'tier-loadout', tier: 4, items: 7 },
    { gold: 3000 },
    true,
  ),
];

/**
 * Task 24: two tiers per activity type — Gold 500 + Ore 15, then Gold 1500 + Ore 40. PROVISIONAL.
 */
const ACTIVITY_QUESTS = (
  [
    ['shrine', 'Cleanse', 'shrines', [10, 50]],
    ['lantern', 'Defend', 'lanterns', [10, 40]],
    ['thief', 'Catch', 'thieves', [10, 50]],
    ['nest', 'Destroy', 'nests', [10, 50]],
  ] as const
).flatMap(([activity, verb, noun, counts]) =>
  counts.map((count, i) =>
    q(
      `activities.${activity}.${count}`,
      'activities',
      `${verb} ${count} ${noun}`,
      { kind: 'activities', activity, count },
      { gold: [500, 1500][i], ore: [15, 40][i] },
    ),
  ),
);

/** All 58 quests in catalogue order (group, then goal): Task 21's 50 + Task 24's 8. */
export const QUESTS: readonly QuestDefinition[] = Object.freeze([
  ...CAMPAIGN,
  ...HUNT,
  ...TYPES,
  ...BOSSES,
  ...MASTERY,
  ...SYNERGY,
  ...CHESTS,
  ...FORGE,
  ...ACTIVITY_QUESTS,
]);
export const QUEST_BY_ID: ReadonlyMap<string, QuestDefinition> = new Map(
  QUESTS.map((quest) => [quest.id, quest]),
);
