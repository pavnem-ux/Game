import { describe, expect, it, vi } from 'vitest';
import { StatusEffects, WeaponStatusAdapter } from '../../src/status-effects';
import type { EffectDefinition } from '../../src/status-effects';
import type { WeaponImpactEvent } from '../../src/weapon-attacks';
import { setup, application, kill } from './helpers';
import { setup as weaponSetup, addEntity, impacts } from '../weapon-attacks/helpers';
import { TEST_WEAPONS } from '../weapon-attacks/fixtures';
const definition: EffectDefinition = {
  effectType: 'poison',
  rawDamagePerTick: 3,
  duration: 3,
  probabilityPercent: 100,
};
function realHit(patch: Parameters<typeof setup>[1] = {}, coefficient = 1) {
  const world = setup({}, patch),
    attack = world.core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient });
  const hit: WeaponImpactEvent = {
    type: 'impact',
    time: 0,
    weaponId: 'test-weapon',
    attack,
    targetId: 'target',
    result: world.core.resolveAttack(attack, 'target'),
  };
  return { ...world, hit };
}
describe('narrow WeaponImpactEvent integration', () => {
  it('applies an on-hit effect after actual HP loss without repeating direct damage', () => {
    const { core, statuses, hit } = realHit();
    const adapter = new WeaponStatusAdapter(statuses, { 'test-weapon': [definition] });
    const hp = core.getEntity('target').currentHp;
    const result = adapter.consumeImpact(hit);
    expect(result.eligible).toBe(true);
    expect(result.applications[0].status).toBe('applied');
    expect(statuses.getGroup('target', 'poison')?.stacks[0]).toMatchObject({
      sourceId: 'source',
      originId: 'test-weapon',
      rawDamagePerTick: 3,
    });
    expect(core.getEntity('target').currentHp).toBe(hp);
  });
  it('rejects a dodged hit without rolling application RNG', () => {
    const { core } = setup();
    core.updateEntityStats('target', { ...core.getEntity('target'), dodgeChance: 60 });
    // The synthetic envelope uses a valid direct result shape; actual dodge behavior belongs to Core.
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    const random = vi.fn(() => 0.1);
    const statuses = new StatusEffects(core, { random });
    const hit: WeaponImpactEvent = {
      type: 'impact',
      time: 0,
      weaponId: 'test-weapon',
      attack,
      targetId: 'target',
      result: {
        attackId: attack.id,
        targetId: 'target',
        status: 'dodged',
        damage: 0,
        appliedDamage: 0,
        previousHp: 1000,
        currentHp: 1000,
        events: [],
      },
    };
    expect(
      new WeaponStatusAdapter(statuses, { 'test-weapon': [definition] }).consumeImpact(hit)
        .eligible,
    ).toBe(false);
    expect(random).not.toHaveBeenCalled();
    expect(statuses.getGroups()).toEqual([]);
  });
  it('ignores zero actual damage, inactive results and killing hits', () => {
    for (const mode of ['zero', 'inactive', 'killing'] as const) {
      const { core, statuses, hit } = realHit(
        mode === 'killing' ? { maxHp: 10 } : {},
        mode === 'zero' ? 0 : 1,
      );
      let event = hit;
      if (mode === 'inactive') {
        kill(core, 'target');
        event = { ...hit, result: core.resolveAttack(hit.attack, 'target') };
      }
      const result = new WeaponStatusAdapter(statuses, {
        'test-weapon': [definition],
      }).consumeImpact(event);
      expect(result.eligible).toBe(false);
      expect(result.applications).toEqual([]);
      expect(statuses.getGroups()).toEqual([]);
    }
  });
  it('cleans existing target groups from killing-hit death events', () => {
    const { core, statuses } = setup({}, { maxHp: 10 });
    statuses.apply(application());
    const attack = core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1,
    });
    const hit: WeaponImpactEvent = {
      type: 'impact',
      time: 0,
      weaponId: 'test-weapon',
      attack,
      targetId: 'target',
      result: core.resolveAttack(attack, 'target'),
    };
    const result = new WeaponStatusAdapter(statuses, { 'test-weapon': [definition] }).consumeImpact(
      hit,
    );
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'status-removed', reason: 'target-dead' }),
    );
    expect(statuses.getGroups()).toEqual([]);
  });
  it('does not modify application chance because the direct hit was critical', () => {
    const { core } = setup();
    core.updateEntityStats('source', { ...core.getEntity('source'), criticalChance: 75 });
    const world = weaponSetup(TEST_WEAPONS.sword, () => 0);
    world.core.updateEntityStats('hero', { ...world.core.getEntity('hero'), criticalChance: 75 });
    addEntity(world.core, world.system, 'enemy', { x: 40, y: 0, radius: 1 });
    const hit = impacts(world.system.update(0))[0];
    expect(hit.attack.critical).toBe(true);
    const random = vi.fn(() => 0.7);
    const statuses = new StatusEffects(world.core, { random });
    const result = new WeaponStatusAdapter(statuses, {
      [TEST_WEAPONS.sword.id]: [{ ...definition, probabilityPercent: 50 }],
    }).consumeImpact(hit);
    expect(result.applications[0].status).toBe('failed-roll');
    expect(random).toHaveBeenCalledTimes(1);
  });
  it('performs separate application rolls for sword targets sharing one crit snapshot', () => {
    const { core, system } = weaponSetup();
    addEntity(core, system, 'a', { x: 40, y: 0, radius: 1 });
    addEntity(core, system, 'b', { x: 50, y: 0, radius: 1 });
    const random = vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
    const statuses = new StatusEffects(core, { random });
    const adapter = new WeaponStatusAdapter(statuses, {
      [TEST_WEAPONS.sword.id]: [{ ...definition, probabilityPercent: 50 }],
    });
    const hits = impacts(system.update(0));
    expect(hits[0].attack).toBe(hits[1].attack);
    hits.forEach((hit) => adapter.consumeImpact(hit));
    expect(random).toHaveBeenCalledTimes(2);
    expect(statuses.getGroup('a', 'poison')?.stacks).toHaveLength(1);
    expect(statuses.getGroup('b', 'poison')).toBeNull();
  });
  it('preserves independent dagger-strike on-hit checks at their actual times', () => {
    const { core, system } = weaponSetup(TEST_WEAPONS.daggers);
    addEntity(core, system, 'enemy', { x: 40, y: 0, radius: 1 });
    const random = vi.fn(() => 0.1);
    const statuses = new StatusEffects(core, { random });
    const adapter = new WeaponStatusAdapter(statuses, { [TEST_WEAPONS.daggers.id]: [definition] });
    impacts(system.update(0)).forEach((hit) => adapter.consumeImpact(hit));
    statuses.advanceTo(0.315);
    impacts(system.update(0.315)).forEach((hit) => adapter.consumeImpact(hit));
    expect(random).toHaveBeenCalledTimes(2);
    expect(statuses.getGroup('enemy', 'poison')?.stacks).toHaveLength(2);
    expect(statuses.getGroup('enemy', 'poison')?.nextTickAt).toBe(1);
  });
  it('can apply from an already-launched projectile whose source died', () => {
    const { core, system } = weaponSetup(TEST_WEAPONS.bow);
    addEntity(core, system, 'enemy', { x: 100, y: 0, radius: 5 });
    system.update(0);
    kill(core, 'hero', 'enemy');
    const hit = impacts(system.update(0.2))[0];
    const statuses = new StatusEffects(core, { random: () => 0.1 });
    statuses.advanceTo(hit.time);
    const result = new WeaponStatusAdapter(statuses, {
      [TEST_WEAPONS.bow.id]: [definition],
    }).consumeImpact(hit);
    expect(result.eligible).toBe(true);
    expect(statuses.getGroup('enemy', 'poison')?.stacks[0].sourceId).toBe('hero');
  });
  it('does not apply on launch/start and leaves unconfigured weapons alone', () => {
    const { statuses, hit } = realHit();
    const adapter = new WeaponStatusAdapter(statuses, {});
    expect(adapter.consumeImpact(hit).applications).toEqual([]);
    expect(() =>
      adapter.consumeImpact({ ...hit, type: 'attack-started' } as unknown as WeaponImpactEvent),
    ).toThrow(/WeaponImpactEvent/);
    expect(statuses.getGroups()).toEqual([]);
  });
  it('copies the configuration mapping and supports independent effect types', () => {
    const { statuses, hit } = realHit();
    const rules = [{ ...definition }, { ...definition, effectType: 'burn' as const }];
    const adapter = new WeaponStatusAdapter(statuses, { 'test-weapon': rules });
    rules[0].rawDamagePerTick = 999;
    adapter.consumeImpact(hit);
    expect(statuses.getGroups().map((g) => g.effectType)).toEqual(['poison', 'burn']);
    expect(statuses.getGroup('target', 'poison')?.stacks[0].rawDamagePerTick).toBe(3);
  });
  it('rolls back all status applications in a malformed batch without undoing the already-resolved direct hit', () => {
    const { core, statuses, hit } = realHit();
    const hp = core.getEntity('target').currentHp;
    const adapter = new WeaponStatusAdapter(statuses, {
      'test-weapon': [definition, { ...definition, effectType: 'burn', rawDamagePerTick: 1e308 }],
    });
    expect(() => adapter.consumeImpact(hit)).toThrow();
    expect(statuses.getGroups()).toEqual([]);
    expect(core.getEntity('target').currentHp).toBe(hp);
    expect(statuses.apply(application()).stack?.sequence).toBe(1);
  });
  it.each([NaN, Infinity, -1, 1])(
    'rejects invalid/unaligned hit time %s before mutation',
    (time) => {
      const { statuses, hit } = realHit();
      const adapter = new WeaponStatusAdapter(statuses, { 'test-weapon': [definition] });
      expect(() => adapter.consumeImpact({ ...hit, time })).toThrow();
      expect(statuses.getGroups()).toEqual([]);
    },
  );
  it('validates result identity and HP loss before applying effects', () => {
    const { statuses, hit } = realHit();
    const adapter = new WeaponStatusAdapter(statuses, { 'test-weapon': [definition] });
    for (const patch of [
      { targetId: 'other' },
      { attackId: 'wrong' },
      { appliedDamage: -1 },
      { appliedDamage: 99999 },
      { currentHp: NaN },
    ])
      expect(() =>
        adapter.consumeImpact({ ...hit, result: { ...hit.result, ...patch } }),
      ).toThrow();
    expect(statuses.getGroups()).toEqual([]);
  });
  it('rejects a mixed invalid mapping before any application', () => {
    const { statuses } = setup();
    expect(
      () =>
        new WeaponStatusAdapter(statuses, {
          valid: [definition],
          invalid: [{ ...definition, duration: -1 }],
        }),
    ).toThrow();
    expect(statuses.getGroups()).toEqual([]);
  });
});
