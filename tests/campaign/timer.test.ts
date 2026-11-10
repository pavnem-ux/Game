import { describe, expect, it } from 'vitest';
import { ALPHA, ALPHA_ENEMY_STATS, GameplayWorld } from '../../src/gameplay';
import {
  CAMPAIGN_BALANCE,
  getCampaignMap,
  runClock,
  stageAt,
  stageBoundaries,
} from '../../src/campaign';
import { play } from '../skills/helpers';

const campaignWorld = (mapId: number, extra: Record<string, unknown> = {}) => {
  const w = new GameplayWorld({
    characterClass: 'warrior',
    seed: 11,
    initialEnemies: false,
    campaign: { mapId },
    ...extra,
  });
  w.setTestProtection(true);
  return w;
};

describe('run timer and stages (Task 08 §1.2)', () => {
  it('five stages with boundaries relative to duration', () => {
    const b = stageBoundaries(600);
    expect(b.map((s) => [s.id, s.start])).toEqual([
      ['opening', 0],
      ['escalation', 90],
      ['midgame', 240],
      ['late', 390],
      ['boss', 540],
    ]);
    expect(b[4].end).toBe(Infinity);
    expect(stageAt(89.999, 600).id).toBe('opening');
    expect(stageAt(90, 600).id).toBe('escalation');
    expect(stageAt(900, 600).id).toBe('boss');
    expect(stageBoundaries(900)[4].start).toBe(810);
  });
  it('run clock reports remaining time and duration reached', () => {
    const map = getCampaignMap(10);
    expect(runClock(map, 0)).toMatchObject({
      duration: 900,
      remaining: 900,
      durationReached: false,
    });
    expect(runClock(map, 900)).toMatchObject({ remaining: 0, durationReached: true });
    expect(runClock(map, 1000).remaining).toBe(0);
    expect(() => runClock(map, -1)).toThrow();
  });
});

describe('campaign world scaling via the existing spawner', () => {
  it('scales enemy HP/damage and the spawn rate by map difficulty; reserves elite/boss slots', () => {
    const w = campaignWorld(5);
    const id = w.spawnEnemy('melee', 300);
    const e = w.core.getEntity(id);
    expect(e.maxHp).toBeCloseTo(ALPHA_ENEMY_STATS.maxHp * 1.48, 9);
    expect(e.physicalDamage).toBeCloseTo(ALPHA_ENEMY_STATS.physicalDamage * 1.32, 9);
    expect(e.magicalDamage).toBeCloseTo(ALPHA_ENEMY_STATS.magicalDamage * 1.32, 9);
    expect(e.resistance).toBe(ALPHA_ENEMY_STATS.resistance);
    const s = w.getSnapshot().spawning.settings;
    expect(s.interval).toBeCloseTo(4 / 1.32, 12);
    expect(s.maxActive).toBe(ALPHA.enemyCap - CAMPAIGN_BALANCE.reservedSlots);
    const map1 = campaignWorld(1).getSnapshot().spawning.settings;
    expect(map1.interval).toBe(4);
  });
  it('the classic alpha (no campaign) is unchanged', () => {
    const w = new GameplayWorld({ characterClass: 'mage', initialEnemies: false });
    expect(w.getSnapshot().campaign).toBeNull();
    expect(w.core.getEntity(w.spawnEnemy('melee', 300)).maxHp).toBe(ALPHA_ENEMY_STATS.maxHp);
    expect(w.getSnapshot().spawning.settings.maxActive).toBe(ALPHA.enemyCap);
  });
  it('the timer is frozen during manual pause and a pending level-up choice', () => {
    const w = campaignWorld(1, { spawning: { enabled: false } });
    w.update(5);
    expect(w.getSnapshot().campaign!.elapsed).toBeCloseTo(5, 9);
    w.setPaused(true);
    w.update(30);
    expect(w.getSnapshot().campaign!.elapsed).toBeCloseTo(5, 9);
    w.setPaused(false);
    w.grantTestXp(60);
    expect(w.run.pendingChoices).toBeGreaterThan(0);
    w.update(30);
    expect(w.getSnapshot().campaign!.elapsed).toBeCloseTo(5, 9);
    expect(w.getSnapshot().campaign!.stage.id).toBe('opening');
  });
  it('no new waves at or after the duration; existing enemies keep acting', () => {
    const w = campaignWorld(1, { spawning: { maxActive: 2 } });
    play(w, 599.9, 0.25);
    const before = w.getSnapshot().spawning;
    expect(before.waves).toBeGreaterThan(200);
    play(w, 10.1, 0.25); // world history is bounded; use the authoritative wave counter
    const after = w.getSnapshot().spawning;
    expect(after.waves).toBe(before.waves + (before.nextSpawnAt < 600 ? 1 : 0));
    expect(after.nextSpawnAt).toBeGreaterThanOrEqual(600);
    const lastWave = w
      .getEvents()
      .filter((e) => e.channel === 'spawning' && e.event.type === 'wave-spawned')
      .at(-1)!;
    expect(lastWave.time).toBeLessThan(600);
    const snap = w.getSnapshot().campaign!;
    expect(snap).toMatchObject({ durationReached: true, remaining: 0 });
    expect(snap.stage.id).toBe('boss');
  });
});
