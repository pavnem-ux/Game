import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import { ACTIVITY_RULES, RunActivities, activityGold } from '../../src/gameplay/activities';
import { lcgStream } from '../../src/gameplay/rng';
import { createProfile, applyRunResult } from '../../src/profile';
import { runOre } from '../../src/equipment';
import { activityEvents, step } from './activity-helpers';

function world(seed = 1, mapId = 1, maxActive = 120) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed,
    initialEnemies: false,
    spawning: { enabled: false, maxActive },
    onHit: [],
    campaign: { mapId },
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01);
  return w;
}
const activity = (w: GameplayWorld, id: string) =>
  w.getSnapshot().activities!.items.find((a) => a.id === id) ?? null;
/** Walks the player to `target` through normal input (stops within `within`). */
function walkTo(
  w: GameplayWorld,
  target: { x: number; y: number },
  within = 5,
  sink: WorldEvent[] = [],
) {
  for (let i = 0; i < 2000; i++) {
    const p = w.getSnapshot().playerBody;
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    if (d <= within) break;
    w.setMovement((target.x - p.x) / d, (target.y - p.y) / d);
    step(w, 1 / 60, 1 / 60, sink);
  }
  w.setMovement(0, 0);
  return sink;
}

describe('Task 24 Phase 2 — Shrine of Embers', () => {
  it('9 s inside captures it; completion is an exact boundary; reward: one enchanted chest at the shrine', () => {
    const w = world(3);
    const id = w.debugSpawnActivity('shrine')!;
    const s = activity(w, id)!;
    const sink = walkTo(w, s); // centre of the shrine
    const started = activityEvents(sink, 'activity-started');
    expect(started).toHaveLength(1);
    const enteredAt = started[0].time;
    const events = step(w, 10, 0.25);
    const done = activityEvents(events, 'activity-completed');
    expect(done).toHaveLength(1);
    expect(done[0].time).toBeCloseTo(enteredAt + ACTIVITY_RULES.shrine.captureTime, 9);
    const rewards = activityEvents(events, 'activity-reward');
    expect(rewards).toHaveLength(1);
    expect(rewards[0].event).toMatchObject({
      activityType: 'shrine',
      chest: 'enchanted',
      coins: 0,
      ore: 0,
    });
    const chests = events.filter((e) => e.channel === 'chests' && e.event.type === 'chest-spawned');
    expect(chests).toHaveLength(1);
    const chest = (chests[0].event as { chest: { x: number; y: number; type: string } }).chest;
    expect(chest).toMatchObject({ x: s.x, y: s.y, type: 'enchanted' });
    expect(w.getSnapshot().runStats.activities.completed.shrine).toBe(1);
    // Nothing more is paid later.
    expect(activityEvents(step(w, 5), 'activity-reward')).toHaveLength(0);
  });
  it('outside, progress decays at half speed; decaying back to 0 fails it (abandoned)', () => {
    const a = new RunActivities(lcgStream(1), 3600);
    const e = a.spawnNear(
      0,
      { player: { x: 1800, y: 1800 }, mapId: 1, chests: [], enemySlotFree: true },
      'shrine',
    );
    const s = e.type === 'activity-spawned' ? e.activity : null!;
    const inside = { player: { x: s.x, y: s.y }, enemiesNear: () => 0 };
    const outside = { player: { x: s.x + 500, y: s.y }, enemiesNear: () => 0 };
    a.sample(10, inside);
    a.sample(14, outside); // 4 s captured
    expect(a.getActivity(s.id, 14)!.progress).toBeCloseTo(4 / 9, 9);
    expect(a.getActivity(s.id, 16)!.progress).toBeCloseTo(3 / 9, 9); // -0.5/s for 2 s
    a.sample(16, inside); // 3 s left of 9 → completes 6 s later
    expect(a.nextResolveAt()).toBeCloseTo(22, 9);
    a.sample(17, outside); // 4 s of progress, decays to 0 in 8 s
    expect(a.nextResolveAt()).toBeCloseTo(25, 9);
    const out = a.resolveDue(25);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'activity-failed', reason: 'abandoned' });
  });
  it('one extra enemy every 1.5 s only while the player is inside, never above the active cap', () => {
    const w = world(4, 1, 3); // tiny cap: the shrine's spawns must stop at it
    const id = w.debugSpawnActivity('shrine')!;
    const sink = walkTo(w, activity(w, id)!);
    const enteredAt = activityEvents(sink, 'activity-started')[0].time;
    const events = step(w, 7, 0.25);
    const spawns = activityEvents(events, 'activity-enemy-spawned');
    expect(spawns.map((e) => e.time)).toEqual(
      [1, 2, 3, 4].map((k) => expect.closeTo(enteredAt + k * 1.5, 9)),
    );
    expect(spawns.filter((e) => e.event.enemyId !== null)).toHaveLength(3); // cap 3
    expect(spawns[3].event.enemyId).toBeNull();
    for (const s of spawns.filter((e) => e.event.position)) {
      const d = Math.hypot(
        s.event.position!.x - activity(w, id)!.x,
        s.event.position!.y - activity(w, id)!.y,
      );
      expect(d).toBeGreaterThanOrEqual(250 - 1e-9);
      expect(d).toBeLessThanOrEqual(350 + 1e-9);
    }
    expect(w.getSnapshot().enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(3);
    // Leaving stops the spawns.
    const p = w.getSnapshot().playerBody;
    walkTo(w, { x: p.x + 200, y: p.y });
    const after = step(w, 4, 0.25);
    expect(activityEvents(after, 'activity-enemy-spawned')).toHaveLength(0);
  });
});

describe('Task 24 Phase 2 — Treasure Thief', () => {
  it('spawns 350 from the player as a fleeing, non-attacking enemy with 6× melee HP', () => {
    const w = world(2);
    const id = w.debugSpawnActivity('thief')!;
    const a = activity(w, id)!;
    expect(a.enemyId).not.toBeNull();
    const p = w.getSnapshot().playerBody;
    expect(Math.hypot(a.x - p.x, a.y - p.y)).toBeCloseTo(350, 6);
    const enemy = w.getSnapshot().enemies.find((e) => e.entityId === a.enemyId)!;
    expect(enemy.config.behavior).toBe('flee');
    expect(enemy.config.movementSpeed).toBeCloseTo(185 * 0.95, 9);
    const melee = w.core.getEntity(
      w.spawnEnemy('melee', 600, 0), // a normal melee enemy of the same map for reference
    );
    expect(w.core.getEntity(a.enemyId!).maxHp).toBeCloseTo(melee.maxHp * 6, 9);
    // It runs away: the distance grows while the player stands still; it never attacks.
    const d0 = Math.hypot(enemy.position.x - p.x, enemy.position.y - p.y);
    const events = step(w, 3, 0.25);
    const now = w.getSnapshot().enemies.find((e) => e.entityId === a.enemyId)!;
    expect(Math.hypot(now.position.x - p.x, now.position.y - p.y)).toBeGreaterThan(d0 + 300);
    expect(
      events.some(
        (e) => e.channel === 'enemy' && 'sourceId' in e.event && e.event.sourceId === a.enemyId,
      ),
    ).toBe(false);
  });
  it('the flight path is deterministic and stays inside the arena (steering off the edges)', () => {
    const path = (seed: number) => {
      const w = world(seed);
      const id = w.debugSpawnActivity('thief')!;
      const enemyId = activity(w, id)!.enemyId!;
      const out: [number, number][] = [];
      for (let i = 0; i < 19; i++) {
        step(w, 1, 0.25);
        const e = w.getSnapshot().enemies.find((x) => x.entityId === enemyId);
        if (!e) break;
        out.push([e.position.x, e.position.y]);
        expect(e.position.x).toBeGreaterThanOrEqual(0);
        expect(e.position.y).toBeGreaterThanOrEqual(0);
        expect(e.position.x).toBeLessThanOrEqual(3600);
        expect(e.position.y).toBeLessThanOrEqual(3600);
      }
      return out;
    };
    const a = path(11);
    expect(a.length).toBe(19);
    expect(path(11)).toEqual(a);
  });
  it('escapes 20 s after spawning: no reward, no kill, removal not counted as damage', () => {
    const w = world(5);
    const id = w.debugSpawnActivity('thief')!;
    const spawnedAt = activity(w, id)!.spawnedAt;
    const enemyId = activity(w, id)!.enemyId!;
    const events = step(w, 21, 0.25);
    const failed = activityEvents(events, 'activity-failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].time).toBeCloseTo(spawnedAt + 20, 9);
    expect(failed[0].event.reason).toBe('escaped');
    expect(w.core.getEntity(enemyId).alive).toBe(false);
    expect(w.getSnapshot().enemies.some((e) => e.entityId === enemyId)).toBe(false);
    expect(activityEvents(events, 'activity-reward')).toHaveLength(0);
    expect(
      events.some((e) => e.channel === 'progression' && e.event.type === 'enemy-rewarded'),
    ).toBe(false);
    expect(w.getSnapshot().kills).toBe(0);
    // Only real hits count (the mage may hit it while it runs); the removal itself is not damage.
    expect(w.getSnapshot().runStats.damageDealt).toBeLessThan(w.core.getEntity(enemyId).maxHp);
    expect(w.getSnapshot().runStats.activities.failed.thief).toBe(1);
  });
  it('killed: a coin burst worth 8% of the map victory Gold (6 piles), rewarded once', () => {
    const w = world(6, 12);
    const id = w.debugSpawnActivity('thief')!;
    const enemyId = activity(w, id)!.enemyId!;
    const sink: WorldEvent[] = [];
    let seq = w.getEvents().at(-1)!.sequence;
    w.debugKillInView({ x: 0, y: 0, width: 3600, height: 3600 });
    sink.push(...w.getEvents(seq));
    seq = sink.at(-1)!.sequence;
    expect(w.core.getEntity(enemyId).alive).toBe(false);
    const done = activityEvents(sink, 'activity-completed');
    expect(done).toHaveLength(1);
    const reward = activityEvents(sink, 'activity-reward');
    expect(reward).toHaveLength(1);
    const gold = activityGold('thief', w.campaignMap!.victoryGold);
    expect(gold).toBe(Math.round(w.campaignMap!.victoryGold * 0.08));
    expect(reward[0].event.coins).toBe(gold);
    // The burst = 6 piles summing to the reward (plus the thief's own normal kill coin, if any).
    const drops = sink.filter(
      (e) => e.channel === 'progression' && e.event.type === 'coins-dropped',
    );
    const burst = drops.slice(-6).map((e) => (e.event as { amount: number }).amount);
    expect(burst.reduce((a, b) => a + b, 0)).toBe(gold);
    expect(w.getSnapshot().runStats.activities.completed.thief).toBe(1);
    expect(activityEvents(step(w, 25), 'activity-reward')).toHaveLength(0);
  });
  it('the +1 Ore roll is seeded (~20%) and the same seed gives the same result', () => {
    const ore = (seed: number) => {
      const w = world(seed);
      w.debugSpawnActivity('thief');
      w.debugKillInView({ x: 0, y: 0, width: 3600, height: 3600 });
      return w.getSnapshot().activities!.ore;
    };
    const results = Array.from({ length: 60 }, (_, i) => ore(100 + i));
    const hits = results.filter((o) => o === 1).length;
    expect(results.every((o) => o === 0 || o === 1)).toBe(true);
    expect(hits).toBeGreaterThan(3);
    expect(hits).toBeLessThan(24);
    expect(Array.from({ length: 60 }, (_, i) => ore(100 + i))).toEqual(results);
  });
});

describe('Task 24 Phase 2 — banked activity Ore is paid only with a victory', () => {
  const base = {
    runId: 'r1',
    mapId: 1,
    characterClass: 'mage' as const,
    elapsed: 600,
    kills: 10,
    eliteKills: 0,
    bossKilled: true,
    runLevel: 5,
    coins: 10,
    activityOre: 3,
  };
  it('victory: map Ore + activity Ore; defeat: nothing', () => {
    const p = createProfile('p', '2026-11-15T10:00:00.000Z');
    const win = applyRunResult(p, { ...base, outcome: 'victory' }, '2026-11-15T10:10:00.000Z');
    expect(win.summary.oreGained).toBe(runOre('victory', 1, true) + 3);
    expect(win.profile.ore).toBe(runOre('victory', 1, true) + 3);
    const loss = applyRunResult(
      p,
      { ...base, runId: 'r2', outcome: 'defeat' },
      '2026-11-15T10:10:00.000Z',
    );
    expect(loss.summary.oreGained).toBe(0);
    expect(() =>
      applyRunResult(
        p,
        { ...base, runId: 'r3', outcome: 'victory', activityOre: -1 },
        '2026-11-15T10:10:00.000Z',
      ),
    ).toThrow(RangeError);
  });
});
