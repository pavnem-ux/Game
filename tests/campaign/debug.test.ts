import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import { createTestingController, createTestingWorld } from '../../src/gameplay/testing';
import type { GameplayOptions } from '../../src/gameplay';
import { resolveOffers } from '../skills/helpers';

const options = (mapId = 1): GameplayOptions => ({
  characterClass: 'warrior',
  seed: 4,
  initialEnemies: false,
  spawning: { enabled: false },
  onHit: [],
  campaign: { mapId, runId: 'dbg-run' },
});
function world(mapId = 1) {
  const w = new GameplayWorld(options(mapId));
  w.setTestProtection(true);
  return w;
}
const resolutions = (w: GameplayWorld) =>
  w.getEvents().filter((e) => e.event.type === 'run-resolved');

describe('Task 08 debug tools (normal pipelines, exactly once)', () => {
  it('spawning the boss early marks it fired: the scheduled 10:00 boss never spawns again', () => {
    const w = world(10);
    expect(w.debugFireCampaignEvent('boss')).toBe(true);
    expect(w.debugFireCampaignEvent('boss')).toBe(false);
    const bossId = w.getSnapshot().campaign!.bossEnemyId;
    w.debugSetBossHpFraction(0); // kill it so the long run stays cheap
    while (w.time < 610 && w.getSnapshot().campaign!.status === 'active') {
      w.update(30);
      resolveOffers(w);
    }
    expect(w.getSnapshot().campaign!.bossEnemyId).toBe(bossId);
    expect(w.getSnapshot().campaign!.firedEvents.filter((id) => id === 'boss')).toHaveLength(1);
  });
  it('boss HP cut goes through Combat Core and never heals', () => {
    const w = world(1);
    expect(w.debugSetBossHpFraction(0.5)).toBe(false); // no boss yet
    w.debugFireCampaignEvent('boss');
    expect(w.debugSetBossHpFraction(0.1)).toBe(true);
    const boss = w.getSnapshot().campaign!.boss!;
    expect(Math.abs(boss.hp - boss.maxHp * 0.1)).toBeLessThanOrEqual(1);
    w.debugSetBossHpFraction(0.5);
    expect(w.getSnapshot().campaign!.boss!.hp).toBe(boss.hp);
    expect(() => w.debugSetBossHpFraction(2)).toThrow();
  });
  it('forced victory resolves once through boss death + duration (results pipeline)', () => {
    const w = world(3);
    w.update(30);
    w.debugForceOutcome('victory');
    const c = w.getSnapshot().campaign!;
    expect(c).toMatchObject({ status: 'victory', bossKilled: true, durationReached: true });
    expect(resolutions(w)).toHaveLength(1);
    expect(w.getEvents().filter((e) => e.event.type === 'boss-defeated')).toHaveLength(1);
    w.debugForceOutcome('defeat'); // already resolved: ignored
    expect(resolutions(w)).toHaveLength(1);
  });
  it('forced defeat goes through death and finishing the run (no revival)', () => {
    const w = world(2);
    w.update(20);
    w.debugForceOutcome('defeat');
    expect(w.survival.getState().runState).toBe('ended');
    expect(w.getSnapshot().campaign!.status).toBe('defeat');
    expect(resolutions(w)).toHaveLength(1);
  });
  it('testing controller: skip to the next event uses the normal simulation', () => {
    let w = createTestingWorld(options(1));
    const control = createTestingController(
      () => w,
      (o) => {
        w = createTestingWorld(o);
      },
    );
    control({ type: 'protection', enabled: true });
    control({ type: 'campaign-skip' });
    expect(w.time).toBe(120);
    expect(w.getSnapshot().campaign!.firedEvents).toEqual(['elite-1']);
    control({ type: 'campaign-boss-now' });
    expect(() => control({ type: 'campaign-boss-now' })).toThrow();
    control({ type: 'campaign-boss-hp', fraction: 0.1 });
    control({ type: 'campaign-force', outcome: 'victory' });
    expect(w.getSnapshot().campaign!.status).toBe('victory');
  });
});
