import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES, calculateCharacterStats } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import {
  GEAR_SLOTS,
  GEAR_TEMPLATES,
  SHOP_ITEMS,
  SLOT_LABELS,
  TIER_CONFIG,
  defaultLoadout,
  defaultLoadouts,
  equip,
  getItem,
  isEligible,
  permanentStats,
  unequip,
} from '../../src/equipment';
import type { EquipmentState, GearSlot, Loadout, Tier } from '../../src/equipment';

const NEW_SLOTS: readonly GearSlot[] = ['helmet', 'gloves', 'pants'];
const MULT = [1, 2, 3.5, 5, 7];

describe('Task 19 §1.1 — helmet, gloves, pants', () => {
  it('7 slots; 9 new templates (3 per slot) × 5 tiers; 130 unique items', () => {
    expect(GEAR_SLOTS).toEqual(['weapon', 'helmet', 'armor', 'gloves', 'pants', 'amulet', 'ring']);
    expect(NEW_SLOTS.map((s) => SLOT_LABELS[s])).toEqual(['Helmet', 'Gloves', 'Legs']);
    for (const slot of NEW_SLOTS)
      expect(GEAR_TEMPLATES.filter((t) => t.slot === slot)).toHaveLength(3);
    expect(SHOP_ITEMS).toHaveLength(130);
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(130);
    expect(new Set(SHOP_ITEMS.map((i) => i.name)).size).toBe(130);
  });
  it('first stat ×1.0, second ×0.6 of the tier-1 base; tier multipliers, prices and unlocks as armor', () => {
    for (const tier of [1, 2, 3, 4, 5] as Tier[]) {
      const m = MULT[tier - 1];
      const near = (id: string, expected: Record<string, number>) => {
        const stats = getItem(`${id}-t${tier}`).stats as Record<string, number>;
        expect(Object.keys(stats)).toEqual(Object.keys(expected));
        for (const [k, v] of Object.entries(expected)) expect(stats[k]).toBeCloseTo(v, 9);
      };
      near('guard_helm', { maxHpPercent: 5 * m, resistance: 2 * m * 0.6 });
      near('hunter_hood', { criticalChance: m, dodgeChance: m * 0.6 });
      near('mage_circlet', { cooldownReduction: m, magicalDamagePercent: 4 * m * 0.6 });
      near('plate_gauntlets', { physicalDamagePercent: 4 * m, resistance: 2 * m * 0.6 });
      near('trickster_gloves', { attackSpeed: 2 * m, criticalChance: m * 0.6 });
      near('sorcerer_gloves', { magicalDamagePercent: 4 * m, areaSizePercent: 2 * m * 0.6 });
      near('plate_greaves', { maxHpPercent: 5 * m, resistance: 2 * m * 0.6 });
      near('leather_pants', { movementSpeedPercent: 2 * m, dodgeChance: m * 0.6 });
      near('mystic_trousers', { cooldownReduction: m, maxHpPercent: 5 * m * 0.6 });
      for (const item of SHOP_ITEMS.filter((i) => i.tier === tier && NEW_SLOTS.includes(i.slot))) {
        expect(item.price).toBe(TIER_CONFIG[tier].price); // non-weapon price (no ×1.25)
        expect(item.price).toBe(getItem(`plate-t${tier}`).price);
        expect(item.unlockAfterMap).toBe(TIER_CONFIG[tier].unlockAfterMap);
        expect(item.characterClass).toBeUndefined();
      }
    }
    // Task 11 armor keeps both stats at ×1.0 (unchanged).
    expect(getItem('plate-t1').stats).toEqual({ maxHpPercent: 5, resistance: 2 });
    expect(getItem('guard_helm-t1').name).toBe("Common Guard's Helm");
    expect(getItem('plate_gauntlets-t5').name).toBe('Legendary Plate Gauntlets');
  });
  it('new-slot items are eligible for every class, only in their own slot', () => {
    for (const item of SHOP_ITEMS.filter((i) => NEW_SLOTS.includes(i.slot)))
      for (const c of CHARACTER_CLASSES) {
        expect(isEligible(item, c, item.slot)).toBe(true);
        for (const other of GEAR_SLOTS.filter((s) => s !== item.slot))
          expect(isEligible(item, c, other)).toBe(false);
      }
  });
  it('default loadouts have empty new slots; per-class loadouts stay independent', () => {
    for (const c of CHARACTER_CLASSES)
      for (const slot of NEW_SLOTS) expect(defaultLoadout(c)[slot]).toBeNull();
    let s: EquipmentState = {
      gold: 0,
      ownedItems: ['guard_helm-t1', 'leather_pants-t2'],
      loadouts: defaultLoadouts(),
    };
    s = equip(s, 'warrior', 'guard_helm-t1');
    s = equip(s, 'mage', 'guard_helm-t1'); // one owned item, worn by two classes at once
    s = equip(s, 'mage', 'leather_pants-t2');
    expect(s.loadouts.warrior.helmet).toBe('guard_helm-t1');
    expect(s.loadouts.warrior.pants).toBeNull();
    expect(s.loadouts.mage.pants).toBe('leather_pants-t2');
    expect(s.loadouts.rogue).toEqual(defaultLoadout('rogue'));
    s = unequip(s, 'mage', 'helmet');
    expect(s.loadouts.mage.helmet).toBeNull();
    expect(s.loadouts.warrior.helmet).toBe('guard_helm-t1');
    expect(() => equip(s, 'archer', 'plate_gauntlets-t1')).toThrow(/not-owned/);
  });
  it('new-slot stats apply once through the pipeline; central caps once', () => {
    const base = calculateCharacterStats('warrior', 50).combatAttributes;
    const loadout: Loadout = {
      ...defaultLoadout('warrior'),
      helmet: 'guard_helm-t5', // +35% HP, +8.4 res
      armor: 'plate-t5', // +35% HP, +14 res
      gloves: 'plate_gauntlets-t5', // +28% phys, +8.4 res
      pants: 'plate_greaves-t5', // +35% HP, +8.4 res
    };
    const s = permanentStats('warrior', 50, {}, loadout);
    expect(s.maxHp).toBeCloseTo(base.maxHp * (1 + 1.05), 9);
    expect(s.resistance).toBeCloseTo(base.resistance + 14 + 8.4 * 3, 9);
    expect(s.physicalDamage).toBeCloseTo(base.physicalDamage * 1.28, 9);
    const w = new GameplayWorld({
      characterClass: 'warrior',
      level: 50,
      seed: 1,
      initialEnemies: false,
      spawning: { enabled: false },
      equipment: { loadout },
    });
    expect(w.skills.effectiveStats).toEqual(s);
    expect(w.core.getEntity('player').maxHp).toBeCloseTo(s.maxHp, 9);
    // Crit chance stacked from weapon, helmet, gloves and ring stays at the 75 cap.
    const crit: Loadout = {
      ...defaultLoadout('rogue'),
      weapon: 'assassin_dagger-t5',
      helmet: 'hunter_hood-t5',
      gloves: 'trickster_gloves-t5',
      ring: 'ring_precision-t5',
    };
    const many = permanentStats('rogue', 50, {}, crit);
    expect(many.criticalChance).toBeLessThanOrEqual(75);
    // Removing the helmet changes the result only by its own (uncapped) contribution.
    const without = permanentStats('rogue', 50, {}, { ...crit, helmet: null });
    expect(without.dodgeChance).toBeCloseTo(many.dodgeChance - 4.2, 9);
  });
});
