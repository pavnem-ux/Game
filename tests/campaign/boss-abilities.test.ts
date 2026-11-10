import { describe, expect, it } from 'vitest';
import {
  BossController,
  GLOBAL_CAST_GAP,
  MIN_TELEGRAPH,
  validateBossAbilities,
} from '../../src/campaign';
import type { BossAbility, BossAbilityOutcome, BossHost } from '../../src/campaign';

const ALL: readonly BossAbility[] = [
  {
    id: 'burst',
    kind: 'radial_burst',
    cooldown: 6,
    windup: 0.5,
    initialDelay: 1,
    projectiles: 10,
    coefficient: 0.8,
    speed: 220,
  },
  {
    id: 'slam',
    kind: 'circle_aoe',
    cooldown: 8,
    windup: 1.2,
    initialDelay: 2,
    radius: 90,
    coefficient: 1.6,
  },
  {
    id: 'charge',
    kind: 'charge',
    cooldown: 10,
    windup: 0.9,
    initialDelay: 3,
    duration: 1,
    speedMultiplier: 3.5,
    impactCoefficient: 1.4,
    impactRange: 30,
  },
  {
    id: 'haste',
    kind: 'speed_buff',
    cooldown: 12,
    windup: 0,
    initialDelay: 4,
    duration: 4,
    multiplier: 1.5,
  },
  {
    id: 'adds',
    kind: 'summon',
    cooldown: 15,
    windup: 0.8,
    initialDelay: 5,
    count: 3,
    profile: 'melee',
  },
];

function fakeHost() {
  const calls = {
    strikes: [] as [string, number, number][],
    bursts: [] as [number, number][],
    speed: [] as [number, number][],
    summons: [] as [number, number][],
  };
  let now = 0;
  const state = { player: { x: 100, y: 0, radius: 16 }, boss: { x: 0, y: 0 } };
  const host: BossHost = {
    bossPosition: () => state.boss,
    playerBody: () => state.player,
    bossRadius: () => 30,
    strikePlayer: (id, c) => (calls.strikes.push([id, c, now]), true),
    launchRadial: (_id, count) => (calls.bursts.push([count, now]), count),
    setSpeedBoost: (m) => void calls.speed.push([m, now]),
    summon: (_id, count) => (calls.summons.push([count, now]), count),
  };
  /** Drives the controller exactly like the world: peek → resolve at that time. */
  const run = (c: BossController, until: number, onStep?: (t: number) => void) => {
    const out: (BossAbilityOutcome & { at: number })[] = [];
    for (;;) {
      const next = c.peek();
      if (next === null || next > until) break;
      now = next;
      onStep?.(now);
      for (const o of c.resolve(now, host)) out.push({ ...o, at: now });
    }
    return out;
  };
  return { host, calls, state, run };
}

describe('boss ability library (Task 08 §2.2)', () => {
  it('every ability telegraphs, triggers and respects its cooldown; casts never overlap', () => {
    const { calls, run } = fakeHost();
    const c = new BossController(ALL, 0);
    const out = run(c, 120);
    for (const a of ALL) {
      const times = c.executionLog(a.id);
      expect(times.length, a.id).toBeGreaterThan(2);
      for (let i = 1; i < times.length; i++)
        expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(a.cooldown - 1e-9);
      // Each execution follows its own telegraph by exactly the windup.
      const starts = out.filter((o) => o.type === 'boss-cast-started' && o.abilityId === a.id);
      expect(starts.length).toBeGreaterThanOrEqual(times.length);
      for (const t of times)
        expect(starts.some((s) => Math.abs(s.at + a.windup - t) < 1e-9)).toBe(true);
    }
    // One cast at a time, with the global gap between executions and the next start.
    const events = out.filter((o) => o.type !== 'boss-effect-ended');
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1],
        cur = events[i];
      if (prev.type === 'boss-cast-started') expect(cur.type).toBe('boss-ability-executed');
      if (prev.type === 'boss-ability-executed' && cur.type === 'boss-cast-started')
        expect(cur.at - prev.at).toBeGreaterThanOrEqual(GLOBAL_CAST_GAP - 1e-9);
    }
    expect(calls.bursts.every(([n]) => n === 10)).toBe(true);
    expect(calls.summons.every(([n]) => n === 3)).toBe(true);
    expect(calls.strikes.some(([id]) => id === 'slam')).toBe(true);
  });
  it('circle AoE hits the telegraphed spot only: dodging out of it avoids the hit', () => {
    const slamOnly: BossAbility[] = [ALL[1], { ...ALL[3], initialDelay: 1000 }];
    const stay = fakeHost();
    stay.run(new BossController(slamOnly, 0), 3.3);
    expect(stay.calls.strikes).toEqual([['slam', 1.6, 3.2]]);
    const dodge = fakeHost();
    dodge.run(new BossController(slamOnly, 0), 3.3, (t) => {
      if (t > 2) dodge.state.player = { x: 400, y: 0, radius: 16 }; // moved during the windup
    });
    expect(dodge.calls.strikes).toEqual([]);
  });
  it('charge boosts speed for its duration, impacts only when it reaches the player, then resets', () => {
    const chargeOnly: BossAbility[] = [ALL[2], { ...ALL[3], initialDelay: 1000 }];
    const h = fakeHost();
    const out = h.run(new BossController(chargeOnly, 0), 5, (t) => {
      if (t >= 4.9) h.state.boss = { x: 80, y: 0 }; // reached the player by the end of the dash
    });
    expect(h.calls.speed).toEqual([
      [3.5, 3.9],
      [1, 4.9],
    ]);
    expect(h.calls.strikes).toEqual([['charge', 1.4, 4.9]]);
    expect(out.find((o) => o.type === 'boss-cast-started')!.telegraph!.direction).toEqual({
      x: 1,
      y: 0,
    });
    const miss = fakeHost();
    miss.run(new BossController(chargeOnly, 0), 5);
    expect(miss.calls.strikes).toEqual([]);
  });
  it('speed buff is instant, lasts its duration and overlapping boosts take the maximum', () => {
    const h = fakeHost();
    const c = new BossController(
      [
        { ...ALL[3], initialDelay: 0 },
        { ...ALL[2], initialDelay: 1 },
      ],
      0,
    );
    h.run(c, 6);
    expect(h.calls.speed[0]).toEqual([1.5, 0]);
    expect(h.calls.speed.map(([m]) => m)).toContain(3.5);
    expect(h.calls.speed.at(-1)![0]).toBeGreaterThanOrEqual(1);
  });
  it('validation: ≥2 abilities, unique ids, dangerous telegraphs ≥ minimum, sane values', () => {
    expect(() => validateBossAbilities(ALL)).not.toThrow();
    expect(() => validateBossAbilities([ALL[0]])).toThrow();
    expect(() => validateBossAbilities([ALL[0], { ...ALL[0] }])).toThrow();
    expect(() =>
      validateBossAbilities([ALL[0], { ...ALL[1], windup: MIN_TELEGRAPH - 0.1 }]),
    ).toThrow();
    expect(() => validateBossAbilities([ALL[0], { ...ALL[2], windup: 0.2 }])).toThrow();
    expect(() => validateBossAbilities([ALL[0], { ...ALL[4], count: 0 }])).toThrow();
    expect(() => validateBossAbilities([ALL[0], { ...ALL[1], cooldown: 0 }])).toThrow();
    expect(() => validateBossAbilities([{ ...ALL[0], projectiles: 2 }, ALL[1]])).toThrow();
  });
});
