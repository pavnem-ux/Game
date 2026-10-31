import { describe, expect, it } from 'vitest';
import { PlayerSurvival, createSurvivalPausePolicy } from '../../src/player-survival';
import { world, direct, die, dot } from './helpers';
describe('death, decisions and one revival per run', () => {
  it('waits for an explicit choice after the actual direct death, without changing the world', () => {
    const w = world();
    const enemy = w.core.getEntity('enemy');
    const result = die(w);
    expect(result.notification.state).toMatchObject({
      runState: 'awaiting-revival-choice',
      revivalUsed: false,
      requiresWorldPause: true,
      canPlayerAct: false,
      canRevive: true,
      availableDecisions: ['revive', 'finish-run'],
    });
    expect(result.notification.events[0].type).toBe('revival-choice-required');
    expect(w.core.getEntity('player').alive).toBe(false);
    expect(w.core.getEntity('enemy')).toBe(enemy);
    expect(w.survival.consumeCombatEvents(0, result.result.events).events).toEqual([]);
  });
  it.each(['poison', 'burn', 'bleed'] as const)(
    '%s death follows the same choice lifecycle',
    (effect) => {
      const w = world();
      dot(w, effect, 1000);
      const events = w.statuses.update(5, createSurvivalPausePolicy(w.survival));
      expect(w.survival.getState()).toMatchObject({ runState: 'awaiting-revival-choice', time: 1 });
      expect(
        events
          .filter((e) => e.type === 'status-tick')
          .flatMap((e) => e.result?.events ?? [])
          .filter((e) => e.type === 'death'),
      ).toHaveLength(1);
      expect(w.events.filter((e) => e.type === 'revival-choice-required')).toHaveLength(1);
    },
  );
  it('revives at 50% CURRENT Max HP with fractional precision', () => {
    const w = world();
    die(w);
    w.core.changeMaxHp('player', 901);
    const revival = w.survival.decide('revive', w.statuses);
    expect(w.core.getEntity('player')).toMatchObject({
      maxHp: 1001,
      currentHp: 500.5,
      alive: true,
    });
    expect(revival.state).toMatchObject({
      runState: 'active',
      revivalUsed: true,
      requiresWorldPause: false,
      canPlayerAct: true,
    });
    expect(revival.revival?.events[0].type).toBe('revived');
    expect(revival.events[0]).toMatchObject({
      type: 'player-revived',
      restoredHp: 500.5,
      fullInvulnerableUntil: 3,
    });
    expect(() => w.survival.decide('revive', w.statuses)).toThrow();
  });
  it('clears only the player effects on manual revival and old effects never reappear', () => {
    const w = world();
    for (const type of ['poison', 'burn', 'bleed'] as const) {
      dot(w, type, 1);
      dot(w, type, 2, 'enemy');
    }
    const enemyEffects = w.statuses.getGroups('enemy'),
      enemy = w.core.getEntity('enemy');
    die(w);
    const result = w.survival.decide('revive', w.statuses);
    expect(result.removedEffects).toHaveLength(3);
    expect(result.removedEffects?.every((e) => e.reason === 'cleansed' && e.time === 0)).toBe(true);
    expect(w.statuses.getGroups('player')).toEqual([]);
    expect(w.statuses.getGroups('enemy')).toEqual(enemyEffects);
    expect(w.core.getEntity('enemy')).toBe(enemy);
    w.statuses.update(2);
    expect(w.statuses.getGroups('player')).toEqual([]);
    expect(w.core.getEntity('player').currentHp).toBe(50);
  });
  it('finish-run consumes no revival and is idempotent', () => {
    const w = world();
    die(w);
    const ended = w.survival.decide('finish-run');
    expect(ended.state).toMatchObject({
      runState: 'ended',
      revivalUsed: false,
      requiresWorldPause: true,
      availableDecisions: [],
    });
    expect(ended.events[0]).toMatchObject({ type: 'run-ended', reason: 'finish-run' });
    expect(w.survival.decide('finish-run').events).toEqual([]);
    expect(() => w.survival.decide('revive', w.statuses)).toThrow();
    w.survival.update(100);
    expect(w.survival.time).toBe(0);
  });
  it('ends automatically after a second death and emits no duplicate run-ended event', () => {
    const w = world();
    die(w);
    w.survival.decide('revive', w.statuses);
    w.statuses.advanceTo(3);
    const second = die(w, 3);
    expect(second.notification.state).toMatchObject({ runState: 'ended', revivalUsed: true });
    expect(second.notification.events[0]).toMatchObject({
      type: 'run-ended',
      reason: 'revival-already-used',
    });
    expect(w.survival.consumeCombatEvents(3, second.result.events).events).toEqual([]);
    expect(w.survival.decide('finish-run').events).toEqual([]);
    expect(() => w.survival.decide('revive', w.statuses)).toThrow();
  });
  it('ignores a known old death replay after successful revival', () => {
    const w = world();
    const first = die(w);
    w.survival.decide('revive', w.statuses);
    expect(
      w.survival.consumeCombatEvents(0, JSON.parse(JSON.stringify(first.result.events))).events,
    ).toEqual([]);
    expect(w.survival.getState().runState).toBe('active');
  });
  it('records a new death even if a generic caller reuses the old attack snapshot in a later life', () => {
    const w = world();
    const attack = w.core.createAttack({
      attackerId: 'source',
      damageType: 'physical',
      coefficient: 1000,
    });
    const first = w.core.resolveAttack(attack, 'player');
    w.survival.recordDirectResult(0, first);
    w.survival.decide('revive', w.statuses);
    w.survival.advanceTo(3);
    w.statuses.advanceTo(3);
    const second = w.core.resolveAttack(attack, 'player');
    const result = w.survival.recordDirectResult(3, second);
    expect(result.state.runState).toBe('ended');
  });
  it('keeps lifecycle sequences stable and public data deeply immutable', () => {
    const w = world();
    const first = direct(w)!;
    const before = first.notification.state;
    w.survival.advanceTo(0.3);
    const death = die(w, 0.3);
    w.statuses.advanceTo(0.3);
    const revived = w.survival.decide('revive', w.statuses);
    expect([
      first.notification.events[0].sequence,
      death.notification.events[0].sequence,
      revived.events[0].sequence,
    ]).toEqual([1, 2, 3]);
    expect(before.time).toBe(0);
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.availableDecisions)).toBe(true);
    expect(Object.isFrozen(death.notification.events[0])).toBe(true);
    expect(Object.isFrozen(revived)).toBe(true);
  });
  it('creates fresh survival state only for a new run context', () => {
    const old = world();
    die(old);
    old.survival.decide('finish-run');
    const fresh = world();
    expect(fresh.survival.getState()).toMatchObject({
      runState: 'active',
      revivalUsed: false,
      time: 0,
      directInvulnerableUntil: null,
      fullInvulnerableUntil: null,
    });
    expect(fresh.core.getEntity('player').currentHp).toBe(100);
    expect(() => new PlayerSurvival(old.core, 'player')).toThrow(/living player/);
  });
});
