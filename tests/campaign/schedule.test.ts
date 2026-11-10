import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_BALANCE,
  CAMPAIGN_MAPS,
  CampaignDirector,
  campaignSchedule,
  getBossDefinition,
  getCampaignMap,
  scheduledEnemyCount,
} from '../../src/campaign';
import { GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import { resolveOffers } from '../skills/helpers';

const plan = (mapId: number) =>
  campaignSchedule(getCampaignMap(mapId)).map((e) =>
    e.kind === 'elite' ? `${e.time}:${e.profile}` : `${e.time}:${e.kind}`,
  );
function world(mapId: number, extra: Record<string, unknown> = {}) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed: 3,
    initialEnemies: false,
    spawning: { enabled: false },
    campaign: { mapId },
    ...extra,
  });
  w.setTestProtection(true);
  return w;
}
/** Steps the world, resolving offers, collecting campaign events incrementally (history is bounded). */
function run(w: GameplayWorld, seconds: number, step: number, sink: WorldEvent[]) {
  const end = w.time + seconds;
  let seq = w.getEvents().at(-1)?.sequence ?? 0;
  // A resolved campaign run freezes the world, so stop there.
  while (w.time < end - 1e-9 && w.getSnapshot().campaign?.status !== 'victory') {
    resolveOffers(w);
    w.update(Math.min(step, end - w.time));
    const fresh = w.getEvents(seq);
    if (fresh.length) seq = fresh.at(-1)!.sequence;
    sink.push(...fresh.filter((e) => e.channel === 'campaign'));
  }
}

describe('elite/boss schedule (Task 08 §1.2)', () => {
  it('elites every 2:00 strictly before the end; the boss replaces the 10:00 elite', () => {
    expect(plan(1)).toEqual([
      '120:melee',
      '240:ranged',
      '360:melee',
      '480:ranged',
      '600:boss',
      '600:end',
    ]);
    expect(plan(3)).toEqual([
      '120:melee',
      '240:ranged',
      '360:melee',
      '480:ranged',
      '600:boss',
      '660:end',
    ]);
    // 12-minute map: no elite at exactly 12:00 (not strictly before the end).
    expect(plan(5).slice(-2)).toEqual(['600:boss', '720:end']);
    expect(plan(10)).toEqual([
      '120:melee',
      '240:ranged',
      '360:melee',
      '480:ranged',
      '600:boss',
      '720:melee',
      '840:ranged',
      '900:end',
    ]);
    for (const m of CAMPAIGN_MAPS) {
      const events = campaignSchedule(m);
      expect(events.filter((e) => e.kind === 'boss')).toHaveLength(1);
      expect(
        events.filter((e) => e.kind === 'elite').every((e) => e.time < m.durationSeconds),
      ).toBe(true);
      // Task 10: the reserve is per map (≥ the Task 08 base of 8; Act I maps keep exactly 8).
      expect(scheduledEnemyCount(m)).toBeLessThanOrEqual(m.reservedSlots);
      if (m.id <= 10) expect(m.reservedSlots).toBe(CAMPAIGN_BALANCE.reservedSlots);
    }
  });
  it('the director fires each due event once, in order, and nothing early', () => {
    const d = new CampaignDirector(getCampaignMap(1));
    expect(d.fire(119.99)).toBeNull();
    expect(d.fire(10_000)?.id).toBe('elite-1');
    expect(d.fire(10_000)?.id).toBe('elite-2');
    while (d.fire(10_000));
    expect(d.firedIds()).toEqual(['elite-1', 'elite-2', 'elite-3', 'elite-4', 'boss', 'end']);
    expect(d.peek()).toBeNull();
    expect(d.fire(10_000)).toBeNull();
  });
});

describe('scheduled events in the world fire exactly once at their time', () => {
  it('fires each event at its exact simulation time with small and large frames alike', () => {
    for (const step of [0.05, 7, 650]) {
      const w = world(1);
      const events: WorldEvent[] = [];
      run(w, 700, step, events);
      // Authoritative fire times from state (the world event history is bounded).
      expect(w.getSnapshot().campaign!.firedLog).toEqual([
        { id: 'elite-1', time: 120 },
        { id: 'elite-2', time: 240 },
        { id: 'elite-3', time: 360 },
        { id: 'elite-4', time: 480 },
        { id: 'boss', time: 600 },
        { id: 'end', time: 600 },
      ]);
      expect(events.filter((e) => e.event.type === 'run-resolved').length).toBeLessThanOrEqual(1);
      if (step < 1)
        expect(
          events
            .filter((e) =>
              ['elite-spawned', 'boss-spawned', 'duration-reached'].includes(e.event.type),
            )
            .map((e) => [e.time, e.event.type]),
        ).toEqual([
          [120, 'elite-spawned'],
          [240, 'elite-spawned'],
          [360, 'elite-spawned'],
          [480, 'elite-spawned'],
          [600, 'boss-spawned'],
          [600, 'duration-reached'],
        ]);
      const scheduled = () =>
        events.filter((e) =>
          ['elite-spawned', 'boss-spawned', 'duration-reached', 'run-resolved'].includes(
            e.event.type,
          ),
        ).length;
      const seen = scheduled();
      const c = w.getSnapshot().campaign!;
      expect(c.firedEvents).toEqual(['elite-1', 'elite-2', 'elite-3', 'elite-4', 'boss', 'end']);
      expect(c.eliteEnemyIds).toHaveLength(4);
      expect(c.bossEnemyId).not.toBeNull();
      expect(c.nextEvent).toBeNull();
      run(w, 300, step, events);
      expect(scheduled()).toBe(seen); // nothing scheduled fires again
      expect(w.getSnapshot().campaign!.firedLog).toHaveLength(6);
    }
  });
  it('nothing fires while paused or while a level-up choice is pending; resume continues once', () => {
    const w = world(1);
    w.update(119);
    w.setPaused(true);
    w.update(500);
    expect(w.getSnapshot().campaign!.firedEvents).toEqual([]);
    w.setPaused(false);
    w.grantTestXp(60);
    w.update(500);
    expect(w.time).toBeCloseTo(119, 9);
    expect(w.getSnapshot().campaign!.firedEvents).toEqual([]);
    resolveOffers(w);
    w.update(1);
    expect(w.getSnapshot().campaign!.firedEvents).toEqual(['elite-1']);
  });
  it('elites and the boss use their scaled definitions; a single boss per run', () => {
    const w = world(4);
    const events: WorldEvent[] = [];
    run(w, 601, 1, events);
    const base = w.core.getEntity(w.spawnEnemy('melee', 300));
    const c = w.getSnapshot().campaign!;
    const elite = w.core.getEntity(c.eliteEnemyIds[0]);
    expect(elite.maxHp).toBeCloseTo(base.maxHp * 2.5, 6);
    expect(elite.physicalDamage).toBeCloseTo(base.physicalDamage * 1.4, 6);
    const boss = w.core.getEntity(c.bossEnemyId!);
    expect(boss.maxHp).toBeCloseTo(base.maxHp * getBossDefinition('ash_wolf').hpMultiplier, 6);
    const bosses = events.filter((e) => e.event.type === 'boss-spawned');
    expect(bosses).toHaveLength(1);
    expect(bosses[0].event).toMatchObject({ bossId: 'ash_wolf', bossName: 'Пепельный волк' });
    expect(
      events
        .filter((e) => e.event.type === 'elite-spawned')
        .map((e) => (e.event as { profile: string }).profile),
    ).toEqual(['melee', 'ranged', 'melee', 'ranged']);
  });
  it('the classic alpha has no campaign schedule', () => {
    const w = new GameplayWorld({ characterClass: 'mage', initialEnemies: false });
    w.setTestProtection(true);
    w.update(700);
    expect(w.getEvents().some((e) => e.channel === 'campaign')).toBe(false);
  });
});
