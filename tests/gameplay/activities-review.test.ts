import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import { RunActivities } from '../../src/gameplay/activities';
import type { ActivityEvent } from '../../src/gameplay/activities';
import { lcgStream } from '../../src/gameplay/rng';
import { activityEvents, step } from './activity-helpers';

/** Task 24 review fixes (PR #22, Codex P1 findings) — regression tests. */
const placement = (mapId: number) => ({
  player: { x: 1800, y: 1800 },
  mapId,
  chests: [],
  enemySlotFree: true,
});
const spawned = (a: RunActivities, type: 'shrine' | 'lantern') =>
  (a.spawnNear(0, placement(15), type) as Extract<ActivityEvent, { type: 'activity-spawned' }>)
    .activity;

describe('Task 24 review — a pending failure survives a resample at its deadline', () => {
  it('a shrine whose progress reaches exactly 0 on a control step still fails (abandoned)', () => {
    const a = new RunActivities(lcgStream(1), 3600);
    const s = spawned(a, 'shrine');
    const inside = { player: { x: s.x, y: s.y }, enemiesNear: () => 0 };
    const outside = { player: { x: s.x + 500, y: s.y }, enemiesNear: () => 0 };
    a.sample(10, inside);
    a.sample(12, outside); // 2 s captured → 0 at 16
    a.sample(16, outside); // the control step lands exactly on the deadline
    expect(a.nextResolveAt()).toBe(16);
    const out = a.resolveDue(16);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'activity-failed', reason: 'abandoned' });
    expect(a.activeCount).toBe(0);
  });
  it('a lantern whose Light reaches exactly 0 when the enemies leave still fails (not a success)', () => {
    const a = new RunActivities(lcgStream(2), 3600);
    const l = spawned(a, 'lantern');
    const at = (n: number) => ({ player: { x: l.x, y: l.y }, enemiesNear: () => n });
    a.sample(0, at(0));
    a.resolveDue(a.nextResolveAt()!); // activated at 1, defence ends at 31
    a.sample(1, at(5)); // −10 Light/s → 0 at 11
    a.sample(11, at(0)); // the drainers left exactly when the Light ran out
    expect(a.nextResolveAt()).toBe(11);
    const out = a.resolveDue(11);
    expect(out[0]).toMatchObject({ type: 'activity-failed', reason: 'light' });
    expect(a.litLanterns()).toHaveLength(0);
  });
});

describe('Task 24 review — activities already due when the player dies still finish', () => {
  it('a shrine completing at the same instant as a lethal hit is completed and rewarded', () => {
    const w = new GameplayWorld({
      characterClass: 'mage',
      seed: 1,
      initialEnemies: false,
      spawning: { enabled: false },
      onHit: [],
      campaign: { mapId: 1 },
    });
    w.weapons.setAttackSpeed('player', 0.01);
    const id = w.debugSpawnActivity('shrine')!;
    const s = w.getSnapshot().activities!.items.find((a) => a.id === id)!;
    // Walk into the shrine (the run starts with no enemies, so nothing hurts on the way).
    for (let i = 0; i < 600; i++) {
      const p = w.getSnapshot().playerBody;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d <= 5) break;
      w.setMovement((s.x - p.x) / d, (s.y - p.y) / d);
      w.update(1 / 60);
    }
    w.setMovement(0, 0);
    const started = w
      .getEvents()
      .find((e) => e.channel === 'activities' && e.event.type === 'activity-started')!;
    const due = started.time + 9;
    // A lethal damage-over-time tick (status ticks rank before activities) lands exactly at `due`.
    w.update(due - 1 - w.time);
    w.applyEffect({
      targetId: 'player',
      sourceId: 'player',
      effectType: 'bleed',
      probabilityPercent: 100,
      duration: 3,
      rawDamagePerTick: 1_000_000,
    });
    const events = step(w, 2, 0.25);
    const death = events.find((e) => e.channel === 'combat' && e.event.type === 'death');
    expect(death?.time).toBeCloseTo(due, 9);
    expect(w.getSnapshot().survival.runState).not.toBe('active');
    const done = activityEvents(events, 'activity-completed');
    expect(done).toHaveLength(1);
    expect(done[0].time).toBeCloseTo(due, 9);
    expect(activityEvents(events, 'activity-reward')).toHaveLength(1);
    expect(w.getSnapshot().runStats.activities.completed.shrine).toBe(1);
    // Future activity work stays frozen while the player is down.
    expect(activityEvents(events, 'activity-spawned')).toHaveLength(0);
    expect(w.time).toBeCloseTo(due, 9);
  });
});

/** Walks into the shrine and lands a lethal bleed tick exactly on its 9 s completion. */
function dieAtShrineCompletion(w: GameplayWorld) {
  w.setTestProtection(true); // the shrine's guards must not decide the outcome
  const id = w.debugSpawnActivity('shrine')!;
  const s = w.getSnapshot().activities!.items.find((a) => a.id === id)!;
  let seq = w.getEvents().at(-1)?.sequence ?? 0;
  let started: number | null = null;
  for (let i = 0; i < 600 && started === null; i++) {
    const p = w.getSnapshot().playerBody;
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d > 5) w.setMovement((s.x - p.x) / d, (s.y - p.y) / d);
    else w.setMovement(0, 0);
    w.update(1 / 60);
    for (const e of w.getEvents(seq)) {
      seq = e.sequence;
      if (e.channel === 'activities' && e.event.type === 'activity-started') started = e.time;
    }
  }
  w.setMovement(0, 0);
  const due = started! + 9;
  w.update(due - 1 - w.time);
  w.setTestProtection(false); // only the lethal tick below lands
  w.applyEffect({
    targetId: 'player',
    sourceId: 'player',
    effectType: 'bleed',
    probabilityPercent: 100,
    duration: 3,
    rawDamagePerTick: 1_000_000,
  });
  return { due, events: step(w, 2, 0.25) };
}

describe('Task 24 review — a terminal death at a completion instant keeps the result', () => {
  it('revival already used: the run ends, but the shrine due at that instant completes first', () => {
    const w = new GameplayWorld({
      characterClass: 'mage',
      seed: 1,
      initialEnemies: false,
      spawning: { enabled: false },
      onHit: [],
      campaign: { mapId: 1 },
    });
    w.weapons.setAttackSpeed('player', 0.01);
    // Use up the one revival with a real lethal hit.
    w.applyEffect({
      targetId: 'player',
      sourceId: 'player',
      effectType: 'bleed',
      probabilityPercent: 100,
      duration: 3,
      rawDamagePerTick: 1_000_000,
    });
    step(w, 2, 0.25);
    w.decide('revive');
    step(w, 4, 0.25); // past the 3 s revival protection
    const { due, events } = dieAtShrineCompletion(w);
    const resolved = events.find(
      (e) => e.channel === 'campaign' && e.event.type === 'run-resolved',
    );
    expect(resolved?.time).toBeCloseTo(due, 9);
    expect(w.getSnapshot().campaign!.status).toBe('defeat');
    const done = activityEvents(events, 'activity-completed');
    expect(done).toHaveLength(1);
    expect(done[0].time).toBeCloseTo(due, 9);
    expect(w.getSnapshot().runStats.activities.completed.shrine).toBe(1);
    expect(w.getSnapshot().activities!.items).toHaveLength(0);
  });
});

describe('Task 24 review — a completion already reached survives leaving at its deadline', () => {
  it('a shrine captured for exactly 9 s completes even if the player steps out on that step', () => {
    const a = new RunActivities(lcgStream(1), 3600);
    const s = spawned(a, 'shrine');
    const inside = { player: { x: s.x, y: s.y }, enemiesNear: () => 0 };
    const outside = { player: { x: s.x + 500, y: s.y }, enemiesNear: () => 0 };
    a.sample(10, inside);
    a.sample(19, outside); // the control step lands exactly on the capture deadline
    expect(a.nextResolveAt()).toBe(19);
    const out = a.resolveDue(19);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('activity-completed');
    expect(a.activeCount).toBe(0);
  });
  it('a lantern whose activation completes on the step the player leaves still activates', () => {
    const a = new RunActivities(lcgStream(2), 3600);
    const l = spawned(a, 'lantern');
    a.sample(0, { player: { x: l.x, y: l.y }, enemiesNear: () => 0 });
    a.sample(1, { player: { x: l.x + 500, y: l.y }, enemiesNear: () => 0 });
    expect(a.nextResolveAt()).toBe(1);
    const out = a.resolveDue(1);
    expect(out.map((e) => e.type)).toEqual(['activity-started']);
    expect(a.activeCount).toBe(1);
  });
});
