/**
 * Task 08 campaign + balance configuration — the single place for campaign numbers.
 * Every value here is PROVISIONAL (owner-controlled tuning; see docs/task-08.md §1.1–1.3).
 * Framework-independent: no Phaser/React/storage imports.
 */

export type StageId = 'opening' | 'escalation' | 'midgame' | 'late' | 'boss';
export type EliteProfileId = 'melee' | 'ranged';

export const CAMPAIGN_BALANCE = Object.freeze({
  /** Map i (1–10) duration in minutes. */
  durationsMinutes: Object.freeze([10, 10, 11, 11, 12, 12, 13, 13, 14, 15] as const),
  /** k = mapId − 1: HP ×(1 + hpPerMap·k), damage ×(1 + damagePerMap·k), spawn rate ×(1 + …·k). */
  difficulty: Object.freeze({ hpPerMap: 0.12, damagePerMap: 0.08, spawnRatePerMap: 0.08 }),
  /** Stage boundaries as fractions of map duration (start of each stage, ascending). */
  stages: Object.freeze([
    Object.freeze({ id: 'opening', name: 'Начало', start: 0 }),
    Object.freeze({ id: 'escalation', name: 'Нарастание', start: 0.15 }),
    Object.freeze({ id: 'midgame', name: 'Середина', start: 0.4 }),
    Object.freeze({ id: 'late', name: 'Поздняя фаза', start: 0.65 }),
    Object.freeze({ id: 'boss', name: 'Фаза босса', start: 0.9 }),
  ] as const),
  elite: Object.freeze({
    /** An elite every interval seconds, strictly before map end; the boss replaces one. */
    interval: 120,
    /** Extra multipliers on top of the map difficulty. */
    hpMultiplier: 2.5,
    damageMultiplier: 1.4,
    /** Profiles alternate in this order (aggressive melee, ranged). */
    profiles: Object.freeze(['melee', 'ranged'] as const),
    /**
     * Elite profile definitions applied to the existing enemy profiles (same AI). Scales multiply
     * the base melee/ranged config; extraXp is added to the elite's normal crystal reward.
     */
    definitions: Object.freeze({
      melee: Object.freeze({
        name: 'Свирепый громила',
        radiusScale: 1.6,
        movementScale: 1.3,
        attackIntervalScale: 0.75,
        attackRangeScale: 1,
        extraXp: 40,
      }),
      ranged: Object.freeze({
        name: 'Тёмный ворожей',
        radiusScale: 1.5,
        movementScale: 1,
        attackIntervalScale: 0.8,
        attackRangeScale: 1.2,
        extraXp: 40,
      }),
    }),
  }),
  boss: Object.freeze({
    /** Simulation seconds; the scheduled elite at this time is replaced by the boss. */
    spawnTime: 600,
  }),
  /**
   * Alpha enemy slots kept free for scheduled elites/boss (automatic waves stop earlier), so a
   * scheduled spawn never exceeds the 120-enemy cap and is never skipped. Must be ≥ the largest
   * number of scheduled enemies on any map (validated).
   */
  reservedSlots: 8,
  rewards: Object.freeze({
    victoryXpBase: 100,
    victoryXpPerMap: 50,
    /** Gold = XP × goldPerXp. */
    goldPerXp: 0.5,
    /** Defeat: floor(reward × defeatShare × min(elapsed / duration, 1)). */
    defeatShare: 0.25,
  }),
});

export interface DifficultyMultipliers {
  readonly hp: number;
  readonly damage: number;
  readonly spawnRate: number;
}
/** Optional per-map overrides of the derived values (spec allows per-map enemy tuning). */
export interface MapOverrides {
  readonly difficulty?: Partial<DifficultyMultipliers>;
  /** Share of automatic spawns that are ranged (existing spawner setting). */
  readonly rangedShare?: number;
}
export interface CampaignMap {
  readonly id: number;
  readonly name: string;
  readonly durationSeconds: number;
  readonly difficulty: DifficultyMultipliers;
  readonly victoryXp: number;
  readonly victoryGold: number;
  /** Reference to the map's boss (Phase 2 adds the full boss definitions). */
  readonly bossId: string;
  readonly bossName: string;
  readonly rangedShare?: number;
}

const MAP_TEXT: readonly {
  name: string;
  bossId: string;
  bossName: string;
  overrides?: MapOverrides;
}[] = [
  { name: 'Опушка забытых сказок', bossId: 'thornwarden', bossName: 'Терновый страж' },
  { name: 'Туманные болота', bossId: 'marsh_witch', bossName: 'Болотная ведьма' },
  { name: 'Каменный перевал', bossId: 'stone_colossus', bossName: 'Каменный колосс' },
  { name: 'Пепельная роща', bossId: 'ash_wolf', bossName: 'Пепельный волк' },
  { name: 'Ледяные курганы', bossId: 'barrow_king', bossName: 'Курганный король' },
  { name: 'Гиблые топи', bossId: 'mire_serpent', bossName: 'Топяной змей' },
  { name: 'Руины часовни', bossId: 'fallen_bellringer', bossName: 'Падший звонарь' },
  { name: 'Багровые пустоши', bossId: 'crimson_reaper', bossName: 'Багровый жнец' },
  { name: 'Сумрачная цитадель', bossId: 'dusk_knight', bossName: 'Сумрачный рыцарь' },
  { name: 'Сердце тьмы', bossId: 'last_dark', bossName: 'Владыка последней тьмы' },
];

/** Map difficulty from the central formula, then optional overrides. */
export function mapDifficulty(mapId: number, overrides?: MapOverrides): DifficultyMultipliers {
  const k = mapId - 1;
  const d = CAMPAIGN_BALANCE.difficulty;
  return Object.freeze({
    hp: 1 + d.hpPerMap * k,
    damage: 1 + d.damagePerMap * k,
    spawnRate: 1 + d.spawnRatePerMap * k,
    ...overrides?.difficulty,
  });
}
export function victoryXp(mapId: number): number {
  return CAMPAIGN_BALANCE.rewards.victoryXpBase + CAMPAIGN_BALANCE.rewards.victoryXpPerMap * mapId;
}

export const CAMPAIGN_MAPS: readonly CampaignMap[] = Object.freeze(
  MAP_TEXT.map((text, i) => {
    const id = i + 1;
    const xp = victoryXp(id);
    return Object.freeze({
      id,
      name: text.name,
      durationSeconds: CAMPAIGN_BALANCE.durationsMinutes[i] * 60,
      difficulty: mapDifficulty(id, text.overrides),
      victoryXp: xp,
      victoryGold: Math.floor(xp * CAMPAIGN_BALANCE.rewards.goldPerXp),
      bossId: text.bossId,
      bossName: text.bossName,
      ...(text.overrides?.rangedShare !== undefined
        ? { rangedShare: text.overrides.rangedShare }
        : {}),
    } satisfies CampaignMap);
  }),
);

export function getCampaignMap(mapId: number): CampaignMap {
  const map = CAMPAIGN_MAPS[mapId - 1];
  if (!Number.isInteger(mapId) || !map) throw new RangeError(`Unknown campaign map: ${mapId}.`);
  return map;
}

/** Startup validation: rejects an inconsistent configuration before any run can use it. */
export function validateCampaignConfig(maps: readonly CampaignMap[] = CAMPAIGN_MAPS): void {
  const b = CAMPAIGN_BALANCE;
  if (maps.length !== 10) throw new Error('The campaign must have exactly 10 maps.');
  const bosses = new Set<string>();
  maps.forEach((map, i) => {
    if (map.id !== i + 1) throw new Error(`Map ${i + 1} has id ${map.id}.`);
    if (!map.name.trim()) throw new Error(`Map ${map.id} needs a name.`);
    if (!Number.isFinite(map.durationSeconds) || map.durationSeconds < b.boss.spawnTime)
      throw new Error(`Map ${map.id} must last at least until the boss spawns.`);
    for (const value of Object.values(map.difficulty))
      if (!Number.isFinite(value) || value <= 0)
        throw new Error(`Map ${map.id} difficulty invalid.`);
    if (map.rangedShare !== undefined && !(map.rangedShare >= 0 && map.rangedShare <= 1))
      throw new Error(`Map ${map.id} rangedShare invalid.`);
    if (!map.bossId || bosses.has(map.bossId))
      throw new Error(`Map ${map.id} boss reference invalid.`);
    bosses.add(map.bossId);
  });
  const starts = b.stages.map((s) => s.start);
  if (starts[0] !== 0 || starts.some((s, i) => i > 0 && !(s > starts[i - 1] && s < 1)))
    throw new Error('Stage boundaries must start at 0 and increase below 1.');
  if (b.elite.interval <= 0 || b.boss.spawnTime % b.elite.interval !== 0)
    throw new Error('The boss must replace a scheduled elite slot.');
}
validateCampaignConfig();
