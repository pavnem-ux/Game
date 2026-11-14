import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import type { PetId } from '../pets/config';

/**
 * Task 21 quest catalogue — data only. Every number is PROVISIONAL (owner-controlled).
 * Quests are permanent (no daily/timed quests): в процессе → выполнено → награда получена.
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
  | 'forge';
export const QUEST_GROUPS: readonly QuestGroup[] = Object.freeze([
  'campaign',
  'hunt',
  'types',
  'bosses',
  'mastery',
  'synergy',
  'chests',
  'forge',
]);
export const QUEST_GROUP_LABELS: Readonly<Record<QuestGroup, string>> = Object.freeze({
  campaign: 'Кампания',
  hunt: 'Охота',
  types: 'Виды врагов',
  bosses: 'Боссы',
  mastery: 'Мастерство',
  synergy: 'Синергии',
  chests: 'Сундуки',
  forge: 'Кузница',
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
  | Readonly<{ kind: 'item-level'; level: number }>
  | Readonly<{ kind: 'tier-loadout'; tier: number; items: number }>;
export interface QuestReward {
  readonly gold?: number;
  readonly ore?: number;
  /** Shop item id to unlock (owned already → its shop price in Gold). */
  readonly item?: string;
  /** Pet to unlock (owned already → its shop price, quest-only pets 2000 Gold). */
  readonly pet?: PetId;
}
export interface QuestDefinition {
  readonly id: string;
  readonly group: QuestGroup;
  readonly title: string;
  readonly goal: QuestGoal;
  readonly reward: QuestReward;
}
/** Gold given instead of an already-owned quest-only pet. */
export const QUEST_PET_FALLBACK_GOLD = 2000;

const q = (
  id: string,
  group: QuestGroup,
  title: string,
  goal: QuestGoal,
  reward: QuestReward,
): QuestDefinition =>
  Object.freeze({ id, group, title, goal: Object.freeze(goal), reward: Object.freeze(reward) });
const CLASS_NAMES: Readonly<Record<CharacterClass, string>> = {
  warrior: 'Воин',
  mage: 'Маг',
  archer: 'Лучник',
  rogue: 'Разбойник',
};
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const CAMPAIGN = [5, 10, 15, 20, 25, 30, 35, 40].map((mapId, i) => {
  const gold = [300, 600, 900, 1200, 1500, 1800, 2100, 2500][i];
  const ore = [10, 20, 30, 40, 50, 60, 70, 100][i];
  const extra: Partial<QuestReward> =
    mapId === 10
      ? { pet: 'firefly' }
      : mapId === 20
        ? { item: 'ring_precision-t3' }
        : mapId === 40
          ? { pet: 'wolf' }
          : {};
  return q(
    `campaign.map${mapId}`,
    'campaign',
    `Победить на карте ${mapId}`,
    { kind: 'map-win', mapId },
    { gold, ore, ...extra },
  );
});
const HUNT = [1000, 5000, 20000, 50000, 100000].map((count, i) =>
  q(
    `hunt.${count}`,
    'hunt',
    `Победить ${fmt(count)} врагов`,
    { kind: 'kills', count },
    { gold: [200, 500, 1000, 2000, 4000][i], ore: [5, 15, 30, 60, 100][i] },
  ),
);
const TYPES = [
  q(
    'types.swift',
    'types',
    'Победить 500 стремительных врагов',
    { kind: 'type-kills', type: 'swift', count: 500 },
    { gold: 400, ore: 15 },
  ),
  q(
    'types.brute',
    'types',
    'Победить 300 громил',
    { kind: 'type-kills', type: 'brute', count: 300 },
    { gold: 400, ore: 15 },
  ),
  q(
    'types.bombard',
    'types',
    'Победить 300 бомбардиров',
    { kind: 'type-kills', type: 'bombard', count: 300 },
    { gold: 400, ore: 15 },
  ),
  // 100 elites → the owlet (its shop price in Gold if already owned), plus the group's Gold + ore.
  q(
    'types.elite',
    'types',
    'Победить 100 элитных врагов',
    { kind: 'type-kills', type: 'elite', count: 100 },
    { gold: 400, ore: 15, pet: 'owlet' },
  ),
];
/** Ore of the 4th boss quest is not in the spec table (3 values for 4 quests): 100, provisional. */
const BOSSES = [5, 15, 30, 40].map((count, i) =>
  q(
    `bosses.${count}`,
    'bosses',
    `Победить ${count} разных боссов`,
    { kind: 'bosses', count },
    { gold: [1000, 2000, 3000, 5000][i], ore: [20, 50, 100, 100][i] },
  ),
);
const MASTERY = CHARACTER_CLASSES.flatMap((characterClass) =>
  [10, 20, 30, 40, 50].map((level, i) =>
    q(
      `mastery.${characterClass}.${level}`,
      'mastery',
      `${CLASS_NAMES[characterClass]}: уровень ${level}`,
      { kind: 'class-level', characterClass, level },
      { gold: [300, 600, 1000, 1500, 2500][i] },
    ),
  ),
);
const SYNERGY = [
  q(
    'synergy.open',
    'synergy',
    'Открыть любую синергию',
    { kind: 'synergies-opened', count: 1 },
    { gold: 200 },
  ),
  q(
    'synergy.awaken',
    'synergy',
    'Пробудить любую синергию',
    { kind: 'synergies-awakened', count: 1 },
    { ore: 30 },
  ),
  q(
    'synergy.awaken6',
    'synergy',
    'Пробудить 6 разных синергий',
    { kind: 'synergies-awakened', count: 6 },
    { pet: 'fox' },
  ),
];
const CHESTS = [25, 100, 300].map((count, i) =>
  q(
    `chests.${count}`,
    'chests',
    `Открыть ${count} сундуков`,
    { kind: 'chests', count },
    { gold: [300, 800, 2000][i] },
  ),
);
const FORGE = [
  q(
    'forge.plus5',
    'forge',
    'Улучшить любой предмет до +5',
    { kind: 'item-level', level: 5 },
    { ore: 20 },
  ),
  q(
    'forge.plus10',
    'forge',
    'Улучшить любой предмет до +10',
    { kind: 'item-level', level: 10 },
    { ore: 60 },
  ),
  q(
    'forge.tier4',
    'forge',
    'Надеть на одного героя 7 предметов 4-го уровня или выше',
    { kind: 'tier-loadout', tier: 4, items: 7 },
    { gold: 3000 },
  ),
];

/** All 50 quests in catalogue order (group, then goal). */
export const QUESTS: readonly QuestDefinition[] = Object.freeze([
  ...CAMPAIGN,
  ...HUNT,
  ...TYPES,
  ...BOSSES,
  ...MASTERY,
  ...SYNERGY,
  ...CHESTS,
  ...FORGE,
]);
export const QUEST_BY_ID: ReadonlyMap<string, QuestDefinition> = new Map(
  QUESTS.map((quest) => [quest.id, quest]),
);
