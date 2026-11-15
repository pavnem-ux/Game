import { describe, expect, it } from 'vitest';
import type { GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import { ACTIVITY_RULES, RunActivities, activityTypesFor } from '../../src/gameplay/activities';
import type { ActivityEvent, ActivityType } from '../../src/gameplay/activities';
import { lcgStream } from '../../src/gameplay/rng';
import { activityEvents, campaignWorld, step } from './activity-helpers';

const placement = (mapId = 1, chests: { x: number; y: number }[] = []) => ({
  player: { x: 1800, y: 1800 },
  mapId,
  chests,
  enemySlotFree: true,
});

describe('Task 24 Phase 1 — activity types per act', () => {
  it('maps 1–10: shrine + thief; 11–20: + lantern; 21–40: + nest', () => {
    expect(activityTypesFor(1)).toEqual(['shrine', 'thief']);
    expect(activityTypesFor(10)).toEqual(['shrine', 'thief']);
    expect(activityTypesFor(11)).toEqual(['shrine', 'lantern', 'thief']);
    expect(activityTypesFor(20)).toEqual(['shrine', 'lantern', 'thief']);
    expect(activityTypesFor(21)).toEqual(['shrine', 'lantern', 'thief', 'nest']);
    expect(activityTypesFor(40)).toEqual(['shrine', 'lantern', 'thief', 'nest']);
    expect(() => activityTypesFor(0)).toThrow(RangeError);
  });
  it('rolls only available types and never the same type twice in a row', () => {
    for (const mapId of [1, 15, 30]) {
      const a = new RunActivities(lcgStream(mapId * 7), 3600);
      const seen = new Set<ActivityType>();
      let last: ActivityType | null = null;
      for (let i = 0; i < 60; i++) {
        const due = a.spawnDue(i * 80 + 50, placement(mapId));
        expect(due.type).toBe('activity-spawned');
        const t = (due as Extract<ActivityEvent, { type: 'activity-spawned' }>).activity.type;
        expect(activityTypesFor(mapId)).toContain(t);
        if (last !== null) expect(t).not.toBe(last);
        seen.add(t);
        last = t;
        a.endRun(); // free the slots (the "last type" memory stays)
      }
      expect([...seen].sort()).toEqual([...activityTypesFor(mapId)].sort());
    }
  });
});

describe('Task 24 Phase 1 — scheduling', () => {
  it('first at 0:50, then every 75 ± 15 s (seeded, identical for the same seed)', () => {
    const times = (seed: number) => {
      const w = campaignWorld(seed);
      const events = step(w, 600, 1);
      return [
        ...activityEvents(events, 'activity-spawned').map((e) => e.time),
        ...activityEvents(events, 'activity-spawn-skipped').map((e) => e.time),
      ].sort((a, b) => a - b);
    };
    const a = times(3);
    expect(a[0]).toBe(50);
    for (let i = 1; i < a.length; i++) {
      expect(a[i] - a[i - 1]).toBeGreaterThanOrEqual(60 - 1e-9);
      expect(a[i] - a[i - 1]).toBeLessThanOrEqual(90 + 1e-9);
    }
    expect(a.length).toBeGreaterThanOrEqual(6);
    expect(times(3)).toEqual(a);
    expect(times(4)).not.toEqual(a);
  });
  it('never spawns at or after the map duration', () => {
    const w = campaignWorld(5, 1);
    const duration = w.campaignMap!.durationSeconds;
    const events = step(w, duration + 60, 2);
    const all = [
      ...activityEvents(events, 'activity-spawned'),
      ...activityEvents(events, 'activity-spawn-skipped'),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) expect(e.time).toBeLessThan(duration);
  });
  it('at most 2 activities at once: the third spawn is skipped and the timer keeps going', () => {
    const a = new RunActivities(lcgStream(9), 3600);
    expect(a.spawnDue(50, placement(1)).type).toBe('activity-spawned');
    const next = a.nextSpawnAt;
    expect(a.spawnDue(next, placement(1)).type).toBe('activity-spawned');
    const third = a.nextSpawnAt;
    const skipped = a.spawnDue(third, placement(1));
    expect(skipped).toEqual({
      type: 'activity-spawn-skipped',
      reason: 'limit',
      activityType: null,
    });
    expect(a.nextSpawnAt).toBeGreaterThanOrEqual(third + 60);
    expect(a.activeCount).toBe(2);
  });
  it('thief / nest need a free enemy slot (skipped with reason cap)', () => {
    const a = new RunActivities(lcgStream(2), 3600);
    const e = a.spawnNear(10, { ...placement(30), enemySlotFree: false }, 'nest');
    expect(e).toEqual({ type: 'activity-spawn-skipped', reason: 'cap', activityType: 'nest' });
  });
});

describe('Task 24 Phase 1 — placement', () => {
  it('500–900 from the player, inside the arena, ≥ 300 from chests and other activities', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = new RunActivities(lcgStream(seed), 3600);
      const chest = { x: 1800 + 650, y: 1800 };
      const player = seed % 2 ? { x: 1800, y: 1800 } : { x: 300, y: 3300 }; // a corner too
      const p = { ...placement(30, [chest]), player };
      const placed: { x: number; y: number }[] = [];
      for (let i = 0; i < 2; i++) {
        const e = a.spawnNear(0, p, 'shrine'); // fill nothing: use the scheduled path below
        a.endRun();
        void e;
      }
      for (const t of [50, 125]) {
        const e = a.spawnDue(t, p);
        if (e.type !== 'activity-spawned') continue;
        const s = e.activity;
        if (s.type === 'thief') {
          expect(Math.hypot(s.x - player.x, s.y - player.y)).toBeCloseTo(
            ACTIVITY_RULES.thief.spawnDistance,
            6,
          );
        } else {
          const d = Math.hypot(s.x - player.x, s.y - player.y);
          expect(d).toBeGreaterThanOrEqual(500 - 1e-9);
          expect(d).toBeLessThanOrEqual(900 + 1e-9);
          expect(Math.hypot(s.x - chest.x, s.y - chest.y)).toBeGreaterThanOrEqual(300);
          for (const o of placed)
            expect(Math.hypot(s.x - o.x, s.y - o.y)).toBeGreaterThanOrEqual(300);
          placed.push(s);
        }
        const m = ACTIVITY_RULES.arenaMargin;
        expect(s.x).toBeGreaterThanOrEqual(m);
        expect(s.y).toBeGreaterThanOrEqual(m);
        expect(s.x).toBeLessThanOrEqual(3600 - m);
        expect(s.y).toBeLessThanOrEqual(3600 - m);
      }
    }
  });
});

describe('Task 24 Phase 1 — expiry and freezing', () => {
  it('a shrine not started within 45 s fades out without reward', () => {
    const a = new RunActivities(lcgStream(1), 3600);
    const e = a.spawnNear(10, placement(1), 'shrine');
    expect(e.type).toBe('activity-spawned');
    const far = { player: { x: 100, y: 100 }, enemiesNear: () => 0 };
    a.sample(20, far);
    expect(a.nextResolveAt()).toBe(55);
    expect(a.resolveDue(54.9)).toEqual([]);
    const out = a.resolveDue(55);
    expect(out.map((o) => o.type)).toEqual(['activity-faded']);
    expect(a.activeCount).toBe(0);
  });
  it('in the world: the scheduled shrine fades at spawn + 45 s; run stats count it as failed', () => {
    // Seed with a shrine first on map 1 (the player stands still, far from it).
    let w: GameplayWorld | null = null,
      events: WorldEvent[] = [];
    for (let seed = 1; seed < 40 && !w; seed++) {
      const c = campaignWorld(seed);
      const ev = step(c, 51, 1);
      const s = activityEvents(ev, 'activity-spawned')[0];
      if (s?.event.activity.type === 'shrine') {
        w = c;
        events = ev;
      }
    }
    expect(w).not.toBeNull();
    const spawned = activityEvents(events, 'activity-spawned')[0];
    expect(spawned.time).toBe(50);
    expect(w!.getSnapshot().activities!.items[0].fadesAt).toBe(95);
    const later = step(w!, 50, 1);
    const faded = activityEvents(later, 'activity-faded');
    expect(faded.map((f) => f.time)).toEqual([95]);
    expect(w!.getSnapshot().runStats.activities.spawned.shrine).toBe(1);
    expect(w!.getSnapshot().runStats.activities.failed.shrine).toBe(1);
    expect(w!.getSnapshot().runStats.activities.completed.shrine).toBe(0);
  });
  it('pause freezes activities (no spawn, no fade while paused)', () => {
    const w = campaignWorld(2);
    step(w, 49, 1);
    w.setPaused(true);
    for (let i = 0; i < 20; i++) w.update(1);
    expect(w.time).toBe(49);
    expect(w.getSnapshot().activities!.items).toHaveLength(0);
    w.setPaused(false);
    const events = step(w, 2, 1);
    expect(activityEvents(events, 'activity-spawned').map((e) => e.time)).toEqual([50]);
  });
  it('frame size does not change spawn / fade times', () => {
    const run = (dt: number) => {
      const w = campaignWorld(6);
      return step(w, 300, dt)
        .filter((e) => e.channel === 'activities')
        .map((e) => [e.time, e.event.type]);
    };
    expect(run(0.016)).toEqual(run(1));
  });
});
