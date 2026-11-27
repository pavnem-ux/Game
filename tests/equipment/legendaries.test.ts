import { describe, expect, it } from 'vitest';
import {
  LEGENDARIES,
  LEGENDARY_TEXT,
  RARITY_CONFIG,
  affixMax,
  classLegendaryPool,
  generateItem,
  itemName,
  legendaryChance,
  legendaryPool,
  legendaryRoll,
  reforgeItem,
  rollDropItem,
  validateItem,
} from '../../src/equipment';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import { lcgStream } from '../../src/gameplay/rng';

/** Task 43 §1–3 — the Legendary catalogue, pools and drops (provisional numbers). */
describe('Task 43 — catalogue', () => {
  it('10 Legendaries in pool order; 4 class weapons, 6 shared slots; every one has effect text', () => {
    expect(LEGENDARIES.map((l) => l.name)).toEqual([
      'Crown of the Barrow King',
      'Bark of the Old Leshy',
      'Stride of the Ash Wolf',
      'Millwheel Gauntlets',
      'Heart of the Mourner',
      'Ring of the Water Tsar',
      'Edge of the Warden',
      'Staff of the Frost Warlord',
      'Bow of the Thunder Kite',
      'Fangs of the Mire Serpent',
    ]);
    expect(LEGENDARIES.filter((l) => l.slot === 'weapon').map((l) => l.characterClass)).toEqual([
      'warrior',
      'mage',
      'archer',
      'rogue',
    ]);
    for (const l of LEGENDARIES) expect(LEGENDARY_TEXT[l.id].length).toBeGreaterThan(20);
  });
  it('a Legendary item: ×1.2 main, 3 stats at 80–100%, its own name; validation checks the fit', () => {
    const it0 = generateItem(lcgStream(3), {
      uid: 'i1',
      slot: 'helmet',
      itemLevel: 30,
      rarity: 'legendary',
      characterClass: 'mage',
      legendaryId: 'barrow_crown',
    });
    expect(it0.affixes).toHaveLength(3);
    for (const a of it0.affixes)
      expect(a.value / affixMax(a.stat, 30)).toBeGreaterThanOrEqual(
        RARITY_CONFIG.legendary.rollMin - 0.05,
      );
    expect(itemName(it0)).toBe('Crown of the Barrow King');
    expect(validateItem(it0)).toEqual(it0);
    for (const bad of [
      { ...it0, legendaryId: 'nope' },
      { ...it0, slot: 'ring' as const, legendaryId: 'barrow_crown' }, // wrong slot
      { ...it0, rarity: 'epic' as const, affixes: it0.affixes }, // effect on a non-Legendary
    ])
      expect(() => validateItem(bad)).toThrow(RangeError);
    const axe = {
      ...it0,
      slot: 'weapon' as const,
      characterClass: 'mage' as const,
      legendaryId: 'warden_edge',
    };
    expect(() => validateItem(axe)).toThrow(RangeError); // the Warrior's weapon on a Mage
    // Reforge keeps the unique effect.
    expect(reforgeItem(lcgStream(1), it0, it0.affixes[0].stat, 'mage').legendaryId).toBe(
      'barrow_crown',
    );
  });
});

describe('Task 43 — pools and drops', () => {
  it('pools: (k + act), +3, +6 mod 10; map 1 → #0 #3 #6, map 4 → #3 #6 #9; 12 pools per item', () => {
    const idx = (m: number) => legendaryPool(m).map((l) => LEGENDARIES.indexOf(l));
    expect(idx(1)).toEqual([0, 3, 6]);
    expect(idx(4)).toEqual([3, 6, 9]);
    expect(idx(11)).toEqual([1, 4, 7]); // act II shifts by one
    const count = new Map<number, number>();
    for (let m = 1; m <= 40; m++) for (const i of idx(m)) count.set(i, (count.get(i) ?? 0) + 1);
    expect([...count.values()].every((n) => n === 12)).toBe(true);
    for (let m = 1; m <= 40; m++)
      for (const c of CHARACTER_CLASSES) {
        const pool = classLegendaryPool(m, c);
        expect(pool.length).toBeGreaterThanOrEqual(1);
        expect(pool.every((l) => l.slot !== 'weapon' || l.characterClass === c)).toBe(true);
      }
  });
  it('chance by difficulty (0.5 / 1 / 3 / 3 %); a hit picks from the class pool; drops take the slot', () => {
    expect(
      ['normal', 'hard', 'nightmare', 'trial'].map((d) => legendaryChance(d as never)),
    ).toEqual([0.5, 1, 3, 3]);
    const r = lcgStream(21);
    let hits = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 40000; i++) {
      const id = legendaryRoll(r, 'nightmare', 1, 'rogue');
      if (id) {
        hits++;
        seen.add(id);
      }
    }
    expect(hits / 40000).toBeCloseTo(0.03, 2);
    // Map 1 pool #0 Crown, #3 Millwheel, #6 Warden (Warrior weapon) → a Rogue gets only the first two.
    expect([...seen].sort()).toEqual(['barrow_crown', 'millwheel_gauntlets']);
    const item = rollDropItem(lcgStream(2), {
      uid: 'drop-1',
      rarity: 'epic',
      itemLevel: 6,
      characterClass: 'warrior',
      legendaryId: 'warden_edge',
    });
    expect(item).toMatchObject({
      slot: 'weapon',
      characterClass: 'warrior',
      rarity: 'legendary',
      legendaryId: 'warden_edge',
    });
  });
});
