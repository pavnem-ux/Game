import { describe, expect, it, vi } from 'vitest';
import { CombatCore } from '../../src/combat-core';
import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { StatusEffects, EFFECT_TYPES } from '../../src/status-effects';
import { setup, application, ticks, kill } from './helpers';
describe('aggregate periodic damage and authoritative defenses', () => {
  it('sums raw contributions before one resistance/rounding operation', () => {
    const { core, statuses } = setup({}, { resistance: 100 });
    statuses.apply(application({ rawDamagePerTick: 1.4 }));
    statuses.apply(application({ sourceId: 'other', rawDamagePerTick: 1.4 }));
    const tick = ticks(statuses.update(1))[0];
    expect(tick.rawDamage).toBe(2.8);
    expect(tick.result?.damage).toBe(1);
    expect(core.getEntity('target').currentHp).toBe(999);
  });
  it('reads CURRENT resistance each tick', () => {
    const { core, statuses } = setup();
    statuses.apply(application({ rawDamagePerTick: 100 }));
    expect(ticks(statuses.update(1))[0].result?.damage).toBe(100);
    core.updateEntityStats('target', { ...core.getEntity('target'), resistance: 300 });
    expect(ticks(statuses.update(1))[0].result?.damage).toBe(25);
  });
  it('never draws Core crit or Dodge RNG, even with capped crit and dodge stats', () => {
    const random = vi.fn(() => {
      throw new Error('Unexpected combat RNG');
    });
    const core = new CombatCore(random);
    for (const id of ['source', 'target'])
      core.addEntity({
        id,
        affiliation: id === 'source' ? 'player' : 'enemy',
        stats: {
          ...BASE_COMBAT_ATTRIBUTES,
          maxHp: 1000,
          criticalChance: 75,
          criticalDamage: 275,
          dodgeChance: 60,
        },
      });
    const status = new StatusEffects(core, { random: () => 0.1 });
    status.apply(application({ rawDamagePerTick: 10 }));
    expect(ticks(status.update(1))[0].result?.damage).toBe(10);
    expect(random).not.toHaveBeenCalled();
  });
  it.each([
    [0.01, 1],
    [0, 0],
    [1.49, 1],
    [1.5, 2],
  ])('raw %s ticks for %s HP', (raw, damage) => {
    const { core, statuses } = setup();
    statuses.apply(application({ rawDamagePerTick: raw }));
    const result = ticks(statuses.update(1))[0].result!;
    expect(result.damage).toBe(damage);
    expect(core.getEntity('target').currentHp).toBe(1000 - damage);
    if (!damage) expect(result.events).toEqual([]);
  });
  it('only consumes application RNG, with no extra draws on ticks', () => {
    const random = vi.fn(() => 0.1);
    const { statuses } = setup({ random });
    statuses.apply(application());
    statuses.apply(application({ effectType: 'burn' }));
    expect(random).toHaveBeenCalledTimes(2);
    statuses.update(4);
    expect(random).toHaveBeenCalledTimes(2);
  });
});
describe('source/target deaths and stable event order', () => {
  it('preserves damage, attribution and expiration after source death', () => {
    const { core, statuses } = setup();
    statuses.apply(application({ duration: 3, originId: 'test-weapon' }));
    const before = statuses.getGroups();
    const death = kill(core, 'source');
    expect(statuses.consumeCombatEvents(death.events)).toEqual([]);
    expect(statuses.getGroups()).toEqual(before);
    const tick = ticks(statuses.update(1))[0];
    expect(tick.result?.damage).toBe(10);
    expect(tick.result?.events[0]).toMatchObject({
      periodic: { sources: [{ sourceId: 'source', originId: 'test-weapon' }] },
    });
  });
  it('clears all target effects immediately upon forwarding a direct Core death', () => {
    const { core, statuses } = setup();
    for (const effectType of EFFECT_TYPES) statuses.apply(application({ effectType }));
    const hit = core.resolveAttack(
      core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient: 1e6 }),
      'target',
    );
    expect(statuses.consumeCombatEvents(hit.events)).toHaveLength(3);
    expect(statuses.getGroups()).toEqual([]);
    expect(statuses.update(10)).toEqual([]);
    expect(statuses.consumeCombatEvents(hit.events)).toEqual([]);
  });
  it('cleans dead targets without forwarded events, including on a paused update', () => {
    const { core, statuses } = setup();
    statuses.apply(application());
    kill(core, 'target');
    const events = statuses.update(0, { paused: true });
    expect(events[0]).toMatchObject({ type: 'status-removed', reason: 'target-dead' });
    expect(ticks(events)).toEqual([]);
    expect(statuses.getGroups()).toEqual([]);
    expect(statuses.apply(application()).status).toBe('inactive');
  });
  it('kills via Core exactly once, removes all groups and prevents later same-time damage', () => {
    const { core, statuses } = setup({}, { maxHp: 5 });
    for (const effectType of EFFECT_TYPES)
      statuses.apply(application({ effectType, rawDamagePerTick: 10 }));
    const events = statuses.update(5);
    expect(ticks(events).map((t) => t.group.effectType)).toEqual(['poison']);
    expect(
      ticks(events)
        .flatMap((t) => t.result?.events ?? [])
        .map((e) => e.type),
    ).toEqual(['periodic-damage', 'death']);
    expect(events.filter((e) => e.type === 'status-removed')).toHaveLength(3);
    expect(core.getEntity('target').currentHp).toBe(0);
    expect(statuses.update(0)).toEqual([]);
  });
  it('orders simultaneous ticks by target ID then poison/burn/bleed, before expirations', () => {
    const { statuses } = setup();
    for (const targetId of ['target-b', 'target'])
      for (const effectType of [...EFFECT_TYPES].reverse())
        statuses.apply(application({ targetId, effectType, duration: 1 }));
    const events = statuses.update(1);
    expect(ticks(events).map((t) => [t.group.targetId, t.group.effectType])).toEqual([
      ['target', 'poison'],
      ['target', 'burn'],
      ['target', 'bleed'],
      ['target-b', 'poison'],
      ['target-b', 'burn'],
      ['target-b', 'bleed'],
    ]);
    expect(events.slice(0, 6).every((e) => e.type === 'status-tick')).toBe(true);
    expect(events.slice(6).every((e) => e.type === 'status-removed')).toBe(true);
  });
  it('represents simultaneous deaths on different entities without global early abort', () => {
    const { core, statuses } = setup({}, { maxHp: 5 });
    core.updateEntityStats('source', { ...core.getEntity('source'), maxHp: 5 });
    statuses.apply(application({ rawDamagePerTick: 10 }));
    statuses.apply(application({ sourceId: 'target', targetId: 'source', rawDamagePerTick: 10 }));
    const events = statuses.update(1);
    const deaths = ticks(events)
      .flatMap((t) => t.result?.events ?? [])
      .filter((e) => e.type === 'death');
    expect(deaths.map((e) => e.entityId)).toEqual(['source', 'target']);
    expect(core.getEntity('source').alive).toBe(false);
    expect(core.getEntity('target').alive).toBe(false);
    expect(statuses.getGroups()).toEqual([]);
  });
  it('does not move overkill to another target', () => {
    const { core, statuses } = setup({}, { maxHp: 5 });
    statuses.apply(application({ rawDamagePerTick: 100 }));
    const tick = ticks(statuses.update(1))[0];
    expect(tick.result?.appliedDamage).toBe(5);
    expect(core.getEntity('target-b').currentHp).toBe(1000);
  });
});
describe('optional survival integration hooks', () => {
  it('blocks application before RNG without inventing an invulnerability system', () => {
    const random = vi.fn(() => 0.1);
    const { statuses } = setup({ random, canApply: () => false });
    expect(statuses.apply(application()).status).toBe('blocked');
    expect(statuses.getGroups()).toEqual([]);
    expect(random).not.toHaveBeenCalled();
  });
  it('suppresses protected ticks but does not freeze duration or accumulate a later burst', () => {
    let allowed = false;
    const { core, statuses } = setup({ canDamage: () => allowed });
    statuses.apply(application({ duration: 2 }));
    const first = ticks(statuses.update(1))[0];
    expect(first.outcome).toBe('blocked');
    expect(first.result).toBeNull();
    expect(core.getEntity('target').currentHp).toBe(1000);
    allowed = true;
    expect(ticks(statuses.update(1))[0].result?.damage).toBe(10);
    expect(core.getEntity('target').currentHp).toBe(990);
    expect(statuses.getGroups()).toEqual([]);
  });
  it('expires groups even when every periodic damage operation is protected', () => {
    const { core, statuses } = setup({ canDamage: () => false });
    statuses.apply(application({ duration: 2 }));
    expect(ticks(statuses.update(10)).every((t) => t.outcome === 'blocked')).toBe(true);
    expect(statuses.getGroups()).toEqual([]);
    expect(core.getEntity('target').currentHp).toBe(1000);
  });
});
