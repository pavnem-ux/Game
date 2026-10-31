import { describe, expect, it } from 'vitest';
import { createSurvivalPausePolicy } from '../../src/player-survival';
import { world, direct, die, dot, notify } from './helpers';
describe('0.3-second direct-hit protection', () => {
  it('activates at actual positive HP loss and blocks further hits without refreshing', () => {
    const w = world();
    const hit = direct(w, 0)!;
    expect(hit.result.appliedDamage).toBe(20);
    expect(hit.notification.events[0]).toMatchObject({
      type: 'direct-protection-granted',
      time: 0,
      expiresAt: 0.3,
      sequence: 1,
    });
    expect(w.survival.getState().directProtected).toBe(true);
    expect(direct(w, 0.1)).toBeNull();
    expect(direct(w, 0.2)).toBeNull();
    expect(w.survival.getState().directInvulnerableUntil).toBe(0.3);
    expect(w.core.getEntity('player').currentHp).toBe(80);
  });
  it('permits damage exactly at expiration, not just before', () => {
    const w = world();
    direct(w);
    expect(direct(w, 0.3 - 1e-6)).toBeNull();
    const next = direct(w, 0.3)!;
    expect(next.result.appliedDamage).toBe(20);
    expect(w.survival.getState().directInvulnerableUntil).toBe(0.6);
  });
  it('does not trigger on Dodge and allows the next attack at the same time', () => {
    const sequence = [0.99, 0, 0.99, 0.99];
    const w = world({ random: () => sequence.shift()!, playerStats: { dodgeChance: 60 } });
    const first = direct(w)!;
    expect(first.result.status).toBe('dodged');
    expect(first.notification.events).toEqual([]);
    expect(w.survival.getState().directProtected).toBe(false);
    const second = direct(w)!;
    expect(second.result.appliedDamage).toBe(20);
    expect(w.survival.getState().directProtected).toBe(true);
  });
  it('does not trigger on zero actual loss or duplicate direct notifications', () => {
    const w = world();
    const zero = direct(w, 0, 0)!;
    expect(zero.result.appliedDamage).toBe(0);
    expect(w.survival.getState().directInvulnerableUntil).toBeNull();
    const hit = direct(w)!;
    const before = w.survival.getState();
    expect(notify(w, hit.result).events).toEqual([]);
    expect(w.survival.getState()).toEqual(before);
  });
  it('allows DoT damage during ordinary protection and does not refresh the direct timer', () => {
    const w = world();
    dot(w, 'poison', 10);
    w.survival.advanceTo(0.9);
    w.statuses.advanceTo(0.9);
    direct(w, 0.9);
    const until = w.survival.getState().directInvulnerableUntil;
    const tick = w.statuses.update(0.1).find((e) => e.type === 'status-tick')!;
    expect(tick.result?.damage).toBe(10);
    expect(w.core.getEntity('player').currentHp).toBe(70);
    expect(w.survival.getState().directInvulnerableUntil).toBe(until);
    expect(w.survival.getState().directProtected).toBe(true);
  });
  it('can die from DoT during ordinary protection', () => {
    const w = world();
    dot(w, 'poison', 1000);
    w.survival.advanceTo(0.9);
    w.statuses.advanceTo(0.9);
    direct(w, 0.9);
    const events = w.statuses.update(5, createSurvivalPausePolicy(w.survival));
    expect(w.survival.getState()).toMatchObject({ runState: 'awaiting-revival-choice', time: 1 });
    expect(w.statuses.time).toBe(1);
    expect(events.filter((e) => e.type === 'status-tick')).toHaveLength(1);
  });
  it('does not impose outgoing/self damage restrictions and exposes player action gating', () => {
    const w = world();
    expect(
      w.survival.canReceiveHostileDirectDamage({ time: 0, sourceId: 'player', targetId: 'player' }),
    ).toBe(true);
    direct(w);
    expect(w.survival.getState().canPlayerAct).toBe(true);
    expect(
      w.survival.canReceiveHostileDirectDamage({ time: 0, sourceId: 'player', targetId: 'enemy' }),
    ).toBe(true);
    expect(w.survival.canReceivePeriodicDamage({ time: 0, targetId: 'enemy' })).toBe(true);
  });
});
describe('three-second full revival protection', () => {
  it('blocks direct, periodic and negative application, and expires precisely at T+3', () => {
    const w = world();
    die(w);
    w.survival.decide('revive', w.statuses);
    expect(w.survival.getState()).toMatchObject({
      fullyProtected: true,
      fullInvulnerableUntil: 3,
      directInvulnerableUntil: null,
    });
    expect(w.survival.canReceivePeriodicDamage({ time: 0, targetId: 'player' })).toBe(false);
    expect(dot(w).status).toBe('blocked');
    expect(direct(w, 2.999999)).toBeNull();
    expect(w.survival.getState().fullInvulnerableUntil).toBe(3);
    w.statuses.advanceTo(3);
    const hit = direct(w, 3)!;
    expect(hit.result.appliedDamage).toBe(20);
    expect(dot(w).status).toBe('applied');
    expect(w.survival.getState().fullyProtected).toBe(false);
  });
  it('uses the paused decision timestamp as protection origin', () => {
    const w = world();
    w.survival.advanceTo(2);
    w.statuses.advanceTo(2);
    die(w, 2);
    w.survival.update(100, { paused: true });
    expect(w.survival.time).toBe(2);
    const revived = w.survival.decide('revive', w.statuses);
    expect(revived.state.fullInvulnerableUntil).toBe(5);
    w.survival.update(100, { paused: true });
    expect(w.survival.time).toBe(2);
    w.survival.advanceTo(4.999);
    expect(w.survival.getState().fullyProtected).toBe(true);
    w.survival.advanceTo(5);
    expect(w.survival.getState().fullyProtected).toBe(false);
  });
  it('suppresses scheduled periodic damage without delaying or resetting ticks', () => {
    // Test injection bypasses only canApply to isolate the damage hook of the same canonical session.
    const w = world({ statusOverride: { canApply: () => true } });
    die(w);
    w.survival.decide('revive', w.statuses);
    dot(w, 'poison', 10, 'player', 4);
    const ticks = w.statuses.update(3).filter((e) => e.type === 'status-tick');
    expect(ticks.map((t) => [t.time, t.outcome])).toEqual([
      [1, 'blocked'],
      [2, 'blocked'],
      [3, 'resolved'],
    ]);
    expect(w.core.getEntity('player').currentHp).toBe(40);
    expect(w.survival.getState().directInvulnerableUntil).toBeNull();
    expect(w.statuses.getGroup('player', 'poison')?.nextTickAt).toBe(4);
  });
  it('does not make unrelated targets invulnerable', () => {
    const w = world();
    die(w);
    w.survival.decide('revive', w.statuses);
    expect(w.survival.canReceivePeriodicDamage({ targetId: 'enemy', time: 0 })).toBe(true);
    expect(dot(w, 'burn', 10, 'enemy').status).toBe('applied');
  });
});
