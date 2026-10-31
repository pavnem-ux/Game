import { describe, expect, it, vi } from 'vitest';
import { StatusEffects } from '../../src/status-effects';
import type { EffectApplication, EffectType, StatusEffectsOptions } from '../../src/status-effects';
import type { CombatEvent } from '../../src/combat-core';
import { setup, application, kill } from './helpers';
describe('probability, validation and state safety', () => {
  it.each([
    [0, 0, 'failed-roll'],
    [0, 0.99, 'failed-roll'],
    [100, 0, 'applied'],
    [100, 1 - Number.EPSILON, 'applied'],
    [50, 0.5, 'failed-roll'],
    [50, 0.499, 'applied'],
  ] as const)('%s percent with roll %s -> %s', (probabilityPercent, value, status) => {
    const random = vi.fn(() => value);
    const { statuses } = setup({ random });
    expect(statuses.apply(application({ probabilityPercent })).status).toBe(status);
    expect(random).toHaveBeenCalledTimes(1);
  });
  it('is deterministic and failed applications do not consume stack identifiers', () => {
    const simulate = () => {
      const values = [0.9, 0.1];
      const { statuses } = setup({ random: () => values.shift()! });
      expect(statuses.apply(application({ probabilityPercent: 50 })).status).toBe('failed-roll');
      return statuses.apply(application({ probabilityPercent: 50 }));
    };
    const first = simulate();
    expect(first).toEqual(simulate());
    expect(first.stack?.id).toBe('status-stack-1');
  });
  it.each([
    { targetId: '' },
    { sourceId: '' },
    { sourceId: 'missing' },
    { targetId: 'missing' },
    { effectType: 'frost' },
    { rawDamagePerTick: -1 },
    { rawDamagePerTick: NaN },
    { rawDamagePerTick: Infinity },
    { duration: 0 },
    { duration: -1 },
    { duration: Infinity },
    { duration: NaN },
    { probabilityPercent: -1 },
    { probabilityPercent: 101 },
    { probabilityPercent: NaN },
    { originId: '' },
  ])('rejects bad application without changing existing state: %j', (patch) => {
    const { statuses } = setup();
    statuses.apply(application());
    const before = statuses.getGroups();
    expect(() => statuses.apply(application(patch as Partial<EffectApplication>))).toThrow();
    expect(statuses.getGroups()).toEqual(before);
  });
  it.each([-1, 1, Infinity, NaN, '0'])(
    'rejects invalid RNG %s without creating/refeshing a group',
    (value) => {
      const { core } = setup();
      const statuses = new StatusEffects(core, { random: () => value as number });
      expect(() => statuses.apply(application())).toThrow();
      expect(statuses.getGroups()).toEqual([]);
    },
  );
  it.each([-1, Infinity, NaN])('rejects invalid delta %s before cleanup or mutation', (delta) => {
    const { statuses } = setup();
    statuses.apply(application());
    const before = statuses.getGroups();
    expect(() => statuses.update(delta)).toThrow();
    expect(statuses.time).toBe(0);
    expect(statuses.getGroups()).toEqual(before);
  });
  it('rejects backwards/nonfinite absolute timestamps', () => {
    const { statuses } = setup();
    statuses.update(1);
    for (const time of [0, -1, NaN, Infinity]) expect(() => statuses.advanceTo(time)).toThrow();
    expect(statuses.time).toBe(1);
  });
  it('validates pause and hook options', () => {
    const { core, statuses } = setup();
    expect(() => statuses.update(1, { paused: 'yes' } as unknown as { paused: boolean })).toThrow();
    for (const patch of [{ random: 1 }, { canApply: 1 }, { canDamage: 1 }])
      expect(() => new StatusEffects(core, patch as unknown as StatusEffectsOptions)).toThrow();
    const invalid = new StatusEffects(core, { canApply: () => undefined as unknown as boolean });
    expect(() => invalid.apply(application())).toThrow(/boolean/);
    expect(invalid.getGroups()).toEqual([]);
  });
  it('rejects unrepresentable time and arithmetic overflow without half-applying state', () => {
    const { statuses } = setup();
    expect(() => statuses.apply(application({ rawDamagePerTick: 1e308 }))).toThrow();
    expect(statuses.getGroups()).toEqual([]);
    statuses.update(1e308);
    expect(() => statuses.apply(application({ duration: 1 }))).toThrow();
    expect(statuses.getGroups()).toEqual([]);
    expect(() => statuses.update(1e308)).toThrow();
  });
  it('rolls back a multi-application batch on validation/numeric failure', () => {
    const { statuses } = setup();
    statuses.apply(application());
    const before = statuses.getGroups();
    expect(() =>
      statuses.applyBatch([
        application({ effectType: 'burn' }),
        application({ rawDamagePerTick: 1e308 }),
      ]),
    ).toThrow();
    expect(statuses.getGroups()).toEqual(before);
    expect(statuses.apply(application()).stack?.sequence).toBe(2);
  });
  it('validates an entire forwarded death batch before removing groups', () => {
    const { core, statuses } = setup();
    statuses.apply(application());
    const death = kill(core, 'target');
    expect(() =>
      statuses.consumeCombatEvents([
        ...death.events,
        { type: 'death', entityId: 'missing', sourceId: 'source', attackId: 'x' },
      ]),
    ).toThrow();
    expect(statuses.getGroups()).toHaveLength(1);
    expect(statuses.consumeCombatEvents(death.events)).toHaveLength(1);
  });
  it('does not accept a forged death for an entity that is still alive', () => {
    const { statuses } = setup();
    statuses.apply(application());
    expect(() =>
      statuses.consumeCombatEvents([
        { type: 'death', entityId: 'target', sourceId: 'source', attackId: 'x' },
      ]),
    ).toThrow(/authoritatively dead/);
    expect(statuses.getGroups()).toHaveLength(1);
  });
  it('rejects unknown effect types for snapshots and malformed forwarded events', () => {
    const { statuses } = setup();
    expect(() => statuses.getGroup('target', 'frost' as EffectType)).toThrow();
    expect(() => statuses.consumeCombatEvents([null] as unknown as CombatEvent[])).toThrow();
    expect(() =>
      statuses.consumeCombatEvents([{ type: 'unknown' }] as unknown as CombatEvent[]),
    ).toThrow();
  });
  it('gives hooks immutable context and snapshots', () => {
    let checks = 0;
    const { statuses } = setup({
      canApply: (context) => {
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.application)).toBe(true);
        return true;
      },
      canDamage: (context) => {
        checks++;
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(context.group.stacks)).toBe(true);
        return true;
      },
    });
    const first = statuses.apply(application());
    statuses.update(1);
    expect(checks).toBe(1);
    expect(first.group?.nextTickAt).toBe(1);
    expect(statuses.getGroup('target', 'poison')?.nextTickAt).toBe(2);
  });
});
