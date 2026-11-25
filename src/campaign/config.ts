/**
 * Task 08 / Task 10 campaign + balance configuration — the single place for campaign numbers.
 * Every value here is PROVISIONAL (owner-controlled tuning; see docs/task-08.md §1.1–1.3 and
 * docs/task-10-maps.md §1). Framework-independent: no Phaser/React/storage imports.
 *
 * Act I = maps 1–10 (Task 08, unchanged except the Task 10 §1.3 rebalance); Acts II–IV = maps
 * 11–40 (Task 10), built only from existing mechanics.
 */

export type StageId = 'opening' | 'escalation' | 'midgame' | 'late' | 'boss';
export type EliteProfileId = 'melee' | 'ranged';

export const CAMPAIGN_BALANCE = Object.freeze({
  /** Map i (1–10) duration in minutes. */
  durationsMinutes: Object.freeze([10, 10, 11, 11, 12, 12, 13, 13, 14, 15] as const),
  /** Task 10: maps 11–40 last 15 minutes. */
  laterDurationMinutes: 15,
  /**
   * Task 10 §1.2, maps 11–40: spawn rate stays at map 10's value; HP and damage grow linearly
   * from map 10's multipliers: HP ×(m10 + hpPerMap·(id − 10)), damage ×(m10 + damagePerMap·(id − 10)).
   */
  laterDifficulty: Object.freeze({ hpPerMap: 0.15, damagePerMap: 0.1 }),
  /** Task 10 §1.3: baseline share of ranged enemies in normal campaign spawns (was 0.18). */
  rangedShare: 0.12,
  /** Task 10 §1.2: per-map ranged-share overrides may not exceed this. */
  maxRangedShare: 0.18,
  /** k = mapId − 1: HP ×(1 + hpPerMap·k), damage ×(1 + damagePerMap·k), spawn rate ×(1 + …·k). */
  difficulty: Object.freeze({ hpPerMap: 0.12, damagePerMap: 0.08, spawnRatePerMap: 0.08 }),
  /** Stage boundaries as fractions of map duration (start of each stage, ascending). */
  stages: Object.freeze([
    Object.freeze({ id: 'opening', name: 'Opening', start: 0 }),
    Object.freeze({ id: 'escalation', name: 'Rising', start: 0.15 }),
    Object.freeze({ id: 'midgame', name: 'Midgame', start: 0.4 }),
    Object.freeze({ id: 'late', name: 'Late phase', start: 0.65 }),
    Object.freeze({ id: 'boss', name: 'Boss phase', start: 0.9 }),
  ] as const),
  elite: Object.freeze({
    /** An elite every interval seconds, strictly before map end; the boss replaces one. */
    interval: 120,
    /** Extra multipliers on top of the map difficulty. */
    hpMultiplier: 10, // Task 39: elites have ×10 the map's normal enemy health (was 2.5)
    damageMultiplier: 1.4,
    /** Profiles alternate in this order (aggressive melee, ranged). */
    profiles: Object.freeze(['melee', 'ranged'] as const),
    /**
     * Elite profile definitions applied to the existing enemy profiles (same AI). Scales multiply
     * the base melee/ranged config; extraXp is added to the elite's normal crystal reward.
     */
    definitions: Object.freeze({
      melee: Object.freeze({
        name: 'Savage Brute',
        radiusScale: 1.6,
        movementScale: 1.3,
        attackIntervalScale: 0.75,
        attackRangeScale: 1,
        extraXp: 32, // Task 10 §1.3: −20% (was 40)
      }),
      ranged: Object.freeze({
        name: 'Dark Conjurer',
        radiusScale: 1.5,
        movementScale: 1,
        attackIntervalScale: 0.8,
        attackRangeScale: 1.2,
        extraXp: 32, // Task 10 §1.3: −20% (was 40)
      }),
    }),
  }),
  boss: Object.freeze({
    /**
     * Owner decision (Task 11 review): the boss of every map appears when the map timer ends
     * (was a fixed 10:00), so a map ends the moment its boss dies. Earliest allowed time (s).
     */
    minSpawnTime: 600,
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
    /**
     * Task 10 §1.3: victory Gold has its own table (no longer derived from XP). Maps 1–10 keep the
     * Task 08 values (= floor(XP × 0.5)); maps 11–40: laterGoldBase + laterGoldPerMap·(id − 10).
     */
    victoryGold: Object.freeze([75, 100, 125, 150, 175, 200, 225, 250, 275, 300] as const),
    laterGoldBase: 300,
    laterGoldPerMap: 15,
    /** Defeat: floor(reward × defeatShare × min(elapsed / duration, 1)). */
    defeatShare: 0.25,
  }),
});

/**
 * Task 10 acts: 4 × 10 maps. The elite interval is per act (strictly before the map end; the boss
 * appears at the map end — owner decision in the Task 11 review). Elites per event: 1, or 2 on the maps listed in `doubleElites`.
 */
export interface CampaignAct {
  readonly id: 1 | 2 | 3 | 4;
  readonly roman: 'I' | 'II' | 'III' | 'IV';
  readonly name: string;
  readonly firstMap: number;
  readonly lastMap: number;
  readonly eliteInterval: number;
}
export const CAMPAIGN_ACTS: readonly CampaignAct[] = Object.freeze([
  Object.freeze({
    id: 1,
    roman: 'I',
    name: 'Forgotten Tales',
    firstMap: 1,
    lastMap: 10,
    eliteInterval: 120,
  }),
  Object.freeze({
    id: 2,
    roman: 'II',
    name: 'Enchanted Lands',
    firstMap: 11,
    lastMap: 20,
    eliteInterval: 105,
  }),
  Object.freeze({
    id: 3,
    roman: 'III',
    name: 'Kingdom of the Dead',
    firstMap: 21,
    lastMap: 30,
    eliteInterval: 90,
  }),
  Object.freeze({
    id: 4,
    roman: 'IV',
    name: 'The Last Tale',
    firstMap: 31,
    lastMap: 40,
    eliteInterval: 75,
  }),
] as const);
/** Task 10 §1.2: two elites per event on maps 25–30 and 35–40. */
export const DOUBLE_ELITE_MAPS: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([25, 30] as const),
  Object.freeze([35, 40] as const),
]);
export function actOf(mapId: number): CampaignAct {
  const act = CAMPAIGN_ACTS.find((a) => mapId >= a.firstMap && mapId <= a.lastMap);
  if (!act) throw new RangeError(`Unknown campaign map: ${mapId}.`);
  return act;
}

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
/**
 * Task 10 §1.2 per-map modifiers (maps 11–40, at most 2 per map), each through one existing lever:
 * - `swift`: enemy movement speed ×1.1 (normal enemies, elites and boss adds; not the boss);
 * - `ranged15` / `ranged18`: ranged share of normal spawns 0.15 / 0.18 (baseline 0.12);
 * - `elites`: elite HP ×1.25 and damage ×1.15 on top of the Task 08 elite multipliers.
 */
export type MapModifierId = 'swift' | 'ranged15' | 'ranged18' | 'elites';
export const MAP_MODIFIERS = Object.freeze({
  swift: Object.freeze({ label: 'Swift enemies: speed ×1.1', enemySpeed: 1.1 }),
  ranged15: Object.freeze({ label: 'More archers: 15% of enemies', rangedShare: 0.15 }),
  ranged18: Object.freeze({ label: 'Many archers: 18% of enemies', rangedShare: 0.18 }),
  elites: Object.freeze({
    label: 'Strong elites: health ×1.25, damage ×1.15',
    eliteHp: 1.25,
    eliteDamage: 1.15,
  }),
} satisfies Record<MapModifierId, { label: string; [k: string]: number | string }>);
export interface MapModifier {
  readonly id: MapModifierId;
  readonly label: string;
}
/**
 * Task 39: the difficulty tiers of every map (owner decision, PROVISIONAL numbers). Hard / Nightmare
 * scale every monster's health and damage; the Elite Trial is a 3-minute map with no waves — five
 * elites at 0:00, 1:00 and 2:00 (×3 the Normal elites) and the boss at 3:00 (×3 the Normal boss).
 * `rewardScale` multiplies the victory Gold and Ore. Tiers unlock in this order on each map.
 */
export type CampaignDifficulty = 'normal' | 'hard' | 'nightmare' | 'trial';
export const CAMPAIGN_DIFFICULTIES: readonly CampaignDifficulty[] = Object.freeze([
  'normal',
  'hard',
  'nightmare',
  'trial',
]);
export const DIFFICULTY_TIERS = Object.freeze({
  normal: Object.freeze({ name: 'Normal', monsterScale: 1, rewardScale: 1 }),
  hard: Object.freeze({ name: 'Hard', monsterScale: 1.5, rewardScale: 1.5 }),
  nightmare: Object.freeze({ name: 'Nightmare', monsterScale: 2, rewardScale: 2 }),
  trial: Object.freeze({
    name: 'Elite Trial',
    monsterScale: 1,
    rewardScale: 2,
    durationSeconds: 180,
    eliteTimes: Object.freeze([0, 60, 120]),
    elitesPerEvent: 5,
    /** Elite health and damage × this on top of the map's Normal elites. */
    eliteScale: 3,
    /** Boss health and damage × this on top of the map's Normal boss. */
    bossScale: 3,
  }),
});
export function isCampaignDifficulty(value: unknown): value is CampaignDifficulty {
  return (CAMPAIGN_DIFFICULTIES as readonly unknown[]).includes(value);
}
/** Elite settings of one map (Act interval; per-event count; strength on top of difficulty). */
export interface MapEliteSettings {
  readonly interval: number;
  /** Elites per event (1 or 2; Task 39 Elite Trial: 5). */
  readonly perEvent: number;
  readonly hpMultiplier: number;
  readonly damageMultiplier: number;
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
  /** Task 10: act (1–4) and elite settings of this map. */
  readonly act: CampaignAct['id'];
  readonly elite: MapEliteSettings;
  /**
   * Alpha enemy slots kept free for this map's scheduled elites and boss (automatic waves stop
   * earlier): max(base reserve, every scheduled enemy), so a scheduled spawn is never skipped.
   */
  readonly reservedSlots: number;
  /** Task 10: per-map modifiers (Russian labels for the map card) and the enemy speed lever. */
  readonly modifiers: readonly MapModifier[];
  readonly enemySpeedScale: number;
  /** Task 39: the difficulty tier of this map variant (Normal for `getCampaignMap(id)`). */
  readonly tier: CampaignDifficulty;
  /** Task 39: elite event times (Normal: the act interval before the end; Trial: 0 / 60 / 120). */
  readonly eliteTimes: readonly number[];
  /** Task 39: false = no automatic waves and no initial enemies (Elite Trial). */
  readonly waves: boolean;
  /** Task 39: boss health and damage × this on top of its definition (Trial: 3). */
  readonly bossScale: number;
  /** Task 39: victory Gold and Ore × this (Hard 1.5, Nightmare 2, Trial 2). */
  readonly rewardScale: number;
}

const MAP_TEXT: readonly {
  name: string;
  bossId: string;
  bossName: string;
  overrides?: MapOverrides;
  mods?: readonly MapModifierId[];
}[] = [
  { name: 'Edge of Forgotten Tales', bossId: 'thornwarden', bossName: 'Thornwarden' },
  { name: 'Misty Marshes', bossId: 'marsh_witch', bossName: 'Marsh Witch' },
  { name: 'Stone Pass', bossId: 'stone_colossus', bossName: 'Stone Colossus' },
  { name: 'Ashen Grove', bossId: 'ash_wolf', bossName: 'Ash Wolf' },
  { name: 'Frozen Barrows', bossId: 'barrow_king', bossName: 'Barrow King' },
  { name: 'Drowning Mires', bossId: 'mire_serpent', bossName: 'Mire Serpent' },
  { name: 'Chapel Ruins', bossId: 'fallen_bellringer', bossName: 'Fallen Bellringer' },
  { name: 'Crimson Wastes', bossId: 'crimson_reaper', bossName: 'Crimson Reaper' },
  { name: 'Dusk Citadel', bossId: 'dusk_knight', bossName: 'Dusk Knight' },
  { name: 'Heart of Darkness', bossId: 'last_dark', bossName: 'Lord of the Last Dark' },
  // ── Act II «Enchanted Lands» (Task 10) ──
  { name: 'Whispering Pines', bossId: 'old_leshy', bossName: 'The Old Leshy' },
  { name: 'Bear Hollow', bossId: 'giant_bear', bossName: 'Giant Wakeful Bear', mods: ['swift'] },
  {
    name: 'Wasteland of Keys',
    bossId: 'key_keeper',
    bossName: 'Keeper of Keys',
    mods: ['ranged15'],
  },
  { name: 'Crooked Lake', bossId: 'water_tsar', bossName: 'The Water Tsar' },
  { name: 'Owl Thicket', bossId: 'seer_owl', bossName: 'The Seer Owl', mods: ['elites'] },
  {
    name: 'Gingerbread Village',
    bossId: 'gingerbread_giant',
    bossName: 'Gingerbread Giant',
    mods: ['swift'],
  },
  {
    name: 'Copper Hills',
    bossId: 'copper_serpent',
    bossName: 'Copper Serpent',
    mods: ['ranged15', 'elites'],
  },
  { name: 'Abandoned Mill', bossId: 'midnight_miller', bossName: 'The Midnight Miller' },
  {
    name: 'Raven Cliffs',
    bossId: 'raven_prince',
    bossName: 'Raven Prince',
    mods: ['swift', 'ranged15'],
  },
  {
    name: 'Tower of Eternal Winter',
    bossId: 'ice_voivode',
    bossName: 'Frost Warlord',
    mods: ['elites'],
  },
  // ── Act III «Kingdom of the Dead» ──
  { name: 'Bone Bridge', bossId: 'bone_warden', bossName: 'Bone Warden', mods: ['ranged15'] },
  {
    name: 'Black River',
    bossId: 'shadow_ferryman',
    bossName: 'Ferryman of Shadows',
    mods: ['swift'],
  },
  { name: 'Grey Fields', bossId: 'noon_wraith', bossName: 'The Noon Wraith' },
  {
    name: 'Moonless Graveyard',
    bossId: 'graveyard_master',
    bossName: 'Master of the Graveyard',
    mods: ['elites'],
  },
  {
    name: 'Rusted Gates',
    bossId: 'rusted_gatekeeper',
    bossName: 'Rusted Gatekeeper',
    mods: ['ranged18'],
  },
  {
    name: 'Ashen Road',
    bossId: 'fire_rider',
    bossName: 'Fire Rider',
    mods: ['swift', 'elites'],
  },
  { name: 'Weeping Wood', bossId: 'mourner', bossName: 'The Mourner' },
  {
    name: 'Obsidian Mines',
    bossId: 'deep_smith',
    bossName: 'Underhill Smith',
    mods: ['ranged15', 'swift'],
  },
  {
    name: 'Garden of Withered Roses',
    bossId: 'withered_tsarevna',
    bossName: 'The Withered Princess',
    mods: ['elites'],
  },
  {
    name: 'Halls of the Deathless',
    bossId: 'deathless_guard',
    bossName: 'Warden of the Deathless',
    mods: ['swift', 'elites'],
  },
  // ── Act IV «The Last Tale» ──
  {
    name: 'Shattered Sky',
    bossId: 'thunder_kite',
    bossName: 'Thunder Kite',
    mods: ['ranged18'],
  },
  { name: 'Stardust', bossId: 'renegade_stargazer', bossName: 'The Renegade Stargazer' },
  {
    name: 'Mirror Mires',
    bossId: 'mirror_kikimora',
    bossName: 'The Mirror Kikimora',
    mods: ['swift'],
  },
  {
    name: 'Abode of Storms',
    bossId: 'storm_lord',
    bossName: 'Lord of Storms',
    mods: ['elites', 'ranged15'],
  },
  { name: 'Labyrinth of Dreams', bossId: 'drowse', bossName: 'Drowse', mods: ['swift'] },
  {
    name: "Isle at the Sea's Edge",
    bossId: 'sea_serpent',
    bossName: 'Sea Serpent',
    mods: ['ranged18', 'elites'],
  },
  {
    name: 'Bloody Dawn',
    bossId: 'scarlet_knight',
    bossName: 'The Scarlet Knight',
    mods: ['swift', 'elites'],
  },
  { name: 'Silent City', bossId: 'faceless_tsar', bossName: 'The Faceless Tsar' },
  {
    name: 'Edge of the World',
    bossId: 'edge_warden',
    bossName: 'Warden of the Edge',
    mods: ['ranged18', 'swift'],
  },
  {
    name: 'The Last Page',
    bossId: 'dark_storyteller',
    bossName: 'Storyteller of the Dark',
    mods: ['swift', 'elites'],
  },
];

/** Map difficulty from the central formula, then optional overrides. */
export function mapDifficulty(mapId: number, overrides?: MapOverrides): DifficultyMultipliers {
  const d = CAMPAIGN_BALANCE.difficulty;
  const at = (id: number) => {
    const k = id - 1;
    return {
      hp: 1 + d.hpPerMap * k,
      damage: 1 + d.damagePerMap * k,
      spawnRate: 1 + d.spawnRatePerMap * k,
    };
  };
  // Task 10 §1.2: after map 10, spawn rate is frozen and HP/damage grow from map 10's values.
  const base =
    mapId <= 10
      ? at(mapId)
      : {
          hp: at(10).hp + CAMPAIGN_BALANCE.laterDifficulty.hpPerMap * (mapId - 10),
          damage: at(10).damage + CAMPAIGN_BALANCE.laterDifficulty.damagePerMap * (mapId - 10),
          spawnRate: at(10).spawnRate,
        };
  return Object.freeze({ ...base, ...overrides?.difficulty });
}
export function victoryXp(mapId: number): number {
  return CAMPAIGN_BALANCE.rewards.victoryXpBase + CAMPAIGN_BALANCE.rewards.victoryXpPerMap * mapId;
}
/** Task 10 §1.3: victory Gold from its own table (maps 1–10) or formula (maps 11–40). */
export function victoryGold(mapId: number): number {
  const r = CAMPAIGN_BALANCE.rewards;
  return mapId <= 10
    ? r.victoryGold[mapId - 1]
    : r.laterGoldBase + r.laterGoldPerMap * (mapId - 10);
}
export function mapDurationSeconds(mapId: number): number {
  return (
    (mapId <= 10
      ? CAMPAIGN_BALANCE.durationsMinutes[mapId - 1]
      : CAMPAIGN_BALANCE.laterDurationMinutes) * 60
  );
}
/** The boss of a map appears when its timer ends; the map is won the moment it dies. */
export function bossSpawnTime(mapId: number): number {
  return mapDurationSeconds(mapId);
}
/** Elite event times of a map: multiples of the act interval strictly before the end (boss). */
export function eliteEventTimes(mapId: number): readonly number[] {
  const interval = actOf(mapId).eliteInterval;
  const end = mapDurationSeconds(mapId);
  const times: number[] = [];
  for (let t = interval; t < end; t += interval) times.push(t);
  return Object.freeze(times);
}
function elitesPerEvent(mapId: number): 1 | 2 {
  return DOUBLE_ELITE_MAPS.some(([a, b]) => mapId >= a && mapId <= b) ? 2 : 1;
}

export const CAMPAIGN_MAPS: readonly CampaignMap[] = Object.freeze(
  MAP_TEXT.map((text, i) => {
    const id = i + 1;
    const perEvent = elitesPerEvent(id);
    const modifiers = (text.mods ?? []).map((m) =>
      Object.freeze({ id: m, label: MAP_MODIFIERS[m].label }),
    );
    const has = (m: MapModifierId) => modifiers.some((x) => x.id === m);
    const rangedShare = has('ranged18')
      ? MAP_MODIFIERS.ranged18.rangedShare
      : has('ranged15')
        ? MAP_MODIFIERS.ranged15.rangedShare
        : text.overrides?.rangedShare;
    const scheduled = eliteEventTimes(id).length * perEvent + 1; // + the boss
    return Object.freeze({
      id,
      name: text.name,
      durationSeconds: mapDurationSeconds(id),
      difficulty: mapDifficulty(id, text.overrides),
      victoryXp: victoryXp(id),
      victoryGold: victoryGold(id),
      bossId: text.bossId,
      bossName: text.bossName,
      ...(rangedShare !== undefined ? { rangedShare } : {}),
      act: actOf(id).id,
      elite: Object.freeze({
        interval: actOf(id).eliteInterval,
        perEvent,
        hpMultiplier:
          CAMPAIGN_BALANCE.elite.hpMultiplier * (has('elites') ? MAP_MODIFIERS.elites.eliteHp : 1),
        damageMultiplier:
          CAMPAIGN_BALANCE.elite.damageMultiplier *
          (has('elites') ? MAP_MODIFIERS.elites.eliteDamage : 1),
      }),
      reservedSlots: Math.max(CAMPAIGN_BALANCE.reservedSlots, scheduled),
      modifiers: Object.freeze(modifiers),
      enemySpeedScale: has('swift') ? MAP_MODIFIERS.swift.enemySpeed : 1,
      tier: 'normal',
      eliteTimes: eliteEventTimes(id),
      waves: true,
      bossScale: 1,
      rewardScale: 1,
    } satisfies CampaignMap);
  }),
);

/**
 * A campaign map, optionally at a Task 39 difficulty tier (Normal = the map itself). Hard /
 * Nightmare scale the map's health and damage multipliers (every monster derives from them); the
 * Elite Trial replaces the duration and schedule. Variants are cached (frozen, one per map and tier).
 */
export function getCampaignMap(mapId: number, tier: CampaignDifficulty = 'normal'): CampaignMap {
  const map = CAMPAIGN_MAPS[mapId - 1];
  if (!Number.isInteger(mapId) || !map) throw new RangeError(`Unknown campaign map: ${mapId}.`);
  if (!isCampaignDifficulty(tier)) throw new RangeError(`Unknown difficulty: ${String(tier)}.`);
  if (tier === 'normal') return map;
  const key = `${mapId}:${tier}`;
  let variant = VARIANTS.get(key);
  if (!variant) {
    variant = tierVariant(map, tier);
    VARIANTS.set(key, variant);
  }
  return variant;
}
const VARIANTS = new Map<string, CampaignMap>();
function tierVariant(map: CampaignMap, tier: Exclude<CampaignDifficulty, 'normal'>): CampaignMap {
  if (tier === 'trial') {
    const t = DIFFICULTY_TIERS.trial;
    return Object.freeze({
      ...map,
      tier,
      durationSeconds: t.durationSeconds,
      eliteTimes: t.eliteTimes,
      elite: Object.freeze({
        ...map.elite,
        perEvent: t.elitesPerEvent,
        hpMultiplier: map.elite.hpMultiplier * t.eliteScale,
        damageMultiplier: map.elite.damageMultiplier * t.eliteScale,
      }),
      waves: false,
      bossScale: t.bossScale,
      rewardScale: t.rewardScale,
      reservedSlots: Math.max(
        CAMPAIGN_BALANCE.reservedSlots,
        t.eliteTimes.length * t.elitesPerEvent + 1,
      ),
    } satisfies CampaignMap);
  }
  const t = DIFFICULTY_TIERS[tier];
  return Object.freeze({
    ...map,
    tier,
    difficulty: Object.freeze({
      ...map.difficulty,
      hp: map.difficulty.hp * t.monsterScale,
      damage: map.difficulty.damage * t.monsterScale,
    }),
    rewardScale: t.rewardScale,
  } satisfies CampaignMap);
}

/** Startup validation: rejects an inconsistent configuration before any run can use it. */
export function validateCampaignConfig(maps: readonly CampaignMap[] = CAMPAIGN_MAPS): void {
  const b = CAMPAIGN_BALANCE;
  if (maps.length !== 40) throw new Error('The campaign must have exactly 40 maps.');
  const bosses = new Set<string>();
  maps.forEach((map, i) => {
    if (map.id !== i + 1) throw new Error(`Map ${i + 1} has id ${map.id}.`);
    if (!map.name.trim()) throw new Error(`Map ${map.id} needs a name.`);
    if (!Number.isFinite(map.durationSeconds) || map.durationSeconds < b.boss.minSpawnTime)
      throw new Error(`Map ${map.id} must last at least until the boss spawns.`);
    for (const value of Object.values(map.difficulty))
      if (!Number.isFinite(value) || value <= 0)
        throw new Error(`Map ${map.id} difficulty invalid.`);
    if (
      map.rangedShare !== undefined &&
      !(map.rangedShare >= 0 && map.rangedShare <= b.maxRangedShare)
    )
      throw new Error(`Map ${map.id} rangedShare invalid.`);
    if (map.act !== actOf(map.id).id) throw new Error(`Map ${map.id} act invalid.`);
    if (!(map.victoryGold > 0) || !Number.isInteger(map.victoryGold))
      throw new Error(`Map ${map.id} victory Gold invalid.`);
    const e = map.elite;
    if (!(e.interval > 0) || !(e.hpMultiplier > 0) || !(e.damageMultiplier > 0))
      throw new Error(`Map ${map.id} elite settings invalid.`);
    if (map.reservedSlots < b.reservedSlots) throw new Error(`Map ${map.id} reserve too small.`);
    // Task 10 §1.2: at most 2 modifiers, none on Act I, no lever twice.
    if (map.modifiers.length > 2 || (map.id <= 10 && map.modifiers.length > 0))
      throw new Error(`Map ${map.id} has too many modifiers.`);
    if (map.modifiers.filter((m) => m.id.startsWith('ranged')).length > 1)
      throw new Error(`Map ${map.id} sets the ranged share twice.`);
    if (!(map.enemySpeedScale >= 1)) throw new Error(`Map ${map.id} enemy speed invalid.`);
    if (!map.bossId || bosses.has(map.bossId))
      throw new Error(`Map ${map.id} boss reference invalid.`);
    bosses.add(map.bossId);
  });
  const starts = b.stages.map((s) => s.start);
  if (starts[0] !== 0 || starts.some((s, i) => i > 0 && !(s > starts[i - 1] && s < 1)))
    throw new Error('Stage boundaries must start at 0 and increase below 1.');
  if (b.elite.interval <= 0) throw new Error('The elite interval must be positive.');
  if (CAMPAIGN_ACTS[0].eliteInterval !== b.elite.interval)
    throw new Error('Act I must keep the Task 08 elite interval.');
  CAMPAIGN_ACTS.forEach((act, i) => {
    if (act.firstMap !== i * 10 + 1 || act.lastMap !== i * 10 + 10 || !(act.eliteInterval > 0))
      throw new Error(`Act ${act.roman} invalid.`);
  });
}
validateCampaignConfig();
