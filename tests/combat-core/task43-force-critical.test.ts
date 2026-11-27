import { describe, expect, it } from 'vitest';
import { CombatCore } from '../../src/combat-core';
import { addPair } from './helpers';

/** Task 43 (additive): `forceCritical` — always critical, still exactly one crit draw. */
describe('Task 43 — forceCritical', () => {
  it('is critical even at 0% crit chance and keeps the one draw (same seeded sequence)', () => {
    let draws = 0;
    const core = new CombatCore(() => {
      draws++;
      return 0.99;
    });
    addPair(core, { criticalChance: 0 });
    const a = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
      forceCritical: true,
    });
    expect(a.critical).toBe(true);
    expect(a.rawDamage).toBeGreaterThan(a.baseDamage);
    expect(draws).toBe(1);
    const b = core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient: 1 });
    expect(b.critical).toBe(false);
    expect(draws).toBe(2);
  });
  it('rejects a non-boolean and the combination with noCritical', () => {
    const core = new CombatCore(() => 0.5);
    addPair(core);
    const base = { attackerId: 'source', damageType: 'physical' as const, coefficient: 1 };
    expect(() => core.createAttack({ ...base, forceCritical: 'yes' as never })).toThrow(TypeError);
    expect(() => core.createAttack({ ...base, forceCritical: true, noCritical: true })).toThrow(
      RangeError,
    );
  });
});
