import { describe, expect, it } from 'vitest';
import { EFFECT_TYPES, StatusEffects } from '../../src/status-effects';
import { world, die, dot } from './helpers';
describe('dedicated compatible Core revival', () => {
  it('revives an eligible dead entity once per operation and preserves all other stats', () => {
    const w = world();
    die(w);
    const before = w.core.getEntity('player');
    const result = w.core.reviveEntity('player', 25.5);
    expect(result.entity).toEqual({ ...before, currentHp: 25.5, alive: true });
    expect(result.restoredHp).toBe(25.5);
    expect(result.events).toEqual([
      { type: 'revived', entityId: 'player', previousHp: 0, currentHp: 25.5, maxHp: 100 },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.entity)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(result.events[0])).toBe(true);
    expect(() => w.core.reviveEntity('player', 20)).toThrow(/living/);
  });
  it('keeps ordinary healing and Max HP changes unable to revive', () => {
    const w = world();
    die(w);
    expect(w.core.heal('player', 1000)).toMatchObject({
      healed: 0,
      entity: { currentHp: 0, alive: false },
    });
    expect(w.core.changeMaxHp('player', 100).entity).toMatchObject({
      currentHp: 0,
      maxHp: 200,
      alive: false,
    });
  });
  it('allows fractional positive HP including half of Max HP 1', () => {
    const w = world();
    die(w);
    w.core.changeMaxHp('player', -99);
    expect(w.core.reviveEntity('player', 0.5).entity).toMatchObject({
      alive: true,
      currentHp: 0.5,
      maxHp: 1,
    });
  });
  it.each([0, -1, NaN, Infinity, 101])('rejects invalid restoration %s without mutation', (hp) => {
    const w = world();
    die(w);
    const before = w.core.getEntity('player');
    expect(() => w.core.reviveEntity('player', hp)).toThrow();
    expect(w.core.getEntity('player')).toBe(before);
  });
  it('does not place run charge restrictions in the general Core', () => {
    const w = world();
    die(w);
    w.core.reviveEntity('player', 100);
    const result = w.core.resolveAttack(
      w.core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient: 1000 }),
      'player',
    );
    expect(result.events.filter((e) => e.type === 'death')).toHaveLength(1);
    expect(w.core.reviveEntity('player', 30).entity.alive).toBe(true);
  });
});
describe('explicit target-only negative effect removal', () => {
  it('cleanses all three player groups at current time without fake expiration or changing other groups', () => {
    const w = world();
    for (const type of EFFECT_TYPES) {
      dot(w, type, 1);
      dot(w, type, 2, 'enemy');
    }
    const others = w.statuses.getGroups('enemy'),
      hp = w.core.getEntity('player').currentHp;
    const removed = w.statuses.clearNegativeEffects('player');
    expect(removed).toHaveLength(3);
    expect(removed.every((e) => e.reason === 'cleansed' && e.time === 0)).toBe(true);
    expect(w.statuses.getGroups('player')).toEqual([]);
    expect(w.statuses.getGroups('enemy')).toEqual(others);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    expect(Object.isFrozen(removed)).toBe(true);
    expect(removed.every((e) => Object.isFrozen(e) && Object.isFrozen(e.group.stacks))).toBe(true);
    expect(w.statuses.clearNegativeEffects('player')).toEqual([]);
  });
  it('supports cleansing a dead target and exposes same-Core identity validation', () => {
    const w = world();
    dot(w);
    die(w);
    expect(w.statuses.clearNegativeEffects('player')[0].reason).toBe('cleansed');
    expect(w.statuses.usesCombatCore(w.core)).toBe(true);
    const other = world();
    expect(w.statuses.usesCombatCore(other.core)).toBe(false);
    expect(() => w.statuses.clearNegativeEffects('missing')).toThrow();
  });
  it('forwards the additive revived event through existing event consumers', () => {
    const w = world();
    die(w);
    const result = w.core.reviveEntity('player', 50);
    expect(() => w.statuses.consumeCombatEvents(result.events)).not.toThrow();
  });
});
