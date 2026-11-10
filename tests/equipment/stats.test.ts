import { describe, expect, it } from 'vitest';
import {
  applyCombatAttributeCaps,
  calculateCharacterStats,
  deriveUncappedCombatAttributes,
} from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import { defaultLoadout, gearModifiers, permanentStats } from '../../src/equipment';
import type { Loadout } from '../../src/equipment';
import { composeRunStats } from '../../src/skills/stats';

const L = (c: 'warrior' | 'mage' | 'rogue' | 'archer', patch: Partial<Loadout>): Loadout => ({
  ...defaultLoadout(c),
  ...patch,
});
const world = (
  characterClass: 'warrior' | 'mage' | 'rogue' | 'archer',
  loadout?: Loadout,
  talents: Record<string, number> = {},
) =>
  new GameplayWorld({
    characterClass,
    level: 50,
    seed: 1,
    initialEnemies: false,
    spawning: { enabled: false },
    talents: { ranks: talents },
    ...(loadout ? { equipment: { loadout } } : {}),
  });

describe('Task 11 Phase 3 — gear in the attribute pipeline', () => {
  it('gear applies once: plate t5 (+35% HP, +14 res) and heavy sword t5 (+28% phys, +21 crit dmg)', () => {
    const base = calculateCharacterStats('warrior', 50).combatAttributes;
    const loadout = L('warrior', { weapon: 'heavy_sword-t5', armor: 'plate-t5' });
    const s = permanentStats('warrior', 50, {}, loadout);
    expect(s.maxHp).toBeCloseTo(base.maxHp * 1.35, 9);
    expect(s.resistance).toBeCloseTo(base.resistance + 14, 9);
    expect(s.physicalDamage).toBeCloseTo(base.physicalDamage * 1.28, 9);
    expect(s.criticalDamage).toBeCloseTo(base.criticalDamage + 21, 9);
    // The starter loadout (and no loadout) equal the plain class stats.
    expect(permanentStats('warrior', 50, {}, defaultLoadout('warrior'))).toEqual(base);
    expect(permanentStats('warrior', 50, {}, null)).toEqual(base);
    // In a run: the player entity, the run stats and the snapshot all carry the same values.
    const w = world('warrior', loadout);
    expect(w.core.getEntity('player').maxHp).toBeCloseTo(s.maxHp, 9);
    expect(w.skills.effectiveStats).toEqual(s);
    expect(w.getSnapshot().stats).toEqual(s); // the damage preview reads these stats
  });
  it('gear and talents compose additively into one layer (warrior.b2.n01 III +22% HP + plate t5 +35%)', () => {
    const base = calculateCharacterStats('warrior', 50).combatAttributes;
    const talents = { 'warrior.b2.n01': 3 };
    const s = permanentStats('warrior', 50, talents, L('warrior', { armor: 'plate-t5' }));
    expect(s.maxHp).toBeCloseTo(base.maxHp * (1 + (22 + 35) / 100), 9);
    expect(s.resistance).toBeCloseTo(base.resistance + 4 + 14, 9);
    expect(
      world('warrior', L('warrior', { armor: 'plate-t5' }), talents).skills.effectiveStats,
    ).toEqual(s);
  });
  it('central caps apply once, after gear (crit chance never above 75; the excess is not stored)', () => {
    const loadout = L('rogue', { weapon: 'assassin_dagger-t5', ring: 'ring_precision-t5' });
    const primary = calculateCharacterStats('rogue', 50).primaryAttributes;
    const uncapped = deriveUncappedCombatAttributes(primary);
    const s = permanentStats('rogue', 50, {}, loadout);
    expect(s.criticalChance).toBe(Math.min(75, uncapped.criticalChance + 7 + 7));
    expect(s).toEqual(
      applyCombatAttributeCaps({
        ...uncapped,
        criticalChance: uncapped.criticalChance + 14,
        criticalDamage: uncapped.criticalDamage + 35 * 0.6,
      }),
    );
    // A huge layer is still capped exactly once.
    const huge = composeRunStats(primary, {
      ...gearModifiers(loadout),
      criticalChance: 1000,
      cooldownReduction: 1000,
    });
    expect([huge.criticalChance, huge.cooldownReduction]).toEqual([75, 50]);
  });
  it('area size and CDR from a robe; magic damage from a staff; movement from a short bow', () => {
    const mage = calculateCharacterStats('mage', 50).combatAttributes;
    const m = permanentStats(
      'mage',
      50,
      {},
      L('mage', { weapon: 'flame_staff-t3', armor: 'robe-t3' }),
    );
    expect(m.areaSize).toBeCloseTo(mage.areaSize * (1 + (7 * 0.6 + 7) / 100), 9);
    expect(m.cooldownReduction).toBeCloseTo(mage.cooldownReduction + 3.5, 9);
    expect(m.magicalDamage).toBeCloseTo(mage.magicalDamage * 1.14, 9);
    const archer = calculateCharacterStats('archer', 50).combatAttributes;
    const a = permanentStats('archer', 50, {}, L('archer', { weapon: 'short_bow-t1' }));
    expect(a.attackSpeed).toBeCloseTo(archer.attackSpeed + 2, 9);
    expect(a.movementSpeed).toBeCloseTo(archer.movementSpeed * (1 + 1.2 / 100), 9);
  });
  it('the world rejects a loadout the class cannot use', () => {
    expect(() => world('mage', L('mage', { weapon: 'heavy_sword-t1' }))).toThrow(RangeError);
    expect(() => world('mage', L('mage', { armor: 'ring_fury-t1' }))).toThrow(RangeError);
    expect(() => world('mage', L('mage', { weapon: null }))).toThrow(RangeError);
    expect(() => world('mage', L('mage', { ring: 'no-such-item' }))).toThrow(RangeError);
  });
});
