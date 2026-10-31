import { describe, expect, it, vi } from 'vitest';
import { addEntity, setup, starts, impacts, kill } from './helpers';
import { TEST_WEAPONS } from './fixtures';

describe('melee execution through Combat Core', () => {
  it('hits all intersecting enemies once, including partial hitboxes, but not behind or friendly', () => {
    const { core, system } = setup();
    addEntity(core, system, 'front', { x: 45, y: 0, radius: 3 });
    const a = (55 * Math.PI) / 180;
    addEntity(core, system, 'partial', { x: 60 * Math.cos(a), y: 60 * Math.sin(a), radius: 6 });
    addEntity(core, system, 'behind', { x: -80, y: 0, radius: 5 });
    addEntity(core, system, 'friend', { x: 30, y: 0, radius: 5 }, 'player');
    const events = system.update(0);
    expect(impacts(events).map((e) => e.targetId)).toEqual(['front', 'partial']);
    expect(core.getEntity('behind').currentHp).toBe(100000);
    expect(core.getEntity('friend').currentHp).toBe(100000);
    expect(impacts(system.update(0))).toEqual([]);
  });
  it('shares a crit snapshot while rolling independent Dodge in stable target order', () => {
    const random = vi
      .fn()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.9);
    const { core, system } = setup(TEST_WEAPONS.sword, random);
    core.updateEntityStats('hero', {
      ...core.getEntity('hero'),
      criticalChance: 50,
      criticalDamage: 250,
    });
    addEntity(core, system, 'b', { x: 50, y: 0, radius: 5 }, 'enemy', {
      dodgeChance: 50,
      resistance: 100,
    });
    addEntity(core, system, 'a', { x: 40, y: 0, radius: 5 }, 'enemy', { dodgeChance: 50 });
    const events = system.update(0),
      hits = impacts(events);
    expect(starts(events)).toHaveLength(1);
    expect(starts(events)[0].attack.critical).toBe(true);
    expect(hits.map((h) => h.result.status)).toEqual(['dodged', 'hit']);
    expect(hits[0].attack).toBe(hits[1].attack);
    expect(hits[1].result.damage).toBe(30);
    expect(random).toHaveBeenCalledTimes(3);
  });
  it('enemy weapon attacks player-affiliated entities only', () => {
    const { core, system } = setup();
    addEntity(core, system, 'enemy', { x: 50, y: 0, radius: 5 });
    addEntity(core, system, 'ally-enemy', { x: 40, y: 0, radius: 5 });
    system.equipWeapon({
      entityId: 'enemy',
      characterClass: 'warrior',
      weapon: { ...TEST_WEAPONS.sword, id: 'enemy-sword' },
      attackSpeedPercent: 100,
      fallbackDirection: { x: -1, y: 0 },
    });
    const events = impacts(system.update(0)).filter((e) => e.attack.attackerId === 'enemy');
    expect(events.map((e) => e.targetId)).toEqual(['hero']);
  });
});
describe('dual dagger cycles', () => {
  it('runs independent strikes at 0 and 35% and the next complete cycle at .9', () => {
    const { core, system } = setup(TEST_WEAPONS.daggers);
    addEntity(core, system, 'target', { x: 40, y: 0, radius: 5 });
    const events = starts(system.update(0.9));
    expect(events.map((e) => e.strike)).toEqual([1, 2, 1]);
    expect(events[1].time).toBeCloseTo(0.315, 12);
    expect(events[2].time).toBe(0.9);
    expect(new Set(events.map((e) => e.attack.id)).size).toBe(3);
  });
  it('scales the second-strike delay with Attack Speed and pauses pending time', () => {
    const { core, system } = setup(TEST_WEAPONS.daggers, () => 0.99, 200);
    addEntity(core, system, 'target', { x: 40, y: 0, radius: 5 });
    system.update(0);
    expect(system.getWeaponState('hero').secondStrikeAt).toBeCloseTo(0.1575);
    expect(system.update(10, { paused: true })).toEqual([]);
    expect(starts(system.update(0.1575))[0].strike).toBe(2);
  });
  it('rolls crit separately at each strike using current attacker stats', () => {
    const random = vi
      .fn()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.9)
      .mockReturnValue(0.99);
    const { core, system } = setup(TEST_WEAPONS.daggers, random);
    core.updateEntityStats('hero', { ...core.getEntity('hero'), criticalChance: 50 });
    addEntity(core, system, 'target', { x: 40, y: 0, radius: 5 });
    const first = starts(system.update(0))[0];
    core.updateEntityStats('hero', { ...core.getEntity('hero'), physicalDamage: 100 });
    const second = starts(system.update(0.315))[0];
    expect(first.attack.critical).toBe(true);
    expect(first.attack.rawDamage).toBe(18);
    expect(second.attack.critical).toBe(false);
    expect(second.attack.rawDamage).toBe(45);
  });
  it('retains the original live target even if another target becomes closer', () => {
    const { core, system } = setup(TEST_WEAPONS.daggers);
    addEntity(core, system, 'original', { x: 40, y: 0, radius: 2 });
    system.update(0);
    addEntity(core, system, 'new', { x: 10, y: 0, radius: 2 });
    expect(starts(system.update(0.315))[0].targetId).toBe('original');
  });
  it.each(['dead', 'out-of-range'] as const)(
    'retargets the second strike when the original is %s',
    (reason) => {
      const { core, system } = setup(TEST_WEAPONS.daggers);
      addEntity(core, system, 'original', { x: 30, y: 0, radius: 2 });
      addEntity(core, system, 'new', { x: 0, y: 50, radius: 2 });
      system.update(0);
      if (reason === 'dead') kill(core, 'original');
      else system.setBody('original', { x: 200, y: 0, radius: 2 });
      const second = starts(system.update(0.315))[0];
      expect(second.targetId).toBe('new');
      expect(second.direction.x).toBeCloseTo(0);
      expect(second.direction.y).toBeCloseTo(1);
    },
  );
  it('skips a missing second target without restarting the cooldown early', () => {
    const { core, system } = setup(TEST_WEAPONS.daggers);
    addEntity(core, system, 'original', { x: 40, y: 0, radius: 2 });
    system.update(0);
    kill(core, 'original');
    const skipped = system.update(0.315);
    expect(skipped).toContainEqual(
      expect.objectContaining({ type: 'strike-skipped', reason: 'no-target' }),
    );
    addEntity(core, system, 'new', { x: 40, y: 0, radius: 2 });
    expect(starts(system.update(0.2))).toEqual([]);
    expect(starts(system.update(0.385))[0].time).toBeCloseTo(0.9);
  });
  it('uses the current source position at the second strike', () => {
    const { core, system } = setup(TEST_WEAPONS.daggers);
    addEntity(core, system, 'target', { x: 40, y: 0, radius: 2 });
    system.update(0);
    system.setBody('hero', { x: 40, y: 40, radius: 10 });
    const second = starts(system.update(0.315))[0];
    expect(second.origin).toEqual({ x: 40, y: 40 });
    expect(second.direction).toEqual({ x: 0, y: -1 });
  });
  it('cancels the pending second strike and future cycles immediately if the source dies', () => {
    const { core, system } = setup(TEST_WEAPONS.daggers);
    addEntity(core, system, 'killer', { x: 40, y: 0, radius: 2 });
    system.update(0);
    core.resolveAttack(
      core.createAttack({ attackerId: 'killer', damageType: 'physical', coefficient: 1e6 }),
      'hero',
    );
    const events = system.update(3);
    expect(starts(events)).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'strike-skipped', reason: 'source-dead', time: 0 }),
    );
    expect(system.getWeaponState('hero').secondStrikeAt).toBeNull();
  });
});

describe('attack instance hit guarantees', () => {
  it('has no arbitrary melee target cap and never hits the same ID twice in a strike', () => {
    const { core, system } = setup();
    for (let i = 0; i < 100; i++)
      addEntity(core, system, `target-${i}`, { x: 40 + i * 0.1, y: 0, radius: 1 });
    const events = system.update(0),
      hits = impacts(events);
    expect(hits).toHaveLength(100);
    expect(new Set(hits.map((h) => h.targetId)).size).toBe(100);
    expect(new Set(hits.map((h) => h.attack.id)).size).toBe(1);
    expect(impacts(system.update(0))).toEqual([]);
  });
  it('removes dead-source pending strikes even when elapsed simulation is paused', () => {
    const { core, system } = setup(TEST_WEAPONS.daggers);
    addEntity(core, system, 'killer', { x: 40, y: 0, radius: 1 });
    system.update(0);
    core.resolveAttack(
      core.createAttack({ attackerId: 'killer', damageType: 'physical', coefficient: 1e6 }),
      'hero',
    );
    const events = system.update(100, { paused: true });
    expect(system.time).toBe(0);
    expect(system.getWeaponState('hero').secondStrikeAt).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'strike-skipped', reason: 'source-dead' }),
    );
    expect(starts(system.update(5))).toEqual([]);
  });
});
