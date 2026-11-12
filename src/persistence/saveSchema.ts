import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { CAMPAIGN_MAPS } from '../campaign';
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
  UPGRADE_RULES,
  defaultLoadout,
  findItem,
  isEligible,
  isUpgradeable,
} from '../equipment';
import type { Loadout } from '../equipment';

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
export const migrations: Readonly<Record<number, Migration>> = Object.freeze({
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
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
/** Task 11: a class loadout — known ids, right slot and class, owned (starter always owned). */
function loadout(raw: unknown, c: CharacterClass, owned: ReadonlySet<string>): Loadout {
  if (raw === undefined) return defaultLoadout(c);
  if (!isObject(raw)) invalid(`classes.${c}.loadout`);
  const v = raw as Json;
  const out: Record<string, string | null> = {};
  for (const slot of GEAR_SLOTS) {
    const id = or(v[slot], slot === 'weapon' ? defaultLoadout(c).weapon : null);
    const what = `classes.${c}.loadout.${slot}`;
    if (id === null) {
      if (slot === 'weapon') invalid(what); // the weapon slot always holds a weapon
      out[slot] = null;
      continue;
    }
    const item = typeof id === 'string' ? findItem(id) : null;
    if (!item || !isEligible(item, c, slot)) invalid(what);
    if (!item!.starter && !owned.has(item!.id)) invalid(`${what} (not owned)`);
    out[slot] = item!.id;
  }
  return Object.freeze(out as Record<(typeof GEAR_SLOTS)[number], string | null>);
}
function classProgress(raw: unknown, c: string, owned: ReadonlySet<string>): ClassProgress {
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
    loadout: loadout(v.loadout, c as CharacterClass, owned),
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
    finishedAt: finishedAt === null ? null : iso(finishedAt, `${p}.finishedAt`),
    // Task 08.5: optional additive field (older saves have none; schema version unchanged).
    ...(v.stats === undefined ? {} : { stats: runStats(v.stats, `${p}.stats`) }),
  });
}

/** Validates current-version data, filling defaults for missing fields. Throws SaveDataError. */
export function normalizeProfile(data: Json, version = SAVE_SCHEMA_VERSION): PlayerProfile {
  if (data.schemaVersion !== version) invalid('schemaVersion');
  // Task 11: owned shop items first (known, buyable ids, no duplicates); loadouts check them.
  const ownedRaw = or(data.ownedItems, []);
  if (!Array.isArray(ownedRaw)) invalid('ownedItems');
  const ownedItems = (ownedRaw as unknown[]).map((id, i) => {
    const item = typeof id === 'string' ? findItem(id) : null;
    if (!item || item.starter) invalid(`ownedItems[${i}]`);
    return item!.id;
  });
  if (new Set(ownedItems).size !== ownedItems.length) invalid('ownedItems (duplicates)');
  const owned = new Set(ownedItems);
  // Task 19: forge levels 0–10 of owned (upgradeable) items only; +0 entries are not kept.
  const levelsRaw = or(data.itemLevels, {});
  if (!isObject(levelsRaw)) invalid('itemLevels');
  const itemLevels: Record<string, number> = {};
  for (const [id, level] of Object.entries(levelsRaw as Json)) {
    const item = findItem(id);
    if (!item || !isUpgradeable(item) || !owned.has(id)) invalid(`itemLevels.${id}`);
    if (int(level, `itemLevels.${id}`, 0, UPGRADE_RULES.maxLevel) > 0)
      itemLevels[id] = level as number;
  }
  const classesRaw = or(data.classes, {});
  if (!isObject(classesRaw)) invalid('classes');
  const classes = Object.freeze(
    Object.fromEntries(
      CHARACTER_CLASSES.map((c) => [c, classProgress((classesRaw as Json)[c], c, owned)]),
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
  return Object.freeze({
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
    ownedItems: Object.freeze(ownedItems),
    itemLevels: Object.freeze(itemLevels),
  });
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
