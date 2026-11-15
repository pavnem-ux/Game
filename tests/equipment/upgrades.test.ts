import { describe, expect, it } from 'vitest';
import {
  UPGRADE_RULES,
  UpgradeError,
  checkUpgrade,
  defaultLoadout,
  getItem,
  itemDisplayName,
  permanentStats,
  upgradeCost,
  upgradeItem,
  upgradedStats,
  validateItemLevels,
} from '../../src/equipment';
import type { Loadout, UpgradeState } from '../../src/equipment';
import { GameplayWorld } from '../../src/gameplay';
import { calculateCharacterStats } from '../../src/character-stats';

const state = (over: Partial<UpgradeState> = {}): UpgradeState => ({
  gold: 100_000,
  ore: 10_000,
  ownedItems: ['ring_precision-t1', 'heavy_sword-t5', 'plate-t3', 'guard_helm-t2'],
  itemLevels: {},
  ...over,
});

describe('Task 19 §1.3 — upgrade costs', () => {
  it('Gold = ⌈price × 0.1 × L⌉, Ore = ⌈tier × L / 2⌉ (cost table)', () => {
    expect(UPGRADE_RULES).toEqual({
      maxLevel: 10,
      statPerLevel: 0.05,
      goldShare: 0.1,
      oreDivisor: 2,
    });
    const table = (id: string) =>
      Array.from({ length: 10 }, (_, i) => upgradeCost(getItem(id), i + 1));
    // Tier 1 shared item (80 Gold).
    expect(table('ring_precision-t1').map((c) => c.gold)).toEqual([
      8, 16, 24, 32, 40, 48, 56, 64, 72, 80,
    ]);
    expect(table('ring_precision-t1').map((c) => c.ore)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    // Tier 5 weapon (3125 Gold): half Gold rounds up.
    expect(table('heavy_sword-t5').map((c) => c.gold)).toEqual([
      313, 625, 938, 1250, 1563, 1875, 2188, 2500, 2813, 3125,
    ]);
    expect(table('heavy_sword-t5').map((c) => c.ore)).toEqual([
      3, 5, 8, 10, 13, 15, 18, 20, 23, 25,
    ]);
    expect(table('plate-t3').map((c) => c.ore)).toEqual([2, 3, 5, 6, 8, 9, 11, 12, 14, 15]);
    // Totals to +10: 5.5 × price Gold.
    expect(table('plate-t3').reduce((a, c) => a + c.gold, 0)).toBe(700 * 5.5);
    expect(() => upgradeCost(getItem('starter_sword'), 1)).toThrow();
    for (const bad of [0, 11, 1.5]) expect(() => upgradeCost(getItem('plate-t1'), bad)).toThrow();
  });
});

describe('Task 19 §1.3 — upgrade rules', () => {
  it('one level per upgrade; Gold and ore deducted with the level in one new state; never random', () => {
    let s = state();
    s = upgradeItem(s, 'plate-t3');
    expect(s).toMatchObject({ gold: 100_000 - 70, ore: 10_000 - 2, itemLevels: { 'plate-t3': 1 } });
    s = upgradeItem(s, 'plate-t3');
    expect(s.itemLevels['plate-t3']).toBe(2);
    expect(s.gold).toBe(100_000 - 70 - 140);
    // Same input → same output (no randomness, no failure).
    expect(upgradeItem(state(), 'plate-t3')).toEqual(upgradeItem(state(), 'plate-t3'));
    expect(Object.isFrozen(s) && Object.isFrozen(s.itemLevels)).toBe(true);
  });
  it('cannot exceed +10, upgrade unowned, unknown or starter items, or go below 0 currency', () => {
    const at10 = state({ itemLevels: { 'plate-t3': 10 } });
    expect(checkUpgrade(at10, 'plate-t3')).toMatchObject({ ok: false, reason: 'max' });
    expect(() => upgradeItem(at10, 'plate-t3')).toThrow(UpgradeError);
    expect(checkUpgrade(state(), 'plate-t4')).toMatchObject({ ok: false, reason: 'not-owned' });
    expect(checkUpgrade(state(), 'starter_sword')).toMatchObject({ ok: false, reason: 'starter' });
    expect(checkUpgrade(state(), 'nope')).toMatchObject({ ok: false, reason: 'unknown' });
    // Exactly enough → 0 left; one short → refused, nothing changes.
    const exact = state({ gold: 70, ore: 2 });
    expect(upgradeItem(exact, 'plate-t3')).toMatchObject({ gold: 0, ore: 0 });
    const poorGold = state({ gold: 69, ore: 2 });
    expect(checkUpgrade(poorGold, 'plate-t3')).toMatchObject({ ok: false, reason: 'gold' });
    const poorOre = state({ gold: 70, ore: 1 });
    expect(checkUpgrade(poorOre, 'plate-t3')).toMatchObject({ ok: false, reason: 'ore' });
    expect(() => upgradeItem(poorOre, 'plate-t3')).toThrow(/ore/);
    expect(poorOre).toEqual(state({ gold: 70, ore: 1 }));
  });
  it('item names show the level («Ring of Precision +3»)', () => {
    const ring = getItem('ring_precision-t1');
    expect(itemDisplayName(ring, 0)).toBe('Common Ring of Precision');
    expect(itemDisplayName(ring, 3)).toBe('Common Ring of Precision +3');
  });
});

describe('Task 19 §1.3 — stats with upgrade levels', () => {
  it('each level adds +5% of the base stats: +0 ×1, +5 ×1.25, +10 ×1.5', () => {
    const sword = getItem('heavy_sword-t5'); // phys +28, crit dmg +21
    expect(upgradedStats(sword, 0)).toEqual({ physicalDamagePercent: 28, criticalDamage: 21 });
    expect(upgradedStats(sword, 5)).toEqual({ physicalDamagePercent: 35, criticalDamage: 26.25 });
    expect(upgradedStats(sword, 10)).toEqual({ physicalDamagePercent: 42, criticalDamage: 31.5 });
    expect(() => upgradedStats(sword, 11)).toThrow();
  });
  it('levels flow through the pipeline once (Character screen = run start); caps once', () => {
    const base = calculateCharacterStats('warrior', 50).combatAttributes;
    const loadout: Loadout = {
      ...defaultLoadout('warrior'),
      weapon: 'heavy_sword-t5',
      armor: 'plate-t3',
    };
    const levels = { 'heavy_sword-t5': 10, 'plate-t3': 5 };
    const s = permanentStats('warrior', 50, {}, loadout, levels);
    expect(s.physicalDamage).toBeCloseTo(base.physicalDamage * 1.42, 9);
    expect(s.maxHp).toBeCloseTo(base.maxHp * (1 + 0.175 * 1.25), 9);
    // Levels of items not equipped by this class change nothing.
    expect(permanentStats('warrior', 50, {}, loadout, { ...levels, 'guard_helm-t2': 10 })).toEqual(
      s,
    );
    const w = new GameplayWorld({
      characterClass: 'warrior',
      level: 50,
      seed: 1,
      initialEnemies: false,
      spawning: { enabled: false },
      equipment: { loadout, itemLevels: levels },
    });
    expect(w.skills.effectiveStats).toEqual(s);
    expect(w.core.getEntity('player').maxHp).toBeCloseTo(s.maxHp, 9);
    // Crit chance with +10 crit items stays at the 75 cap.
    const crit: Loadout = {
      ...defaultLoadout('rogue'),
      weapon: 'assassin_dagger-t5',
      helmet: 'hunter_hood-t5',
      gloves: 'trickster_gloves-t5',
      ring: 'ring_precision-t5',
    };
    const all10 = Object.fromEntries(
      ['assassin_dagger-t5', 'hunter_hood-t5', 'trickster_gloves-t5', 'ring_precision-t5'].map(
        (id) => [id, 10],
      ),
    );
    expect(permanentStats('rogue', 50, {}, crit, all10).criticalChance).toBeLessThanOrEqual(75);
  });
  it('the world rejects invalid levels before creating anything', () => {
    for (const bad of [{ 'plate-t1': 11 }, { 'plate-t1': 0.5 }, { starter_sword: 1 }, { x: 1 }])
      expect(() => validateItemLevels(bad)).toThrow();
    expect(
      () =>
        new GameplayWorld({
          characterClass: 'warrior',
          seed: 1,
          equipment: { loadout: defaultLoadout('warrior'), itemLevels: { 'plate-t1': 11 } },
        }),
    ).toThrow();
  });
});
