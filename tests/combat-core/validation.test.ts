import { describe, expect, it, vi } from 'vitest';
import { BASE_COMBAT_ATTRIBUTES, COMBAT_ATTRIBUTE_CAPS } from '../../src/character-stats';
import { CombatCore, calculateSuccessfulDamage } from '../../src/combat-core';
import type {
  AttackSnapshot,
  CombatEntityInput,
  CombatEntityStats,
  AttackRequest,
  RandomSource,
} from '../../src/combat-core';
import { addPair } from './helpers';

const request = { attackerId: 'source', damageType: 'physical', coefficient: 1 } as const;
describe('input boundaries and failure atomicity', () => {
  it('enforces unique IDs within a session, including IDs of dead entities', () => {
    const core = new CombatCore();
    addPair(core);
    expect(() =>
      core.addEntity({ id: 'target', affiliation: 'enemy', stats: BASE_COMBAT_ATTRIBUTES }),
    ).toThrow(/already exists/);
    expect(() => core.getEntity('missing')).toThrow(/unknown combat entity/i);
    core.addEntity({
      id: 'dead',
      affiliation: 'enemy',
      stats: BASE_COMBAT_ATTRIBUTES,
      currentHp: 0,
    });
    expect(() =>
      core.addEntity({ id: 'dead', affiliation: 'enemy', stats: BASE_COMBAT_ATTRIBUTES }),
    ).toThrow(/already exists/);
  });
  it.each(['', '   ', null, undefined, 7])('rejects invalid IDs: %s', (id) => {
    const core = new CombatCore();
    expect(() =>
      core.addEntity({
        id,
        affiliation: 'enemy',
        stats: BASE_COMBAT_ATTRIBUTES,
      } as CombatEntityInput),
    ).toThrow(/entity id/);
  });
  it('rejects missing entity and attack objects with clear errors', () => {
    const core = new CombatCore();
    expect(() => core.addEntity(null as unknown as CombatEntityInput)).toThrow(
      /input must be an object/,
    );
    expect(() => core.createAttack(null as unknown as AttackRequest)).toThrow(
      /request must be an object/,
    );
  });
  it('rejects invalid affiliation and missing stats', () => {
    const core = new CombatCore();
    expect(() =>
      core.addEntity({
        id: 'bad',
        affiliation: 'friendly',
        stats: BASE_COMBAT_ATTRIBUTES,
      } as unknown as CombatEntityInput),
    ).toThrow(/affiliation/);
    expect(() =>
      core.addEntity({
        id: 'bad',
        affiliation: 'enemy',
        stats: null,
      } as unknown as CombatEntityInput),
    ).toThrow(/stats must be an object/);
  });
  it.each([
    'maxHp',
    'physicalDamage',
    'magicalDamage',
    'resistance',
    'criticalChance',
    'criticalDamage',
    'dodgeChance',
  ] as const)('validates finite non-negative %s', (key) => {
    for (const bad of [-1, NaN, Infinity, -Infinity, '20', undefined]) {
      const core = new CombatCore();
      expect(() =>
        core.addEntity({
          id: 'invalid',
          affiliation: 'enemy',
          stats: { ...BASE_COMBAT_ATTRIBUTES, [key]: bad } as CombatEntityStats,
        }),
      ).toThrow(/stats\./);
    }
  });
  it.each([0, 0.5])('rejects Max HP %s below the representable living minimum', (maxHp) => {
    expect(() =>
      new CombatCore().addEntity({
        id: 'invalid',
        affiliation: 'enemy',
        stats: { ...BASE_COMBAT_ATTRIBUTES, maxHp },
      }),
    ).toThrow(/at least 1/);
  });
  it.each([-1, 101, NaN, Infinity, null])('rejects invalid current HP %s', (currentHp) => {
    expect(() =>
      new CombatCore().addEntity({
        id: 'invalid',
        affiliation: 'enemy',
        stats: BASE_COMBAT_ATTRIBUTES,
        currentHp: currentHp as number,
      }),
    ).toThrow(/currentHp/);
  });
  it('reuses the central critical/dodge caps when accepting combined entity stats', () => {
    const core = new CombatCore();
    const entity = core.addEntity({
      id: 'capped',
      affiliation: 'player',
      stats: {
        ...BASE_COMBAT_ATTRIBUTES,
        criticalChance: 10000,
        dodgeChance: 10000,
        resistance: 10000,
        criticalDamage: 10000,
      },
    });
    expect(entity.criticalChance).toBe(COMBAT_ATTRIBUTE_CAPS.criticalChance);
    expect(entity.dodgeChance).toBe(COMBAT_ATTRIBUTE_CAPS.dodgeChance);
    expect(entity.resistance).toBe(10000);
    expect(entity.criticalDamage).toBe(10000);
    const changed = core.updateEntityStats('capped', {
      ...entity,
      criticalChance: 10000,
      dodgeChance: 10000,
    });
    expect(changed.entity.criticalChance).toBe(75);
    expect(changed.entity.dodgeChance).toBe(60);
  });
  it.each([-1, NaN, Infinity, '1', undefined])(
    'rejects invalid attack coefficient %s before rolling RNG',
    (coefficient) => {
      const random = vi.fn(() => 0.99);
      const core = new CombatCore(random);
      addPair(core);
      expect(() => core.createAttack({ ...request, coefficient: coefficient as number })).toThrow(
        /coefficient/,
      );
      expect(random).not.toHaveBeenCalled();
      expect(core.getEntity('target').currentHp).toBe(100);
    },
  );
  it('rejects unknown sources and unsupported damage types', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    expect(() => core.createAttack({ ...request, attackerId: 'unknown' })).toThrow(
      /unknown combat entity/i,
    );
    expect(() =>
      core.createAttack({ ...request, damageType: 'fire' } as unknown as AttackRequest),
    ).toThrow(/physical or magical/);
  });
  it.each([-1, 1, Infinity, NaN, '0'])(
    'rejects RNG value %s on attack or target without changing HP',
    (value) => {
      const core = new CombatCore(() => value as number);
      addPair(core);
      expect(() => core.createAttack(request)).toThrow(/\[0, 1\)/);
      const random = vi.fn().mockReturnValueOnce(0.99).mockReturnValue(value);
      const second = new CombatCore(random);
      addPair(second);
      const attack = second.createAttack(request);
      expect(() => second.resolveAttack(attack, 'target')).toThrow(/\[0, 1\)/);
      expect(second.getEntity('target').currentHp).toBe(100);
    },
  );
  it('accepts RNG values arbitrarily close to 1 but rejects a non-function source', () => {
    const core = new CombatCore(() => 1 - Number.EPSILON);
    addPair(core);
    expect(core.resolveAttack(core.createAttack(request), 'target').status).toBe('hit');
    expect(() => new CombatCore(1 as unknown as RandomSource)).toThrow(/must be a function/);
  });
  it.each([-1, NaN, Infinity])(
    'rejects malformed snapshot damage %s without changing the target',
    (rawDamage) => {
      const random = vi.fn(() => 0.99);
      const core = new CombatCore(random);
      addPair(core);
      const attack = core.createAttack(request);
      expect(() => core.resolveAttack({ ...attack, rawDamage }, 'target')).toThrow(/rawDamage/);
      expect(random).toHaveBeenCalledTimes(1);
      expect(core.getEntity('target').currentHp).toBe(100);
    },
  );
  it('validates all snapshot fields, including serialized data', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    const attack = core.createAttack(request);
    const invalid = [
      null,
      { ...attack, id: '' },
      { ...attack, attackerId: '' },
      { ...attack, damageType: 'fire' },
      { ...attack, coefficient: -1 },
      { ...attack, baseDamage: -1 },
      { ...attack, critical: 'yes' },
    ];
    for (const data of invalid)
      expect(() => core.resolveAttack(data as AttackSnapshot, 'target')).toThrow();
    expect(core.resolveAttack(JSON.parse(JSON.stringify(attack)), 'target').damage).toBe(20);
  });
  it.each([-1, NaN, Infinity])(
    'rejects invalid healing amount %s and keeps HP unchanged',
    (amount) => {
      const core = new CombatCore(() => 0.99);
      addPair(core);
      expect(() => core.heal('target', amount)).toThrow(/healing amount/);
      expect(core.getEntity('target').currentHp).toBe(100);
    },
  );
  it.each([NaN, Infinity, -Infinity, -100, -101])(
    'rejects invalid Max HP change %s without mutation',
    (delta) => {
      const core = new CombatCore(() => 0.99);
      addPair(core);
      const before = core.getEntity('target');
      expect(() => core.changeMaxHp('target', delta)).toThrow();
      expect(core.getEntity('target')).toBe(before);
    },
  );
  it('rejects an invalid complete stats update atomically', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    const before = core.getEntity('target');
    expect(() =>
      core.updateEntityStats('target', { ...before, maxHp: 200, physicalDamage: -1 }),
    ).toThrow();
    expect(core.getEntity('target')).toBe(before);
  });
  it('rejects numeric overflow without imposing additional gameplay stat caps', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core, { physicalDamage: 1e308 });
    expect(() => core.createAttack({ ...request, coefficient: 2 })).toThrow(
      /calculated base damage/,
    );
    expect(core.getEntity('source').physicalDamage).toBe(1e308);
    core.updateEntityStats('target', { ...core.getEntity('target'), maxHp: 1e308 });
    const before = core.getEntity('target');
    expect(() => core.changeMaxHp('target', 1e308)).toThrow();
    expect(core.getEntity('target')).toBe(before);
    expect(() => calculateSuccessfulDamage(1e308, 0)).toThrow(/finite/);
  });
  it('does not mutate the target if resistance calculation overflows', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core, { physicalDamage: 1e308 });
    const before = core.getEntity('target');
    const attack = core.createAttack(request);
    expect(() => core.resolveAttack(attack, 'target')).toThrow(/finite/);
    expect(core.getEntity('target')).toBe(before);
  });
  it.each([
    [-1, 0],
    [NaN, 0],
    [1, -1],
    [1, Infinity],
  ])('rejects invalid damage/resistance inputs %s / %s', (raw, resistance) =>
    expect(() => calculateSuccessfulDamage(raw, resistance)).toThrow(),
  );
});
