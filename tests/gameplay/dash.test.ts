import { describe, expect, it } from 'vitest';
import { ALPHA, ALPHA_ENEMIES, DASH_RULES, GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';

function world(seed = 1) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01);
  return w;
}
function step(w: GameplayWorld, seconds: number, dt = 0.01, sink: WorldEvent[] = []) {
  let seq = w.getEvents().at(-1)?.sequence ?? 0;
  const end = w.time + seconds;
  while (w.time < end - 1e-9) {
    w.update(Math.min(dt, end - w.time));
    const fresh = w.getEvents(seq);
    if (fresh.length) seq = fresh.at(-1)!.sequence;
    sink.push(...fresh);
  }
  return sink;
}
const of = (events: WorldEvent[], type: string) => events.filter((e) => e.event.type === type);
const pos = (w: GameplayWorld) => ({
  x: w.getSnapshot().playerBody.x,
  y: w.getSnapshot().playerBody.y,
});

describe('Task 14 Phase 2 — dash', () => {
  it('140 units over 0.15 s in the last direction (right at the start); starts at the next input sample', () => {
    expect(DASH_RULES).toEqual({
      distance: 140,
      duration: 0.15,
      cooldown: 3,
      invulnerability: 0.2,
    });
    const w = world();
    const start = pos(w);
    expect(w.requestDash()).toBe(true);
    const events = step(w, 0.5);
    const [started] = of(events, 'dash-started');
    // Starts at the first input sample (1/60 s), ends exactly 0.15 s later at +140 to the right.
    expect(started.time).toBeCloseTo(ALPHA.controlStep, 9);
    const [ended] = of(events, 'dash-ended');
    expect(ended.time).toBeCloseTo(started.time + 0.15, 9);
    expect(pos(w)).toEqual({ x: start.x + 140, y: start.y });
    // Mid-dash the position follows the dash line (no input needed).
    const v = world();
    v.requestDash();
    // Positions update on the 60 Hz input samples: 4 samples after the start = 4/60 s of dash.
    step(v, 5 * ALPHA.controlStep + 0.001);
    expect(pos(v).x - start.x).toBeCloseTo(((4 * ALPHA.controlStep) / 0.15) * 140, 6);
    // Moving: the current movement direction (here up-left) is used.
    const m = world();
    m.setMovement(-1, -1);
    step(m, 0.2);
    const before = pos(m);
    m.requestDash();
    step(m, 0.2);
    const travelled = { x: pos(m).x - before.x, y: pos(m).y - before.y };
    expect(Math.hypot(travelled.x, travelled.y)).toBeGreaterThan(140);
    expect(travelled.x).toBeCloseTo(travelled.y, 6);
  });
  it('stops at the arena bounds along the dash line', () => {
    const w = world();
    w.setDebugDashCooldown(0);
    for (let i = 0; i < 20; i++) {
      w.requestDash();
      step(w, 0.2);
    }
    expect(pos(w).x).toBe(ALPHA.arenaSize - ALPHA.playerRadius);
    expect(pos(w).y).toBe(1800);
  });
  it('cooldown 3 s from the dash start; a «dash-ready» boundary at the end; unavailable states', () => {
    const w = world();
    w.requestDash();
    const events = step(w, 0.5);
    const t0 = of(events, 'dash-started')[0].time;
    expect(w.requestDash()).toBe(false);
    expect(w.dashBlockReason()).toBe('cooldown');
    const later = step(w, 3);
    expect(of(later, 'dash-ready').map((e) => e.time)).toEqual([expect.closeTo(t0 + 3, 9)]);
    expect(w.requestDash()).toBe(true);
    // Paused, in an offer, dead/revive prompt: no dash.
    const p = world();
    p.setPaused(true);
    expect([p.requestDash(), p.dashBlockReason()]).toEqual([false, 'paused']);
    const o = world();
    o.grantTestXp(20);
    expect([o.requestDash(), o.dashBlockReason()]).toEqual([false, 'paused']);
    const d = world();
    d.setTestProtection(false);
    d.setPlayerHp(0);
    expect(d.survival.getState().runState).toBe('awaiting-revival-choice');
    expect([d.requestDash(), d.dashBlockReason()]).toEqual([false, 'dead']);
  });
  it('DEV cooldown override also shortens or restores a running cooldown', () => {
    const w = world();
    w.requestDash();
    const t0 = of(step(w, 0.5), 'dash-started')[0].time;
    expect(w.dashBlockReason()).toBe('cooldown');
    w.setDebugDashCooldown(1);
    expect(w.getSnapshot().dash.readyAt).toBeCloseTo(t0 + 1, 9);
    w.setDebugDashCooldown(0); // already past t0 + 0 → ready now
    const ready = of(step(w, 0.05), 'dash-ready');
    expect(ready).toHaveLength(1);
    expect(w.requestDash()).toBe(true);
    step(w, 0.5);
    // A finished cooldown stays finished; restoring the default applies from the next dash.
    w.setDebugDashCooldown(null);
    expect(w.dashBlockReason()).toBeNull();
    w.requestDash();
    step(w, 0.05);
    expect(w.getSnapshot().dash.readyAt).toBeCloseTo(w.getSnapshot().dash.startedAt! + 3, 9);
    expect(() => w.setDebugDashCooldown(-1)).toThrow(RangeError);
  });
  it('i-frames: the existing hit protection for 0.2 s from the dash start only', () => {
    const w = world();
    w.setTestProtection(false);
    w.requestDash();
    const events = step(w, 0.05);
    const t0 = of(events, 'dash-started')[0].time;
    expect(of(events, 'protection-granted')[0].event).toMatchObject({
      source: 'dash',
      expiresAt: t0 + 0.2,
    });
    step(w, t0 + 0.19 - w.time);
    expect(w.survival.getState().directProtected).toBe(true);
    step(w, t0 + 0.21 - w.time);
    expect(w.survival.getState().directProtected).toBe(false);
  });
  it('a contact hit inside the i-frames is blocked and counted as avoided; without a dash it lands', () => {
    const interval = ALPHA_ENEMIES.melee.attackInterval; // first hit at 0, second at this time
    const run = (dash: boolean) => {
      const w = world();
      w.setTestProtection(false);
      w.spawnEnemy('melee', 0, 0, { ...ALPHA_ENEMIES.melee, movementSpeed: 0 });
      // Dash so that it starts at the input sample just before the second contact attempt.
      step(w, interval - 0.012);
      if (dash) expect(w.requestDash()).toBe(true);
      const hp = w.core.getEntity('player').currentHp;
      const events = step(w, 0.03);
      return { w, hp, events };
    };
    const dashed = run(true);
    expect(
      of(dashed.events, 'contact-attempt').map((e) => (e.event as { blocked: boolean }).blocked),
    ).toEqual([true]);
    expect(dashed.w.core.getEntity('player').currentHp).toBe(dashed.hp);
    expect(dashed.w.getSnapshot().dash.hitsAvoided).toBe(1);
    expect(dashed.w.getSnapshot().runStats.dash).toEqual({ used: 1, hitsAvoided: 1 });
    const plain = run(false);
    expect(
      of(plain.events, 'contact-attempt').map((e) => (e.event as { blocked: boolean }).blocked),
    ).toEqual([false]);
    expect(plain.w.core.getEntity('player').currentHp).toBeLessThan(plain.hp);
  });
  it('pause freezes the dash; same seed + inputs ⇒ same positions; large and small frame steps agree', () => {
    const w = world();
    w.requestDash();
    step(w, ALPHA.controlStep + 0.05);
    const mid = pos(w);
    w.setPaused(true);
    w.update(5);
    expect(pos(w)).toEqual(mid);
    expect(w.getSnapshot().dash.active).toBe(true);
    w.setPaused(false);
    step(w, 0.2);
    expect(w.getSnapshot().dash.active).toBe(false);
    const script = (dt: number) => {
      const v = world(9);
      const trace: number[] = [];
      v.setMovement(1, 0.3);
      for (const t of [0.4, 1.0, 4.2, 4.3, 7.9]) {
        while (v.time < t - 1e-9) v.update(Math.min(dt, t - v.time));
        v.requestDash();
        if (t === 4.3) v.setMovement(-1, 0);
        trace.push(v.getSnapshot().playerBody.x, v.getSnapshot().playerBody.y);
      }
      while (v.time < 9 - 1e-9) v.update(Math.min(dt, 9 - v.time));
      trace.push(
        v.getSnapshot().playerBody.x,
        v.getSnapshot().playerBody.y,
        v.getSnapshot().dash.used,
      );
      return trace;
    };
    const small = script(1 / 120);
    const large = script(0.5);
    expect(large.length).toBe(small.length);
    large.forEach((v, i) => expect(v).toBeCloseTo(small[i], 6));
    expect(small.at(-1)).toBe(3); // 0.4, 4.2 (cooldown from 0.4), 7.9 — the others were on cooldown
    expect(script(1 / 120)).toEqual(small);
  });
});
