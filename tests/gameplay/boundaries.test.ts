import { describe, expect, it } from 'vitest';
import { GameplayWorld, ALPHA_ENEMIES } from '../../src/gameplay';
import { CombatCore } from '../../src/combat-core';
import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { WeaponAttacks } from '../../src/weapon-attacks';
import { EnemyAI } from '../../src/enemy-ai';
import { StatusEffects } from '../../src/status-effects';
import { TEST_WEAPONS } from '../weapon-attacks/fixtures';
import { AI_OPTIONS } from '../enemy-ai/fixtures';
import { createTestingController } from '../../src/gameplay/testing';
function core() {
  const c = new CombatCore(() => 0.99);
  for (const id of ['player', 'enemy'])
    c.addEntity({
      id,
      affiliation: id === 'player' ? 'player' : 'enemy',
      stats: { ...BASE_COMBAT_ATTRIBUTES, maxHp: 100, resistance: 0, dodgeChance: 0 },
    });
  return c;
}
describe('additive event-boundary APIs reuse authoritative module resolvers', () => {
  it('does not deal damage while peeking or advancing; resolves each weapon strike once', () => {
    const c = core(),
      w = new WeaponAttacks(c);
    w.setBody('player', { x: 0, y: 0, radius: 10 });
    w.setBody('enemy', { x: 40, y: 0, radius: 10 });
    w.equipWeapon({
      entityId: 'player',
      characterClass: 'warrior',
      weapon: TEST_WEAPONS.sword,
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    });
    expect(w.peekBoundary(10)?.time).toBe(0);
    expect(w.peekBoundary(10)?.time).toBe(0);
    expect(() => w.advanceToBoundary(1)).toThrow(/unresolved/);
    expect(c.getEntity('enemy').currentHp).toBe(100);
    expect(w.resolveBoundary().some((e) => e.type === 'impact')).toBe(true);
    expect(w.resolveBoundary()).toEqual([]);
    expect(c.getEntity('enemy').currentHp).toBe(88);
    expect(() => w.advanceToBoundary(NaN)).toThrow();
  });
  it('resolves swept collisions against moving hitboxes at relative-motion contact time', () => {
    const c = core(),
      w = new WeaponAttacks(c);
    w.setBody('player', { x: 0, y: 0, radius: 0 });
    w.setBody('enemy', { x: 100, y: 0, radius: 5 }, { x: -20, y: 0 });
    w.equipWeapon({
      entityId: 'player',
      characterClass: 'mage',
      weapon: {
        ...TEST_WEAPONS.staff,
        baseAttackInterval: 100,
        projectile: { speed: 100, radius: 5, maxTravelDistance: 500 },
      },
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    });
    w.resolveBoundary();
    const time = w.peekBoundary(10)!.time;
    expect(time).toBeCloseTo(0.75);
    w.advanceToBoundary(time);
    expect(c.getEntity('enemy').currentHp).toBe(100);
    w.setBody('enemy', { x: 100 - time * 20, y: 0, radius: 5 }, { x: -20, y: 0 });
    const hits = w.resolveBoundary().filter((e) => e.type === 'impact');
    expect(hits).toHaveLength(1);
    expect(c.getEntity('enemy').currentHp).toBe(90);
  });
  it('forbids skipping an EnemyAI contact boundary and preserves the old update API', () => {
    const c = core(),
      ai = new EnemyAI(c, AI_OPTIONS);
    ai.registerEnemy({
      entityId: 'enemy',
      position: { x: 0, y: 0 },
      config: { ...ALPHA_ENEMIES.melee, movementSpeed: 0 },
    });
    ai.prepareBoundary({ x: 0, y: 0, radius: 10 });
    expect(ai.peekBoundary(1)?.time).toBe(0);
    expect(() => ai.advanceToBoundary(1)).toThrow(/unresolved/);
    expect(c.getEntity('player').currentHp).toBe(100);
    expect(ai.resolveBoundary().filter((e) => e.type === 'contact-attempt')).toHaveLength(1);
    expect(c.getEntity('player').currentHp).toBe(90);
    expect(ai.resolveBoundary()).toEqual([]);
  });
  it('keeps Status ticks and expiration on their old schedule when stepping one boundary at a time', () => {
    const c = core(),
      s = new StatusEffects(c);
    s.apply({
      sourceId: 'player',
      targetId: 'enemy',
      effectType: 'poison',
      duration: 2,
      probabilityPercent: 100,
      rawDamagePerTick: 3,
    });
    expect(s.peekBoundary(2)?.time).toBe(1);
    expect(() => s.advanceToBoundary(1.5)).toThrow(/unresolved/);
    s.advanceToBoundary(1);
    expect(c.getEntity('enemy').currentHp).toBe(100);
    expect(s.resolveBoundary()[0].type).toBe('status-tick');
    expect(s.resolveBoundary()).toEqual([]);
    expect(s.getGroup('enemy', 'poison')?.nextTickAt).toBe(2);
    s.advanceToBoundary(2);
    expect(s.resolveBoundary()[0].type).toBe('status-tick');
    expect(s.resolveBoundary()[0]).toMatchObject({
      type: 'status-removed',
      reason: 'expired',
      time: 2,
    });
  });
});
describe('world integration edge cases and developer authority', () => {
  it('records periodic player death before a contact attack due at the same time', () => {
    const w = new GameplayWorld({ characterClass: 'mage', initialEnemies: false });
    const id = w.spawnEnemy('melee', 127, 0, { ...ALPHA_ENEMIES.melee, movementSpeed: 100 });
    w.applyEffect({
      sourceId: id,
      targetId: 'player',
      effectType: 'bleed',
      duration: 5,
      rawDamagePerTick: 10000,
      probabilityPercent: 100,
    });
    w.update(10);
    expect(w.time).toBe(1);
    expect(w.getEvents().filter((e) => e.event.type === 'contact-attempt')).toHaveLength(0);
    expect(w.getSnapshot().survival.runState).toBe('awaiting-revival-choice');
  });
  it('keeps a hostile projectile after its source dies, and its eventual impact checks protection', () => {
    const w = new GameplayWorld({ characterClass: 'mage', initialEnemies: false });
    const id = w.spawnEnemy('ranged', 320, 0, { ...ALPHA_ENEMIES.ranged, movementSpeed: 0 });
    w.update(0);
    expect(w.getSnapshot().enemyProjectiles).toHaveLength(1);
    w.clearEnemies();
    expect(w.core.getEntity(id).alive).toBe(false);
    expect(w.getSnapshot().enemyProjectiles).toHaveLength(1);
    w.setPlayerHp(0);
    w.decide('revive');
    const hp = w.core.getEntity('player').currentHp;
    w.update(2);
    expect(w.getSnapshot().enemyProjectiles).toHaveLength(0);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    expect(
      w.getEvents().some((e) => e.event.type === 'enemy-projectile-impact' && e.event.blocked),
    ).toBe(true);
  });
  it('applies no on-hit effect to a killing blow and does not duplicate the kill after later updates', () => {
    const w = new GameplayWorld({ characterClass: 'warrior', level: 50, initialEnemies: false });
    const id = w.spawnEnemy('melee', 60, 0, { ...ALPHA_ENEMIES.melee, movementSpeed: 0 });
    w.update(0);
    expect(w.core.getEntity(id).alive).toBe(false);
    expect(w.statuses.getGroups(id)).toEqual([]);
    expect(w.getSnapshot().kills).toBe(1);
    w.update(5);
    expect(w.getSnapshot().kills).toBe(1);
    expect(w.getSnapshot().enemies).toHaveLength(0);
  });
  it('processes normal-protection DoT and new negative effects without refreshing protection', () => {
    const w = new GameplayWorld({ characterClass: 'mage', initialEnemies: false });
    const id = w.spawnEnemy('melee', 0, 0, {
      ...ALPHA_ENEMIES.melee,
      movementSpeed: 0,
      attackInterval: 0.9,
    });
    w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 10000 });
    w.update(0);
    const until = w.survival.getState().directInvulnerableUntil;
    w.applyEffect({
      sourceId: id,
      targetId: 'player',
      effectType: 'burn',
      duration: 2,
      rawDamagePerTick: 1,
      probabilityPercent: 100,
    });
    expect(w.statuses.getGroup('player', 'burn')).not.toBeNull();
    w.update(1);
    expect(
      w
        .getEvents()
        .some(
          (e) =>
            e.channel === 'combat' &&
            e.event.type === 'periodic-damage' &&
            e.event.targetId === 'player',
        ),
    ).toBe(true);
    expect(w.survival.getState().directInvulnerableUntil).not.toBe(until); // .9 direct hit, not the 1.0 tick.
    expect(w.survival.getState().directInvulnerableUntil).toBeCloseTo(1.2);
  });
  it('rejects invalid developer commands without replacing a valid session or injecting HP', () => {
    let w = new GameplayWorld({ characterClass: 'rogue', initialEnemies: false });
    const old = w;
    const test = createTestingController(
      () => w,
      (options) => {
        const next = new GameplayWorld(options);
        w = next;
      },
    );
    expect(() =>
      test({ type: 'restart', options: { characterClass: 'mage', level: 51 } }),
    ).toThrow();
    expect(w).toBe(old);
    expect(() =>
      test({
        type: 'effect',
        targetId: 'player',
        effectType: 'poison',
        stacks: 3,
        damage: -1,
        duration: 5,
      }),
    ).toThrow();
    expect(w.statuses.getGroups()).toEqual([]);
    test({ type: 'hp', value: 50 });
    expect(w.core.getEntity('player').currentHp).toBe(50);
    test({ type: 'heal' });
    expect(w.core.getEntity('player').currentHp).toBe(w.core.getEntity('player').maxHp);
    test({ type: 'death' });
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    expect(() => test({ type: 'hp', value: 50 })).toThrow(/Dead/);
    test({ type: 'restart', options: { characterClass: 'mage', level: 2, initialEnemies: false } });
    expect(w).not.toBe(old);
    expect(w.core).not.toBe(old.core);
    expect(w.character.characterClass).toBe('mage');
    expect(w.survival.getState().revivalUsed).toBe(false);
    expect(() => test({ type: 'unknown' })).toThrow();
  });
  it('keeps bounded event history and has no reward duplication during repeated cleanup', () => {
    const w = new GameplayWorld({ characterClass: 'warrior', initialEnemies: false });
    for (let i = 0; i < 30; i++) {
      w.spawnGroup(4);
      w.clearEnemies();
    }
    expect(w.getSnapshot().enemies).toHaveLength(0);
    expect(w.getSnapshot().kills).toBe(120);
    expect(w.getEvents()).toHaveLength(160);
    const sequences = w.getEvents().map((e) => e.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);
    w.clearEnemies();
    expect(w.getSnapshot().kills).toBe(120);
  });
});

describe('movement, cancellation and numerical time contracts', () => {
  it('normalizes diagonal input, uses Character Stats speed, clamps arena bounds and never blocks on enemies', () => {
    const straight = new GameplayWorld({ characterClass: 'warrior', initialEnemies: false });
    const diagonal = new GameplayWorld({ characterClass: 'warrior', initialEnemies: false });
    straight.setMovement(1, 0);
    diagonal.setMovement(1, 1);
    straight.update(1);
    diagonal.update(1);
    const a = straight.getSnapshot().playerBody,
      b = diagonal.getSnapshot().playerBody;
    expect(Math.hypot(b.x - 1800, b.y - 1800)).toBeCloseTo(a.x - 1800, 8);
    expect(a.x - 1800).toBeCloseTo(185 * 1.005, 8);
    straight.update(100);
    expect(straight.getSnapshot().playerBody.x).toBe(3600 - 13);
  });
  it('cancels a pending second dagger strike at direct death and never resurrects that pending attack', () => {
    const w = new GameplayWorld({ characterClass: 'rogue', initialEnemies: false });
    w.spawnEnemy('melee', 0, 0, {
      ...ALPHA_ENEMIES.melee,
      movementSpeed: 0,
      attackCoefficient: 10000,
    });
    w.update(10);
    expect(w.time).toBe(0);
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    expect(w.weapons.getWeaponState('player').secondStrikeAt).toBeNull();
    const skips = w.getEvents().filter((e) => e.event.type === 'strike-skipped');
    expect(skips).toHaveLength(1);
    w.decide('revive');
    w.update(0.4);
    expect(w.getEvents().filter((e) => e.event.type === 'attack-started')).toHaveLength(1);
  });
  it('does not allow a newly killed contact enemy to initiate its same-time attack', () => {
    const w = new GameplayWorld({ characterClass: 'warrior', level: 50, initialEnemies: false });
    w.spawnEnemy('melee', 0, 0, { ...ALPHA_ENEMIES.melee, movementSpeed: 0 });
    w.update(0);
    expect(w.getSnapshot().kills).toBe(1);
    expect(w.getEvents().filter((e) => e.event.type === 'contact-attempt')).toHaveLength(0);
  });
  it('keeps DoT active when its enemy source dies', () => {
    const w = new GameplayWorld({ characterClass: 'warrior', initialEnemies: false });
    const id = w.spawnEnemy('melee', 300, 0);
    w.applyEffect({
      sourceId: id,
      targetId: 'player',
      effectType: 'poison',
      duration: 3,
      rawDamagePerTick: 10,
      probabilityPercent: 100,
    });
    w.clearEnemies();
    const before = w.core.getEntity('player').currentHp;
    w.update(1);
    expect(w.core.getEntity('player').currentHp).toBeLessThan(before);
    expect(w.statuses.getGroup('player', 'poison')?.stacks[0].sourceId).toBe(id);
  });
  it('allows repeated zero-delta updates after accumulated floating point correction', () => {
    const w = new GameplayWorld({ characterClass: 'warrior', initialEnemies: false });
    for (let i = 0; i < 3; i++) w.update(0.1);
    const before = w.getSnapshot();
    w.update(0);
    w.update(0);
    expect(w.getSnapshot()).toEqual(before);
    expect(() => w.spawnGroup(3, 1500)).toThrow();
    expect(w.getSnapshot().enemies).toHaveLength(0);
  });
});
