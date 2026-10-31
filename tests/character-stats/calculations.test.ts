import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_CONVERSIONS,
  BASE_COMBAT_ATTRIBUTES,
  CHARACTER_CLASSES,
  CLASS_STATS_CONFIG,
  COMBAT_ATTRIBUTE_CAPS,
  applyCombatAttributeCaps,
  calculateCharacterStats,
  calculatePrimaryAttributes,
  deriveUncappedCombatAttributes,
} from '../../src/character-stats';
import type {
  CharacterClass,
  CombatAttributes,
  PrimaryAttributes,
} from '../../src/character-stats';
import { REFERENCE_FIXTURES } from './fixtures';

const primaryKeys = ['strength', 'intelligence', 'dexterity', 'vitality', 'agility'] as const;
const combatKeys = [
  'maxHp',
  'physicalDamage',
  'magicalDamage',
  'resistance',
  'attackSpeed',
  'criticalChance',
  'criticalDamage',
  'movementSpeed',
  'dodgeChance',
  'cooldownReduction',
  'areaSize',
] as const;
const zero: PrimaryAttributes = {
  strength: 0,
  intelligence: 0,
  dexterity: 0,
  vitality: 0,
  agility: 0,
};

function expectValues(actual: CombatAttributes, values: readonly number[]) {
  expect(Object.keys(actual).sort()).toEqual([...combatKeys].sort());
  combatKeys.forEach((key, i) => expect(actual[key], key).toBeCloseTo(values[i], 10));
}

describe('approved class snapshots', () => {
  it.each(REFERENCE_FIXTURES)(
    '$characterClass at permanent level $level',
    ({ characterClass, level, primary, combat }) => {
      const snapshot = calculateCharacterStats(characterClass, level);
      expect(snapshot.characterClass).toBe(characterClass);
      expect(snapshot.permanentLevel).toBe(level);
      expect(Object.keys(snapshot.primaryAttributes).sort()).toEqual([...primaryKeys].sort());
      primaryKeys.forEach((key, i) => {
        expect(snapshot.primaryAttributes[key], key).toBe(primary[i]);
        expect(Number.isInteger(snapshot.primaryAttributes[key])).toBe(true);
      });
      expectValues(snapshot.combatAttributes, combat);
    },
  );
  // Explicit table from specification, independent of progression and conversion implementation.
  const level50: Record<CharacterClass, readonly number[]> = {
    warrior: [1600, 760, 260, 300, 125, 20, 225, 125, 10, 5, 115],
    mage: [1100, 260, 1260, 150, 149.5, 29.8, 249.5, 125, 10, 25, 175],
    archer: [600, 1260, 260, 300, 150, 30, 250, 150, 15, 5, 115],
    rogue: [1100, 760, 260, 250, 175, 40, 275, 175, 20, 5, 115],
  };
  it.each(CHARACTER_CLASSES)('%s reproduces every level-50 reference value', (id) =>
    expectValues(calculateCharacterStats(id, 50).combatAttributes, level50[id]),
  );
  it.each(CHARACTER_CLASSES)('%s grows automatically at every level after level 1', (id) => {
    for (let level = 2; level <= 50; level++) {
      const previous = calculatePrimaryAttributes(id, level - 1),
        current = calculatePrimaryAttributes(id, level);
      for (const key of primaryKeys)
        expect(current[key] - previous[key]).toBe(CLASS_STATS_CONFIG[id].growthPerLevel[key]);
    }
  });
  it('is deterministic and returns independent immutable snapshots', () => {
    const first = calculateCharacterStats('mage', 50),
      second = calculateCharacterStats('mage', 50);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.primaryAttributes).not.toBe(second.primaryAttributes);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.primaryAttributes)).toBe(true);
    expect(Object.isFrozen(first.combatAttributes)).toBe(true);
    expect(() => {
      (first.primaryAttributes as { intelligence: number }).intelligence = 999;
    }).toThrow();
    expect(calculateCharacterStats('mage', 50)).toEqual(second);
  });
  it('keeps configuration deeply immutable', () => {
    expect(Object.isFrozen(CLASS_STATS_CONFIG)).toBe(true);
    for (const id of CHARACTER_CLASSES) {
      expect(Object.isFrozen(CLASS_STATS_CONFIG[id])).toBe(true);
      expect(Object.isFrozen(CLASS_STATS_CONFIG[id].initialAttributes)).toBe(true);
      expect(Object.isFrozen(CLASS_STATS_CONFIG[id].growthPerLevel)).toBe(true);
    }
    expect(Object.isFrozen(BASE_COMBAT_ATTRIBUTES)).toBe(true);
    expect(Object.isFrozen(COMBAT_ATTRIBUTE_CAPS)).toBe(true);
    for (const value of Object.values(ATTRIBUTE_CONVERSIONS))
      expect(Object.isFrozen(value)).toBe(true);
  });
});

describe('conversion isolation and precision', () => {
  it('includes each base exactly once for zero attributes', () =>
    expectValues(
      deriveUncappedCombatAttributes(zero),
      [100, 10, 10, 0, 100, 10, 200, 100, 5, 0, 100],
    ));
  const bonuses: Record<keyof PrimaryAttributes, Partial<CombatAttributes>> = {
    strength: { physicalDamage: 5, resistance: 1 },
    intelligence: { magicalDamage: 5, cooldownReduction: 0.1, areaSize: 0.3 },
    dexterity: { attackSpeed: 0.5, criticalChance: 0.2, criticalDamage: 0.5 },
    vitality: { maxHp: 10, resistance: 1 },
    agility: { movementSpeed: 0.5, dodgeChance: 0.1 },
  };
  it.each(primaryKeys)('%s affects only approved stats', (key) => {
    const result = deriveUncappedCombatAttributes({ ...zero, [key]: 1 });
    for (const combatKey of combatKeys)
      expect(result[combatKey] - BASE_COMBAT_ATTRIBUTES[combatKey]).toBeCloseTo(
        bonuses[key][combatKey] ?? 0,
        10,
      );
  });
  it('retains fractional percentages without display rounding', () => {
    const result = calculateCharacterStats('mage', 50).combatAttributes;
    expect(result.attackSpeed).toBe(149.5);
    expect(result.criticalChance).toBeCloseTo(29.8, 12);
    expect(result.criticalDamage).toBe(249.5);
    expect(deriveUncappedCombatAttributes({ ...zero, intelligence: 1 }).cooldownReduction).toBe(
      0.1,
    );
  });
});

describe('strict input validation', () => {
  it.each([0, -1, 51, 1.5, 49.999, NaN, Infinity, -Infinity, '1', null, undefined])(
    'rejects permanent level %s without clamping',
    (value) => {
      expect(() => calculateCharacterStats('warrior', value as number)).toThrow(
        /permanent character level.*integer from 1 to 50/i,
      );
    },
  );
  it.each(['paladin', 'Mage', '', '__proto__', 'constructor', 'toString', null, undefined, 1])(
    'rejects unknown class %s',
    (value) => {
      expect(() => calculateCharacterStats(value as CharacterClass, 1)).toThrow(
        /invalid character class/i,
      );
    },
  );
  it('accepts both level boundaries', () => {
    expect(calculateCharacterStats('rogue', 1).permanentLevel).toBe(1);
    expect(calculateCharacterStats('rogue', 50).permanentLevel).toBe(50);
  });
});

describe('final cap boundary for future contributors', () => {
  const capCases = [
    ['criticalChance', 75],
    ['dodgeChance', 60],
    ['cooldownReduction', 50],
    ['attackSpeed', 300],
    ['movementSpeed', 200],
  ] as const;
  it.each(capCases)('%s has the approved hard cap %s', (key, limit) => {
    for (const value of [limit - 0.25, limit, limit + 0.25, 1e9])
      expect(applyCombatAttributeCaps({ ...BASE_COMBAT_ATTRIBUTES, [key]: value })[key]).toBe(
        Math.min(value, limit),
      );
  });
  it('does not cap HP, damage, resistance, critical damage or area size', () => {
    const result = applyCombatAttributeCaps({
      maxHp: 1e9,
      physicalDamage: 2e9,
      magicalDamage: 3e9,
      resistance: 4e9,
      criticalDamage: 5e9,
      areaSize: 6e9,
      attackSpeed: 1e9,
      criticalChance: 1e9,
      movementSpeed: 1e9,
      dodgeChance: 1e9,
      cooldownReduction: 1e9,
    });
    expect(result).toEqual({
      maxHp: 1e9,
      physicalDamage: 2e9,
      magicalDamage: 3e9,
      resistance: 4e9,
      criticalDamage: 5e9,
      areaSize: 6e9,
      attackSpeed: 300,
      criticalChance: 75,
      movementSpeed: 200,
      dodgeChance: 60,
      cooldownReduction: 50,
    });
  });
  it('applies caps after combined future bonuses and never mutates the source', () => {
    const base = deriveUncappedCombatAttributes({
      strength: 1000,
      intelligence: 1000,
      dexterity: 1000,
      vitality: 1000,
      agility: 1000,
    });
    expect(base.attackSpeed).toBe(600);
    expect(base.cooldownReduction).toBe(100);
    // A future caller supplies the combined values; no stacking policy is implemented here.
    const combined = {
      ...base,
      attackSpeed: base.attackSpeed - 350,
      cooldownReduction: base.cooldownReduction - 60,
    };
    const result = applyCombatAttributeCaps(combined);
    expect(result.attackSpeed).toBe(250);
    expect(result.cooldownReduction).toBe(40);
    expect(combined.attackSpeed).toBe(250);
    expect(base.attackSpeed).toBe(600);
    expect(applyCombatAttributeCaps(result)).toEqual(result);
  });
});
