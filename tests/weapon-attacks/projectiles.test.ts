import { describe, expect, it } from 'vitest';
import { addEntity, setup, starts, impacts, kill } from './helpers';
import { TEST_WEAPONS } from './fixtures';

describe('straight-line projectile simulation', () => {
  it.each([TEST_WEAPONS.staff, TEST_WEAPONS.bow])(
    'launches $category with its fixed damage type and constant speed',
    (weapon) => {
      const { core, system } = setup(weapon);
      addEntity(core, system, 'target', { x: 250, y: 0, radius: 5 });
      const events = system.update(0.1);
      expect(starts(events)[0].attack.damageType).toBe(weapon.damageType);
      expect(system.getProjectiles()[0].x).toBeCloseTo(weapon.projectile.speed * 0.1);
      system.update(0.1);
      expect(system.getProjectiles()[0].x).toBeCloseTo(weapon.projectile.speed * 0.2);
      expect(system.getProjectiles()[0].y).toBe(0);
    },
  );
  it('keeps a fixed trajectory when the original target moves', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'target', { x: 200, y: 0, radius: 5 });
    system.update(0);
    system.setBody('target', { x: 200, y: 100, radius: 5 });
    system.update(0.5);
    expect(system.getProjectiles()[0]).toMatchObject({ x: 300, y: 0, direction: { x: 1, y: 0 } });
    expect(core.getEntity('target').currentHp).toBe(100000);
  });
  it('continues after original target death and can hit a different enemy beyond acquisition range', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'original', { x: 200, y: 0, radius: 5 });
    addEntity(core, system, 'beyond-range', { x: 420, y: 0, radius: 5 });
    system.update(0);
    kill(core, 'original');
    const events = impacts(system.update(0.8));
    expect(events.map((e) => e.targetId)).toEqual(['beyond-range']);
    expect(system.getProjectiles()).toEqual([]);
  });
  it('continues and damages targets after the source dies, without initiating more attacks', () => {
    const { core, system } = setup(TEST_WEAPONS.staff);
    addEntity(core, system, 'enemy', { x: 200, y: 0, radius: 5 });
    system.update(0);
    core.resolveAttack(
      core.createAttack({ attackerId: 'enemy', damageType: 'physical', coefficient: 1e6 }),
      'hero',
    );
    const events = system.update(3);
    expect(starts(events)).toEqual([]);
    expect(impacts(events)).toHaveLength(1);
    expect(core.getEntity('enemy').currentHp).toBe(99960);
    expect(core.getEntity('hero').alive).toBe(false);
  });
  it('locks damage, direction and flight configuration against later stats/config mutations', () => {
    const weapon = { ...TEST_WEAPONS.bow, projectile: { ...TEST_WEAPONS.bow.projectile } };
    const { core, system } = setup(weapon);
    addEntity(core, system, 'target', { x: 200, y: 0, radius: 5 });
    system.update(0);
    core.updateEntityStats('hero', { ...core.getEntity('hero'), physicalDamage: 1000 });
    Object.assign(weapon.projectile, { speed: 1, maxTravelDistance: 1 });
    const hits = impacts(system.update(0.5));
    expect(hits[0].result.damage).toBe(20);
    expect(hits[0].time).toBeCloseTo(190 / 600);
  });
  it('uses the configured launch offset and aims from that launch position', () => {
    const { core, system } = setup();
    addEntity(core, system, 'mage', { x: 0, y: 100, radius: 5 }, 'player');
    addEntity(core, system, 'target', { x: 100, y: 110, radius: 5 });
    system.equipWeapon({
      entityId: 'mage',
      characterClass: 'mage',
      weapon: TEST_WEAPONS.staff,
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
      launchOffset: { x: 0, y: 10 },
    });
    const launched = starts(system.update(0)).find((e) => e.sourceId === 'mage')!;
    expect(launched.origin).toEqual({ x: 0, y: 110 });
    expect(launched.direction).toEqual({ x: 1, y: 0 });
  });
  it('does not hit friendly bodies between source and target', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'friend', { x: 50, y: 0, radius: 20 }, 'player');
    addEntity(core, system, 'enemy', { x: 200, y: 0, radius: 5 });
    expect(impacts(system.update(0.5)).map((e) => e.targetId)).toEqual(['enemy']);
    expect(core.getEntity('friend').currentHp).toBe(100000);
  });
  it('enemy projectiles damage players only and ignore other enemies', () => {
    const { core, system } = setup({ ...TEST_WEAPONS.sword, attackRange: 0 });
    system.setBody('hero', { x: 1000, y: 0, radius: 10 });
    addEntity(core, system, 'enemy', { x: 800, y: 0, radius: 5 });
    addEntity(core, system, 'friend-of-enemy', { x: 900, y: 0, radius: 20 });
    system.equipWeapon({
      entityId: 'enemy',
      characterClass: 'archer',
      weapon: TEST_WEAPONS.bow,
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    });
    const hits = impacts(system.update(0.5));
    expect(hits.map((e) => e.targetId)).toEqual(['hero']);
    expect(core.getEntity('friend-of-enemy').currentHp).toBe(100000);
  });
});
describe('swept collision, ordering and lifetime', () => {
  it('uses both collision radii for off-center tangency', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'aim', { x: 200, y: 0, radius: 0 });
    addEntity(core, system, 'tangent', { x: 100, y: 15, radius: 10 });
    expect(impacts(system.update(0.5))[0].targetId).toBe('tangent');
  });
  it('resolves the first crossed enemy even when several complete hitboxes fit inside one update', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'third', { x: 300, y: 0, radius: 2 });
    addEntity(core, system, 'second', { x: 200, y: 0, radius: 2 });
    addEntity(core, system, 'first', { x: 100, y: 0, radius: 2 });
    const hits = impacts(system.update(0.7));
    expect(hits.map((e) => e.targetId)).toEqual(['first']);
    expect(core.getEntity('second').currentHp).toBe(100000);
    expect(system.getProjectiles()).toEqual([]);
  });
  it('orders earliest contacts using the expanded hitbox rather than target center', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'small', { x: 100, y: 0, radius: 1 });
    addEntity(core, system, 'big', { x: 130, y: 0, radius: 40 });
    expect(impacts(system.update(0.5))[0].targetId).toBe('big');
  });
  it('uses a stable ID tie-breaker for identical collision positions', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'z', { x: 100, y: 0, radius: 5 });
    addEntity(core, system, 'a', { x: 100, y: 0, radius: 5 });
    expect(impacts(system.update(0.5)).map((e) => e.targetId)).toEqual(['a']);
  });
  it('consumes the projectile even when the first enemy dodges', () => {
    const { core, system } = setup(TEST_WEAPONS.bow, () => 0);
    addEntity(core, system, 'dodge', { x: 100, y: 0, radius: 2 }, 'enemy', { dodgeChance: 60 });
    addEntity(core, system, 'behind', { x: 200, y: 0, radius: 2 });
    const hits = impacts(system.update(0.5));
    expect(hits).toHaveLength(1);
    expect(hits[0].result.status).toBe('dodged');
    expect(system.getProjectiles()).toEqual([]);
    expect(core.getEntity('behind').currentHp).toBe(100000);
  });
  it('stops at exactly max travel distance and never hits beyond it', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'aim', { x: 200, y: 0, radius: 5 });
    system.update(0);
    kill(core, 'aim');
    addEntity(core, system, 'too-far', { x: 520, y: 0, radius: 5 });
    system.update(0.8);
    expect(system.getProjectiles()[0].distanceTraveled).toBeCloseTo(480);
    const expired = system.update(0.2).find((e) => e.type === 'projectile-expired')!;
    expect(expired).toMatchObject({ position: { x: 500, y: 0 }, distanceTraveled: 500 });
    expect(core.getEntity('too-far').currentHp).toBe(100000);
    expect(system.getProjectiles()).toEqual([]);
  });
  it('allows a collision exactly at the maximum distance instead of expiring first', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'aim', { x: 200, y: 0, radius: 5 });
    system.update(0);
    kill(core, 'aim');
    addEntity(core, system, 'edge', { x: 510, y: 0, radius: 5 });
    expect(impacts(system.update(1)).map((e) => e.targetId)).toEqual(['edge']);
  });
  it('processes simultaneous projectiles stably and immediately excludes a newly dead target', () => {
    const { core, system } = setup(TEST_WEAPONS.bow);
    addEntity(core, system, 'second-source', { x: 0, y: 0, radius: 5 }, 'player');
    system.equipWeapon({
      entityId: 'second-source',
      characterClass: 'archer',
      weapon: { ...TEST_WEAPONS.bow, id: 'second-bow' },
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    });
    addEntity(core, system, 'front', { x: 100, y: 0, radius: 5 }, 'enemy', { maxHp: 10 });
    addEntity(core, system, 'behind', { x: 200, y: 0, radius: 5 });
    const events = system.update(0.5),
      hits = impacts(events);
    expect(hits.map((e) => e.targetId)).toEqual(['front', 'behind']);
    expect(hits[0].projectileId).toBe('projectile-1');
    expect(hits[1].projectileId).toBe('projectile-2');
    expect(hits.flatMap((h) => h.result.events).filter((e) => e.type === 'death')).toHaveLength(1);
  });
  it('resolves a lethal projectile at a pending strike time before that source can strike', () => {
    const { core, system } = setup(TEST_WEAPONS.daggers);
    addEntity(core, system, 'archer-enemy', { x: 204, y: 0, radius: 0 }, 'enemy', {
      physicalDamage: 1000000,
    });
    system.equipWeapon({
      entityId: 'archer-enemy',
      characterClass: 'archer',
      weapon: TEST_WEAPONS.bow,
      attackSpeedPercent: 100,
      fallbackDirection: { x: -1, y: 0 },
    });
    addEntity(core, system, 'dagger-target', { x: 40, y: 20, radius: 1 });
    // Exact tie: projectile contact is (204 - (10+5))/600 = .315, matching second strike.
    const events = system.update(0.5);
    expect(core.getEntity('hero').alive).toBe(false);
    expect(
      starts(events)
        .filter((e) => e.sourceId === 'hero')
        .map((e) => e.strike),
    ).toEqual([1]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'strike-skipped', sourceId: 'hero', reason: 'source-dead' }),
    );
  });
  it('produces the same hit order and HP for large and partitioned updates', () => {
    const simulate = (steps: number[]) => {
      const { core, system } = setup(TEST_WEAPONS.bow);
      addEntity(core, system, 'target', { x: 100, y: 0, radius: 5 });
      const hits = steps.flatMap((dt) => impacts(system.update(dt)));
      return {
        ids: hits.map((h) => h.targetId),
        damage: hits.map((h) => h.result.damage),
        times: hits.map((h) => h.time),
        hp: core.getEntity('target').currentHp,
      };
    };
    const whole = simulate([3]),
      split = simulate(Array(30).fill(0.1));
    expect(split.ids).toEqual(whole.ids);
    expect(split.damage).toEqual(whole.damage);
    expect(split.hp).toBe(whole.hp);
    split.times.forEach((t, i) => expect(t).toBeCloseTo(whole.times[i], 10));
  });
});
