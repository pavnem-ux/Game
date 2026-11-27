import { describe, expect, it } from 'vitest';
import {
  NO_SLOT_LEVELS,
  defaultLoadout,
  gearModifiers,
  generateItem,
  mainStats,
  nextSlotMilestone,
  permanentStats,
  slotMainMultiplier,
  slotMilestones,
  slotSecondaryMultiplier,
  slotUpgradeCost,
  slottedStats,
  starterWeapon,
  validateSlotLevels,
} from '../../src/equipment';
import type { SlotLevels } from '../../src/equipment';
import { lcgStream } from '../../src/gameplay/rng';
import { GameplayWorld } from '../../src/gameplay';

const levels = (patch: Partial<SlotLevels>): SlotLevels => ({ ...NO_SLOT_LEVELS, ...patch });
const ring = generateItem(lcgStream(4), {
  uid: 'i1',
  slot: 'ring',
  itemLevel: 1,
  rarity: 'rare',
  characterClass: 'mage',
});

/** Task 41 §1 — slot upgrades (provisional numbers). */
describe('Task 41 — slot upgrade rules', () => {
  it('costs: Gold 250 + 4n², Ore 8 + 4n (the spec table)', () => {
    expect([1, 5, 10, 15, 20, 25, 30].map((n) => slotUpgradeCost(n).gold)).toEqual([
      254, 350, 650, 1150, 1850, 2750, 3850,
    ]);
    expect([1, 5, 10, 15, 20, 25, 30].map((n) => slotUpgradeCost(n).ore)).toEqual([
      12, 28, 48, 68, 88, 108, 128,
    ]);
    for (const n of [0, 31, 1.5]) expect(() => slotUpgradeCost(n)).toThrow(RangeError);
  });
  it('main ×(1 + 0.04·level); secondary ×(1 + 0.2·milestones); +30 → ×2.2 both', () => {
    expect(slotMainMultiplier(0)).toBe(1);
    expect(slotMainMultiplier(1)).toBeCloseTo(1.04, 12);
    expect(slotMainMultiplier(30)).toBeCloseTo(2.2, 12);
    expect([0, 4, 5, 9, 10, 29, 30].map(slotMilestones)).toEqual([0, 0, 1, 1, 2, 5, 6]);
    expect(slotSecondaryMultiplier(4)).toBe(1);
    expect(slotSecondaryMultiplier(5)).toBeCloseTo(1.2, 12);
    expect(slotSecondaryMultiplier(30)).toBeCloseTo(2.2, 12);
    expect([0, 5, 27, 30].map(nextSlotMilestone)).toEqual([5, 10, 30, null]);
    expect(() => slotMainMultiplier(31)).toThrow(RangeError);
  });
  it('the slotted item stats: the starter weapon too; secondary only at milestones', () => {
    const starter = slottedStats(starterWeapon('warrior'), 'warrior', 10);
    expect(starter.main.physicalDamage).toBeCloseTo(
      mainStats('weapon', 1, 'common', 'warrior').physicalDamage * 1.4,
      12,
    );
    const at4 = slottedStats(ring, 'mage', 4);
    expect(at4.affixes).toEqual(ring.affixes);
    const at5 = slottedStats(ring, 'mage', 5);
    at5.affixes.forEach((a, i) => expect(a.value).toBeCloseTo(ring.affixes[i].value * 1.2, 12));
  });
  it('validation: every slot whole 0–30, no unknown slots; missing slots are 0', () => {
    expect(validateSlotLevels({ ring: 3 })).toEqual(levels({ ring: 3 }));
    for (const bad of [
      null,
      [],
      { ring: 31 },
      { ring: -1 },
      { ring: 1.5 },
      { ring: '2' },
      { boots: 1 },
    ])
      expect(() => validateSlotLevels(bad)).toThrow(RangeError);
  });
});

describe('Task 41 — slot levels in the gear pipeline', () => {
  const loadout = { ...defaultLoadout('mage'), ring: 'i1' };
  it('scales the slotted item before the percent modifiers; other classes / slots unaffected', () => {
    const base = gearModifiers(loadout, [ring], 'mage');
    const up = gearModifiers(loadout, [ring], 'mage', levels({ ring: 10, weapon: 5 }));
    expect(up.flatMagicalDamage).toBeCloseTo(
      mainStats('weapon', 1, 'common', 'mage').magicalDamage * 1.2 +
        mainStats('ring', 1, 'rare', 'mage').magicalDamage * 1.4,
      9,
    );
    for (const a of ring.affixes) expect(up[a.stat]).toBeCloseTo(base[a.stat] * 1.4, 9);
    // An empty upgraded slot adds nothing; absent levels = the Task 40 result.
    expect(gearModifiers(loadout, [ring], 'mage', levels({ helmet: 30 }))).toEqual(base);
    expect(gearModifiers(loadout, [ring], 'mage', NO_SLOT_LEVELS)).toEqual(base);
    const stats = permanentStats('mage', 1, {}, loadout, [ring], levels({ weapon: 30 }));
    expect(stats.magicalDamage).toBeGreaterThan(
      permanentStats('mage', 1, {}, loadout, [ring]).magicalDamage,
    );
  });
  it('a run starts with the slot levels (validated)', () => {
    const start = (slotLevels?: SlotLevels) =>
      new GameplayWorld({
        characterClass: 'mage',
        seed: 1,
        initialEnemies: false,
        spawning: { enabled: false },
        equipment: { loadout, items: [ring], ...(slotLevels ? { slotLevels } : {}) },
      });
    const plain = start();
    const up = start(levels({ weapon: 30 }));
    expect(up.core.getEntity(up.playerId).magicalDamage).toBeGreaterThan(
      plain.core.getEntity(plain.playerId).magicalDamage,
    );
    expect(() => start({ ...NO_SLOT_LEVELS, ring: 31 })).toThrow(RangeError);
  });
});
