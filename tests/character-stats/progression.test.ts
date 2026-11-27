import { describe, expect, it } from 'vitest';
import {
  createCharacterProgression,
  setPermanentCharacterLevel,
  selectCharacterClass,
  getSelectedCharacterStats,
  CHARACTER_CLASSES,
} from '../../src/character-stats';
import type { CharacterClass } from '../../src/character-stats';

describe('independent permanent class progression', () => {
  it('starts every class at level 1 with a versioned serializable structure', () => {
    const data = createCharacterProgression('mage');
    expect(data.version).toBe(1);
    expect(data.selectedClass).toBe('mage');
    for (const id of CHARACTER_CLASSES) expect(data.classes[id]).toEqual({ permanentLevel: 1 });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(Object.keys(data)).toEqual(['version', 'selectedClass', 'classes']);
  });
  it('preserves all other levels when changing class or assigning a level', () => {
    const initial = createCharacterProgression();
    let data = setPermanentCharacterLevel(initial, 'warrior', 20);
    data = setPermanentCharacterLevel(data, 'mage', 5);
    data = setPermanentCharacterLevel(data, 'rogue', 12);
    const switched = selectCharacterClass(data, 'mage');
    expect(switched.classes).toBe(data.classes);
    expect(switched.selectedClass).toBe('mage');
    expect(switched.classes).toEqual({
      warrior: { permanentLevel: 20 },
      mage: { permanentLevel: 5 },
      archer: { permanentLevel: 1 },
      rogue: { permanentLevel: 12 },
    });
    expect(getSelectedCharacterStats(switched).permanentLevel).toBe(5);
    expect(getSelectedCharacterStats(switched).characterClass).toBe('mage');
    expect(initial.classes.warrior.permanentLevel).toBe(1);
    expect(data.selectedClass).toBe('warrior');
    const changed = setPermanentCharacterLevel(switched, 'mage', 50);
    expect(changed.classes.warrior).toBe(switched.classes.warrior);
    expect(switched.classes.mage.permanentLevel).toBe(5);
  });
  it('does not store derived stats or manual attribute points', () => {
    const data = setPermanentCharacterLevel(createCharacterProgression(), 'mage', 50);
    expect(Object.keys(data.classes.mage)).toEqual(['permanentLevel']);
    expect(getSelectedCharacterStats(data).primaryAttributes.strength).toBe(3);
    const selected = selectCharacterClass(data, 'mage');
    // Task 40: Mage intelligence 5 + 49 × 5 × 2/15 at level 50.
    expect(getSelectedCharacterStats(selected).primaryAttributes.intelligence).toBeCloseTo(
      5 + (49 * 5 * 2) / 15,
      10,
    );
  });
  it('returns deeply immutable progression without sharing mutable class records', () => {
    const data = createCharacterProgression();
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(data.classes)).toBe(true);
    for (const id of CHARACTER_CLASSES) expect(Object.isFrozen(data.classes[id])).toBe(true);
    expect(data.classes.mage).not.toBe(data.classes.archer);
  });
  it('validates class and level without modifying the supplied progression', () => {
    const data = createCharacterProgression();
    expect(() => setPermanentCharacterLevel(data, 'mage', 51)).toThrow(
      /permanent character level/i,
    );
    expect(() => setPermanentCharacterLevel(data, 'invalid' as CharacterClass, 1)).toThrow(
      /invalid character class/i,
    );
    expect(() => selectCharacterClass(data, 'invalid' as CharacterClass)).toThrow(
      /invalid character class/i,
    );
    expect(() => createCharacterProgression('invalid' as CharacterClass)).toThrow(
      /invalid character class/i,
    );
    expect(data.classes.mage.permanentLevel).toBe(1);
  });
});
