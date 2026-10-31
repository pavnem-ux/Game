import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../../src/enemy-ai';
import { PLAYER, setup, addEnemy, kill } from './helpers';
import { NORMAL_MELEE, FAST_MELEE, AI_OPTIONS } from './fixtures';
describe('deterministic melee pursuit and player collision policy', () => {
  it('moves directly at configured speed with normalized direction', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 300, y: 400 });
    ai.update(1, PLAYER);
    const enemy = ai.getEnemy('enemy');
    expect(enemy.position.x).toBeCloseTo(240);
    expect(enemy.position.y).toBeCloseTo(320);
    expect(Math.hypot(enemy.velocity.x, enemy.velocity.y)).toBeCloseTo(100);
  });
  it('uses the latest player sample without predictive movement or modifying the player', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 200, y: 0 });
    ai.update(0.5, PLAYER);
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(150);
    const player = { x: 150, y: 200, radius: 10 };
    const input = { ...player };
    ai.update(1, player);
    expect(ai.getEnemy('enemy').position).toEqual(expect.objectContaining({ x: 150 }));
    expect(ai.getEnemy('enemy').position.y).toBeCloseTo(100);
    expect(player).toEqual(input);
  });
  it.each([0, 1e-8])('is stable at zero/near-zero distance %s without overshooting', (x) => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x, y: 0 });
    ai.update(3, PLAYER);
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(0, 12);
    expect(ai.getEnemy('enemy').position.y).toBe(0);
    expect(ai.getEnemy('enemy').velocity).toEqual({ x: 0, y: 0 });
  });
  it('does not overshoot the player center during a large update', () => {
    const { core, ai } = setup({ movementStep: 2 });
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 });
    ai.update(5, PLAYER);
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(0);
    expect(ai.getEnemy('enemy').velocity).toEqual({ x: 0, y: 0 });
  });
  it('does not slow pursuit while attacking and allows hitbox overlap', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 30, y: 0 });
    ai.update(0.2, PLAYER);
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(10);
    expect(core.getEntity('player').currentHp).toBeLessThan(100000);
  });
  it('freezes movement, cooldowns and simulation time while paused', () => {
    const { core, ai } = setup();
    addEnemy(core, ai);
    ai.update(0.2, PLAYER);
    const before = ai.getEnemies();
    expect(ai.update(100, { x: 0, y: 0, radius: 10 }, { paused: true })).toEqual([]);
    expect(ai.time).toBe(0.2);
    expect(ai.getEnemies()).toEqual(before);
  });
  it('never physically blocks, pushes or penalizes player movement through an enemy', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    const player = { x: 0, y: 0, radius: 10 };
    ai.update(0, player);
    expect(player).toEqual({ x: 0, y: 0, radius: 10 });
    const through = { x: 100, y: 0, radius: 10 };
    ai.update(0.1, through);
    expect(through).toEqual({ x: 100, y: 0, radius: 10 });
    expect(ai.getEnemy('enemy').position).toEqual({ x: 0, y: 0 });
  });
  it('stops dead enemies immediately and excludes them from separation', () => {
    const { core, ai } = setup({ separation: { ...AI_OPTIONS.separation, strength: 0.5 } });
    addEnemy(core, ai);
    ai.update(0.2, PLAYER);
    const position = ai.getEnemy('enemy').position;
    kill(core, 'enemy');
    expect(ai.getEnemy('enemy').velocity).toEqual({ x: 0, y: 0 });
    ai.update(1, PLAYER);
    expect(ai.getEnemy('enemy').position).toEqual(position);
    expect(ai.getSeparationStats().livingEnemies).toBe(0);
  });
  it('stops pursuit and new attacks after the player dies', () => {
    const { core, ai } = setup();
    addEnemy(core, ai);
    ai.update(0.2, PLAYER);
    const position = ai.getEnemy('enemy').position;
    kill(core, 'player', 'enemy');
    expect(ai.getEnemy('enemy').state).toBe('idle');
    expect(ai.getEnemy('enemy').velocity).toEqual({ x: 0, y: 0 });
    ai.update(2, PLAYER);
    expect(ai.getEnemy('enemy').position).toEqual(position);
  });
  it('normal and fast test profiles retain independent speeds', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'normal', { x: 1000, y: 0 }, NORMAL_MELEE);
    addEnemy(core, ai, 'fast', { x: 1000, y: 0 }, FAST_MELEE);
    ai.update(1, PLAYER);
    expect(ai.getEnemy('normal').position.x).toBeCloseTo(900);
    expect(ai.getEnemy('fast').position.x).toBeCloseTo(840);
  });
  it('matches large and partitioned updates under a stationary player assumption', () => {
    const run = (steps: number[]) => {
      const { core, ai } = setup();
      addEnemy(core, ai, 'enemy', { x: 300, y: 400 });
      steps.forEach((dt) => ai.update(dt, PLAYER));
      return ai.getEnemy('enemy');
    };
    const a = run([2]),
      b = run(Array(20).fill(0.1));
    expect(a.position.x).toBeCloseTo(b.position.x, 9);
    expect(a.position.y).toBeCloseTo(b.position.y, 9);
  });
});
describe('uniform-grid local soft separation', () => {
  it('separates identical positions deterministically with bounded velocities', () => {
    const { core, ai } = setup({ separation: { cellSize: 40, padding: 10, strength: 0.5 } });
    addEnemy(core, ai, 'a', { x: 0, y: 0 });
    addEnemy(core, ai, 'b', { x: 0, y: 0 });
    ai.update(0.05, PLAYER);
    expect(ai.getEnemy('a').position.x).toBeLessThan(0);
    expect(ai.getEnemy('b').position.x).toBeGreaterThan(0);
    for (const enemy of ai.getEnemies())
      expect(Math.hypot(enemy.velocity.x, enemy.velocity.y)).toBeLessThanOrEqual(100 + 1e-9);
  });
  it('does not let distant enemies interfere', () => {
    const run = (extra: boolean) => {
      const { core, ai } = setup({ separation: { cellSize: 40, padding: 10, strength: 0.5 } });
      addEnemy(core, ai, 'a', { x: 100, y: 0 });
      if (extra) addEnemy(core, ai, 'far', { x: 10000, y: 10000 });
      ai.update(0.1, PLAYER);
      return ai.getEnemy('a').position;
    };
    expect(run(true)).toEqual(run(false));
  });
  it('is independent of insertion order even for a dense overlapping group', () => {
    const run = (ids: string[]) => {
      const { core, ai } = setup({ separation: { cellSize: 40, padding: 10, strength: 0.4 } });
      ids.forEach((id) => addEnemy(core, ai, id, { x: 0, y: 0 }));
      ai.update(0.5, PLAYER);
      return ai.getEnemies();
    };
    const ids = Array.from({ length: 20 }, (_, i) => `enemy-${i}`);
    expect(run(ids)).toEqual(run([...ids].reverse()));
  });
  it('uses local queries instead of globally testing all distant enemy pairs', () => {
    const { core, ai } = setup({ separation: { cellSize: 40, padding: 10, strength: 0.5 } });
    for (let i = 0; i < 200; i++) addEnemy(core, ai, `e-${i}`, { x: i * 1000, y: 10000 });
    ai.update(0, PLAYER);
    const stats = ai.getSeparationStats();
    expect(stats.queries).toBe(200);
    expect(stats.cells).toBe(200);
    expect(stats.neighborChecks).toBe(0);
  });
  it('handles cell edges, negative coordinates and sorted local results', () => {
    const grid = new SpatialGrid(10);
    grid.insert('z', { x: -1, y: 0 });
    grid.insert('a', { x: 1, y: 0 });
    grid.insert('far', { x: 100, y: 0 });
    expect(grid.query({ x: 0, y: 0 }, 2)).toEqual(['a', 'z']);
    expect(grid.query({ x: 0, y: 0 }, 1000)).toEqual(['a', 'far', 'z']);
    expect(() => grid.insert('a', { x: 0, y: 0 })).toThrow(/Duplicate/);
  });
});
