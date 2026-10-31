import { describe, expect, it } from 'vitest';
import { CombatCore } from '../../src/combat-core';
import type { CombatEvent, DamageResult } from '../../src/combat-core';
import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { StatusEffects } from '../../src/status-effects';
import { PlayerSurvival, createEnemySurvivalPolicies } from '../../src/player-survival';
import type { RevivalDecision } from '../../src/player-survival';
import { world, direct, die } from './helpers';
describe('validation, idempotency and chronological protocol', () => {
  it.each([-1, NaN, Infinity])('rejects invalid time %s before changing state', (time) => {
    const w = world();
    const before = w.survival.getState();
    expect(() => w.survival.advanceTo(time)).toThrow();
    expect(w.survival.getState()).toEqual(before);
    expect(() => w.survival.update(time)).toThrow();
  });
  it('rejects backwards and unrepresentable protection timestamps', () => {
    const w = world();
    w.survival.advanceTo(1);
    expect(() => w.survival.advanceTo(0.5)).toThrow(/backwards/);
    expect(() => w.survival.advanceTo(1e308)).toThrow(/representable/);
    expect(w.survival.time).toBe(1);
  });
  it('rejects bad player references and fresh dead-player sessions', () => {
    const w = world();
    expect(() => new PlayerSurvival(w.core, 'missing')).toThrow();
    expect(() => new PlayerSurvival(w.core, 'enemy')).toThrow(/player-affiliated/);
    die(w);
    expect(() => new PlayerSurvival(w.core, 'player')).toThrow(/living player/);
  });
  it('rejects unsynchronized or unknown eligibility contexts', () => {
    const w = world();
    expect(() =>
      w.survival.canReceiveHostileDirectDamage({ time: 1, sourceId: 'source', targetId: 'player' }),
    ).toThrow(/time/);
    expect(() =>
      w.survival.canReceiveHostileDirectDamage({
        time: 0,
        sourceId: 'missing',
        targetId: 'player',
      }),
    ).toThrow();
    expect(() => w.survival.canApplyNegativeEffect({ time: NaN, targetId: 'player' })).toThrow();
    expect(() => w.survival.canReceivePeriodicDamage({ time: 0, targetId: 'missing' })).toThrow();
  });
  it('rejects active-state decisions and invalid decision IDs', () => {
    const w = world();
    expect(() => w.survival.decide('revive', w.statuses)).toThrow(/awaiting/);
    expect(() => w.survival.decide('finish-run')).toThrow(/awaiting/);
    expect(() => w.survival.decide('auto' as RevivalDecision)).toThrow(/Decision/);
    expect(w.survival.getState().revivalUsed).toBe(false);
  });
  it('validates status ownership and time before any revival/charge/cleanse mutation', () => {
    const w = world(),
      foreign = world();
    die(w);
    const before = w.core.getEntity('player');
    expect(() => w.survival.decide('revive', foreign.statuses)).toThrow(/same CombatCore/);
    expect(() => w.survival.decide('revive')).toThrow();
    expect(w.core.getEntity('player')).toBe(before);
    expect(w.survival.getState().revivalUsed).toBe(false);
    w.statuses.update(0.1, { paused: false });
    expect(() => w.survival.decide('revive', w.statuses)).toThrow(/time/);
    expect(w.core.getEntity('player')).toBe(before);
    expect(w.survival.getState().revivalUsed).toBe(false);
  });
  it('does not allow external Core revival to consume another session revival or bypass the dead precondition', () => {
    const w = world();
    die(w);
    w.core.reviveEntity('player', 50);
    expect(() => w.survival.decide('revive', w.statuses)).toThrow(/dead player/);
    expect(w.survival.getState().revivalUsed).toBe(false);
  });
  it('rejects malformed direct result fields and non-direct periodic data', () => {
    const w = world();
    const hit = direct(w)!;
    for (const patch of [
      { appliedDamage: -1 },
      { currentHp: NaN },
      { targetId: 'missing' },
      { events: [{ type: 'periodic-damage' }] },
    ])
      expect(() =>
        w.survival.recordDirectResult(0, { ...hit.result, ...patch } as DamageResult),
      ).toThrow();
  });
  it('rejects late direct notification after additional HP operations instead of retroactively protecting', () => {
    const w = world();
    const result = w.core.resolveAttack(
      w.core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient: 1 }),
      'player',
    );
    w.core.heal('player', 1);
    expect(() => w.survival.recordDirectResult(0, result)).toThrow(/immediately/);
    expect(w.survival.getState().directInvulnerableUntil).toBeNull();
  });
  it('rejects callers resolving damage through protection rather than silently fixing HP afterward', () => {
    const w = world();
    direct(w);
    w.survival.advanceTo(0.1);
    const invalid = w.core.resolveAttack(
      w.core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient: 1 }),
      'player',
    );
    expect(() => w.survival.recordDirectResult(0.1, invalid)).toThrow(/during protection/);
    expect(w.survival.getState().directInvulnerableUntil).toBe(0.3);
  });
  it('rejects fake deaths for a living player without changing state', () => {
    const w = world();
    expect(() =>
      w.survival.consumeCombatEvents(0, [
        { type: 'death', entityId: 'player', sourceId: 'source', attackId: 'fake' },
      ]),
    ).toThrow(/authoritative/);
    expect(w.survival.getState().runState).toBe('active');
  });
  it('validates all events before a lifecycle transition', () => {
    const w = world();
    const hit = w.core.resolveAttack(
      w.core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient: 1000 }),
      'player',
    );
    expect(() =>
      w.survival.consumeCombatEvents(0, [
        ...hit.events,
        { type: 'unknown' },
      ] as unknown as CombatEvent[]),
    ).toThrow();
    expect(w.survival.getState().runState).toBe('active');
    expect(w.survival.getState().requiresWorldPause).toBe(true);
    expect(w.survival.consumeCombatEvents(0, hit.events).state.runState).toBe(
      'awaiting-revival-choice',
    );
  });
  it('detaches immutable death metadata from caller-owned deserialized event objects', () => {
    const w = world();
    const hit = w.core.applyPeriodicDamage({
      operationId: 'tick-1',
      targetId: 'player',
      effectId: 'poison',
      rawDamage: 1000,
      sources: [{ applicationId: 's1', sourceId: 'source', rawDamage: 1000 }],
    });
    const input = JSON.parse(JSON.stringify(hit.events));
    const result = w.survival.consumeCombatEvents(0, input);
    const event = result.events[0];
    input.find((e: { type: string }) => e.type === 'death').periodic.sources[0].sourceId =
      'changed';
    if (event.type === 'revival-choice-required') {
      expect(event.death.periodic?.sources[0].sourceId).toBe('source');
      expect(Object.isFrozen(event.death)).toBe(true);
      expect(Object.isFrozen(event.death.periodic?.sources[0])).toBe(true);
    }
  });
  it('validates pause options and observer construction', () => {
    const w = world();
    expect(() =>
      w.survival.update(1, { paused: 'yes' } as unknown as { paused: boolean }),
    ).toThrow();
    expect(() => createEnemySurvivalPolicies(w.survival, 1 as unknown as () => void)).toThrow();
    expect(w.survival.time).toBe(0);
  });
});
