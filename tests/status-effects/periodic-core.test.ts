import { describe, expect, it, vi } from 'vitest';
import { CombatCore } from '../../src/combat-core';
import type { PeriodicDamageRequest } from '../../src/combat-core';
import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { periodic, setup } from './helpers';
describe('backward-compatible periodic Core operation', () => {
  it('owns HP and reuses rounding/resistance without crit or Dodge RNG', () => {
    const rng = vi.fn(() => {
      throw new Error('No RNG for periodic damage');
    });
    const core = new CombatCore(rng);
    core.addEntity({ id: 'source', affiliation: 'player', stats: BASE_COMBAT_ATTRIBUTES });
    core.addEntity({
      id: 'target',
      affiliation: 'enemy',
      stats: {
        ...BASE_COMBAT_ATTRIBUTES,
        criticalChance: 75,
        criticalDamage: 275,
        dodgeChance: 60,
        resistance: 100,
      },
    });
    const hit = core.applyPeriodicDamage(periodic('target', 21));
    expect(hit.damage).toBe(11);
    expect(hit.currentHp).toBe(89);
    expect(hit.events[0]).toMatchObject({
      type: 'periodic-damage',
      damage: 11,
      sourceId: 'source',
      periodic: { effectId: 'test-effect' },
    });
    expect(rng).not.toHaveBeenCalled();
  });
  it.each([
    [0, 0],
    [0.001, 1],
    [1.49, 1],
    [1.5, 2],
    [2.5, 3],
  ])('raw %s gives %s whole HP', (raw, expected) => {
    const { core } = setup();
    expect(core.applyPeriodicDamage(periodic('target', raw)).damage).toBe(expected);
  });
  it('retains multi-source attribution and does not transfer overkill', () => {
    const { core } = setup({}, { maxHp: 10 });
    const request = {
      ...periodic('target', 30),
      sources: [
        { applicationId: 'one', sourceId: 'source', originId: 'weapon-a', rawDamage: 20 },
        { applicationId: 'two', sourceId: 'other', originId: 'skill-b', rawDamage: 10 },
      ],
    };
    const result = core.applyPeriodicDamage(request);
    expect(result.appliedDamage).toBe(10);
    expect(result.currentHp).toBe(0);
    expect(result.events.map((e) => e.type)).toEqual(['periodic-damage', 'death']);
    expect(result.events[1]).toMatchObject({
      type: 'death',
      sourceId: 'source',
      attackId: request.operationId,
      periodic: { sources: request.sources },
    });
    expect(core.getEntity('target-b').currentHp).toBe(1000);
    expect(core.applyPeriodicDamage(request)).toMatchObject({
      status: 'inactive',
      events: [],
      appliedDamage: 0,
    });
  });
  it('allows already-dead sources and keeps immutable event metadata detached from caller input', () => {
    const { core } = setup();
    core.applyPeriodicDamage(periodic('source', 10000, 'other'));
    const request = periodic();
    const hit = core.applyPeriodicDamage(request);
    (request.sources[0] as { sourceId: string }).sourceId = 'changed';
    expect(hit.events[0]).toMatchObject({ periodic: { sources: [{ sourceId: 'source' }] } });
    expect(Object.isFrozen(hit)).toBe(true);
    expect(Object.isFrozen(hit.events[0])).toBe(true);
    if (hit.events[0].type === 'periodic-damage')
      expect(Object.isFrozen(hit.events[0].periodic.sources[0])).toBe(true);
  });
  it.each([
    { operationId: '' },
    { targetId: 'missing' },
    { effectId: '' },
    { rawDamage: -1 },
    { rawDamage: NaN },
    { rawDamage: Infinity },
    { sources: [] },
    { sources: [{ applicationId: 'a', sourceId: 'missing', rawDamage: 10 }] },
    { sources: [{ applicationId: '', sourceId: 'source', rawDamage: 10 }] },
    { sources: [{ applicationId: 'a', sourceId: 'source', rawDamage: 9 }] },
    {
      sources: [
        { applicationId: 'a', sourceId: 'source', rawDamage: 5 },
        { applicationId: 'a', sourceId: 'other', rawDamage: 5 },
      ],
    },
  ])('rejects malformed periodic input without changing HP: %j', (patch) => {
    const { core } = setup();
    const before = core.getEntity('target');
    expect(() =>
      core.applyPeriodicDamage({ ...periodic(), ...patch } as PeriodicDamageRequest),
    ).toThrow();
    expect(core.getEntity('target')).toBe(before);
  });
  it('does not consume direct attack IDs or change direct attack behavior', () => {
    const { core } = setup();
    core.applyPeriodicDamage(periodic());
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    expect(attack.id).toBe('attack-1');
    expect(core.resolveAttack(attack, 'target')).toMatchObject({ damage: 20, currentHp: 970 });
  });
});
