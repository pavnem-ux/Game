import { describe, expect, it } from 'vitest';
import { INITIAL_RUN_STATE, reduceRun } from '../../src/campaign';
import type { CampaignRunState, RunInput } from '../../src/campaign';
import type { CombatTag } from '../../src/skills';
import { GameplayWorld } from '../../src/gameplay';
import { resolveOffers } from '../skills/helpers';

const apply = (inputs: RunInput[]) => {
  let state: CampaignRunState = INITIAL_RUN_STATE;
  const resolved: string[] = [];
  for (const input of inputs) {
    const t = reduceRun(state, input);
    state = t.state;
    if (t.resolved) resolved.push(t.resolved);
  }
  return { state, resolved };
};

describe('run state machine (pure)', () => {
  it('victory needs boss dead AND duration reached, in either order', () => {
    const a = apply([
      { type: 'boss-killed', time: 650 },
      { type: 'duration-reached', time: 900 },
    ]);
    expect(a.state).toMatchObject({ status: 'victory', resolvedAt: 900 });
    const b = apply([
      { type: 'duration-reached', time: 600 },
      { type: 'boss-killed', time: 640 },
    ]);
    expect(b.state).toMatchObject({ status: 'victory', resolvedAt: 640 });
    expect(apply([{ type: 'duration-reached', time: 600 }]).state.status).toBe('active');
    expect(apply([{ type: 'boss-killed', time: 600 }]).state.status).toBe('active');
  });
  it('defeat and abandon resolve; the first resolution wins and everything after is ignored', () => {
    const d = apply([
      { type: 'elite-killed', time: 130 },
      { type: 'player-defeated', time: 200 },
      { type: 'boss-killed', time: 600 },
      { type: 'duration-reached', time: 600 },
      { type: 'abandon', time: 700 },
    ]);
    expect(d.resolved).toEqual(['defeat']);
    expect(d.state).toMatchObject({ status: 'defeat', eliteKills: 1, resolvedAt: 200 });
    const q = apply([
      { type: 'abandon', time: 50 },
      { type: 'abandon', time: 51 },
      { type: 'player-defeated', time: 52 },
    ]);
    expect(q.resolved).toEqual(['abandoned']);
  });
});

function world(mapId: number, extra: Record<string, unknown> = {}) {
  const w = new GameplayWorld({
    characterClass: 'warrior',
    seed: 5,
    initialEnemies: false,
    spawning: { enabled: false },
    campaign: { mapId, runId: 'run-test-1' },
    ...extra,
  });
  w.setTestProtection(true);
  return w;
}
const until = (w: GameplayWorld, time: number) => {
  while (w.time < time - 1e-9 && w.getSnapshot().campaign!.status === 'active') {
    resolveOffers(w);
    w.update(Math.min(1, time - w.time));
  }
};
/** Kills an enemy through the normal engine hit pipeline (Combat Core damage → world death). */
const kill = (w: GameplayWorld, id: string) => {
  const t = new Set<CombatTag>(['physical']);
  w.skills.hit(id, w.skills.attack(t, 1e7, 'physical'), t, { procs: false });
  expect(w.core.getEntity(id).alive).toBe(false);
};
const resolutions = (w: GameplayWorld) =>
  w.getEvents().filter((e) => e.channel === 'campaign' && e.event.type === 'run-resolved');

describe('campaign runs resolve exactly once in the world', () => {
  it('long map: an early boss kill wins only when the duration is reached', () => {
    const w = world(10);
    until(w, 601);
    kill(w, w.getSnapshot().campaign!.bossEnemyId!);
    expect(w.getSnapshot().campaign).toMatchObject({ status: 'active', bossKilled: true });
    until(w, 900);
    const c = w.getSnapshot().campaign!;
    expect(c).toMatchObject({ status: 'victory', resolvedAt: 900, bossKilled: true });
    expect(resolutions(w)).toHaveLength(1);
    expect(resolutions(w)[0].event).toMatchObject({
      outcome: 'victory',
      runId: 'run-test-1',
      elapsed: 900,
    });
    // The world is frozen after resolution.
    w.setPaused(false);
    w.update(50);
    expect(w.time).toBe(900);
    expect(w.paused).toBe(true);
  });
  it('duration reached with the boss alive: the boss keeps acting; victory when it dies', () => {
    const w = world(1);
    until(w, 600);
    expect(w.getSnapshot().campaign).toMatchObject({
      status: 'active',
      durationReached: true,
      bossKilled: false,
    });
    const boss = w.getSnapshot().campaign!.bossEnemyId!;
    const before = w.getSnapshot().enemies.find((e) => e.entityId === boss)!.position;
    w.update(5);
    const after = w.getSnapshot().enemies.find((e) => e.entityId === boss)!.position;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(1);
    kill(w, boss);
    const c = w.getSnapshot().campaign!;
    expect(c).toMatchObject({ status: 'victory', resolvedAt: 605 });
    expect(resolutions(w)).toHaveLength(1);
    expect(resolutions(w)[0].event).toMatchObject({ elapsed: 600 });
  });
  it('death without revival is a defeat; revival keeps the same run going', () => {
    const w = world(2);
    w.setTestProtection(false);
    until(w, 30);
    w.setPlayerHp(0);
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    expect(w.getSnapshot().campaign!.status).toBe('active');
    w.decide('revive');
    until(w, 40);
    expect(w.getSnapshot().campaign!.status).toBe('active');
    w.setPlayerHp(0);
    expect(w.survival.getState().runState).toBe('ended');
    const c = w.getSnapshot().campaign!;
    expect(c.status).toBe('defeat');
    expect(resolutions(w)).toHaveLength(1);
    const t = w.time;
    w.update(10);
    expect(w.time).toBe(t);
  });
  it('declining revival is a defeat; abandon resolves once and never later', () => {
    const w = world(3);
    w.setTestProtection(false);
    until(w, 10);
    w.setPlayerHp(0);
    w.decide('finish-run');
    expect(w.getSnapshot().campaign!.status).toBe('defeat');
    expect(w.abandonRun()).toBe(false);
    const q = world(3);
    until(q, 50);
    expect(q.abandonRun()).toBe(true);
    expect(q.abandonRun()).toBe(false);
    expect(q.getSnapshot().campaign).toMatchObject({ status: 'abandoned', resolvedAt: 50 });
    q.update(1000);
    expect(q.getSnapshot().campaign!.firedEvents).toEqual([]);
    expect(resolutions(q)).toHaveLength(1);
  });
  it('elite kills are counted', () => {
    const w = world(1);
    until(w, 121);
    const elite = w.getSnapshot().campaign!.eliteEnemyIds[0];
    if (w.core.getEntity(elite).alive) kill(w, elite);
    expect(w.getSnapshot().campaign!.eliteKills).toBe(1);
  });
});
