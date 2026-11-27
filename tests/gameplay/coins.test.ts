import { describe, expect, it } from 'vitest';
import { GameplayWorld, ALPHA_ENEMIES } from '../../src/gameplay';
import { RunCoins } from '../../src/gameplay/coins';
import {
  COIN_RULES,
  coinScale,
  coinTarget,
  coinValue,
  normalChance,
  victoryBonus,
} from '../../src/equipment';
import { campaignSchedule, getCampaignMap } from '../../src/campaign';
import type { CombatTag } from '../../src/skills';
import { XP_RULES } from '../../src/gameplay/experience';

const stationary = { ...ALPHA_ENEMIES.melee, movementSpeed: 0 };
function world(seed: number, mapId: number | null = 1) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    ...(mapId ? { campaign: { mapId } } : {}),
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01);
  return w;
}
const kill = (w: GameplayWorld, id: string) => {
  const t = new Set<CombatTag>(['physical']);
  w.skills.hit(id, w.skills.attack(t, 1e6, 'physical'), t, { procs: false });
};
const drops = (w: GameplayWorld) =>
  w
    .getEvents()
    .filter((e) => e.event.type === 'coins-dropped')
    .map((e) => (e.event as { amount: number }).amount);
/**
 * Kills `n` far-away normal enemies one by one; returns, per kill, the coins it dropped (read from
 * the piles on the ground — the world event history is bounded).
 */
function killNormals(w: GameplayWorld, n: number) {
  const ground = () => w.getSnapshot().coins.piles.reduce((s, p) => s + p.value, 0);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const before = ground();
    kill(w, w.spawnEnemy('melee', 1500, (i * 0.37) % 6.28, stationary));
    out.push(ground() - before);
  }
  return out;
}

describe('Task 11 Phase 4 — coin piles (RunCoins)', () => {
  it('piles merge per cell; the separate cap merges into the nearest pile and never loses coins', () => {
    const c = new RunCoins();
    c.drop({ x: 10, y: 10 }, 3);
    c.drop({ x: 20, y: 20 }, 2); // same 64-unit cell → one pile
    expect(c.getPiles()).toHaveLength(1);
    expect(c.getPiles()[0].value).toBe(5);
    for (let i = 0; i < COIN_RULES.pileCap + 50; i++) c.drop({ x: 100 + i * 70, y: 3000 }, 1);
    expect(c.getPiles()).toHaveLength(COIN_RULES.pileCap);
    expect(c.onGround).toBe(5 + COIN_RULES.pileCap + 50);
    expect(() => c.drop({ x: 0, y: 0 }, 0)).toThrow();
    expect(() => c.drop({ x: 0, y: 0 }, 1.5)).toThrow();
  });
  it('collection uses the crystal magnet radius; collected coins only grow', () => {
    const c = new RunCoins();
    const reach = 20 + XP_RULES.pickupRadius + XP_RULES.crystalRadius;
    c.drop({ x: 1000 + reach, y: 1000 }, 4);
    c.drop({ x: 1000 + reach + 70, y: 1000 }, 9);
    const events = c.collect({ x: 1000, y: 1000 }, 20);
    expect(events).toEqual([{ type: 'coins-collected', pileId: 'coins-1', amount: 4 }]);
    expect([c.collected, c.onGround]).toEqual([4, 9]);
  });
});

describe('Task 11 Phase 4 — drops in the world', () => {
  it('values scale with the map: normal piles like the Task 10 Gold table; boss 20% and all elites together 20% of the 60% coin target', () => {
    expect([coinScale(1), coinScale(10), coinScale(40)]).toEqual([1, 4, 10]);
    expect([1, 10, 40].map((m) => coinValue('normal', m))).toEqual([1, 4, 10]);
    // Task 40: victory Gold ×0.8, so the coin targets follow (60% of 60 / 240 / 360 / 600).
    expect([1, 10, 20, 40].map(coinTarget)).toEqual([36, 144, 216, 360]);
    // Boss: 20% of the coin target (map 1: 7.2 → 7, map 40: 72).
    expect([1, 10, 40].map((m) => coinValue('boss', m))).toEqual([7, 29, 72]);
    // Elites: 20% of the target shared by the map's elites (map 1: 4 elites → 1.8 → 2 each; map 10: 7 → 4; map 40: 22 → 3).
    expect([1, 10, 20, 25, 40].map((m) => coinValue('elite', m))).toEqual([2, 4, 5, 3, 3]);
    for (const m of [1, 10, 20, 25, 40]) {
      const elites = campaignSchedule(getCampaignMap(m)).filter((e) => e.kind === 'elite').length;
      const target = coinTarget(m) * COIN_RULES.eliteShare;
      expect(Math.abs(coinValue('elite', m) * elites - target)).toBeLessThanOrEqual(elites * 0.5);
    }
    expect([1, 40].map(victoryBonus)).toEqual([24, 240]);
    // Normal chance: 21.6 piles (60% of the target at scale 1) over 4.7 × spawnRate × duration kills.
    expect(normalChance(1)).toBeCloseTo(21.6 / (4.7 * 1 * 600), 10);
    expect(normalChance(10)).toBeCloseTo(21.6 / (4.7 * 1.72 * 900), 10);
    expect(normalChance(40)).toBeCloseTo(normalChance(10), 10);
  });
  it('deterministic per seed: same seed + same kills → identical drops; one roll per normal death', () => {
    const a = killNormals(world(7), 1500);
    const b = killNormals(world(7), 1500);
    expect(a).toEqual(b);
    const dropped = a.filter((v) => v > 0);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.length).toBeLessThan(1500 * normalChance(1) * 2); // ≈ 1% per normal death on map 1
    expect(dropped.every((v) => v === coinValue('normal', 1))).toBe(true);
    expect(killNormals(world(8), 1500)).not.toEqual(a);
  });
  it('each death drops at most once (a dead enemy hit again drops nothing); elites and the boss always drop', () => {
    const w = world(3, 20);
    const id = w.spawnEnemy('melee', 1500, 0, stationary);
    kill(w, id);
    const n = drops(w).length;
    kill(w, id); // already dead: no second reward, no second drop
    expect(drops(w).length).toBe(n);
    w.debugFireCampaignEvent('elite-1');
    const elite = w.getSnapshot().campaign!.eliteEnemyIds[0];
    kill(w, elite);
    w.debugFireCampaignEvent('boss');
    kill(w, w.getSnapshot().campaign!.bossEnemyId!);
    expect(drops(w).slice(n)).toEqual([coinValue('elite', 20), coinValue('boss', 20)]);
  });
  it('coins are collected by walking over them and appear in the snapshot; sandbox runs drop none', () => {
    const w = world(1, 1);
    w.debugFireCampaignEvent('elite-1');
    const elite = w.getSnapshot().campaign!.eliteEnemyIds[0];
    const pos = w.getSnapshot().enemies.find((e) => e.entityId === elite)!.position;
    kill(w, elite);
    expect(w.getSnapshot().coins.piles.map((p) => p.value)).toEqual([coinValue('elite', 1)]);
    const p = w.getSnapshot().playerBody;
    const d = Math.hypot(pos.x - p.x, pos.y - p.y);
    w.setMovement((pos.x - p.x) / d, (pos.y - p.y) / d);
    for (let i = 0; i < 400 && w.getSnapshot().coins.collected === 0; i++) w.update(0.05);
    expect(w.getSnapshot().coins).toEqual({ collected: coinValue('elite', 1), piles: [] });
    expect(killNormals(world(7, null), 200).every((v) => v === 0)).toBe(true);
  });
  it('a victory collects every pile left on the ground (the map 1–10 boss dies at the end); a defeat does not', () => {
    const w = world(5, 1);
    w.debugFireCampaignEvent('elite-1');
    kill(w, w.getSnapshot().campaign!.eliteEnemyIds[0]);
    w.debugFireCampaignEvent('boss');
    w.debugFireCampaignEvent('end');
    expect(w.getSnapshot().campaign!.status).toBe('active');
    kill(w, w.getSnapshot().campaign!.bossEnemyId!);
    w.update(0.05);
    expect(w.getSnapshot().campaign!.status).toBe('victory');
    expect(w.getSnapshot().coins).toEqual({
      collected: coinValue('elite', 1) + coinValue('boss', 1),
      piles: [],
    });
    const lost = world(5, 1);
    lost.debugFireCampaignEvent('elite-1');
    kill(lost, lost.getSnapshot().campaign!.eliteEnemyIds[0]);
    lost.setTestProtection(false);
    lost.debugForceOutcome('defeat');
    lost.update(0.05);
    expect(lost.getSnapshot().campaign!.status).toBe('defeat');
    expect(lost.getSnapshot().coins.collected).toBe(0);
    expect(lost.getSnapshot().coins.piles.map((p) => p.value)).toEqual([coinValue('elite', 1)]);
  });
});
