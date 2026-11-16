import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import {
  EquipmentError,
  GEAR_TEMPLATES,
  SHOP_ITEMS,
  STARTER_ITEMS,
  TIER_CONFIG,
  checkPurchase,
  defaultLoadouts,
  equip,
  getItem,
  highestClearedMap,
  isEligible,
  isTierUnlocked,
  loadoutStats,
  purchase,
  starterWeapon,
  unequip,
  validateEquipmentConfig,
} from '../../src/equipment';
import type { EquipmentState, Tier } from '../../src/equipment';

const state = (gold = 100_000, owned: string[] = []): EquipmentState => ({
  gold,
  ownedItems: owned,
  loadouts: defaultLoadouts(),
});

describe('Task 11 §1.2 — items (templates × tiers)', () => {
  it('130 shop items (26 templates × 5 tiers, Task 19) with unique ids; 4 starter weapons', () => {
    expect(GEAR_TEMPLATES).toHaveLength(26);
    expect(GEAR_TEMPLATES.filter((t) => t.slot === 'weapon')).toHaveLength(8);
    expect(SHOP_ITEMS).toHaveLength(130);
    const ids = [...SHOP_ITEMS, ...STARTER_ITEMS].map((i) => i.id);
    expect(new Set(ids).size).toBe(134);
    expect(STARTER_ITEMS.map((i) => [i.characterClass, i.tier, i.price, i.stats])).toEqual(
      CHARACTER_CLASSES.map((c) => [c, 0, 0, {}]).sort(
        (a, b) =>
          STARTER_ITEMS.findIndex((i) => i.characterClass === a[0]) -
          STARTER_ITEMS.findIndex((i) => i.characterClass === b[0]),
      ),
    );
    expect(() => validateEquipmentConfig()).not.toThrow();
  });
  it('tier stats: tier-1 base × 1/2/3.5/5/7; weapons first stat ×1.0, second ×0.6', () => {
    const mult = [1, 2, 3.5, 5, 7];
    for (const tier of [1, 2, 3, 4, 5] as Tier[]) {
      const m = mult[tier - 1];
      expect(getItem(`heavy_sword-t${tier}`).stats).toEqual({
        physicalDamagePercent: 4 * m,
        criticalDamage: 5 * m * 0.6,
      });
      expect(getItem(`plate-t${tier}`).stats).toEqual({ maxHpPercent: 5 * m, resistance: 2 * m });
      expect(getItem(`ring_precision-t${tier}`).stats).toEqual({ criticalChance: 1 * m });
      expect(getItem(`robe-t${tier}`).stats).toEqual({
        cooldownReduction: m,
        areaSizePercent: 2 * m,
      });
      expect(getItem(`short_bow-t${tier}`).stats).toEqual({
        attackSpeed: 2 * m,
        movementSpeedPercent: 2 * m * 0.6,
      });
    }
  });
  it('prices 80/300/700/1400/2500, weapons ×1.25; Russian names with the tier adjective', () => {
    for (const item of SHOP_ITEMS) {
      const base = [80, 300, 700, 1400, 2500][(item.tier as number) - 1];
      expect(item.price).toBe(item.slot === 'weapon' ? base * 1.25 : base);
    }
    expect(getItem('heavy_sword-t3').name).toBe('Rare Heavy Sword');
    expect(getItem('robe-t5').name).toBe('Legendary Robe');
    expect(getItem('plate-t2').name).toBe('Uncommon Plate Armor');
    expect(getItem('ring_fury-t4').name).toBe('Epic Ring of Fury');
  });
  it('shop unlock by highest cleared map: tier 1 from start, 2 after 8, 3 after 16, 4 after 24, 5 after 32', () => {
    expect([1, 2, 3, 4, 5].map((t) => TIER_CONFIG[t as Tier].unlockAfterMap)).toEqual([
      0, 8, 16, 24, 32,
    ]);
    expect(isTierUnlocked(1, 0)).toBe(true);
    expect(isTierUnlocked(2, 7)).toBe(false);
    expect(isTierUnlocked(2, 8)).toBe(true);
    expect(isTierUnlocked(5, 31)).toBe(false);
    expect(isTierUnlocked(5, 32)).toBe(true);
    expect(highestClearedMap([])).toBe(0);
    expect(highestClearedMap([1, 2, 9, 3])).toBe(9);
  });
  it('weapons are class-specific; armor, amulets and rings fit every class', () => {
    for (const c of CHARACTER_CLASSES) {
      expect(isEligible(starterWeapon(c), c, 'weapon')).toBe(true);
      for (const item of SHOP_ITEMS) {
        const ok = isEligible(item, c, item.slot);
        expect(ok).toBe(item.slot !== 'weapon' || item.characterClass === c);
      }
    }
    expect(isEligible(getItem('plate-t1'), 'mage', 'ring')).toBe(false);
  });
});

describe('Task 11 §1.1 — purchase / equip / unequip (pure)', () => {
  it('buying deducts Gold and owns the item once; never twice, never without Gold or a locked tier', () => {
    let s = state(500);
    s = purchase(s, 'plate-t1', 0);
    expect(s.gold).toBe(420);
    expect(s.ownedItems).toEqual(['plate-t1']);
    expect(checkPurchase(s, 'plate-t1', 0)).toEqual({ ok: false, reason: 'owned' });
    expect(() => purchase(s, 'plate-t1', 0)).toThrow(EquipmentError);
    expect(checkPurchase(s, 'plate-t2', 7)).toEqual({ ok: false, reason: 'locked' });
    expect(checkPurchase(state(79), 'ring_fury-t1', 0)).toEqual({ ok: false, reason: 'gold' });
    expect(checkPurchase(state(80), 'ring_fury-t1', 0).ok).toBe(true);
    expect(checkPurchase(s, 'starter_sword', 0)).toEqual({ ok: false, reason: 'starter' });
    expect(checkPurchase(s, 'nope', 0)).toEqual({ ok: false, reason: 'unknown' });
    // A refused purchase never changes the state.
    const before = state(10);
    expect(() => purchase(before, 'plate-t1', 0)).toThrow();
    expect(before).toEqual(state(10));
  });
  it('equip needs an owned, eligible item; loadouts are per class and independent', () => {
    let s = purchase(purchase(state(), 'plate-t1', 0), 'heavy_sword-t1', 0);
    expect(() => equip(s, 'warrior', 'ring_fury-t1')).toThrow(/not-owned/);
    expect(() => equip(s, 'mage', 'heavy_sword-t1')).toThrow(/not-eligible/);
    s = equip(s, 'warrior', 'heavy_sword-t1');
    s = equip(s, 'warrior', 'plate-t1');
    s = equip(s, 'mage', 'plate-t1'); // the same owned item fits another class too
    expect(s.loadouts.warrior).toEqual({
      weapon: 'heavy_sword-t1',
      armor: 'plate-t1',
      helmet: null,
      gloves: null,
      pants: null,
      amulet: null,
      ring: null,
    });
    expect(s.loadouts.mage).toEqual({
      weapon: 'starter_staff',
      armor: 'plate-t1',
      helmet: null,
      gloves: null,
      pants: null,
      amulet: null,
      ring: null,
    });
    expect(s.loadouts.rogue).toEqual(defaultLoadouts().rogue);
    // Unequip: weapon back to the starter, other slots empty; other classes untouched.
    s = unequip(s, 'warrior', 'weapon');
    s = unequip(s, 'warrior', 'armor');
    expect(s.loadouts.warrior).toEqual(defaultLoadouts().warrior);
    expect(s.loadouts.mage.armor).toBe('plate-t1');
  });
  it('default loadouts: starter weapon equipped, other slots empty; loadout stats sum the equipped items', () => {
    for (const c of CHARACTER_CLASSES)
      expect(defaultLoadouts()[c]).toEqual({
        weapon: starterWeapon(c).id,
        armor: null,
        helmet: null,
        gloves: null,
        pants: null,
        amulet: null,
        ring: null,
      });
    expect(loadoutStats(defaultLoadouts().warrior)).toEqual({});
    let s = state();
    for (const id of ['heavy_sword-t2', 'amulet_power-t1', 'ring_fury-t1', 'plate-t1'])
      s = equip(purchase(s, id, 40), 'warrior', id);
    expect(loadoutStats(s.loadouts.warrior)).toEqual({
      physicalDamagePercent: 8 + 4,
      criticalDamage: 6 + 5,
      maxHpPercent: 5,
      resistance: 2,
    });
  });
});
