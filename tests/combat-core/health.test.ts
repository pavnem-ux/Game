import { describe, expect, it, vi } from 'vitest';
import { CombatCore } from '../../src/combat-core';
import { addPair } from './helpers';

const request = { attackerId: 'source', damageType: 'physical', coefficient: 1 } as const;
describe('HP, healing and one-time death transitions', () => {
  it('heals no higher than Max HP and reports the actual restoration', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    core.resolveAttack(core.createAttack(request), 'target');
    expect(core.heal('target', 7)).toMatchObject({
      healed: 7,
      entity: { currentHp: 87 },
      events: [{ type: 'healing', entityId: 'target', amount: 7 }],
    });
    expect(core.heal('target', 1e308)).toMatchObject({ healed: 13, entity: { currentHp: 100 } });
    expect(core.heal('target', 10).events).toEqual([]);
    expect(core.heal('target', 0).healed).toBe(0);
  });
  it('increases current HP by the Max HP delta without filling missing HP', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    core.resolveAttack(core.createAttack(request), 'target');
    const result = core.changeMaxHp('target', 30);
    expect(result.entity).toMatchObject({ currentHp: 110, maxHp: 130, alive: true });
    expect(result.events).toEqual([
      {
        type: 'max-hp-changed',
        entityId: 'target',
        previousMaxHp: 100,
        maxHp: 130,
        previousHp: 80,
        currentHp: 110,
      },
    ]);
  });
  it('reduces current HP by the same delta and keeps a living entity at least at 1 HP', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    core.resolveAttack(core.createAttack(request), 'target');
    expect(core.changeMaxHp('target', -30).entity).toMatchObject({
      maxHp: 70,
      currentHp: 50,
      alive: true,
    });
    expect(core.changeMaxHp('target', -69).entity).toMatchObject({
      maxHp: 1,
      currentHp: 1,
      alive: true,
    });
  });
  it('updates complete combined stats with the same Max HP rules', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    core.resolveAttack(core.createAttack(request), 'target');
    const original = core.getEntity('target');
    const result = core.updateEntityStats('target', {
      ...original,
      maxHp: 150,
      resistance: 300,
      physicalDamage: 47,
    });
    expect(result.entity).toMatchObject({
      currentHp: 130,
      maxHp: 150,
      resistance: 300,
      physicalDamage: 47,
    });
    expect(original.currentHp).toBe(80);
  });
  it('emits damage then death immediately, exactly once, with no negative HP', () => {
    const random = vi.fn(() => 0.99);
    const core = new CombatCore(random);
    addPair(core, { physicalDamage: 1000 });
    const attack = core.createAttack(request);
    const first = core.resolveAttack(attack, 'target');
    expect(first.currentHp).toBe(0);
    expect(first.appliedDamage).toBe(100);
    expect(first.events.map((e) => e.type)).toEqual(['damage', 'death']);
    expect(first.events[1]).toEqual({
      type: 'death',
      entityId: 'target',
      sourceId: 'source',
      attackId: attack.id,
    });
    expect(core.getEntity('target').alive).toBe(false);
    const draws = random.mock.calls.length;
    for (let i = 0; i < 5; i++) {
      expect(core.resolveAttack(attack, 'target')).toMatchObject({
        status: 'inactive',
        damage: 0,
        appliedDamage: 0,
        currentHp: 0,
        events: [],
      });
    }
    expect(random).toHaveBeenCalledTimes(draws);
    expect(() =>
      core.createAttack({ attackerId: 'target', damageType: 'physical', coefficient: 1 }),
    ).toThrow(/combat-inactive/);
    expect(random).toHaveBeenCalledTimes(draws);
  });
  it('kills on damage exactly equal to remaining HP', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core, { physicalDamage: 100 });
    const result = core.resolveAttack(core.createAttack(request), 'target');
    expect(result.events.filter((e) => e.type === 'death')).toHaveLength(1);
    expect(result.currentHp).toBe(0);
  });
  it('never revives a dead entity through healing, Max HP, or a stats update', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core, { physicalDamage: 1000 });
    const attack = core.createAttack(request);
    core.resolveAttack(attack, 'target');
    expect(core.heal('target', 10000)).toMatchObject({
      healed: 0,
      events: [],
      entity: { currentHp: 0, alive: false },
    });
    expect(core.changeMaxHp('target', 200).entity).toMatchObject({
      currentHp: 0,
      maxHp: 300,
      alive: false,
    });
    expect(core.changeMaxHp('target', -299).entity).toMatchObject({
      currentHp: 0,
      maxHp: 1,
      alive: false,
    });
    expect(
      core.updateEntityStats('target', { ...core.getEntity('target'), maxHp: 100 }).entity,
    ).toMatchObject({ currentHp: 0, alive: false });
    expect(core.resolveAttack(attack, 'target').events).toEqual([]);
  });
  it('supports initially dead entities without synthesizing a death transition', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    core.addEntity({
      id: 'dead',
      affiliation: 'enemy',
      stats: core.getEntity('target'),
      currentHp: 0,
    });
    expect(core.getEntity('dead').alive).toBe(false);
    expect(core.heal('dead', 100).healed).toBe(0);
    expect(core.resolveAttack(core.createAttack(request), 'dead').events).toEqual([]);
  });
  it('keeps zero-delta changes silent and preserves fractional HP unless a reduction needs the 1 HP floor', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    core.addEntity({
      id: 'fraction',
      affiliation: 'enemy',
      stats: core.getEntity('target'),
      currentHp: 0.25,
    });
    expect(core.changeMaxHp('fraction', 0)).toMatchObject({
      events: [],
      entity: { currentHp: 0.25 },
    });
    expect(core.changeMaxHp('fraction', 0.5).entity.currentHp).toBe(0.75);
    expect(core.heal('fraction', 0.125).entity.currentHp).toBe(0.875);
    expect(core.changeMaxHp('fraction', -0.25).entity.currentHp).toBe(1);
  });
  it('reports whole calculated damage separately from actual HP lost on fractional remaining HP', () => {
    const core = new CombatCore(() => 0.99);
    addPair(core);
    core.addEntity({
      id: 'fraction',
      affiliation: 'enemy',
      stats: core.getEntity('target'),
      currentHp: 0.25,
    });
    const result = core.resolveAttack(core.createAttack(request), 'fraction');
    expect(result.damage).toBe(20);
    expect(result.appliedDamage).toBe(0.25);
    expect(result.currentHp).toBe(0);
    expect(result.events.filter((e) => e.type === 'death')).toHaveLength(1);
  });
});
