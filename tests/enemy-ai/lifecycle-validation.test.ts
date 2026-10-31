import { describe, expect, it } from 'vitest';
import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { EnemyAI, SpatialGrid } from '../../src/enemy-ai';
import type { EnemyAIOptions, EnemyConfig } from '../../src/enemy-ai';
import { StatusEffects } from '../../src/status-effects';
import { PLAYER, setup, addEnemy, contacts, launches, impacts, kill } from './helpers';
import { AI_OPTIONS, NORMAL_MELEE, RANGED } from './fixtures';
describe('Core / Status Effects lifecycle compatibility', () => {
  it('active poison does not slow movement or prevent attacks while enemy remains alive', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 });
    const statuses = new StatusEffects(core, { random: () => 0.1 });
    statuses.apply({
      sourceId: 'player',
      targetId: 'enemy',
      effectType: 'poison',
      duration: 3,
      probabilityPercent: 100,
      rawDamagePerTick: 1,
    });
    ai.update(1, PLAYER);
    statuses.advanceTo(1);
    expect(core.getEntity('enemy').currentHp).toBe(999);
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(0);
    expect(contacts(ai.update(1, PLAYER))).toHaveLength(1);
  });
  it('stops movement and attacks immediately after an aligned periodic death is observed', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 300, y: 0 });
    const statuses = new StatusEffects(core, { random: () => 0.1 });
    statuses.apply({
      sourceId: 'player',
      targetId: 'enemy',
      effectType: 'poison',
      duration: 2,
      probabilityPercent: 100,
      rawDamagePerTick: 1000,
    });
    ai.update(1, PLAYER);
    const position = ai.getEnemy('enemy').position;
    const ticks = statuses.advanceTo(1).filter((e) => e.type === 'status-tick');
    const deathEvents = ticks.flatMap((t) => t.result?.events ?? []);
    const changes = ai.consumeCombatEvents(deathEvents);
    expect(changes).toContainEqual(
      expect.objectContaining({ type: 'enemy-state-changed', state: 'dead', time: 1 }),
    );
    expect(ai.getEnemy('enemy').velocity).toEqual({ x: 0, y: 0 });
    expect(contacts(ai.update(3, PLAYER))).toEqual([]);
    expect(ai.getEnemy('enemy').position).toEqual(position);
    expect(statuses.getGroups()).toEqual([]);
    expect(ai.consumeCombatEvents(deathEvents)).toEqual([]);
  });
  it('keeps a projectile alive after its source dies from periodic damage', () => {
    const { core, ai } = setup();
    addEnemy(
      core,
      ai,
      'enemy',
      { x: 100, y: 0 },
      { ...RANGED, movementSpeed: 0, projectile: { speed: 1, radius: 5, maxTravelDistance: 400 } },
    );
    const statuses = new StatusEffects(core, { random: () => 0.1 });
    statuses.apply({
      sourceId: 'player',
      targetId: 'enemy',
      effectType: 'burn',
      duration: 2,
      probabilityPercent: 100,
      rawDamagePerTick: 1000,
    });
    ai.update(1, PLAYER);
    const events = statuses.advanceTo(1);
    for (const e of events)
      if (e.type === 'status-tick' && e.result) ai.consumeCombatEvents(e.result.events);
    const after = ai.update(100, PLAYER);
    expect(launches(after)).toEqual([]);
    expect(impacts(after)).toHaveLength(1);
    expect(impacts(after)[0].result?.damage).toBe(30);
  });
  it('cleans status groups from the authoritative death, without AI synthesizing another Core death', () => {
    const { core, ai } = setup({}, () => 0.99, { maxHp: 10 });
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    const statuses = new StatusEffects(core, { random: () => 0.1 });
    statuses.apply({
      sourceId: 'enemy',
      targetId: 'player',
      effectType: 'bleed',
      duration: 3,
      probabilityPercent: 100,
      rawDamagePerTick: 1,
    });
    const event = contacts(ai.update(0, PLAYER))[0];
    expect(event.result?.events.filter((e) => e.type === 'death')).toHaveLength(1);
    statuses.consumeCombatEvents(event.result!.events);
    expect(statuses.getGroups()).toEqual([]);
    expect(contacts(ai.update(5, PLAYER))).toHaveLength(0);
  });
  it('does not auto-orchestrate or replay status applications after a completed AI batch', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    const statuses = new StatusEffects(core, { random: () => 0.1 });
    ai.update(2, PLAYER);
    expect(statuses.time).toBe(0);
    expect(statuses.getGroups()).toEqual([]);
    expect(ai.time).toBe(2);
  });
  it('keeps Core as sole HP authority and returns immutable AI/event snapshots', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    const initial = ai.getEnemy('enemy');
    expect('currentHp' in initial).toBe(false);
    expect('maxHp' in initial).toBe(false);
    const events = ai.update(0, PLAYER);
    const hit = contacts(events)[0];
    expect(core.getEntity('player').currentHp).toBe(100000 - hit.result!.appliedDamage);
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(hit)).toBe(true);
    expect(Object.isFrozen(hit.attack)).toBe(true);
    expect(Object.isFrozen(hit.result)).toBe(true);
    expect(Object.isFrozen(initial.position)).toBe(true);
    expect(Object.isFrozen(initial.config)).toBe(true);
  });
  it('never mutates source caller configuration, geometry or retained snapshots', () => {
    const { core, ai } = setup();
    const config = { ...NORMAL_MELEE, movementSpeed: 100 as number },
      position = { x: 100, y: 0 };
    addEnemy(core, ai, 'enemy', position, config);
    const before = ai.getEnemy('enemy');
    config.movementSpeed = 999;
    position.x = 999;
    ai.update(0.1, PLAYER);
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(90);
    expect(before.position.x).toBe(100);
  });
  it('disposes AI and flights without deleting entity history', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 }, { ...RANGED, movementSpeed: 0 });
    ai.update(0, PLAYER);
    expect(ai.getProjectiles()).toHaveLength(1);
    ai.dispose();
    expect(() => ai.update(1, PLAYER)).toThrow(/disposed/);
    expect(() => ai.getProjectiles()).toThrow(/disposed/);
    expect(core.getEntity('enemy').alive).toBe(true);
    expect(core.getEntity('player').alive).toBe(true);
    ai.dispose();
  });
  it('can register a new actor after a long empty simulation without replaying idle steering ticks', () => {
    const { core, ai } = setup();
    expect(ai.update(100, PLAYER)).toEqual([]);
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    const event = contacts(ai.update(0, PLAYER))[0];
    expect(event.time).toBe(100);
  });
});
describe('validation and registration safety', () => {
  it.each([
    { behavior: 'boss' },
    { movementSpeed: -1 },
    { movementSpeed: NaN },
    { radius: -1 },
    { radius: Infinity },
    { attackInterval: 0 },
    { attackInterval: Infinity },
    { attackInterval: Number.MIN_VALUE },
    { attackCoefficient: -1 },
    { damageType: 'poison' },
  ])('rejects malformed melee config %j', (patch) => {
    const { core, ai } = setup();
    core.addEntity({ id: 'invalid', affiliation: 'enemy', stats: BASE_COMBAT_ATTRIBUTES });
    expect(() =>
      ai.registerEnemy({
        entityId: 'invalid',
        position: { x: 0, y: 0 },
        config: { ...NORMAL_MELEE, ...patch } as EnemyConfig,
      }),
    ).toThrow();
    expect(ai.getEnemies()).toEqual([]);
  });
  it.each([
    { attackRange: 0 },
    { retreatDistance: -1 },
    { retreatDistance: 200 },
    { hysteresis: -1 },
    { hysteresis: 100 },
    { projectile: undefined },
    { projectile: { speed: 0, radius: 5, maxTravelDistance: 400 } },
    { projectile: { speed: 300, radius: -1, maxTravelDistance: 400 } },
    { projectile: { speed: 300, radius: 5, maxTravelDistance: 0 } },
  ])('rejects malformed ranged config %j', (patch) => {
    const { core, ai } = setup();
    core.addEntity({ id: 'invalid', affiliation: 'enemy', stats: BASE_COMBAT_ATTRIBUTES });
    expect(() =>
      ai.registerEnemy({
        entityId: 'invalid',
        position: { x: 0, y: 0 },
        config: { ...RANGED, ...patch } as EnemyConfig,
      }),
    ).toThrow();
    expect(ai.getEnemies()).toEqual([]);
  });
  it('rejects missing/duplicate AI entities, invalid positions and player registration', () => {
    const { core, ai } = setup();
    expect(() =>
      ai.registerEnemy({ entityId: 'unknown', position: { x: 0, y: 0 }, config: NORMAL_MELEE }),
    ).toThrow(/Unknown combat entity/);
    expect(() =>
      ai.registerEnemy({ entityId: 'player', position: { x: 0, y: 0 }, config: NORMAL_MELEE }),
    ).toThrow(/enemy-affiliated/);
    addEnemy(core, ai);
    expect(() =>
      ai.registerEnemy({ entityId: 'enemy', position: { x: 0, y: 0 }, config: NORMAL_MELEE }),
    ).toThrow(/already registered/);
    core.addEntity({ id: 'invalid', affiliation: 'enemy', stats: BASE_COMBAT_ATTRIBUTES });
    expect(() =>
      ai.registerEnemy({ entityId: 'invalid', position: { x: NaN, y: 0 }, config: NORMAL_MELEE }),
    ).toThrow();
  });
  it.each([-1, NaN, Infinity])('rejects invalid delta %s without moving anything', (delta) => {
    const { core, ai } = setup();
    addEnemy(core, ai);
    const before = ai.getEnemy('enemy');
    expect(() => ai.update(delta, PLAYER)).toThrow();
    expect(ai.time).toBe(0);
    expect(ai.getEnemy('enemy')).toEqual(before);
  });
  it('validates player geometry and pause before changing AI state', () => {
    const { core, ai } = setup();
    addEnemy(core, ai);
    expect(() => ai.update(1, { x: 0, y: 0, radius: -1 })).toThrow();
    expect(() => ai.update(1, { x: NaN, y: 0, radius: 10 })).toThrow();
    expect(() =>
      ai.update(1, PLAYER, { paused: 'yes' } as unknown as { paused: boolean }),
    ).toThrow();
    expect(ai.time).toBe(0);
  });
  it('validates target affiliation and movement/separation options', () => {
    const { core } = setup();
    core.addEntity({ id: 'not-player', affiliation: 'enemy', stats: BASE_COMBAT_ATTRIBUTES });
    expect(() => new EnemyAI(core, { ...AI_OPTIONS, playerId: 'not-player' })).toThrow(
      /player affiliation/,
    );
    for (const movementStep of [0, -1, Infinity, Number.MIN_VALUE])
      expect(() => new EnemyAI(core, { ...AI_OPTIONS, movementStep })).toThrow();
    for (const separation of [
      { cellSize: 0, padding: 1, strength: 0.5 },
      { cellSize: 10, padding: -1, strength: 0.5 },
      { cellSize: 10, padding: 1, strength: 2 },
    ])
      expect(() => new EnemyAI(core, { ...AI_OPTIONS, separation })).toThrow();
    expect(
      () =>
        new EnemyAI(core, {
          ...AI_OPTIONS,
          canResolveDirectDamage: 1,
        } as unknown as EnemyAIOptions),
    ).toThrow(/policy/);
  });
  it('does not accept fake deaths or partially consume a malformed event batch', () => {
    const { core, ai } = setup();
    addEnemy(core, ai);
    ai.update(0.1, PLAYER);
    const death = kill(core, 'enemy');
    expect(() =>
      ai.consumeCombatEvents([
        ...death.events,
        { type: 'death', entityId: 'missing', sourceId: 'player', attackId: 'x' },
      ]),
    ).toThrow();
    expect(ai.consumeCombatEvents(death.events)).toHaveLength(1);
    expect(() =>
      ai.consumeCombatEvents([
        { type: 'death', entityId: 'player', sourceId: 'enemy', attackId: 'x' },
      ]),
    ).toThrow(/authoritative/);
  });
  it('requires boolean policy responses and supplies a frozen context', () => {
    let checked = false;
    const { core, ai } = setup({
      canResolveDirectDamage: (context) => {
        checked = true;
        expect(Object.isFrozen(context)).toBe(true);
        return undefined as unknown as boolean;
      },
    });
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    expect(() => ai.update(0, PLAYER)).toThrow(/boolean/);
    expect(checked).toBe(true);
    expect(core.getEntity('player').currentHp).toBe(100000);
    expect(ai.getEnemy('enemy').nextAttackAt).toBe(0);
  });
  it('rejects unsafe grid numeric inputs rather than looping invalid cell coordinates', () => {
    const grid = new SpatialGrid(1);
    expect(() => grid.insert('bad', { x: 1e308, y: 0 })).toThrow(/representable/);
    expect(() => grid.query({ x: 0, y: 0 }, Infinity)).toThrow();
    expect(() => new SpatialGrid(0)).toThrow();
  });
});
