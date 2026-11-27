import { describe, expect, it, vi } from 'vitest';
import { calculateCharacterStats } from '../../src/character-stats';
import { CombatCore, calculateSuccessfulDamage } from '../../src/combat-core';
import { addPair } from './helpers';

describe('direct damage and reusable attack snapshots', () => {
  it.each([
    ['physical', 20],
    ['magical', 35],
  ] as const)('resolves %s damage from the corresponding stat', (damageType, base) => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    const attack = core.createAttack({ attackerId: 'source', damageType, coefficient: 1.5 });
    expect(attack.baseDamage).toBe(base * 1.5);
    expect(attack.rawDamage).toBe(base * 1.5);
    expect(attack.critical).toBe(false);
    const hit = core.resolveAttack(attack, 'target');
    expect(hit.damage).toBe(Math.round(base * 1.5));
    expect(hit.currentHp).toBe(100 - hit.damage);
    expect(hit.events[0]).toMatchObject({ type: 'damage', damageType, critical: false });
  });
  it.each([
    [0, 100],
    [100, 50],
    [300, 25],
  ])('uses existing universal resistance formula at RES %s', (resistance, expected) => {
    for (const damageType of ['physical', 'magical'] as const) {
      const core = new CombatCore(() => 0.99);
      addPair(core, { physicalDamage: 100, magicalDamage: 100 }, { resistance, maxHp: 1000 });
      const hit = core.resolveAttack(
        core.createAttack({ attackerId: 'source', damageType, coefficient: 1 }),
        'target',
      );
      expect(hit.damage).toBe(expected);
    }
  });
  it('reuses Character Stats without adding bases or duplicating conversions', () => {
    const core = new CombatCore(() => 0.99);
    const mage = calculateCharacterStats('mage', 50);
    const warrior = calculateCharacterStats('warrior', 50);
    core.addEntity({ id: 'mage', affiliation: 'player', stats: mage.combatAttributes });
    core.addEntity({ id: 'warrior', affiliation: 'enemy', stats: warrior.combatAttributes });
    const attack = core.createAttack({ attackerId: 'mage', damageType: 'magical', coefficient: 1 });
    // Task 40 class growth ×2/15: Mage L50 magic damage 15 + 5 × 36.6667 = 198.33; Warrior L50
    // resistance 45.2 → 198.33 × 100 / 145.2 = 136.6 → 137.
    expect(attack.baseDamage).toBeCloseTo(198.333333, 5);
    expect(core.resolveAttack(attack, 'warrior').damage).toBe(137);
  });
  it('rolls crit once and uses the existing Critical Damage multiplier', () => {
    const random = vi.fn().mockReturnValueOnce(0.1).mockReturnValue(0.99);
    const core = new CombatCore(random);
    addPair(
      core,
      { physicalDamage: 40, criticalChance: 40, criticalDamage: 275 },
      { resistance: 100 },
    );
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    expect(attack.critical).toBe(true);
    expect(attack.baseDamage).toBe(40);
    expect(attack.rawDamage).toBe(110);
    expect(random).toHaveBeenCalledTimes(1);
    const hit = core.resolveAttack(attack, 'target');
    expect(hit.damage).toBe(55);
    expect(random).toHaveBeenCalledTimes(2);
  });
  it('shares one critical result between multiple targets and never transfers overkill', () => {
    const random = vi.fn().mockReturnValueOnce(0.1).mockReturnValue(0.99);
    const core = new CombatCore(random);
    addPair(core, { physicalDamage: 100, criticalChance: 50, criticalDamage: 250 }, { maxHp: 10 });
    core.addEntity({
      id: 'second',
      affiliation: 'enemy',
      stats: { ...core.getEntity('target'), maxHp: 1000 },
    });
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    const first = core.resolveAttack(attack, 'target'),
      second = core.resolveAttack(attack, 'second');
    expect(first.damage).toBe(250);
    expect(first.appliedDamage).toBe(10);
    expect(first.currentHp).toBe(0);
    expect(second.damage).toBe(250);
    expect(second.currentHp).toBe(750);
    expect(random).toHaveBeenCalledTimes(3);
  });
  it('checks dodge separately for each target without re-rolling the attack crit', () => {
    const random = vi
      .fn()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.9);
    const core = new CombatCore(random);
    addPair(core, { physicalDamage: 20, criticalChance: 40 }, { dodgeChance: 50 });
    core.addEntity({ id: 'second', affiliation: 'enemy', stats: core.getEntity('target') });
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    expect(attack.critical).toBe(true);
    const first = core.resolveAttack(attack, 'target');
    expect(first.status).toBe('dodged');
    expect(first.damage).toBe(0);
    expect(first.currentHp).toBe(100);
    expect(first.events).toEqual([
      { type: 'dodge', attackId: attack.id, sourceId: 'source', targetId: 'target' },
    ]);
    expect(core.resolveAttack(attack, 'second').damage).toBe(40);
    expect(random).toHaveBeenCalledTimes(3);
  });
  it('uses strict probability boundaries: roll equal to chance does not crit or dodge', () => {
    const core = new CombatCore(() => 0.4);
    addPair(core, { criticalChance: 40 }, { dodgeChance: 40 });
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    expect(attack.critical).toBe(false);
    expect(core.resolveAttack(attack, 'target').status).toBe('hit');
  });
  it('zero chance never succeeds even with an RNG result of zero', () => {
    const core = new CombatCore(() => 0);
    addPair(core);
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    expect(attack.critical).toBe(false);
    expect(core.resolveAttack(attack, 'target').status).toBe('hit');
  });
  it.each([
    [0.01, 0, 1],
    [1, 1000000, 1],
    [1.49, 0, 1],
    [1.5, 0, 2],
    [2.5, 0, 3],
    [0, 100, 0],
  ])('rounds raw %s with RES %s to %s HP', (raw, res, expected) =>
    expect(calculateSuccessfulDamage(raw, res)).toBe(expected),
  );
  it('zero raw damage consumes no HP and emits neither damage nor death', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    const result = core.resolveAttack(
      core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient: 0 }),
      'target',
    );
    expect(result).toMatchObject({
      status: 'hit',
      damage: 0,
      appliedDamage: 0,
      currentHp: 100,
      events: [],
    });
  });
  it('does not change an existing snapshot when attacker stats change', () => {
    const core = new CombatCore(() => 0);
    addPair(core, { criticalChance: 50, criticalDamage: 250 });
    const first = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    core.updateEntityStats('source', {
      ...core.getEntity('source'),
      physicalDamage: 80,
      criticalChance: 0,
      criticalDamage: 400,
    });
    const second = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    expect(first).toMatchObject({ baseDamage: 20, critical: true, rawDamage: 50 });
    expect(second).toMatchObject({ baseDamage: 80, critical: false, rawDamage: 80 });
    expect(first.id).not.toBe(second.id);
    expect(core.resolveAttack(first, 'target').damage).toBe(50);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first as { rawDamage: number }).rawDamage = 999;
    }).toThrow();
  });
  it('uses the target defenses at resolution time', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core, { physicalDamage: 100 });
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    core.updateEntityStats('target', { ...core.getEntity('target'), resistance: 300 });
    expect(core.resolveAttack(attack, 'target').damage).toBe(25);
  });
  it('returns immutable events and state snapshots', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    const original = core.getEntity('target');
    const result = core.resolveAttack(
      core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient: 1 }),
      'target',
    );
    expect(original.currentHp).toBe(100);
    expect(core.getEntity('target').currentHp).toBe(80);
    expect(Object.isFrozen(core.getEntity('target'))).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(result.events[0])).toBe(true);
  });
  it('is deterministic for identical inputs and RNG sequences', () => {
    const simulate = () => {
      const values = [0.1, 0.4, 0.7];
      const core = new CombatCore(() => values.shift()!);
      addPair(core, { criticalChance: 50 }, { dodgeChance: 50 });
      const attack = core.createAttack({
        attackerId: 'source',
        damageType: 'magical',
        coefficient: 0.7,
      });
      return [
        attack,
        core.resolveAttack(attack, 'target'),
        core.resolveAttack(attack, 'target'),
        core.getEntity('target'),
      ];
    };
    expect(simulate()).toEqual(simulate());
  });
});
