import { segmentCircleIntersection } from '../../src/weapon-attacks';
import { describe, expect, it } from 'vitest';
import { GameplayWorld, ALPHA, ALPHA_ENEMIES } from '../../src/gameplay';
import { RunExperience, runXpCost, XP_RULES } from '../../src/gameplay/experience';
import {
  DEFAULT_SPAWNING,
  spawningSettings,
  offscreenPosition,
  cameraRectangle,
  wavePressure,
} from '../../src/gameplay/spawning';
import { createTestingController } from '../../src/gameplay/testing';
const stationary = { ...ALPHA_ENEMIES.melee, movementSpeed: 0 };
const isolated = (level = 1) =>
  new GameplayWorld({
    characterClass: 'warrior',
    level,
    initialEnemies: false,
    spawning: { enabled: false },
  });
const rewards = (w: GameplayWorld) =>
  w.getEvents().filter((e) => e.event.type === 'enemy-rewarded');
function effect(w: GameplayWorld, sourceId: string, targetId: string, damage: number) {
  w.applyEffect({
    sourceId,
    targetId,
    effectType: 'burn',
    rawDamagePerTick: damage,
    duration: 3,
    probabilityPercent: 100,
  });
}
describe('provisional run XP and persistent crystal piles', () => {
  it('uses a separate documented linear cost and supports exact/multiple level boundaries', () => {
    expect([1, 2, 3].map(runXpCost)).toEqual([20, 30, 40]);
    const xp = new RunExperience();
    xp.grantForTesting(19);
    expect(xp.getState()).toEqual({ level: 1, xp: 19, nextXp: 20, totalXp: 19 });
    xp.grantForTesting(1);
    expect(xp.getState()).toEqual({ level: 2, xp: 0, nextXp: 30, totalXp: 20 });
    xp.grantForTesting(75);
    expect(xp.getState()).toEqual({ level: 4, xp: 5, nextXp: 50, totalXp: 95 });
    expect(Object.isFrozen(xp.getState())).toBe(true);
  });
  it('collects by distance once and keeps all distant XP until approached', () => {
    const xp = new RunExperience();
    xp.drop({ x: 100, y: 0 }, 10);
    xp.drop({ x: 800, y: 0 }, 15);
    expect(xp.collect({ x: 0, y: 0 }, 13)).toEqual([]);
    expect(xp.collect({ x: 40, y: 0 }, 13).filter((e) => e.type === 'xp-collected')).toHaveLength(
      1,
    );
    expect(xp.getState().totalXp).toBe(10);
    xp.collect({ x: 40, y: 0 }, 13);
    expect(xp.getState().totalXp).toBe(10);
    expect(xp.getCrystals()).toHaveLength(1);
    xp.collect({ x: 800, y: 0 }, 13);
    expect(xp.getState().totalXp).toBe(25);
    expect(xp.getCrystals()).toEqual([]);
  });
  it('consolidates same-cell and overflow drops without losing XP or growing beyond 512 crystals', () => {
    const xp = new RunExperience();
    const a = xp.drop({ x: 0, y: 0 }, 10);
    const b = xp.drop({ x: 1, y: 1 }, 15);
    expect(b.id).toBe(a.id);
    expect(b.value).toBe(25);
    expect(a.value).toBe(10);
    for (let i = 1; i < 600; i++) xp.drop({ x: i * 70, y: 0 }, 10);
    expect(xp.getCrystals()).toHaveLength(XP_RULES.crystalCap);
    expect(xp.getCrystals().reduce((sum, c) => sum + c.value, 0)).toBe(25 + 5990);
    expect(Object.isFrozen(xp.getCrystals()[0])).toBe(true);
  });
  it('rejects invalid XP and geometry before changing state', () => {
    const xp = new RunExperience(),
      before = xp.getState();
    for (const bad of [-1, NaN, Infinity, 0.5]) expect(() => xp.grantForTesting(bad)).toThrow();
    for (const bad of [0, -1, 1.2, NaN]) expect(() => runXpCost(bad)).toThrow();
    expect(() => xp.drop({ x: NaN, y: 0 }, 10)).toThrow();
    expect(() => xp.collect({ x: 0, y: 0 }, -1)).toThrow();
    expect(xp.getState()).toEqual(before);
  });
});
describe('authoritative death rewards, attribution and run progression', () => {
  it('drops exactly one reward for a direct death, then levels by collection without changing permanent stats', () => {
    const w = isolated(50),
      player = w.core.getEntity('player'),
      character = w.character;
    // Task 10 §1.3: melee crystals are worth 8 (was 10); three kills still pass level 2 (cost 20).
    for (let i = 0; i < 3; i++) w.spawnEnemy('melee', 30, 0, stationary);
    w.update(0);
    expect(w.getSnapshot().kills).toBe(3);
    expect(rewards(w)).toHaveLength(3);
    expect(w.getSnapshot().progression.totalXp).toBe(0);
    expect(w.getSnapshot().crystals.reduce((s, c) => s + c.value, 0)).toBe(24);
    w.update(1 / 60);
    expect(w.getSnapshot().progression).toEqual({ level: 2, xp: 4, nextXp: 30, totalXp: 24 });
    expect(w.core.getEntity('player')).toBe(player);
    expect(w.character).toBe(character);
    expect(w.character.permanentLevel).toBe(50);
    w.clearEnemies();
    w.update(1);
    expect(rewards(w)).toHaveLength(3);
  });
  it('credits a lethal DoT tick once, using positive contributors even if Core representative source is another enemy', () => {
    const w = isolated();
    const source = w.spawnEnemy('melee', 1100, 0, stationary),
      target = w.spawnEnemy('melee', 1000, 0, stationary);
    effect(w, source, target, 200);
    effect(w, 'player', target, 1);
    w.update(1);
    const reward = rewards(w)[0].event;
    expect(reward).toMatchObject({
      type: 'enemy-rewarded',
      enemyId: target,
      sourceId: source,
      cause: 'periodic',
      effectId: 'burn',
      xp: XP_RULES.meleeReward,
      contributors: [source, 'player'],
    });
    expect(w.getSnapshot().kills).toBe(1);
    expect(w.getSnapshot().crystals[0]).toMatchObject({
      x: 2800,
      y: 1800,
      value: XP_RULES.meleeReward,
    });
    w.update(20);
    expect(w.getSnapshot().kills).toBe(1);
    expect(rewards(w)).toHaveLength(1);
    expect(w.getSnapshot().crystals).toHaveLength(1);
  });
  it.each([0, undefined])(
    'gives no player reward for enemy-only lethal contributions (player raw %s)',
    (raw) => {
      const w = isolated();
      const source = w.spawnEnemy('melee', 1100, 0, stationary),
        target = w.spawnEnemy('melee', 1000, 0, stationary);
      effect(w, source, target, 200);
      if (raw !== undefined) effect(w, 'player', target, raw);
      w.update(1);
      expect(w.core.getEntity(target).alive).toBe(false);
      expect(w.getSnapshot().kills).toBe(0);
      expect(w.getSnapshot().crystals).toEqual([]);
      expect(rewards(w)).toEqual([]);
    },
  );
  it('preserves crystals and run XP across pause/revival; ended and fresh runs do not collect/inherit rewards', () => {
    const w = isolated();
    w.grantTestXp(25);
    w.spawnEnemy('melee', 500, 0, stationary);
    w.clearEnemies();
    w.setPaused(true);
    const paused = w.getSnapshot();
    w.update(100);
    expect(w.getSnapshot()).toEqual(paused);
    w.setPlayerHp(0);
    const dead = w.getSnapshot();
    w.update(100);
    expect(w.getSnapshot()).toEqual(dead);
    w.decide('revive');
    expect(w.getSnapshot().crystals).toEqual(dead.crystals);
    expect(w.getSnapshot().progression).toEqual(dead.progression);
    w.setPlayerHp(0);
    const ended = w.getSnapshot();
    w.update(100);
    expect(w.getSnapshot()).toEqual(ended);
    expect(isolated().getSnapshot().progression).toEqual({
      level: 1,
      xp: 0,
      totalXp: 0,
      nextXp: 20,
    });
  });
  it('preserves both rewards and player death at the same timestamp; dead player cannot collect', () => {
    const w = isolated(),
      id = w.spawnEnemy('melee', 30, 0, stationary);
    // Avoid early sword damage; both deaths are due on the first periodic tick.
    w.weapons.setAttackSpeed('player', 1);
    w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 10000 });
    effect(w, 'player', id, 100000);
    effect(w, id, 'player', 100000);
    w.update(10);
    expect(w.time).toBe(1);
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    expect(w.getSnapshot().kills).toBe(1);
    expect(w.getSnapshot().crystals[0].value).toBe(XP_RULES.meleeReward);
    expect(w.getSnapshot().progression.totalXp).toBe(0);
  });
});
describe('off-screen placement and provisional pressure', () => {
  it('increases batch size and lowers interval, bounded by configuration', () => {
    expect(wavePressure(0, DEFAULT_SPAWNING)).toMatchObject({ count: 3, interval: 4 });
    expect(wavePressure(30, DEFAULT_SPAWNING)).toMatchObject({ count: 4, interval: 3.65 });
    expect(wavePressure(3000, DEFAULT_SPAWNING)).toMatchObject({ count: 8, interval: 1.5 });
  });
  it.each([
    { x: 1800, y: 1800 },
    { x: 13, y: 13 },
    { x: 3587, y: 3587 },
    { x: 13, y: 1800 },
  ])('stays outside the clamped camera and within world boundaries at $x,$y', (player) => {
    const viewport = { width: 1440, height: 850 },
      rect = cameraRectangle(player, viewport);
    let seed = 1;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 100; i++) {
      const p = offscreenPosition(player, viewport, 15, DEFAULT_SPAWNING, rand)!;
      expect(p.x).toBeGreaterThanOrEqual(15);
      expect(p.x).toBeLessThanOrEqual(ALPHA.arenaSize - 15);
      expect(p.y).toBeGreaterThanOrEqual(15);
      expect(p.y).toBeLessThanOrEqual(ALPHA.arenaSize - 15);
      expect(
        p.x <= rect.left - 79 ||
          p.x >= rect.right + 79 ||
          p.y <= rect.top - 79 ||
          p.y >= rect.bottom + 79,
      ).toBe(true);
    }
  });
  it('skips impossible off-screen placements without an unbounded search', () => {
    expect(
      offscreenPosition(
        { x: 1800, y: 1800 },
        { width: 4000, height: 4000 },
        15,
        DEFAULT_SPAWNING,
        () => 0.5,
      ),
    ).toBeNull();
    const w = new GameplayWorld({
      characterClass: 'mage',
      viewport: { width: 4000, height: 4000 },
    });
    w.update(20);
    expect(w.getSnapshot().enemies).toEqual([]);
    expect(w.getSnapshot().spawning.waves).toBe(5);
  });
  it.each([
    { interval: 0 },
    { count: 0 },
    { maximumCount: 25 },
    { maxActive: 121 },
    { enabled: 1 },
    { margin: -1 },
    { pressurePeriod: NaN },
  ])('rejects invalid settings %j', (settings) => {
    expect(() => spawningSettings(settings as never)).toThrow();
  });
});
describe('continuous waves on the shared world timeline', () => {
  it('spawns both kinds repeatedly at exact deadlines, bounded by active cap', () => {
    const w = new GameplayWorld({
      characterClass: 'warrior',
      initialEnemies: false,
      spawning: {
        interval: 1,
        minimumInterval: 1,
        count: 3,
        maximumCount: 3,
        maxActive: 3,
        rangedShare: 1 / 3,
      },
    });
    w.setTestProtection(true);
    w.update(0.99);
    expect(w.getSnapshot().enemies).toHaveLength(0);
    w.update(0.01);
    expect(w.getSnapshot().enemies).toHaveLength(3);
    expect(new Set(w.getSnapshot().enemies.map((e) => e.config.behavior)).size).toBe(2);
    for (let i = 0; i < 20; i++) {
      w.update(1);
      // Task 07: collected crystals can level up the run, which pauses for a skill choice.
      while (w.run.currentOffer) {
        const card = w.run.currentOffer.cards[0];
        w.chooseSkill(card.kind === 'skill' ? card.skillId : `bonus:${card.bonusId}`);
        w.update(Math.ceil(w.time) - w.time);
      }
      expect(w.getSnapshot().enemies.length).toBeLessThanOrEqual(3);
    }
    expect(w.getSnapshot().spawning.waves).toBe(21);
    expect(w.getSnapshot().spawning.nextSpawnAt).toBe(22);
    w.clearEnemies();
    w.update(1);
    expect(w.getSnapshot().enemies.length).toBeGreaterThan(0);
  });
  it('keeps the schedule through manual pause and revival and stops after ending', () => {
    const w = new GameplayWorld({ characterClass: 'warrior', initialEnemies: false });
    w.update(1);
    const next = w.getSnapshot().spawning.nextSpawnAt;
    w.setPaused(true);
    w.update(100);
    expect(w.time).toBe(1);
    expect(w.getSnapshot().spawning.nextSpawnAt).toBe(next);
    w.setPlayerHp(0);
    w.update(100);
    w.decide('revive');
    expect(w.getSnapshot().spawning.nextSpawnAt).toBe(next);
    w.update(2.9);
    expect(w.getSnapshot().enemies).toHaveLength(0);
    w.update(0.1);
    expect(w.getSnapshot().spawning.waves).toBe(1);
    w.setPlayerHp(0);
    const end = w.getSnapshot();
    w.update(100);
    expect(w.getSnapshot()).toEqual(end);
  });
  it('does not spawn a wave due at the exact periodic player-death time', () => {
    const w = new GameplayWorld({
      characterClass: 'warrior',
      initialEnemies: false,
      spawning: { interval: 1, minimumInterval: 1 },
    });
    effect(w, 'player', 'player', 10000);
    w.update(30);
    expect(w.time).toBe(1);
    expect(w.getSnapshot().spawning.waves).toBe(0);
    expect([w.weapons.time, w.statuses.time, w.enemies.time, w.survival.time]).toEqual([
      1, 1, 1, 1,
    ]);
    w.decide('revive');
    w.update(0);
    expect(w.getSnapshot().spawning.waves).toBe(1);
  });
  it('produces deterministic spawns, rewards and XP under large versus small deltas', () => {
    const a = new GameplayWorld({ characterClass: 'mage', viewport: { width: 320, height: 240 } });
    const b = new GameplayWorld({ characterClass: 'mage', viewport: { width: 320, height: 240 } });
    for (const w of [a, b]) {
      w.setTestProtection(true);
      w.setMovement(1, 0.25);
    }
    a.update(20);
    for (let i = 0; i < 1200; i++) b.update(1 / 60);
    const x = a.getSnapshot(),
      y = b.getSnapshot();
    expect(x.progression).toEqual(y.progression);
    expect(x.kills).toBe(y.kills);
    expect(x.spawning.waves).toBe(y.spawning.waves);
    expect(x.spawning.nextSpawnAt).toBeCloseTo(y.spawning.nextSpawnAt, 10);
    expect(x.player).toEqual(y.player);
    expect(x.enemies.map((e) => e.entityId)).toEqual(y.enemies.map((e) => e.entityId));
    x.enemies.forEach((e, i) => {
      expect(e.position.x).toBeCloseTo(y.enemies[i].position.x, 7);
      expect(e.entity).toEqual(y.enemies[i].entity);
    });
    expect(x.crystals.map((c) => c.value)).toEqual(y.crystals.map((c) => c.value));
  });
  it('sustains five simulated minutes with bounded active actors/crystals/history', () => {
    const w = new GameplayWorld({
      characterClass: 'mage',
      level: 50,
      viewport: { width: 320, height: 240 },
      spawning: { maxActive: 12 },
    });
    w.setTestProtection(true);
    for (let i = 0; i < 60; i++) {
      w.update(5);
      expect(w.getSnapshot().enemies.length).toBeLessThanOrEqual(12);
    }
    expect(w.time).toBe(300);
    expect(w.getSnapshot().spawning.waves).toBeGreaterThan(80);
    expect(w.getSnapshot().kills).toBeGreaterThan(100);
    expect(w.getSnapshot().crystals.length).toBeLessThanOrEqual(512);
    expect(w.getEvents().length).toBeLessThanOrEqual(160);
  });
  it('validates DEV wave/XP controls atomically and can disable/resume continuous spawning', () => {
    const w = isolated();
    const test = createTestingController(
      () => w,
      () => {},
    );
    test({ type: 'grant-xp', amount: 55 });
    expect(w.getSnapshot().progression.level).toBe(3);
    // Task 07: two queued level-up choices pause the world until resolved.
    expect(w.getSnapshot().skills.pendingChoices).toBe(2);
    expect(w.paused).toBe(true);
    for (let i = 0; i < 2; i++) {
      const card = w.run.currentOffer!.cards[0];
      test({
        type: 'choose-skill',
        card: card.kind === 'skill' ? card.skillId : `bonus:${card.bonusId}`,
      });
    }
    expect(w.paused).toBe(false);
    test({ type: 'xp-crystal', value: 10, distance: 90 });
    expect(w.getSnapshot().crystals).toHaveLength(1);
    const previous = w.getSnapshot();
    expect(() => test({ type: 'grant-xp', amount: Infinity })).toThrow();
    expect(() => test({ type: 'spawning', settings: { maxActive: 0 } })).toThrow();
    expect(w.getSnapshot()).toEqual(previous);
    test({ type: 'spawning', settings: { enabled: true, interval: 1, minimumInterval: 1 } });
    w.update(1);
    expect(w.getSnapshot().spawning.waves).toBe(1);
    test({ type: 'spawning', settings: { enabled: false } });
    const count = w.getSnapshot().spawning.waves;
    w.setTestProtection(true);
    w.update(2);
    expect(w.getSnapshot().spawning.waves).toBe(count);
  });
});

it('uses consistent contact-distance tolerance for zero-length and long swept segments', () => {
  const p = { x: 373 + 5e-10, y: 0 };
  expect(segmentCircleIntersection(p, p, { x: 0, y: 0 }, 373)).toBe(0);
  expect(segmentCircleIntersection(p, { x: 0, y: 0 }, { x: 0, y: 0 }, 373)).toBe(0);
});
