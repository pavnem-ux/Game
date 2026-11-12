import type { CharacterClass } from '../character-stats';
import {
  GEAR_TEMPLATES,
  STARTER_WEAPONS,
  TIER1_STAT_VALUES,
  TIERS,
  SECOND_STAT_REDUCED_SLOTS,
  TIER_CONFIG,
  WEAPON_PRICE_FACTOR,
  WEAPON_SECOND_STAT_FACTOR,
} from './config';
import type { GearSlot, GearStat, GearTemplate, Tier } from './config';

/** One shop item (template × tier) or a starter weapon (tier 0, no stats, not sold). */
export interface GearItem {
  readonly id: string;
  readonly templateId: string;
  readonly name: string;
  readonly slot: GearSlot;
  /** Weapons only: the class that can equip it. */
  readonly characterClass?: CharacterClass;
  readonly tier: Tier | 0;
  /** Stat bonuses (run-modifier units), in template order. */
  readonly stats: Readonly<Partial<Record<GearStat, number>>>;
  readonly price: number;
  /** Highest cleared map needed before the shop sells it (0 = from the start). */
  readonly unlockAfterMap: number;
  readonly starter: boolean;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const lower = (s: string) => s.charAt(0).toLocaleLowerCase('ru') + s.slice(1);

function makeItem(template: GearTemplate, tier: Tier): GearItem {
  const tc = TIER_CONFIG[tier];
  const weapon = template.slot === 'weapon';
  const stats: Partial<Record<GearStat, number>> = {};
  template.stats.forEach((stat, i) => {
    const reduced = SECOND_STAT_REDUCED_SLOTS.includes(template.slot);
    const share = reduced && i > 0 ? WEAPON_SECOND_STAT_FACTOR : 1;
    stats[stat] = round(TIER1_STAT_VALUES[stat] * tc.multiplier * share);
  });
  return Object.freeze({
    id: `${template.id}-t${tier}`,
    templateId: template.id,
    // «Редкий тяжёлый меч», «Редкая мантия», «Редкие латы», «Редкое кольцо точности».
    name: `${tc.adjective[template.gender]} ${lower(template.name)}`,
    slot: template.slot,
    ...(template.characterClass ? { characterClass: template.characterClass } : {}),
    tier,
    stats: Object.freeze(stats),
    price: Math.round(tc.price * (weapon ? WEAPON_PRICE_FACTOR : 1)),
    unlockAfterMap: tc.unlockAfterMap,
    starter: false,
  });
}

/** All 130 shop items (26 templates × 5 tiers), template order then tier. */
export const SHOP_ITEMS: readonly GearItem[] = Object.freeze(
  GEAR_TEMPLATES.flatMap((template) => TIERS.map((tier) => makeItem(template, tier))),
);
export const STARTER_ITEMS: readonly GearItem[] = Object.freeze(
  (Object.entries(STARTER_WEAPONS) as [CharacterClass, { id: string; name: string }][]).map(
    ([characterClass, w]) =>
      Object.freeze({
        id: w.id,
        templateId: w.id,
        name: w.name,
        slot: 'weapon' as const,
        characterClass,
        tier: 0 as const,
        stats: Object.freeze({}),
        price: 0,
        unlockAfterMap: 0,
        starter: true,
      }),
  ),
);
const BY_ID: ReadonlyMap<string, GearItem> = new Map(
  [...SHOP_ITEMS, ...STARTER_ITEMS].map((i) => [i.id, i]),
);
export function findItem(id: string): GearItem | null {
  return BY_ID.get(id) ?? null;
}
export function getItem(id: string): GearItem {
  const item = BY_ID.get(id);
  if (!item) throw new RangeError(`Unknown item: ${id}.`);
  return item;
}
export function starterWeapon(characterClass: CharacterClass): GearItem {
  return getItem(STARTER_WEAPONS[characterClass].id);
}
/** Can a class equip this item in this slot? Weapons are class-specific; the rest are shared. */
export function isEligible(
  item: GearItem,
  characterClass: CharacterClass,
  slot: GearSlot,
): boolean {
  return item.slot === slot && (item.slot !== 'weapon' || item.characterClass === characterClass);
}

/** Startup validation: rejects an inconsistent item configuration before any use. */
export function validateEquipmentConfig(items: readonly GearItem[] = SHOP_ITEMS): void {
  const ids = new Set<string>();
  for (const item of [...items, ...STARTER_ITEMS]) {
    if (ids.has(item.id)) throw new Error(`Duplicate item id ${item.id}.`);
    ids.add(item.id);
    if (!item.name.trim()) throw new Error(`Item ${item.id} needs a name.`);
    if ((item.slot === 'weapon') !== (item.characterClass !== undefined))
      throw new Error(`Item ${item.id}: only weapons are class-specific.`);
    for (const v of Object.values(item.stats))
      if (!Number.isFinite(v) || (v as number) <= 0)
        throw new Error(`Item ${item.id} stat invalid.`);
    if (!item.starter && (!Number.isInteger(item.price) || item.price <= 0))
      throw new Error(`Item ${item.id} price invalid.`);
    if (!item.starter && Object.keys(item.stats).length === 0)
      throw new Error(`Item ${item.id} has no stats.`);
  }
  let prev = -1;
  for (const tier of TIERS) {
    const tc = TIER_CONFIG[tier];
    if (!(tc.multiplier > 0) || !(tc.price > 0) || tc.unlockAfterMap < prev)
      throw new Error(`Tier ${tier} config invalid.`);
    prev = tc.unlockAfterMap;
  }
}
validateEquipmentConfig();
