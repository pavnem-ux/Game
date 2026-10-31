import { describe, expect, it } from 'vitest';
import { EFFECT_TYPES } from '../../src/status-effects';
import { setup, application, ticks } from './helpers';
describe('groups, immutable stacks and oldest replacement', () => {
  it.each(EFFECT_TYPES)(
    'first %s application creates one snapshotted stack, not an immediate tick',
    (effectType) => {
      const { core, statuses } = setup();
      const result = statuses.apply(
        application({ effectType, originId: 'weapon-a', rawDamagePerTick: 12.345 }),
      );
      expect(result.status).toBe('applied');
      expect(result.stack).toMatchObject({
        id: 'status-stack-1',
        effectType,
        sourceId: 'source',
        originId: 'weapon-a',
        rawDamagePerTick: 12.345,
        sequence: 1,
      });
      expect(result.group).toMatchObject({
        targetId: 'target',
        createdAt: 0,
        expiresAt: 4,
        nextTickAt: 1,
      });
      expect(core.getEntity('target').currentHp).toBe(1000);
      expect(Object.isFrozen(result.stack)).toBe(true);
      expect(Object.isFrozen(result.group?.stacks)).toBe(true);
      expect(Object.isFrozen(result.events)).toBe(true);
    },
  );
  it('combines applications across sources and origins in one group', () => {
    const { statuses } = setup();
    statuses.apply(application({ originId: 'sword' }));
    statuses.apply(application({ sourceId: 'other', originId: 'skill', rawDamagePerTick: 20 }));
    const groups = statuses.getGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].stacks.map((s) => [s.sourceId, s.originId])).toEqual([
      ['source', 'sword'],
      ['other', 'skill'],
    ]);
  });
  it('caps at 10 and replaces the oldest, even with a weaker application', () => {
    const { statuses } = setup();
    for (let i = 1; i <= 10; i++)
      statuses.apply(application({ rawDamagePerTick: i, sourceId: i % 2 ? 'source' : 'other' }));
    const before = statuses.getGroup('target', 'poison')!;
    const replacement = statuses.apply(application({ rawDamagePerTick: 0 }));
    const after = statuses.getGroup('target', 'poison')!;
    expect(after.stacks).toHaveLength(10);
    expect(after.stacks.map((s) => s.sequence)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(after.stacks[9].rawDamagePerTick).toBe(0);
    expect(replacement.events[0]).toMatchObject({ replacedStackId: before.stacks[0].id });
    expect(before.stacks[0].sequence).toBe(1);
  });
  it('keeps all three effects and all targets independent', () => {
    const { statuses } = setup();
    for (const effectType of EFFECT_TYPES) {
      statuses.apply(application({ effectType }));
      statuses.apply(application({ effectType, targetId: 'target-b' }));
    }
    expect(statuses.getGroups()).toHaveLength(6);
    for (let i = 0; i < 20; i++) statuses.apply(application());
    expect(statuses.getGroup('target', 'poison')?.stacks).toHaveLength(10);
    expect(statuses.getGroup('target', 'burn')?.stacks).toHaveLength(1);
    expect(statuses.getGroup('target-b', 'poison')?.stacks).toHaveLength(1);
  });
  it('does not retroactively rescale damage when a source gains/loses stats', () => {
    const { core, statuses } = setup();
    statuses.apply(application({ rawDamagePerTick: 7.25 }));
    core.updateEntityStats('source', {
      ...core.getEntity('source'),
      magicalDamage: 999,
      physicalDamage: 0,
    });
    expect(ticks(statuses.update(1))[0].rawDamage).toBe(7.25);
    expect(core.getEntity('target').currentHp).toBe(993);
  });
});
describe('duration, refresh and independent one-second schedules', () => {
  it('has no first tick before one second and no duplicate update(0)', () => {
    const { core, statuses } = setup();
    statuses.apply(application());
    expect(ticks(statuses.update(0.999))).toHaveLength(0);
    expect(ticks(statuses.update(0.001))).toHaveLength(1);
    expect(core.getEntity('target').currentHp).toBe(990);
    expect(statuses.update(0)).toEqual([]);
  });
  it('processes every due tick in a large update, including final expiration tick', () => {
    const { statuses } = setup();
    statuses.apply(application({ duration: 4 }));
    const events = statuses.update(10);
    expect(ticks(events).map((t) => t.time)).toEqual([1, 2, 3, 4]);
    expect(events.at(-1)).toMatchObject({ type: 'status-removed', reason: 'expired', time: 4 });
    expect(statuses.getGroups()).toEqual([]);
    expect(statuses.update(0)).toEqual([]);
  });
  it('expires before the first tick for a duration below one second', () => {
    const { core, statuses } = setup();
    statuses.apply(application({ duration: 0.5 }));
    const events = statuses.update(2);
    expect(ticks(events)).toEqual([]);
    expect(events[0]).toMatchObject({ type: 'status-removed', time: 0.5 });
    expect(core.getEntity('target').currentHp).toBe(1000);
  });
  it('expires fractional durations without an extra tick', () => {
    const { statuses } = setup();
    statuses.apply(application({ duration: 2.5 }));
    const events = statuses.update(3);
    expect(ticks(events).map((t) => t.time)).toEqual([1, 2]);
    expect(events.at(-1)).toMatchObject({ type: 'status-removed', time: 2.5 });
  });
  it('new stacks between ticks contribute on the original next tick without resetting it', () => {
    const { statuses } = setup();
    statuses.apply(application());
    statuses.update(0.5);
    statuses.apply(application({ rawDamagePerTick: 20 }));
    expect(statuses.getGroup('target', 'poison')?.nextTickAt).toBe(1);
    expect(ticks(statuses.update(0.5))[0].rawDamage).toBe(30);
  });
  it('uses max remaining duration, and shorter application stacks live to the shared expiry', () => {
    const { statuses } = setup();
    statuses.apply(application({ duration: 4 }));
    statuses.update(1);
    statuses.apply(application({ duration: 0.1, rawDamagePerTick: 1 }));
    expect(statuses.getGroup('target', 'poison')?.expiresAt).toBe(4);
    const short = ticks(statuses.update(1))[0];
    expect(short.rawDamage).toBe(11);
    statuses.apply(application({ duration: 6, rawDamagePerTick: 2 }));
    expect(statuses.getGroup('target', 'poison')?.expiresAt).toBe(8);
    expect(statuses.getGroup('target', 'poison')?.nextTickAt).toBe(3);
    expect(ticks(statuses.update(6))).toHaveLength(6);
    expect(statuses.getGroups()).toEqual([]);
  });
  it('does not refresh duration after a failed probability check', () => {
    const { statuses } = setup({ random: () => 0.8 });
    statuses.apply(application());
    statuses.update(0.5);
    const before = statuses.getGroup('target', 'poison');
    expect(statuses.apply(application({ duration: 100, probabilityPercent: 50 })).status).toBe(
      'failed-roll',
    );
    expect(statuses.getGroup('target', 'poison')).toEqual(before);
  });
  it('freezes tick and expiration clocks while paused', () => {
    const { core, statuses } = setup();
    statuses.apply(application({ duration: 2 }));
    const before = statuses.getGroups();
    expect(statuses.update(20, { paused: true })).toEqual([]);
    expect(statuses.time).toBe(0);
    expect(statuses.getGroups()).toEqual(before);
    expect(core.getEntity('target').currentHp).toBe(1000);
    expect(ticks(statuses.update(1))).toHaveLength(1);
  });
  it('different groups begin at their own first application time', () => {
    const { statuses } = setup();
    statuses.apply(application({ effectType: 'poison', duration: 3 }));
    statuses.update(0.25);
    statuses.apply(application({ effectType: 'burn', duration: 3 }));
    const events = statuses.update(1);
    expect(ticks(events).map((t) => [t.group.effectType, t.time])).toEqual([
      ['poison', 1],
      ['burn', 1.25],
    ]);
  });
  it('reapplication after expiry creates a fresh group and first-tick schedule', () => {
    const { statuses } = setup();
    const first = statuses.apply(application({ duration: 1 }));
    statuses.update(1);
    const second = statuses.apply(application({ duration: 2 }));
    expect(second.group?.id).not.toBe(first.group?.id);
    expect(second.group?.nextTickAt).toBe(2);
  });
  it('is equivalent for large updates and partitioned time advancement', () => {
    const run = (steps: number[]) => {
      const { core, statuses } = setup();
      statuses.apply(application({ duration: 5 }));
      const events = steps.flatMap((dt) => [...statuses.update(dt)]);
      return {
        hp: core.getEntity('target').currentHp,
        times: ticks(events).map((t) => t.time),
        groups: statuses.getGroups(),
      };
    };
    const whole = run([5]),
      split = run(Array(50).fill(0.1));
    expect(split.hp).toBe(whole.hp);
    expect(split.groups).toEqual(whole.groups);
    expect(split.times).toHaveLength(whole.times.length);
    split.times.forEach((time, i) => expect(time).toBeCloseTo(whole.times[i], 12));
  });
});
