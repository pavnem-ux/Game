import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import {
  ACTIVITY_RULES,
  RunActivities,
  activityGold,
  lanternOre,
} from '../../src/gameplay/activities';
import type { ActivityEvent } from '../../src/gameplay/activities';
import { lcgStream } from '../../src/gameplay/rng';
import { enemyConfig } from '../../src/enemy-ai/validation';
import { activityEvents, step } from './activity-helpers';

function world(seed = 1, mapId = 15, maxActive = 120) {
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
const spawnedLantern = (a: RunActivities) => {
  const e = a.spawnNear(
    0,
    { player: { x: 1800, y: 1800 }, mapId: 15, chests: [], enemySlotFree: true },
    'lantern',
  );
  return (e as Extract<ActivityEvent, { type: 'activity-spawned' }>).activity;
};

describe('Task 24 Phase 3 — Dying Lantern (module timing)', () => {
  it('activation: 1 s within 60 units; leaving resets; then 100 Light and a 30 s defence', () => {
    const a = new RunActivities(lcgStream(1), 3600);
    const l = spawnedLantern(a);
    const at = (dx: number) => ({ player: { x: l.x + dx, y: l.y }, enemiesNear: () => 0 });
    a.sample(2, at(59));
    a.sample(2.6, at(61)); // left after 0.6 s → reset
    expect(a.getActivity(l.id, 2.6)!.progress).toBe(0);
    a.sample(3, at(10));
    expect(a.nextResolveAt()).toBeCloseTo(4, 9);
    const started = a.resolveDue(4);
    expect(started.map((e) => e.type)).toEqual(['activity-started']);
    const s = a.getActivity(l.id, 4)!;
    expect(s.phase).toBe('active');
    expect(s.light).toBe(100);
    expect(s.endsAt).toBe(34);
    expect(s.fadesAt).toBeNull();
  });
  it('each enemy within 70 drains 2 Light/s; 0 Light fails it; survives to 30 s with Light left', () => {
    const a = new RunActivities(lcgStream(2), 3600);
    const l = spawnedLantern(a);
    const near = (n: number) => ({ player: { x: l.x, y: l.y }, enemiesNear: () => n });
    a.sample(0, near(0));
    a.resolveDue(a.nextResolveAt()!); // activated at 1
    a.sample(1, near(3)); // −6/s
    expect(a.getActivity(l.id, 6)!.light).toBeCloseTo(70, 9);
    a.sample(6, near(10)); // −20/s → 0 at 9.5
    expect(a.nextResolveAt()).toBeCloseTo(9.5, 9);
    const out = a.resolveDue(9.5);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'activity-failed', reason: 'light' });
    expect(a.litLanterns()).toHaveLength(0);

    const b = new RunActivities(lcgStream(3), 3600);
    const m = spawnedLantern(b);
    b.sample(0, { player: { x: m.x, y: m.y }, enemiesNear: () => 0 });
    b.resolveDue(b.nextResolveAt()!);
    b.sample(1, { player: { x: m.x, y: m.y }, enemiesNear: () => 1 }); // 2/s × 30 s = 60
    expect(b.nextResolveAt()).toBeCloseTo(31, 9);
    const ok = b.resolveDue(31);
    expect(ok[0].type).toBe('activity-completed');
    expect(b.litLanterns()).toEqual([{ x: m.x, y: m.y }]);
  });
  it('the 45 s fade applies only until activation', () => {
    const a = new RunActivities(lcgStream(4), 3600);
    const l = spawnedLantern(a);
    a.sample(1, { player: { x: 0, y: 0 }, enemiesNear: () => 0 });
    expect(a.nextResolveAt()).toBe(45);
    expect(a.resolveDue(45).map((e) => e.type)).toEqual(['activity-faded']);
    void l;
  });
});

describe('Task 24 Phase 3 — Dying Lantern (world)', () => {
  it('defended: coins 6% of victory Gold + Ore (1 on maps 11–20, 2 on 21–40), stays lit', () => {
    for (const mapId of [15, 30]) {
      const w = world(7, mapId, 1); // a single enemy slot: at most 2 Light/s of drain
      const id = w.debugSpawnActivity('lantern')!;
      walkTo(w, activity(w, id)!);
      const events = step(w, 32, 0.25);
      const started = activityEvents(events, 'activity-started');
      expect(started.length).toBeLessThanOrEqual(1);
      const done = activityEvents(events, 'activity-completed');
      expect(done).toHaveLength(1);
      const reward = activityEvents(events, 'activity-reward');
      expect(reward).toHaveLength(1);
      expect(reward[0].event.coins).toBe(activityGold('lantern', w.campaignMap!.victoryGold));
      expect(reward[0].event.coins).toBe(Math.round(w.campaignMap!.victoryGold * 0.06));
      expect(reward[0].event.ore).toBe(mapId >= 21 ? 2 : 1);
      expect(lanternOre(mapId)).toBe(mapId >= 21 ? 2 : 1);
      expect(w.getSnapshot().activities!.ore).toBe(mapId >= 21 ? 2 : 1);
      expect(w.getSnapshot().activities!.litLanterns).toHaveLength(1);
      expect(w.getSnapshot().activities!.items).toHaveLength(0);
      // Extra enemies every 2 s during the defence, 300–400 from the lantern (within the cap).
      const spawns = activityEvents(events, 'activity-enemy-spawned');
      expect(spawns.length).toBe(14); // +2 … +28 s; at +30 s the completion (8.7) resolves first
      for (const s of spawns.filter((e) => e.event.position)) {
        const lantern = done[0].event.activity;
        const d = Math.hypot(s.event.position!.x - lantern.x, s.event.position!.y - lantern.y);
        expect(d).toBeGreaterThanOrEqual(300 - 1e-9);
        expect(d).toBeLessThanOrEqual(400 + 1e-9);
      }
      expect(w.getSnapshot().enemies.filter((e) => e.alive).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('Task 24 Phase 3 — Blight Nest', () => {
  it('stationary enemy with 25× melee HP; spawns one enemy within 120 every 3 s within the cap', () => {
    const w = world(8, 25, 4);
    const id = w.debugSpawnActivity('nest')!;
    const a = activity(w, id)!;
    const nestId = a.enemyId!;
    const melee = w.core.getEntity(w.spawnEnemy('melee', 900, Math.PI));
    expect(w.core.getEntity(nestId).maxHp).toBeCloseTo(melee.maxHp * 25, 9);
    const pos0 = w.getSnapshot().enemies.find((e) => e.entityId === nestId)!.position;
    const events = step(w, 10, 0.25);
    const pos1 = w.getSnapshot().enemies.find((e) => e.entityId === nestId)!.position;
    expect(pos1).toEqual(pos0);
    const spawns = activityEvents(events, 'activity-enemy-spawned');
    expect(spawns.map((s) => s.time)).toEqual(
      [3, 6, 9].map((k) => expect.closeTo(a.spawnedAt + k, 9)),
    );
    // Cap 4: nest + reference melee + 2 spawns; the third is skipped.
    expect(spawns.map((s) => s.event.enemyId !== null)).toEqual([true, true, false]);
    for (const s of spawns.filter((e) => e.event.position))
      expect(Math.hypot(s.event.position!.x - a.x, s.event.position!.y - a.y)).toBeLessThanOrEqual(
        120 + 1e-9,
      );
    // It never attacks.
    expect(
      events.some(
        (e) => e.channel === 'enemy' && 'sourceId' in e.event && e.event.sourceId === nestId,
      ),
    ).toBe(false);
  });
  it('immune to Slow and Stun; DoTs still apply', () => {
    const w = world(9, 25);
    const nestId = activity(w, w.debugSpawnActivity('nest')!)!.enemyId!;
    w.skills.slow(nestId, 0.4, 3);
    expect(w.skills.stun(nestId, 1)).toBe(false);
    expect(w.getSnapshot().enemies.find((e) => e.entityId === nestId)!.control).toBeUndefined();
    const other = w.spawnEnemy('melee', 300, 0);
    w.skills.slow(other, 0.4, 3);
    expect(w.getSnapshot().enemies.find((e) => e.entityId === other)!.control).toBeDefined();
    const hp = w.core.getEntity(nestId).currentHp;
    w.applyEffect({
      targetId: nestId,
      sourceId: 'player',
      effectType: 'poison',
      probabilityPercent: 100,
      duration: 3,
      rawDamagePerTick: 5,
    });
    step(w, 3, 0.25);
    expect(w.core.getEntity(nestId).currentHp).toBeLessThan(hp);
  });
  it('crumbles after 90 s without reward', () => {
    const w = world(10, 25, 2);
    const id = w.debugSpawnActivity('nest')!;
    const a = activity(w, id)!;
    const events = step(w, 91, 0.5);
    const failed = activityEvents(events, 'activity-failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].time).toBeCloseTo(a.spawnedAt + 90, 9);
    expect(failed[0].event.reason).toBe('expired');
    expect(w.core.getEntity(a.enemyId!).alive).toBe(false);
    expect(activityEvents(events, 'activity-reward')).toHaveLength(0);
    // No more spawns after it crumbled.
    expect(activityEvents(step(w, 6), 'activity-enemy-spawned')).toHaveLength(0);
  });
  it('destroyed: one wooden chest at the nest', () => {
    const w = world(11, 25);
    const id = w.debugSpawnActivity('nest')!;
    const a = activity(w, id)!;
    const seq = w.getEvents().at(-1)!.sequence;
    w.debugKillInView({ x: 0, y: 0, width: 3600, height: 3600 });
    const events = w.getEvents(seq);
    const reward = activityEvents(events, 'activity-reward');
    expect(reward).toHaveLength(1);
    expect(reward[0].event).toMatchObject({ activityType: 'nest', chest: 'wooden' });
    const chests = events.filter((e) => e.channel === 'chests' && e.event.type === 'chest-spawned');
    expect(chests).toHaveLength(1);
    expect((chests[0].event as { chest: { x: number; y: number } }).chest).toMatchObject({
      x: a.x,
      y: a.y,
      type: 'wooden',
    });
    expect(w.getSnapshot().runStats.activities.completed.nest).toBe(1);
  });
});

describe('Task 24 — enemy-ai flee / stationary validation', () => {
  const base = {
    movementSpeed: 100,
    radius: 15,
    attackInterval: 1,
    attackCoefficient: 0,
    damageType: 'physical' as const,
  };
  it('flee needs bounds wider than twice the edge margin; stationary needs nothing more', () => {
    expect(() =>
      enemyConfig({ ...base, behavior: 'flee' } as unknown as Parameters<typeof enemyConfig>[0]),
    ).toThrow(TypeError);
    expect(() =>
      enemyConfig({ ...base, behavior: 'flee', bounds: { min: 0, max: 400 }, edgeMargin: 220 }),
    ).toThrow(RangeError);
    expect(
      enemyConfig({ ...base, behavior: 'flee', bounds: { min: 0, max: 3600 }, edgeMargin: 220 })
        .behavior,
    ).toBe('flee');
    expect(enemyConfig({ ...base, behavior: 'stationary' }).behavior).toBe('stationary');
    expect(ACTIVITY_RULES.nest.radius).toBeGreaterThan(0);
  });
});
