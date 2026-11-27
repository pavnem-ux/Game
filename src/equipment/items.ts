import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import type { RandomSource } from '../combat-core';
import {
  AFFIX_LEVEL_RULES,
  AFFIX_RULES,
  GEAR_SLOTS,
  GEAR_TEMPLATES,
  ITEM_LEVEL_RANGE,
  MAIN_STAT_RULES,
  RARITIES,
  RARITY_CONFIG,
  SHARED_BANDS,
  SLOT_AFFIX_POOLS,
  STARTER_WEAPONS,
  WEAPON_BANDS,
} from './config';
import { checkLegendaryFit, legendaryDef } from './legendaries';
import { formatStatLine } from './stat-format';
import type { AffixStat, GearSlot, GearTemplate, LegendaryId, Rarity } from './config';

/**
 * Task 40 item instances (pure). Two items of the same slot, level and rarity can differ by their
 * rolled secondary stats, so every owned item is an instance with its own `uid`. Stats depend only
 * on slot, item level and rarity (+ the class's damage type for damage main stats); the name and
 * icon come from the item-level band of the slot (§1a).
 */
export interface ItemAffix {
  readonly stat: AffixStat;
  readonly value: number;
}
export interface ItemInstance {
  readonly uid: string;
  readonly slot: GearSlot;
  /** Weapons only: the class that can use it. */
  readonly characterClass?: CharacterClass;
  readonly itemLevel: number;
  readonly rarity: Rarity;
  readonly affixes: readonly ItemAffix[];
  /** Task 43 (unused until then): the Legendary unique effect. */
  readonly legendaryId?: string;
  /** Task 42: how many times this item was reforged (absent = 0). */
  readonly reforges?: number;
}
/** Flat main stats of an item (whole numbers). */
export interface MainStats {
  readonly physicalDamage: number;
  readonly magicalDamage: number;
  readonly maxHp: number;
  readonly resistance: number;
}

export const isWeaponSlot = (slot: GearSlot) => slot === 'weapon';
/** The damage type of a class's weapon: magical for the Mage, physical for the rest. */
export const classDamageType = (c: CharacterClass): 'physical' | 'magical' =>
  c === 'mage' ? 'magical' : 'physical';
export const isStarterUid = (uid: string) =>
  Object.values(STARTER_WEAPONS).some((w) => w.id === uid);

/** The starter weapon of a class: always owned, item level 1, Common, no affixes. */
export function starterWeapon(characterClass: CharacterClass): ItemInstance {
  return STARTERS[characterClass];
}
const STARTERS: Readonly<Record<CharacterClass, ItemInstance>> = Object.freeze(
  Object.fromEntries(
    CHARACTER_CLASSES.map((c) => [
      c,
      Object.freeze({
        uid: STARTER_WEAPONS[c].id,
        slot: 'weapon' as const,
        characterClass: c,
        itemLevel: ITEM_LEVEL_RANGE.min,
        rarity: 'common' as const,
        affixes: Object.freeze([]),
      }),
    ]),
  ) as unknown as Record<CharacterClass, ItemInstance>,
);

// ── Main stats (§3) ──

const roundWhole = (v: number) => Math.round(v);
/** Weapon flat damage before the rarity factor (unrounded). */
const weaponDamage = (level: number) =>
  MAIN_STAT_RULES.weaponDamageBase + MAIN_STAT_RULES.weaponDamagePerLevel * level;
const armorHp = (level: number) =>
  MAIN_STAT_RULES.armorHpBase + MAIN_STAT_RULES.armorHpPerLevel * level;
const armorResistance = (level: number) =>
  MAIN_STAT_RULES.armorResistanceBase + MAIN_STAT_RULES.armorResistancePerLevel * level;
/**
 * Flat main stats of a slot at an item level and rarity, for a class (damage slots use the class's
 * damage type). Rounded to whole numbers after the rarity factor.
 */
export function mainStats(
  slot: GearSlot,
  level: number,
  rarity: Rarity,
  characterClass: CharacterClass,
): MainStats {
  const k = RARITY_CONFIG[rarity].mainScale;
  let damage = 0,
    hp = 0,
    res = 0;
  const r = MAIN_STAT_RULES;
  if (slot === 'weapon') damage = weaponDamage(level);
  else if (slot === 'gloves') damage = weaponDamage(level) * r.glovesDamageShare;
  else if (slot === 'ring') damage = weaponDamage(level) * r.ringDamageShare;
  else if (slot === 'armor') {
    hp = armorHp(level);
    res = armorResistance(level);
  } else if (slot === 'helmet') hp = armorHp(level) * r.helmetHpShare;
  else if (slot === 'amulet') hp = armorHp(level) * r.amuletHpShare;
  else res = armorResistance(level) * r.pantsResistanceShare;
  const dmg = roundWhole(damage * k);
  const magical = classDamageType(characterClass) === 'magical';
  return Object.freeze({
    physicalDamage: magical ? 0 : dmg,
    magicalDamage: magical ? dmg : 0,
    maxHp: roundWhole(hp * k),
    resistance: roundWhole(res * k),
  });
}
/** Main stats of an item for the class wearing it. */
export const itemMainStats = (item: ItemInstance, characterClass: CharacterClass): MainStats =>
  mainStats(item.slot, item.itemLevel, item.rarity, item.characterClass ?? characterClass);

// ── Secondary stats (§4) ──

/** Maximum (100% roll) of a secondary stat at an item level. */
export function affixMax(stat: AffixStat, level: number): number {
  const L = AFFIX_LEVEL_RULES;
  return (
    AFFIX_RULES[stat].max *
    (L.levelBase + (L.levelGrowth * (level - ITEM_LEVEL_RANGE.min)) / (ITEM_LEVEL_RANGE.max - 1))
  );
}
/** Value of a secondary stat at an item level and roll (0–1), rounded to the stat's decimals. */
export function affixValue(stat: AffixStat, level: number, roll: number): number {
  const p = 10 ** AFFIX_RULES[stat].decimals;
  return Math.round(affixMax(stat, level) * roll * p) / p;
}
/** The secondary stat pool of a slot for a class (the weapon's class damage % resolved). */
export function affixPool(slot: GearSlot, characterClass: CharacterClass): readonly AffixStat[] {
  return SLOT_AFFIX_POOLS[slot].map((s) =>
    s === 'classDamagePercent'
      ? classDamageType(characterClass) === 'magical'
        ? 'magicalDamagePercent'
        : 'physicalDamagePercent'
      : s,
  );
}
/**
 * Generates an item instance from a seeded random source (Task 40 `items` stream / a seeded draw):
 * distinct secondary stats from the slot pool (count by rarity), each rolled in the rarity's range.
 * `stats` forces the secondary stats (the shop's Uncommon offers); otherwise they are drawn.
 */
export function generateItem(
  random: RandomSource,
  spec: Readonly<{
    uid: string;
    slot: GearSlot;
    itemLevel: number;
    rarity: Rarity;
    characterClass: CharacterClass;
    stats?: readonly AffixStat[];
    /** Task 43: the unique effect of a Legendary (checked against the slot / class). */
    legendaryId?: LegendaryId;
  }>,
): ItemInstance {
  if (spec.legendaryId !== undefined) {
    if (spec.rarity !== 'legendary') throw new RangeError('Only a Legendary has a unique effect.');
    checkLegendaryFit(spec.legendaryId, spec.slot, spec.characterClass);
  }
  validateLevel(spec.itemLevel);
  if (!RARITIES.includes(spec.rarity)) throw new RangeError('Unknown rarity.');
  if (!GEAR_SLOTS.includes(spec.slot)) throw new RangeError('Unknown slot.');
  const rc = RARITY_CONFIG[spec.rarity];
  const pool = [...affixPool(spec.slot, spec.characterClass)];
  let stats: AffixStat[];
  if (spec.stats) {
    if (spec.stats.length !== rc.affixes || new Set(spec.stats).size !== spec.stats.length)
      throw new RangeError('Wrong number of secondary stats.');
    for (const s of spec.stats)
      if (!pool.includes(s)) throw new RangeError(`Stat ${s} is not in the ${spec.slot} pool.`);
    stats = [...spec.stats];
  } else {
    stats = [];
    for (let i = 0; i < rc.affixes; i++) {
      const at = Math.min(pool.length - 1, Math.floor(random() * pool.length));
      stats.push(pool.splice(at, 1)[0]);
    }
  }
  const affixes = stats.map((stat) => {
    const roll = rc.rollMin + (rc.rollMax - rc.rollMin) * (rc.rollMax > rc.rollMin ? random() : 0);
    return Object.freeze({ stat, value: affixValue(stat, spec.itemLevel, roll) });
  });
  return Object.freeze({
    uid: spec.uid,
    slot: spec.slot,
    ...(spec.slot === 'weapon' ? { characterClass: spec.characterClass } : {}),
    itemLevel: spec.itemLevel,
    rarity: spec.rarity,
    affixes: Object.freeze(affixes),
    ...(spec.legendaryId !== undefined ? { legendaryId: spec.legendaryId } : {}),
  });
}

// ── Names and icons (§1a) ──

const TEMPLATES: ReadonlyMap<string, GearTemplate> = new Map(GEAR_TEMPLATES.map((g) => [g.id, g]));
/** The band base template (name + icon) of an item. */
export function bandTemplate(item: Pick<ItemInstance, 'slot' | 'itemLevel' | 'characterClass'>) {
  const bands =
    item.slot === 'weapon' ? WEAPON_BANDS[item.characterClass!] : SHARED_BANDS[item.slot];
  let id = bands[0][1] as string;
  for (const [from, template] of bands) if (item.itemLevel >= from) id = template;
  return TEMPLATES.get(id)!;
}
/** The secondary stat whose roll is highest relative to its maximum (ties: first in pool order). */
export function dominantAffix(item: ItemInstance): AffixStat | null {
  if (!item.affixes.length) return null;
  const pool = affixPool(item.slot, item.characterClass ?? 'warrior');
  const ranked = [...item.affixes].sort((a, b) => {
    const ra = a.value / affixMax(a.stat, item.itemLevel);
    const rb = b.value / affixMax(b.stat, item.itemLevel);
    return rb - ra || pool.indexOf(a.stat) - pool.indexOf(b.stat);
  });
  return ranked[0].stat;
}
/** «Plate Gauntlets of Fury» (Common: no suffix; starter weapons keep their own names). */
export function itemName(item: ItemInstance): string {
  if (isStarterUid(item.uid)) return STARTER_WEAPONS[item.characterClass!].name;
  // Task 43: a Legendary with a unique effect has its own name (no stat suffix).
  const legendary = item.legendaryId ? legendaryDef(item.legendaryId) : null;
  if (legendary) return legendary.name;
  const base = bandTemplate(item).name;
  const top = dominantAffix(item);
  return top ? `${base} ${AFFIX_RULES[top].suffix}` : base;
}
/** Template id whose art is the item's icon (starter weapons: their own id). */
export function itemIconId(item: ItemInstance): string {
  // Task 45: a Legendary with a unique effect has its own icon (`item_<legendaryId>`).
  if (item.legendaryId && legendaryDef(item.legendaryId)) return item.legendaryId;
  return itemBandIconId(item);
}
/** The slot's band icon (Task 40): the fallback when a Legendary icon is missing. */
export function itemBandIconId(item: ItemInstance): string {
  return isStarterUid(item.uid) ? item.uid : bandTemplate(item).id;
}
/** «+3.4% Crit damage» style text of a secondary stat. */
export function affixText(affix: ItemAffix): string {
  // Task 44: the one stat formatter («Crit chance +3.2%»).
  return formatStatLine(affix.stat, affix.value);
}

// ── Validation ──

function validateLevel(level: number): void {
  if (!Number.isInteger(level) || level < ITEM_LEVEL_RANGE.min || level > ITEM_LEVEL_RANGE.max)
    throw new RangeError(`Invalid item level: ${String(level)}.`);
}
/**
 * Rejects a malformed item instance (shape, slot / class, level, rarity, secondary stats: count by
 * rarity, from the slot pool, no duplicates, within the level's 0–100% roll range). Returns a frozen
 * copy with only the known fields.
 */
export function validateItem(raw: unknown): ItemInstance {
  const v = raw as Partial<ItemInstance> | null;
  if (!v || typeof v !== 'object') throw new RangeError('Item must be an object.');
  if (typeof v.uid !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(v.uid))
    throw new RangeError('Invalid item uid.');
  if (isStarterUid(v.uid)) throw new RangeError('Starter weapons are not stored items.');
  if (!GEAR_SLOTS.includes(v.slot as GearSlot)) throw new RangeError('Invalid item slot.');
  const weapon = v.slot === 'weapon';
  if (weapon !== (v.characterClass !== undefined))
    throw new RangeError('Only weapons are class-specific.');
  if (weapon && !CHARACTER_CLASSES.includes(v.characterClass as CharacterClass))
    throw new RangeError('Invalid weapon class.');
  validateLevel(v.itemLevel as number);
  if (!RARITIES.includes(v.rarity as Rarity)) throw new RangeError('Invalid rarity.');
  if (!Array.isArray(v.affixes)) throw new RangeError('Invalid secondary stats.');
  const rc = RARITY_CONFIG[v.rarity as Rarity];
  if (v.affixes.length !== rc.affixes) throw new RangeError('Wrong number of secondary stats.');
  const pool = affixPool(v.slot as GearSlot, (v.characterClass as CharacterClass) ?? 'warrior');
  const seen = new Set<string>();
  const affixes = v.affixes.map((a) => {
    const stat = a?.stat as AffixStat;
    if (!pool.includes(stat) || seen.has(stat)) throw new RangeError('Invalid secondary stat.');
    seen.add(stat);
    const max = affixMax(stat, v.itemLevel as number);
    if (typeof a.value !== 'number' || !(a.value > 0) || a.value > max + 1e-9 + 0.05)
      throw new RangeError('Secondary stat value out of range.');
    return Object.freeze({ stat, value: a.value });
  });
  // Task 43: a unique effect only on a Legendary of the right slot (and class for weapons).
  if (v.legendaryId !== undefined) {
    if (typeof v.legendaryId !== 'string' || v.rarity !== 'legendary')
      throw new RangeError('Invalid legendary id.');
    checkLegendaryFit(v.legendaryId, v.slot as GearSlot, v.characterClass);
  }
  if (
    v.reforges !== undefined &&
    (!Number.isSafeInteger(v.reforges) || v.reforges < 1 || v.reforges > MAX_REFORGES)
  )
    throw new RangeError('Invalid reforge count.');
  return Object.freeze({
    uid: v.uid,
    slot: v.slot as GearSlot,
    ...(weapon ? { characterClass: v.characterClass } : {}),
    itemLevel: v.itemLevel as number,
    rarity: v.rarity as Rarity,
    affixes: Object.freeze(affixes),
    ...(v.legendaryId !== undefined ? { legendaryId: v.legendaryId } : {}),
    ...(v.reforges !== undefined ? { reforges: v.reforges } : {}),
  });
}
/** Task 42: a sanity bound on the saved reforge count (cost grows ×1.25 each time). */
export const MAX_REFORGES = 1000;

/** Startup validation of the item configuration. */
export function validateEquipmentConfig(): void {
  for (const slot of GEAR_SLOTS) {
    const pool = SLOT_AFFIX_POOLS[slot];
    if (pool.length !== 6 || new Set(pool).size !== pool.length)
      throw new Error(`Slot ${slot} needs 6 distinct secondary stats.`);
  }
  for (const r of RARITIES) {
    const c = RARITY_CONFIG[r];
    if (c.affixes > 6 || !(c.mainScale >= 1) || c.rollMin > c.rollMax || c.rollMax > 1)
      throw new Error(`Rarity ${r} invalid.`);
  }
  for (const bands of [...Object.values(SHARED_BANDS), ...Object.values(WEAPON_BANDS)]) {
    if (bands[0][0] !== ITEM_LEVEL_RANGE.min) throw new Error('Bands must start at level 1.');
    for (const [, id] of bands) if (!TEMPLATES.has(id)) throw new Error(`Unknown template ${id}.`);
  }
}
validateEquipmentConfig();
