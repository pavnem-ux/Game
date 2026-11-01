import { describe, expect, it } from 'vitest';
import { CombatCore } from '../../src/combat-core';
import { addPair } from './helpers';

describe('Task 07 additive Combat Core extensions', () => {
  it('per-target damage multiplier keeps one crit roll per attack and validates input', () => {
    let draws = 0;
    const core = new CombatCore(() => {
      draws++;
      return 0.5;
    });
    addPair(core);
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    expect(draws).toBe(1);
    expect(core.resolveAttack(attack, 'target', { damageMultiplier: 1.5 }).damage).toBe(30);
    expect(core.resolveAttack(attack, 'target').damage).toBe(20);
    expect(core.resolveAttack(attack, 'target', { damageMultiplier: 0 }).damage).toBe(0);
    expect(() => core.resolveAttack(attack, 'target', { damageMultiplier: -1 })).toThrow();
    expect(() => core.resolveAttack(attack, 'target', { damageMultiplier: NaN })).toThrow();
  });
  it('crit bonus is additive for one attack and never exceeds the 75% cap', () => {
    const roll = (value: number, bonus: number, chance: number) => {
      const core = new CombatCore(() => value);
      addPair(core, { criticalChance: chance });
      return core.createAttack({
        attackerId: 'source',
        damageType: 'physical',
        coefficient: 1,
        criticalChanceBonus: bonus,
      }).critical;
    };
    expect(roll(0.3, 25, 10)).toBe(true);
    expect(roll(0.3, 0, 10)).toBe(false);
    expect(roll(0.76, 100, 70)).toBe(false);
    expect(roll(0.74, 100, 70)).toBe(true);
    expect(() => roll(0.1, -1, 10)).toThrow();
  });
  it('barrier absorbs direct and periodic damage before HP and reports the absorbed amount', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    core.setBarrier('target', 25);
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    const first = core.resolveAttack(attack, 'target');
    expect(first).toMatchObject({ damage: 20, appliedDamage: 0, absorbed: 20, currentHp: 100 });
    expect(first.events).toEqual([]);
    expect(core.getBarrier('target')).toBe(5);
    const periodic = core.applyPeriodicDamage({
      operationId: 'p',
      targetId: 'target',
      effectId: 'burn',
      rawDamage: 10,
      sources: [{ applicationId: 'a', sourceId: 'source', rawDamage: 10 }],
    });
    expect(periodic).toMatchObject({ absorbed: 5, appliedDamage: 5, currentHp: 95 });
    expect(core.getBarrier('target')).toBe(0);
    expect('absorbed' in core.resolveAttack(attack, 'target')).toBe(false);
    core.setBarrier('target', 10);
    core.setBarrier('target', 0);
    expect(core.getBarrier('target')).toBe(0);
    expect(() => core.setBarrier('target', -1)).toThrow();
    expect(() => core.setBarrier('nobody', 1)).toThrow();
  });
});
