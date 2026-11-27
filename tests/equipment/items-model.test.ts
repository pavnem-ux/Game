import { describe, expect, it } from 'vitest';
import {
  AFFIX_RULES,
  GEAR_SLOTS,
  GOLD_FIND_CAP,
  RARITIES,
  RARITY_CONFIG,
  affixMax,
  affixPool,
  affixText,
  affixValue,
  availableOffers,
  defaultLoadout,
  dominantAffix,
  gearModifiers,
  generateItem,
  itemIconId,
  itemName,
  mainStats,
  offerItem,
  permanentStats,
  shopPrice,
  shopStock,
  starterWeapon,
  validateItem,
} from '../../src/equipment';
import type { ItemInstance, Loadout } from '../../src/equipment';
import { calculateCharacterStats } from '../../src/character-stats';
import { NO_MODIFIERS, composeRunStats } from '../../src/skills/stats';
import { lcgStream } from '../../src/gameplay/rng';

const gen = (seed: number, spec: Partial<Parameters<typeof generateItem>[1]> = {}) =>
  generateItem(lcgStream(seed), {
    uid: 'i1',
    slot: 'gloves',
    itemLevel: 20,
    rarity: 'epic',
    characterClass: 'warrior',
    ...spec,
  });

describe('Task 40 §3 — flat main stats (provisional numbers)', () => {
  it('weapon 4 + L in the class damage type; armor 10 + 2.5L HP and 2 + 0.6L resistance', () => {
    expect(mainStats('weapon', 10, 'common', 'mage')).toEqual({
      physicalDamage: 0,
      magicalDamage: 14,
      maxHp: 0,
      resistance: 0,
    });
    expect(mainStats('weapon', 10, 'common', 'warrior').physicalDamage).toBe(14);
    // Rare ×1.1: HP round(35 × 1.1) = 39, resistance round(8 × 1.1) = 9.
    expect(mainStats('armor', 10, 'rare', 'warrior')).toMatchObject({ maxHp: 39, resistance: 9 });
    // Legs: 1.2 × armor resistance; Legendary ×1.2 at L50: round(32 × 1.2 × 1.2) = 46.
    expect(mainStats('pants', 50, 'legendary', 'rogue').resistance).toBe(46);
    // Ring: a quarter of the weapon damage (5 × 0.25 → 1).
    expect(mainStats('ring', 1, 'common', 'archer').physicalDamage).toBe(1);
  });
  it('whole numbers that never drop with level or rarity', () => {
    for (const slot of GEAR_SLOTS)
      for (let L = 1; L <= 50; L++) {
        const row = RARITIES.map((r) => mainStats(slot, L, r, 'warrior'));
        for (const s of row)
          for (const v of Object.values(s)) expect(Number.isInteger(v)).toBe(true);
        for (let i = 1; i < row.length; i++)
          for (const k of Object.keys(row[i]) as (keyof (typeof row)[0])[])
            expect(row[i][k]).toBeGreaterThanOrEqual(row[i - 1][k]);
        if (L > 1) {
          const prev = mainStats(slot, L - 1, 'common', 'warrior');
          const cur = mainStats(slot, L, 'common', 'warrior');
          for (const k of Object.keys(cur) as (keyof typeof cur)[])
            expect(cur[k]).toBeGreaterThanOrEqual(prev[k]);
        }
      }
  });
});

describe('Task 40 §4 — secondary stats', () => {
  it('the maximum grows from 30% at level 1 to 100% at level 50', () => {
    expect(affixMax('criticalChance', 1)).toBeCloseTo(AFFIX_RULES.criticalChance.max * 0.3, 12);
    expect(affixMax('criticalChance', 50)).toBeCloseTo(AFFIX_RULES.criticalChance.max, 12);
    expect(affixValue('criticalChance', 10, 0.75)).toBe(1.9); // rounded to the stat's decimals
    expect(affixText({ stat: 'criticalChance', value: 1.9 })).toBe('+1.9 pp Crit chance');
  });
  it('pools: 6 distinct stats per slot; the weapon’s class damage follows the damage type', () => {
    for (const slot of GEAR_SLOTS) {
      const pool = affixPool(slot, 'warrior');
      expect(pool).toHaveLength(6);
      expect(new Set(pool).size).toBe(6);
    }
    expect(affixPool('weapon', 'mage')[0]).toBe('magicalDamagePercent');
    expect(affixPool('weapon', 'rogue')[0]).toBe('physicalDamagePercent');
  });
  it('generation: stat count by rarity, distinct stats in the rarity roll range, deterministic', () => {
    for (const rarity of RARITIES)
      for (let seed = 1; seed <= 30; seed++) {
        const item = gen(seed, { rarity });
        const rc = RARITY_CONFIG[rarity];
        expect(item.affixes).toHaveLength(rc.affixes);
        expect(new Set(item.affixes.map((a) => a.stat)).size).toBe(rc.affixes);
        for (const a of item.affixes) {
          expect(affixPool('gloves', 'warrior')).toContain(a.stat);
          const share = a.value / affixMax(a.stat, 20);
          expect(share).toBeGreaterThanOrEqual(rc.rollMin - 0.05);
          expect(share).toBeLessThanOrEqual(rc.rollMax + 0.05);
        }
        expect(validateItem(item)).toEqual(item);
      }
    expect(gen(7)).toEqual(gen(7));
    expect(gen(7)).not.toEqual(gen(8));
    // Uncommon rolls a fixed 75%; forced stats must be in the pool and match the count.
    const u = gen(3, { rarity: 'uncommon', stats: ['criticalDamage'] });
    expect(u.affixes).toEqual([
      { stat: 'criticalDamage', value: affixValue('criticalDamage', 20, 0.75) },
    ]);
    expect(() => gen(3, { rarity: 'uncommon', stats: ['goldFindPercent'] })).toThrow(RangeError);
    expect(() => gen(3, { rarity: 'rare', stats: ['criticalDamage'] })).toThrow(RangeError);
    expect(() => gen(3, { itemLevel: 51 })).toThrow(RangeError);
  });
});

describe('Task 40 §1a — names and icons by item-level band', () => {
  it('Common has the band name only; others take the suffix of the strongest roll', () => {
    expect(itemName(gen(1, { slot: 'armor', itemLevel: 1, rarity: 'common' }))).toBe('Robe');
    expect(itemName(gen(1, { slot: 'armor', itemLevel: 40, rarity: 'common' }))).toBe(
      'Plate Armor',
    );
    const epic = gen(7);
    expect(itemName(epic)).toBe('Sorcerer’s Gloves of Speed'.replace('’', "'"));
    expect(dominantAffix(epic)).toBe('attackSpeed');
    expect(itemIconId(epic)).toBe('sorcerer_gloves');
    // Weapons use the class's bands; starter weapons keep their own name and icon.
    expect(itemIconId(gen(1, { slot: 'weapon', itemLevel: 30, characterClass: 'warrior' }))).toBe(
      'heavy_sword',
    );
    const starter = starterWeapon('mage');
    expect(itemIconId(starter)).toBe(starter.uid);
    expect(defaultLoadout('mage').weapon).toBe(starter.uid);
  });
  it('validation rejects malformed instances', () => {
    const ok = gen(7);
    const bad: Partial<ItemInstance>[] = [
      { uid: 'Bad Uid!' },
      { uid: starterWeapon('rogue').uid },
      { slot: 'boots' as never },
      { characterClass: 'mage' },
      { itemLevel: 0 },
      { rarity: 'mythic' as never },
      { affixes: ok.affixes.slice(1) },
      { affixes: [ok.affixes[0], ok.affixes[0], ok.affixes[1]] },
      { affixes: [{ stat: 'goldFindPercent', value: 1 }, ok.affixes[1], ok.affixes[2]] },
      { affixes: [{ ...ok.affixes[0], value: 999 }, ok.affixes[1], ok.affixes[2]] },
      { legendaryId: '' },
    ];
    for (const patch of bad) expect(() => validateItem({ ...ok, ...patch })).toThrow(RangeError);
  });
});

describe('Task 40 §5 — shop stock', () => {
  it('28 offers: per slot one Common and three Uncommon with distinct stats, at the class level', () => {
    const stock = shopStock(123, 'mage', 7);
    expect(stock).toHaveLength(28);
    expect(new Set(stock.map((o) => o.id)).size).toBe(28);
    for (const slot of GEAR_SLOTS) {
      const rows = stock.filter((o) => o.slot === slot);
      expect(rows.map((o) => o.rarity)).toEqual(['common', 'uncommon', 'uncommon', 'uncommon']);
      const stats = rows.slice(1).map((o) => o.stat!);
      expect(new Set(stats).size).toBe(3);
      for (const s of stats) expect(affixPool(slot, 'mage')).toContain(s);
    }
    expect(stock.every((o) => o.itemLevel === 7)).toBe(true);
    // Prices: round(base × (1 + L/5)), weapons ×1.25 (provisional).
    expect(stock[0]).toMatchObject({ id: 'weapon:common', price: 120 });
    expect(shopPrice('uncommon', 50, 'weapon')).toBe(825);
    expect(shopPrice('common', 10, 'ring')).toBe(120);
    // The item is fully determined by the offer (Uncommon at a 75% roll).
    const item = offerItem(stock[1], 'mage', 'i9');
    expect(item).toMatchObject({ uid: 'i9', slot: 'weapon', characterClass: 'mage', itemLevel: 7 });
    expect(item.affixes.map((a) => a.stat)).toEqual([stock[1].stat]);
  });
  it('same salt/class/level → same stock; a new level or salt draws anew; bought offers reset', () => {
    expect(shopStock(123, 'mage', 7)).toEqual(shopStock(123, 'mage', 7));
    const ids = (s: ReturnType<typeof shopStock>) => s.map((o) => o.id).join();
    const variants = new Set(
      Array.from({ length: 10 }, (_, i) => ids(shopStock(123, 'mage', 7 + i))),
    );
    expect(variants.size).toBeGreaterThan(1);
    const salts = new Set(
      Array.from({ length: 10 }, (_, i) => ids(shopStock(i + 1, 'warrior', 7))),
    );
    expect(salts.size).toBeGreaterThan(1);
    const stock = shopStock(5, 'rogue', 3);
    const bought = { level: 3, offers: ['ring:common'] };
    expect(availableOffers(stock, bought, 3)).toHaveLength(27);
    expect(availableOffers(stock, bought, 4)).toHaveLength(28); // a level-up resets
    expect(availableOffers(stock, undefined, 3)).toHaveLength(28);
  });
});

describe('Task 40 — gear in the stat pipeline', () => {
  const loadoutOf = (items: ItemInstance[]): Loadout => ({
    ...defaultLoadout('mage'),
    ...Object.fromEntries(items.map((i) => [i.slot, i.uid])),
  });
  it('flat main stats are added before percent modifiers; caps apply once', () => {
    const weapon = generateItem(lcgStream(1), {
      uid: 'i1',
      slot: 'weapon',
      itemLevel: 10,
      rarity: 'uncommon',
      characterClass: 'mage',
      stats: ['magicalDamagePercent'],
    });
    const armor = gen(2, { uid: 'i2', slot: 'armor', itemLevel: 10, rarity: 'common' });
    const items = [weapon, armor];
    const m = gearModifiers(loadoutOf(items), items, 'mage');
    expect(m.flatMagicalDamage).toBe(mainStats('weapon', 10, 'uncommon', 'mage').magicalDamage);
    expect(m.flatMaxHp).toBe(35);
    expect(m.resistance).toBe(8);
    expect(m.magicalDamagePercent).toBe(weapon.affixes[0].value);
    const primary = calculateCharacterStats('mage', 10).primaryAttributes;
    const base = composeRunStats(primary, NO_MODIFIERS);
    const geared = permanentStats('mage', 10, {}, loadoutOf(items), items);
    expect(geared.magicalDamage).toBeCloseTo(
      (base.magicalDamage + m.flatMagicalDamage) * (1 + m.magicalDamagePercent / 100),
      9,
    );
    expect(geared.maxHp).toBeCloseTo(base.maxHp + 35, 9);
    expect(permanentStats('mage', 10, {}, null, items)).toEqual(base);
  });
  it('Gold find from gear is capped at 25%', () => {
    const items = (['helmet', 'armor', 'gloves', 'pants', 'amulet', 'ring'] as const)
      .filter((s) => affixPool(s, 'mage').includes('goldFindPercent'))
      .map((slot, k) =>
        generateItem(lcgStream(k), {
          uid: `i${k + 1}`,
          slot,
          itemLevel: 50,
          rarity: 'uncommon',
          characterClass: 'mage',
          stats: ['goldFindPercent'],
        }),
      );
    // Today's pools reach at most 2 × 8 = 16 (no cap needed yet) — the cap guards later sources
    // (Task 43 Legendary effects), so it is checked with hand-made over-range values too.
    expect(items).toHaveLength(2);
    const raw = items.reduce((s, i) => s + i.affixes[0].value, 0);
    expect(gearModifiers(loadoutOf(items), items, 'mage').goldFindPercent).toBe(raw);
    const big = items.map((i) => ({
      ...i,
      affixes: [{ stat: 'goldFindPercent' as const, value: 20 }],
    }));
    expect(gearModifiers(loadoutOf(big), big, 'mage').goldFindPercent).toBe(GOLD_FIND_CAP);
    expect(gearModifiers(null, items, 'mage')).toEqual(NO_MODIFIERS);
  });
});
