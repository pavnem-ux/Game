import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CAMPAIGN_MAPS, isCampaignDifficulty } from '../campaign';
import type { CampaignDifficulty } from '../campaign';
import {
  MAX_CLASS_LEVEL,
  MAX_PROCESSED_RUN_IDS,
  MAX_RECENT_RUNS,
  NEW_CLASS_PROGRESS,
  PROFILE_SCHEMA_VERSION,
  validateRunStatsSummary,
  xpToNextLevel,
} from '../profile';
import type { ClassProgress, MapBest, PlayerProfile, RecentRun, RunStatsSummary } from '../profile';
import { validateTalentRanks } from '../talents';
import {
  GEAR_SLOTS,
  defaultLoadout,
  equipBlock,
  findOwned,
  isStarterUid,
  BAG_RULES,
  NO_SLOT_LEVELS,
  validateItem,
  validateSlotLevels,
} from '../equipment';
import type { ItemInstance, Loadout, ShopBought, SlotLevels } from '../equipment';
import { shopSaltOf } from '../profile/profile';
import { PET_LEVEL_RULES, isPetId } from '../pets';
import {
  ACTIVITY_COUNTER_TYPES,
  NO_ACTIVITY_COUNTS,
  NO_QUEST_COUNTERS,
  QUEST_BY_ID,
  SYNERGY_IDS,
  legacyTierItemsWorn,
  questProgress,
} from '../quests';
import type { ActivityCounts, QuestCounters } from '../quests';

/**
 * Task 08 `saveSchema`: validation, defaults and migrations for the persisted profile.
 * - `migrations` is keyed by the version a migration upgrades FROM (v1 → v2: Task 09 talents).
 * - Missing fields added in later versions get defaults; a profile is never reset because a field
 *   was added. Unknown fields are dropped (imported data is data only).
 * - Anything structurally wrong, out of range or from a newer version is rejected, never "fixed".
 */
export const SAVE_SCHEMA_VERSION = PROFILE_SCHEMA_VERSION;
type Json = Record<string, unknown>;
export type Migration = (data: Json) => Json;
/**
 * v1 → v2 (Task 09): every class gets `talents: {}` and loses the `talentsSpent` placeholder
 * (talents could not be spent before Task 09). Gold, XP, levels, maps and runs are untouched.
 */
export function migrateV1toV2(data: Json): Json {
  if (!isObject(data.classes)) return { ...data };
  const classes: Json = {};
  for (const [id, value] of Object.entries(data.classes)) {
    if (!isObject(value)) {
      classes[id] = value; // left for normal validation to reject
      continue;
    }
    const rest: Json = { ...value };
    delete rest.talentsSpent;
    classes[id] = { ...rest, talents: {} };
  }
  return { ...data, classes };
}
/**
 * v2 → v3 (Task 10): the campaign grows from 10 to 40 maps and a map 10 victory now unlocks map
 * 11. A v2 save that completed map 10 (so stopped at `highestUnlockedMap` 10, the old last map)
 * gets map 11 unlocked; nothing else changes (Gold, XP, levels, talents, results, runs).
 */
export function migrateV2toV3(data: Json): Json {
  const completed = Array.isArray(data.completedMaps) ? data.completedMaps : [];
  if (completed.includes(10) && data.highestUnlockedMap === 10)
    return { ...data, highestUnlockedMap: 11 };
  return { ...data };
}
/**
 * v3 → v4 (Task 11): `ownedItems: []` and every class gets the default loadout (starter weapon,
 * empty armor/amulet/ring). Gold, XP, levels, maps, talents and runs are untouched.
 */
export function migrateV3toV4(data: Json): Json {
  const classes: Json = {};
  if (isObject(data.classes))
    for (const [id, value] of Object.entries(data.classes))
      classes[id] =
        isObject(value) && (CHARACTER_CLASSES as readonly string[]).includes(id)
          ? { ...value, loadout: defaultLoadout(id as CharacterClass) }
          : value; // left for normal validation to reject
  return {
    ...data,
    ...(isObject(data.classes) ? { classes } : {}),
    ownedItems: [],
  };
}
/**
 * v4 → v5 (Task 19): `ore: 0`, `itemLevels: {}`, and every class loadout gains empty `helmet`,
 * `gloves`, `pants` slots. Nothing else changes (Gold, XP, levels, maps, talents, items, loadouts).
 */
export function migrateV4toV5(data: Json): Json {
  const classes: Json = {};
  if (isObject(data.classes))
    for (const [id, value] of Object.entries(data.classes))
      classes[id] =
        isObject(value) && isObject(value.loadout)
          ? { ...value, loadout: { ...value.loadout, helmet: null, gloves: null, pants: null } }
          : value; // a missing loadout gets the default; anything else is left for validation
  return {
    ...data,
    ...(isObject(data.classes) ? { classes } : {}),
    ore: 0,
    itemLevels: {},
  };
}
/** v5 → v6 (Task 20): `ownedPets: []`, `petLevels: {}`, `activePet: null`. Nothing else changes. */
export function migrateV5toV6(data: Json): Json {
  return { ...data, ownedPets: [], petLevels: {}, activePet: null };
}
/**
 * v6 → v7 (Task 21): quest counters (per-type kills, elites, bosses, chests, synergies start at 0;
 * the best tier-4+ loadout is read from the current loadouts) and `questsClaimed: []`. Quests the
 * profile already satisfies (maps won, class levels, total kills, item levels, worn tier-4 gear)
 * become claimable through evaluation. Nothing else changes.
 */
export function migrateV6toV7(data: Json): Json {
  let best = 0;
  if (isObject(data.classes))
    for (const value of Object.values(data.classes))
      if (isObject(value) && isObject(value.loadout))
        best = Math.max(best, legacyTierItemsWorn(value.loadout as Json));
  return {
    ...data,
    questCounters: { ...NO_QUEST_COUNTERS, bestTierLoadout: best },
    questsClaimed: [],
  };
}
/**
 * v7 → v8 (Task 24): lifetime map-activity counters `questCounters.activities` start at 0 for every
 * type (no retroactive credit). Nothing else changes.
 */
export function migrateV7toV8(data: Json): Json {
  return isObject(data.questCounters)
    ? { ...data, questCounters: { ...data.questCounters, activities: { ...NO_ACTIVITY_COUNTS } } }
    : data; // a missing / invalid counters object is left for validation
}
/**
 * v8 → v9 (Task 39): map difficulty tiers. `mapTiers` (hardest tier won above Normal per map) starts
 * empty: maps already won count as Normal wins through `completedMaps`. Nothing else changes.
 */
export function migrateV8toV9(data: Json): Json {
  return { ...data, mapTiers: {} };
}
/**
 * v9 → v10 (Task 40, items-rework branch rule): everything is kept except equipment. Owned items,
 * loadouts and Forge levels reset — every class gets its starter weapon, other slots empty; the
 * new item fields start empty and the shop salt is derived from the profile id. Class XP above the
 * new (steeper at low levels) cost of its level is clamped to one XP short of the next level, so
 * levels never change. Gold, Ore, maps, talents, quests, pets and settings are kept.
 */
export function migrateV9toV10(data: Json): Json {
  const { ownedItems: _o, itemLevels: _l, ...rest } = data;
  void _o;
  void _l;
  const classes = isObject(data.classes)
    ? Object.fromEntries(
        Object.entries(data.classes).map(([id, value]) => {
          if (!isObject(value) || !CHARACTER_CLASSES.includes(id as CharacterClass))
            return [id, value];
          const level = value.level;
          const cost =
            Number.isInteger(level) &&
            (level as number) >= 1 &&
            (level as number) <= MAX_CLASS_LEVEL
              ? xpToNextLevel(level as number)
              : null;
          const xp =
            typeof value.xp === 'number' && cost !== null && value.xp >= cost ? cost - 1 : value.xp;
          return [
            id,
            {
              ...value,
              ...(xp === undefined ? {} : { xp }),
              loadout: defaultLoadout(id as CharacterClass),
            },
          ];
        }),
      )
    : data.classes;
  return {
    ...rest,
    classes,
    items: [],
    nextItemNumber: 1,
    shopSalt: typeof data.profileId === 'string' ? shopSaltOf(data.profileId) : 0,
    shopBought: {},
  };
}
/**
 * v10 → v11 (Task 41): every class gets slot levels 0 in all seven slots and the profile an empty
 * «new» list (existing items are not new). Nothing else changes.
 */
export function migrateV10toV11(data: Json): Json {
  const classes = isObject(data.classes)
    ? Object.fromEntries(
        Object.entries(data.classes).map(([id, value]) => [
          id,
          isObject(value) ? { ...value, slotLevels: { ...NO_SLOT_LEVELS } } : value,
        ]),
      )
    : data.classes;
  return { ...data, classes, newItems: [] };
}
export const migrations: Readonly<Record<number, Migration>> = Object.freeze({
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
  8: migrateV8toV9,
  9: migrateV9toV10,
  10: migrateV10toV11,
});

export type SaveErrorCode =
  | 'malformed-json'
  | 'not-an-object'
  | 'newer-version'
  | 'unsupported-version'
  | 'invalid';
export class SaveDataError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SaveDataError';
  }
}
export type ParseResult =
  | { readonly ok: true; readonly profile: PlayerProfile; readonly migratedFrom: number | null }
  | { readonly ok: false; readonly error: SaveDataError };

const MAP_COUNT = CAMPAIGN_MAPS.length;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = (what: string): never => {
  throw new SaveDataError('invalid', `Invalid save field: ${what}.`);
};
function int(v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) invalid(what);
  return v as number;
}
function num(v: unknown, what: string, min = 0, max = 1e9): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) invalid(what);
  return v as number;
}
function str(v: unknown, what: string, max = 200): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) invalid(what);
  return v as string;
}
function iso(v: unknown, what: string): string {
  const s = str(v, what, 64);
  if (Number.isNaN(Date.parse(s))) invalid(what);
  return s;
}
const cls = (v: unknown, what: string): CharacterClass =>
  CHARACTER_CLASSES.includes(v as CharacterClass) ? (v as CharacterClass) : invalid(what);
const mapId = (v: unknown, what: string) => int(v, what, 1, MAP_COUNT);
const or = <T>(v: unknown, fallback: T): unknown => (v === undefined ? fallback : v);

/** Task 09 §1.4: known nodes, ranks 0–3, prerequisites, level-30 gate, spent ≤ earned. */
function talentRanks(c: CharacterClass, level: number, raw: unknown, what: string) {
  const r = validateTalentRanks(c, level, raw);
  return r.ok ? r.ranks : invalid(what);
}
/**
 * Task 40: a class loadout — owned instance uids (or the class's starter weapon), right slot and
 * class, item level ≤ the class level.
 */
function loadout(
  raw: unknown,
  c: CharacterClass,
  items: readonly ItemInstance[],
  level: number,
): Loadout {
  if (raw === undefined) return defaultLoadout(c);
  if (!isObject(raw)) invalid(`classes.${c}.loadout`);
  const v = raw as Json;
  const out: Record<string, string | null> = {};
  for (const slot of GEAR_SLOTS) {
    const uid = or(v[slot], slot === 'weapon' ? defaultLoadout(c).weapon : null);
    const what = `classes.${c}.loadout.${slot}`;
    if (uid === null) {
      if (slot === 'weapon') invalid(what); // the weapon slot always holds a weapon
      out[slot] = null;
      continue;
    }
    const item = typeof uid === 'string' ? findOwned(items, uid, c) : null;
    if (!item || item.slot !== slot || equipBlock(item, c, level)) invalid(what);
    out[slot] = item!.uid;
  }
  return Object.freeze(out as Record<(typeof GEAR_SLOTS)[number], string | null>);
}
function slotLevels(raw: unknown, what: string): SlotLevels {
  try {
    return validateSlotLevels(raw);
  } catch {
    return invalid(what);
  }
}
function classProgress(raw: unknown, c: string, items: readonly ItemInstance[]): ClassProgress {
  const v = isObject(raw) ? raw : raw === undefined ? {} : invalid(`classes.${c}`);
  const level = int(
    or(v.level, NEW_CLASS_PROGRESS.level),
    `classes.${c}.level`,
    1,
    MAX_CLASS_LEVEL,
  );
  const cost = xpToNextLevel(level);
  const xp = int(or(v.xp, 0), `classes.${c}.xp`, 0, cost === null ? 0 : cost - 1);
  return Object.freeze({
    xp,
    level,
    lifetimeXp: int(or(v.lifetimeXp, 0), `classes.${c}.lifetimeXp`),
    talents: talentRanks(c as CharacterClass, level, or(v.talents, {}), `classes.${c}.talents`),
    loadout: loadout(v.loadout, c as CharacterClass, items, level),
    slotLevels: slotLevels(or(v.slotLevels, {}), `classes.${c}.slotLevels`),
  });
}
function mapBest(raw: unknown, key: string): MapBest {
  if (!isObject(raw)) invalid(`bestResults.${key}`);
  const v = raw as Json;
  const clear = or(v.bestClearTime, null);
  return Object.freeze({
    victories: int(or(v.victories, 0), `bestResults.${key}.victories`),
    bestClearTime: clear === null ? null : num(clear, `bestResults.${key}.bestClearTime`),
    bestSurvivalTime: num(or(v.bestSurvivalTime, 0), `bestResults.${key}.bestSurvivalTime`),
    bestKills: int(or(v.bestKills, 0), `bestResults.${key}.bestKills`),
  });
}
function runStats(raw: unknown, what: string): RunStatsSummary {
  try {
    return validateRunStatsSummary(raw, what);
  } catch {
    return invalid(what);
  }
}
function recentRun(raw: unknown, i: number): RecentRun {
  if (!isObject(raw)) invalid(`recentRuns[${i}]`);
  const v = raw as Json,
    p = `recentRuns[${i}]`;
  const outcome = v.outcome;
  if (outcome !== 'victory' && outcome !== 'defeat' && outcome !== 'abandoned')
    invalid(`${p}.outcome`);
  const levelBefore = int(v.levelBefore, `${p}.levelBefore`, 1, MAX_CLASS_LEVEL);
  const levelAfter = int(v.levelAfter, `${p}.levelAfter`, levelBefore, MAX_CLASS_LEVEL);
  const unlocked = or(v.unlockedMap, null);
  const finishedAt = or(v.finishedAt, null);
  return Object.freeze({
    runId: str(v.runId, `${p}.runId`, 100),
    mapId: mapId(v.mapId, `${p}.mapId`),
    characterClass: cls(v.characterClass, `${p}.characterClass`),
    outcome: outcome as RecentRun['outcome'],
    elapsed: num(v.elapsed, `${p}.elapsed`),
    kills: int(v.kills, `${p}.kills`),
    eliteKills: int(or(v.eliteKills, 0), `${p}.eliteKills`),
    bossKilled: typeof v.bossKilled === 'boolean' ? v.bossKilled : invalid(`${p}.bossKilled`),
    xp: int(v.xp, `${p}.xp`),
    gold: int(v.gold, `${p}.gold`),
    // Task 19: optional (absent in older runs).
    ...(v.ore === undefined ? {} : { ore: int(v.ore, `${p}.ore`) }),
    levelBefore,
    levelAfter,
    levelsGained: int(or(v.levelsGained, levelAfter - levelBefore), `${p}.levelsGained`),
    unlockedMap: unlocked === null ? null : mapId(unlocked, `${p}.unlockedMap`),
    // Task 39: optional (absent = Normal; Normal is never stored).
    ...(v.difficulty === undefined
      ? {}
      : {
          difficulty:
            isCampaignDifficulty(v.difficulty) && v.difficulty !== 'normal'
              ? v.difficulty
              : invalid(`${p}.difficulty`),
        }),
    ...(v.unlockedTier === undefined
      ? {}
      : {
          unlockedTier:
            isCampaignDifficulty(v.unlockedTier) && v.unlockedTier !== 'normal'
              ? v.unlockedTier
              : invalid(`${p}.unlockedTier`),
        }),
    finishedAt: finishedAt === null ? null : iso(finishedAt, `${p}.finishedAt`),
    // Task 08.5: optional additive field (older saves have none; schema version unchanged).
    ...(v.stats === undefined ? {} : { stats: runStats(v.stats, `${p}.stats`) }),
  });
}

/** Validates current-version data, filling defaults for missing fields. Throws SaveDataError. */
export function normalizeProfile(data: Json, version = SAVE_SCHEMA_VERSION): PlayerProfile {
  if (data.schemaVersion !== version) invalid('schemaVersion');
  // Task 40: owned item instances first (valid, unique uids `i<n>` below the next number);
  // loadouts check them.
  const nextItemNumber = int(or(data.nextItemNumber, 1), 'nextItemNumber', 1);
  const itemsRaw = or(data.items, []);
  if (!Array.isArray(itemsRaw)) invalid('items');
  const items = (itemsRaw as unknown[]).map((raw, i) => {
    let item: ItemInstance;
    try {
      item = validateItem(raw);
    } catch {
      return invalid(`items[${i}]`);
    }
    const m = /^i([1-9][0-9]*)$/.exec(item.uid);
    if (!m || Number(m[1]) >= nextItemNumber || isStarterUid(item.uid)) invalid(`items[${i}].uid`);
    return item;
  });
  if (new Set(items.map((i) => i.uid)).size !== items.length) invalid('items (duplicate uids)');
  // Task 41: the «new» markers — unique uids of owned items.
  const newRaw = or(data.newItems, []);
  if (!Array.isArray(newRaw)) invalid('newItems');
  const owned = new Set(items.map((i) => i.uid));
  const newItems = (newRaw as unknown[]).map((uid, i) =>
    typeof uid === 'string' && owned.has(uid) ? uid : invalid(`newItems[${i}]`),
  );
  if (new Set(newItems).size !== newItems.length) invalid('newItems (duplicates)');
  const shopSalt = int(
    or(data.shopSalt, shopSaltOf(String(data.profileId))),
    'shopSalt',
    0,
    0xffffffff,
  );
  const boughtRaw = or(data.shopBought, {});
  if (!isObject(boughtRaw)) invalid('shopBought');
  const shopBought: Partial<Record<CharacterClass, ShopBought>> = {};
  for (const [c, value] of Object.entries(boughtRaw as Json)) {
    if (!CHARACTER_CLASSES.includes(c as CharacterClass) || !isObject(value))
      invalid(`shopBought.${c}`);
    const v = value as Json;
    const offers = Array.isArray(v.offers) ? v.offers : invalid(`shopBought.${c}.offers`);
    const ids = (offers as unknown[]).map((id, i) =>
      typeof id === 'string' && /^[a-z]+:(common|uncommon:[a-zA-Z]+)$/.test(id)
        ? id
        : invalid(`shopBought.${c}.offers[${i}]`),
    );
    if (new Set(ids).size !== ids.length) invalid(`shopBought.${c}.offers (duplicates)`);
    shopBought[c as CharacterClass] = Object.freeze({
      level: int(v.level, `shopBought.${c}.level`, 1, MAX_CLASS_LEVEL),
      offers: Object.freeze(ids),
    });
  }
  // Task 20: pets — known unique ids; levels 1–5 of owned pets (1 not kept); active pet owned.
  const petsRaw = or(data.ownedPets, []);
  if (!Array.isArray(petsRaw)) invalid('ownedPets');
  const ownedPets = (petsRaw as unknown[]).map((id, i) =>
    isPetId(id) ? id : invalid(`ownedPets[${i}]`),
  );
  if (new Set(ownedPets).size !== ownedPets.length) invalid('ownedPets (duplicates)');
  const petLevelsRaw = or(data.petLevels, {});
  if (!isObject(petLevelsRaw)) invalid('petLevels');
  const petLevels: Record<string, number> = {};
  for (const [id, level] of Object.entries(petLevelsRaw as Json)) {
    if (!isPetId(id) || !ownedPets.includes(id)) invalid(`petLevels.${id}`);
    if (int(level, `petLevels.${id}`, 1, PET_LEVEL_RULES.maxLevel) > 1)
      petLevels[id] = level as number;
  }
  const activeRaw = or(data.activePet, null);
  if (activeRaw !== null && !(isPetId(activeRaw) && ownedPets.includes(activeRaw)))
    invalid('activePet');
  const classesRaw = or(data.classes, {});
  if (!isObject(classesRaw)) invalid('classes');
  const classes = Object.freeze(
    Object.fromEntries(
      CHARACTER_CLASSES.map((c) => [c, classProgress((classesRaw as Json)[c], c, items)]),
    ) as Record<CharacterClass, ClassProgress>,
  );
  const highestUnlockedMap = mapId(or(data.highestUnlockedMap, 1), 'highestUnlockedMap');
  const completedRaw = or(data.completedMaps, []);
  if (!Array.isArray(completedRaw)) invalid('completedMaps');
  const completedMaps = [
    ...new Set((completedRaw as unknown[]).map((m, i) => mapId(m, `completedMaps[${i}]`))),
  ].sort((a, b) => a - b);
  // A completed map always unlocks the next one: the data must be consistent.
  for (const m of completedMaps)
    if (m > highestUnlockedMap || Math.min(MAP_COUNT, m + 1) > highestUnlockedMap)
      invalid('completedMaps/highestUnlockedMap');
  // Task 39: hardest tier above Normal won per map; only on maps won at all.
  const tiersRaw = or(data.mapTiers, {});
  if (!isObject(tiersRaw)) invalid('mapTiers');
  const mapTiers: Record<string, Exclude<CampaignDifficulty, 'normal'>> = {};
  for (const [key, value] of Object.entries(tiersRaw as Json)) {
    const id = mapId(Number(key), `mapTiers.${key}`);
    if (String(id) !== key || !completedMaps.includes(id)) invalid(`mapTiers.${key}`);
    if (!isCampaignDifficulty(value) || value === 'normal') invalid(`mapTiers.${key}`);
    mapTiers[key] = value as Exclude<CampaignDifficulty, 'normal'>;
  }
  const bestRaw = or(data.bestResults, {});
  if (!isObject(bestRaw)) invalid('bestResults');
  const bestResults: Record<string, MapBest> = {};
  for (const [key, value] of Object.entries(bestRaw as Json)) {
    if (String(mapId(Number(key), `bestResults.${key}`)) !== key) invalid(`bestResults.${key}`);
    bestResults[key] = mapBest(value, key);
  }
  const statsRaw = or(data.stats, {});
  if (!isObject(statsRaw)) invalid('stats');
  const st = statsRaw as Json;
  const recentRaw = or(data.recentRuns, []);
  if (!Array.isArray(recentRaw) || recentRaw.length > MAX_RECENT_RUNS) invalid('recentRuns');
  const idsRaw = or(data.processedRunIds, []);
  if (!Array.isArray(idsRaw) || idsRaw.length > MAX_PROCESSED_RUN_IDS) invalid('processedRunIds');
  const processedRunIds = (idsRaw as unknown[]).map((id, i) =>
    str(id, `processedRunIds[${i}]`, 100),
  );
  if (new Set(processedRunIds).size !== processedRunIds.length)
    invalid('processedRunIds (duplicates)');
  const lastSavedAt = or(data.lastSavedAt, null);
  const questCounters = questCountersOf(or(data.questCounters, NO_QUEST_COUNTERS));
  const claimedRaw = or(data.questsClaimed, []);
  if (!Array.isArray(claimedRaw)) invalid('questsClaimed');
  const questsClaimed = (claimedRaw as unknown[]).map((id, i) =>
    typeof id === 'string' && QUEST_BY_ID.has(id) ? id : invalid(`questsClaimed[${i}]`),
  );
  if (new Set(questsClaimed).size !== questsClaimed.length) invalid('questsClaimed (duplicates)');
  const profile: PlayerProfile = Object.freeze({
    schemaVersion: version,
    profileId: str(data.profileId, 'profileId', 100),
    createdAt: iso(data.createdAt, 'createdAt'),
    lastSavedAt: lastSavedAt === null ? null : iso(lastSavedAt, 'lastSavedAt'),
    selectedClass: cls(or(data.selectedClass, 'warrior'), 'selectedClass'),
    classes,
    gold: int(or(data.gold, 0), 'gold'),
    ore: int(or(data.ore, 0), 'ore'),
    highestUnlockedMap,
    completedMaps: Object.freeze(completedMaps),
    mapTiers: Object.freeze(mapTiers),
    bestResults: Object.freeze(bestResults),
    stats: Object.freeze({
      runs: int(or(st.runs, 0), 'stats.runs'),
      wins: int(or(st.wins, 0), 'stats.wins'),
      defeats: int(or(st.defeats, 0), 'stats.defeats'),
      enemiesKilled: int(or(st.enemiesKilled, 0), 'stats.enemiesKilled'),
      bestSurvivalTime: num(or(st.bestSurvivalTime, 0), 'stats.bestSurvivalTime'),
    }),
    recentRuns: Object.freeze((recentRaw as unknown[]).map(recentRun)),
    processedRunIds: Object.freeze(processedRunIds),
    items: Object.freeze(items),
    newItems: Object.freeze(newItems),
    bagExpansions: int(
      or(data.bagExpansions, 0),
      'bagExpansions',
      0,
      BAG_RULES.expansionPrices.length,
    ),
    nextItemNumber,
    shopSalt,
    shopBought: Object.freeze(shopBought),
    ownedPets: Object.freeze(ownedPets),
    petLevels: Object.freeze(petLevels),
    activePet: activeRaw as string | null,
    questCounters,
    questsClaimed: Object.freeze(questsClaimed),
  });
  // Task 21: a claimed quest must be complete in this very profile (no claim of an incomplete one).
  // Task 40: the hidden Forge quests keep their claims (they can't be re-measured without the Forge).
  for (const id of questsClaimed)
    if (
      !QUEST_BY_ID.get(id)!.hidden &&
      questProgress({ ...profile, questsClaimed: [] }, QUEST_BY_ID.get(id)!).state !== 'complete'
    )
      invalid(`questsClaimed.${id} (incomplete)`);
  return profile;
}

/** Parse → version check → migrate → normalize/validate. Never throws; never mutates input. */
export interface ParseOptions {
  /** Test seam: migration table and target version (defaults: the shipped schema). */
  readonly migrations?: Readonly<Record<number, Migration>>;
  readonly targetVersion?: number;
}
export function parseProfile(raw: unknown, options: ParseOptions = {}): ParseResult {
  const table = options.migrations ?? migrations;
  const target = options.targetVersion ?? SAVE_SCHEMA_VERSION;
  try {
    if (!isObject(raw)) throw new SaveDataError('not-an-object', 'Save data is not an object.');
    let data: Json = structuredClone(raw);
    const version = data.schemaVersion;
    if (!Number.isSafeInteger(version) || (version as number) < 1)
      throw new SaveDataError('invalid', 'Save data has no valid schemaVersion.');
    if ((version as number) > target)
      throw new SaveDataError(
        'newer-version',
        `Save was made by a newer version (v${version}; this game supports v${target}).`,
      );
    const from = version as number;
    for (let v = from; v < target; v++) {
      const step = table[v];
      if (!step) throw new SaveDataError('unsupported-version', `No migration from v${v}.`);
      data = { ...step(data), schemaVersion: v + 1 };
    }
    return Object.freeze({
      ok: true,
      profile: normalizeProfile(data, target),
      migratedFrom: from < target ? from : null,
    });
  } catch (error) {
    if (error instanceof SaveDataError) return Object.freeze({ ok: false, error });
    return Object.freeze({
      ok: false,
      error: new SaveDataError('invalid', 'Save data could not be read.'),
    });
  }
}
/** JSON text → profile. Never throws. */
export function parseProfileJson(text: string, options: ParseOptions = {}): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return Object.freeze({
      ok: false,
      error: new SaveDataError('malformed-json', 'Save file is not valid JSON.'),
    });
  }
  return parseProfile(raw, options);
}
/** Task 21: quest counters — whole numbers ≥ 0, known distinct maps / synergies. */
function questCountersOf(raw: unknown): QuestCounters {
  if (!isObject(raw)) invalid('questCounters');
  const v = raw as Json;
  const k = or(v.killsByType, {});
  if (!isObject(k)) invalid('questCounters.killsByType');
  const kk = k as Json;
  const list = <T>(x: unknown, what: string, check: (e: unknown) => e is T): T[] => {
    const arr = or(x, []);
    if (!Array.isArray(arr)) invalid(what);
    const items = (arr as unknown[]).map((e, i) => (check(e) ? e : invalid(`${what}[${i}]`)));
    if (new Set(items).size !== items.length) invalid(`${what} (duplicates)`);
    return items;
  };
  const isMap = (e: unknown): e is number =>
    Number.isSafeInteger(e) && (e as number) >= 1 && (e as number) <= MAP_COUNT;
  const isSynergy = (e: unknown): e is string => typeof e === 'string' && SYNERGY_IDS.has(e);
  const opened = list(v.synergiesOpened, 'questCounters.synergiesOpened', isSynergy).sort();
  const awakened = list(v.synergiesAwakened, 'questCounters.synergiesAwakened', isSynergy).sort();
  if (awakened.some((id) => !opened.includes(id))) invalid('questCounters.synergiesAwakened');
  return Object.freeze({
    killsByType: Object.freeze({
      swift: int(or(kk.swift, 0), 'questCounters.killsByType.swift'),
      brute: int(or(kk.brute, 0), 'questCounters.killsByType.brute'),
      bombard: int(or(kk.bombard, 0), 'questCounters.killsByType.bombard'),
    }),
    eliteKills: int(or(v.eliteKills, 0), 'questCounters.eliteKills'),
    bossesDefeated: Object.freeze(
      list(v.bossesDefeated, 'questCounters.bossesDefeated', isMap).sort((a, b) => a - b),
    ),
    chestsOpened: int(or(v.chestsOpened, 0), 'questCounters.chestsOpened'),
    synergiesOpened: Object.freeze(opened),
    synergiesAwakened: Object.freeze(awakened),
    bestTierLoadout: int(or(v.bestTierLoadout, 0), 'questCounters.bestTierLoadout', 0, 7),
    activities: activityCountsOf(or(v.activities, NO_ACTIVITY_COUNTS)),
  });
}
/** Task 24: completed activities per type — whole numbers ≥ 0 for exactly the known types. */
function activityCountsOf(raw: unknown): ActivityCounts {
  if (!isObject(raw)) invalid('questCounters.activities');
  const v = raw as Json;
  for (const key of Object.keys(v))
    if (!(ACTIVITY_COUNTER_TYPES as readonly string[]).includes(key))
      invalid(`questCounters.activities.${key}`);
  return Object.freeze(
    Object.fromEntries(
      ACTIVITY_COUNTER_TYPES.map((t) => [t, int(or(v[t], 0), `questCounters.activities.${t}`)]),
    ),
  ) as ActivityCounts;
}
