import { describe, expect, it } from 'vitest';
import { ALPHA, GameplayWorld } from '../../src/gameplay';
import { QaGameplayWorld } from '../../src/gameplay/qa';
import type { GameplayOptions } from '../../src/gameplay';

const options = (): GameplayOptions => ({
  characterClass: 'warrior',
  seed: 5,
  initialEnemies: false,
  spawning: { enabled: false },
  onHit: [],
  campaign: { mapId: 1, runId: 'speed-run' },
});
const ARENA = { x: 0, y: 0, width: ALPHA.arenaSize, height: ALPHA.arenaSize };
const rewarded = (w: GameplayWorld) =>
  w.getEvents().filter((e) => e.event.type === 'enemy-rewarded').length;

describe('Task 08.5 §1.2 kill all on screen (normal deaths)', () => {
  it('kills only enemies in view; kills, crystals and rewards are the normal ones, once', () => {
    const w = new GameplayWorld(options());
    const near = [w.spawnEnemy('melee', 200, 0), w.spawnEnemy('ranged', 300, Math.PI)];
    const far = w.spawnEnemy('melee', 1400, Math.PI / 2); // outside the 1280×720 view
    expect(w.debugKillInView()).toBe(2);
    const s = w.getSnapshot();
    expect(s.kills).toBe(2);
    expect(s.enemies.filter((e) => e.alive).map((e) => e.entityId)).toEqual([far]);
    expect(near.every((id) => !s.enemies.find((e) => e.entityId === id)?.alive)).toBe(true);
    expect(s.crystals.length).toBeGreaterThan(0);
    expect(rewarded(w)).toBe(2);
    expect(w.debugKillInView()).toBe(0); // dead enemies are never rewarded twice
    expect(w.getSnapshot().kills).toBe(2);
    expect(rewarded(w)).toBe(2);
  });
  it('elite and boss deaths count as elite/boss kills in the campaign run', () => {
    const w = new GameplayWorld(options());
    w.debugFireCampaignEvent('elite-1');
    w.debugFireCampaignEvent('boss');
    expect(w.debugKillInView(ARENA)).toBe(2);
    const c = w.getSnapshot().campaign!;
    expect(c.eliteKills).toBe(1);
    expect(c.bossKilled).toBe(true);
    expect(w.getEvents().filter((e) => e.event.type === 'boss-defeated')).toHaveLength(1);
  });
  it('rejects an invalid view before changing anything', () => {
    const w = new GameplayWorld(options());
    w.spawnEnemy('melee', 200, 0);
    for (const view of [
      { x: 0, y: 0, width: 0, height: 10 },
      { x: NaN, y: 0, width: 10, height: 10 },
    ])
      expect(() => w.debugKillInView(view)).toThrow(RangeError);
    expect(w.getSnapshot().kills).toBe(0);
  });
  it('God Mode (QA/DEV world) blocks player HP loss in campaign runs, including the boss', () => {
    const run = (god: boolean) => {
      const w = new QaGameplayWorld(options());
      w.setGodMode(god);
      w.debugFireCampaignEvent('boss');
      const hp = w.getSnapshot().player.currentHp;
      for (let t = 0; t < 20 && w.survival.getState().runState === 'active'; t += 0.5)
        w.update(0.5);
      return { w, hp };
    };
    const control = run(false);
    expect(control.w.getSnapshot().player.currentHp).toBeLessThan(control.hp); // the boss hits
    const { w, hp } = run(true);
    expect(w.getSnapshot().player.currentHp).toBe(hp);
    expect(w.survival.getState().runState).toBe('active');
  });
});
