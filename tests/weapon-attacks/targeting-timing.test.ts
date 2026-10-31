import { describe, expect, it } from 'vitest';
import { addEntity, setup, starts, kill } from './helpers';
import { TEST_WEAPONS } from './fixtures';

describe('automatic target acquisition', () => {
  it('selects nearest living opposing target and not friends', () => {
    const { core, system } = setup();
    addEntity(core, system, 'near', { x: 35, y: 0, radius: 5 });
    addEntity(core, system, 'far', { x: 70, y: 0, radius: 5 });
    addEntity(core, system, 'friend', { x: 10, y: 0, radius: 5 }, 'player');
    addEntity(core, system, 'dead', { x: 5, y: 0, radius: 1 });
    kill(core, 'dead');
    expect(starts(system.update(0))[0].targetId).toBe('near');
  });
  it('uses target hitbox edge for range and for nearest ordering', () => {
    const { core, system } = setup();
    addEntity(core, system, 'small', { x: 80, y: 0, radius: 1 });
    addEntity(core, system, 'large', { x: 110, y: 0, radius: 40 });
    expect(starts(system.update(0))[0].targetId).toBe('large');
  });
  it('accepts a center outside range when the hitbox edge is exactly on range', () => {
    const { core, system } = setup();
    addEntity(core, system, 'edge', { x: 100, y: 0, radius: 10 });
    expect(starts(system.update(0))).toHaveLength(1);
  });
  it('breaks equal-distance ties by ID rather than insertion order', () => {
    const { core, system } = setup();
    addEntity(core, system, 'z', { x: 50, y: 0, radius: 5 });
    addEntity(core, system, 'a', { x: 0, y: 50, radius: 5 });
    expect(starts(system.update(0))[0].targetId).toBe('a');
  });
  it('keeps ready without targets, then attacks immediately upon entering range', () => {
    const { core, system } = setup();
    addEntity(core, system, 'target', { x: 200, y: 0, radius: 5 });
    expect(system.update(5)).toEqual([]);
    expect(system.getWeaponState('hero').nextCycleAt).toBe(0);
    system.setBody('target', { x: 50, y: 0, radius: 5 });
    const events = starts(system.update(0));
    expect(events).toHaveLength(1);
    expect(events[0].time).toBe(5);
  });
  it('allows free source movement and reads current position at initiation', () => {
    const { core, system } = setup();
    addEntity(core, system, 'target', { x: 160, y: 0, radius: 5 });
    expect(system.update(0)).toEqual([]);
    system.setBody('hero', { x: 100, y: 0, radius: 10 });
    const before = core.getEntity('hero');
    const event = starts(system.update(0))[0];
    expect(event.origin).toEqual({ x: 100, y: 0 });
    expect(core.getEntity('hero')).toBe(before);
  });
});
describe('simulation scheduling', () => {
  it('scales the complete attack interval with capped Character Stats attack speed', () => {
    const { core, system } = setup(TEST_WEAPONS.sword, () => 0.99, 125);
    addEntity(core, system, 'target', { x: 50, y: 0, radius: 5 });
    const events = starts(system.update(1.6));
    expect(events.map((e) => e.time)).toEqual([0, 0.8, 1.6]);
  });
  it('never creates duplicate attacks on zero delta or repeated cycle boundaries', () => {
    const { core, system } = setup();
    addEntity(core, system, 'target', { x: 50, y: 0, radius: 5 });
    expect(starts(system.update(0))).toHaveLength(1);
    expect(starts(system.update(0))).toHaveLength(0);
    expect(starts(system.update(1))).toHaveLength(1);
    expect(starts(system.update(0))).toHaveLength(0);
  });
  it('pauses attacks, pending strikes and projectile motion without advancing time', () => {
    const { core, system } = setup(TEST_WEAPONS.staff);
    addEntity(core, system, 'target', { x: 250, y: 0, radius: 5 });
    expect(system.update(10, { paused: true })).toEqual([]);
    expect(system.time).toBe(0);
    expect(system.getProjectiles()).toEqual([]);
    system.update(0);
    const before = system.getProjectiles();
    system.update(3, { paused: true });
    expect(system.time).toBe(0);
    expect(system.getProjectiles()).toEqual(before);
    system.update(0.1);
    expect(system.getProjectiles()[0].x).toBeCloseTo(40);
  });
  it('catches up every scheduled cycle in a large delta without empty cycles', () => {
    const { core, system } = setup();
    addEntity(core, system, 'target', { x: 50, y: 0, radius: 5 });
    expect(starts(system.update(10)).map((e) => e.time)).toEqual(
      Array.from({ length: 11 }, (_, i) => i),
    );
  });
  it('is equivalent for one large update and many small updates with fixed target geometry', () => {
    const run = (steps: number[]) => {
      const { core, system } = setup(TEST_WEAPONS.daggers);
      addEntity(core, system, 'target', { x: 50, y: 0, radius: 5 });
      const events = steps.flatMap((dt) => [...system.update(dt)]);
      return { events: starts(events), hp: core.getEntity('target').currentHp };
    };
    const whole = run([3.6]),
      split = run(Array(36).fill(0.1));
    expect(split.hp).toBe(whole.hp);
    expect(split.events.map((e) => [e.strike, e.attack.rawDamage])).toEqual(
      whole.events.map((e) => [e.strike, e.attack.rawDamage]),
    );
    split.events.forEach((e, i) => expect(e.time).toBeCloseTo(whole.events[i].time, 10));
  });
  it('keeps a started cycle fixed when attack speed changes, then uses the new speed', () => {
    const { core, system } = setup();
    addEntity(core, system, 'target', { x: 50, y: 0, radius: 5 });
    system.update(0);
    system.setAttackSpeed('hero', 200);
    expect(starts(system.update(0.99))).toHaveLength(0);
    expect(starts(system.update(0.51)).map((e) => e.time)).toEqual([1, 1.5]);
  });
  it('does not start any new attack from a dead source', () => {
    const { core, system } = setup();
    addEntity(core, system, 'killer', { x: 50, y: 0, radius: 5 });
    core.resolveAttack(
      core.createAttack({ attackerId: 'killer', damageType: 'physical', coefficient: 1e6 }),
      'hero',
    );
    expect(starts(system.update(10))).toHaveLength(0);
  });
});

describe('deterministic boundaries and immutable output', () => {
  it('does not spend critical RNG or create a cooldown without a target', () => {
    let draws = 0;
    const { system } = setup(TEST_WEAPONS.sword, () => {
      draws++;
      return 0.99;
    });
    system.update(10);
    expect(draws).toBe(0);
    expect(system.getWeaponState('hero').nextCycleAt).toBe(0);
  });
  it('orders simultaneous weapon starts by source ID regardless of equip order', () => {
    const { core, system } = setup();
    addEntity(core, system, 'a-source', { x: 0, y: 0, radius: 5 }, 'player');
    addEntity(core, system, 'enemy', { x: 40, y: 0, radius: 5 });
    system.equipWeapon({
      entityId: 'a-source',
      characterClass: 'warrior',
      weapon: { ...TEST_WEAPONS.sword, id: 'a-weapon' },
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    });
    expect(starts(system.update(0)).map((e) => e.sourceId)).toEqual(['a-source', 'hero']);
  });
  it('returns immutable attack, geometry, events and projectile snapshots', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'enemy', { x: 200, y: 0, radius: 1 });
    const events = system.update(0),
      first = starts(events)[0],
      p = system.getProjectiles()[0];
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.origin)).toBe(true);
    expect(Object.isFrozen(first.direction)).toBe(true);
    expect(Object.isFrozen(first.attack)).toBe(true);
    expect(Object.isFrozen(p)).toBe(true);
    system.update(0.1);
    expect(p.x).toBe(0);
    expect(system.getProjectiles()[0].x).toBe(60);
  });
});
