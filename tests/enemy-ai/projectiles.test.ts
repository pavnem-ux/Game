import { describe, expect, it } from 'vitest';
import { EnemyProjectiles } from '../../src/enemy-ai';
import { PLAYER, setup, addEnemy, launches, impacts, kill } from './helpers';
import { NORMAL_MELEE, RANGED } from './fixtures';
const STATIONARY = { ...RANGED, movementSpeed: 0 } as const;
describe('enemy projectile component and AI integration', () => {
  it('snapshots direction, damage, target position and constant configured speed', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    const event = launches(ai.update(0.1, PLAYER))[0];
    expect(event.projectile.direction).toEqual({ x: -1, y: 0 });
    expect(ai.getProjectiles()[0].x).toBeCloseTo(70);
    core.updateEntityStats('enemy', { ...core.getEntity('enemy'), magicalDamage: 999 });
    ai.update(0.1, PLAYER);
    expect(ai.getProjectiles()[0].x).toBeCloseTo(40);
    const hit = impacts(ai.update(0.1, PLAYER))[0];
    expect(hit.result?.damage).toBe(30);
  });
  it('does not home when the player moves after launch', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    ai.update(0, PLAYER);
    ai.update(0.2, { x: 0, y: 100, radius: 10 });
    const p = ai.getProjectiles()[0];
    expect(p.x).toBeCloseTo(40);
    expect(p.y).toBe(0);
    expect(p.direction).toEqual({ x: -1, y: 0 });
  });
  it('misses, expires at exact maximum distance and never exceeds that distance', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    ai.update(0, PLAYER);
    const events = ai.update(2, { x: 0, y: 500, radius: 10 });
    const expired = events.find((e) => e.type === 'enemy-projectile-expired');
    expect(expired).toMatchObject({
      projectile: { x: -300, y: 0, distanceTraveled: 400, maxTravelDistance: 400 },
    });
    expect(impacts(events)).toHaveLength(0);
    expect(ai.getProjectiles()).toEqual([]);
  });
  it('sweeps through the complete player hitbox instead of tunneling on a large step', () => {
    const { core, ai } = setup({ movementStep: 2 });
    addEnemy(
      core,
      ai,
      'enemy',
      { x: 200, y: 0 },
      { ...STATIONARY, projectile: { speed: 10000, radius: 5, maxTravelDistance: 1000 } },
    );
    const hits = impacts(ai.update(1, PLAYER));
    expect(hits).toHaveLength(1);
    expect(hits[0].time).toBeCloseTo(185 / 10000, 10);
    expect(hits[0].projectile.x).toBeCloseTo(15);
  });
  it('uses the sum of player and projectile radii, including tangency after a player position update', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    ai.update(0, PLAYER);
    const hits = impacts(ai.update(0.4, { x: 50, y: 15, radius: 10 }));
    expect(hits).toHaveLength(1);
    expect(hits[0].projectile.x).toBeCloseTo(50);
  });
  it('passes through friendly enemies without damaging or consuming the projectile', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'shooter', { x: 100, y: 0 }, STATIONARY);
    addEnemy(core, ai, 'friend', { x: 50, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    const hits = impacts(ai.update(0.4, PLAYER));
    expect(hits).toHaveLength(1);
    expect(hits[0].projectile.sourceId).toBe('shooter');
    expect(core.getEntity('friend').currentHp).toBe(1000);
  });
  it('consumes a dodged projectile and exposes the unchanged Core result', () => {
    const { core, ai } = setup({}, () => 0, { dodgeChance: 60 });
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    const hits = impacts(ai.update(0.4, PLAYER));
    expect(hits[0].result?.status).toBe('dodged');
    expect(hits[0].blocked).toBe(false);
    expect(ai.getProjectiles()).toEqual([]);
    expect(core.getEntity('player').currentHp).toBe(100000);
  });
  it('consumes a protection-blocked projectile without treating it as Dodge or creating damage events', () => {
    const { core, ai } = setup({
      canResolveDirectDamage: (context) => context.kind !== 'projectile',
    });
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    const hit = impacts(ai.update(0.4, PLAYER))[0];
    expect(hit.blocked).toBe(true);
    expect(hit.result).toBeNull();
    expect(ai.getProjectiles()).toEqual([]);
    expect(ai.getEnemy('enemy').nextAttackAt).toBe(1.2);
    expect(core.getEntity('player').currentHp).toBe(100000);
  });
  it('keeps launched projectiles after source death and prevents new launches', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    ai.update(0.1, PLAYER);
    const projectile = ai.getProjectiles()[0];
    const death = kill(core, 'enemy');
    ai.consumeCombatEvents(death.events);
    const events = ai.update(3, PLAYER);
    expect(launches(events)).toHaveLength(0);
    const hit = impacts(events)[0];
    expect(hit.projectile.id).toBe(projectile.id);
    expect(hit.result?.damage).toBe(30);
  });
  it('retains flights after unregistering AI without deleting Core entity history', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    ai.update(0, PLAYER);
    ai.unregisterEnemy('enemy');
    expect(core.getEntity('enemy').alive).toBe(true);
    expect(ai.getEnemies()).toEqual([]);
    expect(impacts(ai.update(0.4, PLAYER))).toHaveLength(1);
  });
  it('does not launch from an already-dead enemy or toward an already-dead player', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
    kill(core, 'enemy');
    expect(launches(ai.update(2, PLAYER))).toEqual([]);
    const component = new EnemyProjectiles(core, 'player');
    expect(() =>
      component.launch(0, {
        sourceId: 'enemy',
        origin: { x: 100, y: 0 },
        target: PLAYER,
        damageType: 'physical',
        coefficient: 1,
        projectile: STATIONARY.projectile,
        fallbackDirection: { x: -1, y: 0 },
      }),
    ).toThrow(/living enemy/);
  });
  it('resolves simultaneous projectile collisions stably and never damages an already-dead player again', () => {
    const { core, ai } = setup({}, () => 0.99, { maxHp: 30 });
    addEnemy(core, ai, 'b', { x: 100, y: 0 }, STATIONARY);
    addEnemy(core, ai, 'a', { x: 100, y: 0 }, STATIONARY);
    const events = ai.update(2, PLAYER),
      hits = impacts(events);
    expect(launches(events).map((e) => e.projectile.sourceId)).toEqual(['a', 'b']);
    expect(hits).toHaveLength(1);
    expect(hits[0].projectile.sourceId).toBe('a');
    expect(
      hits.flatMap((h) => h.result?.events ?? []).filter((e) => e.type === 'death'),
    ).toHaveLength(1);
    expect(events.filter((e) => e.type === 'enemy-projectile-expired')).toHaveLength(1);
  });
  it('is independent of frame partition for a stationary player and stationary source', () => {
    const run = (steps: number[]) => {
      const { core, ai } = setup();
      addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, STATIONARY);
      const events = steps.flatMap((dt) => [...ai.update(dt, PLAYER)]);
      return {
        hp: core.getEntity('player').currentHp,
        shots: launches(events).map((e) => e.time),
        hits: impacts(events).map((e) => e.time),
      };
    };
    const a = run([3]),
      b = run(Array(30).fill(0.1));
    expect(a.hp).toBe(b.hp);
    expect(a.shots.length).toBe(b.shots.length);
    expect(a.hits.length).toBe(b.hits.length);
    a.shots.forEach((t, i) => expect(t).toBeCloseTo(b.shots[i], 9));
    a.hits.forEach((t, i) => expect(t).toBeCloseTo(b.hits[i], 9));
  });
  it('can be reused separately with explicit launch/next-event/advance/resolve control', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'source', { x: 100, y: 0 }, STATIONARY);
    const component = new EnemyProjectiles(core, 'player');
    const launch = component.launch(0, {
      sourceId: 'source',
      origin: { x: 100, y: 0 },
      target: PLAYER,
      damageType: 'physical',
      coefficient: 1,
      projectile: STATIONARY.projectile,
      fallbackDirection: { x: -1, y: 0 },
    });
    const next = component.nextEvent(0, PLAYER)!;
    component.advance(next.at);
    const event = component.resolve(next, next.at);
    expect(event.type).toBe('enemy-projectile-impact');
    expect(component.getProjectiles()).toEqual([]);
    expect(launch.projectile.distanceTraveled).toBe(0);
  });
});
