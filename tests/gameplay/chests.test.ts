import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import { BUFFS, CHEST_RULES, RunChests, buffModifiers, chestGold } from '../../src/gameplay/chests';
import type { ChestEvent } from '../../src/gameplay/chests';
import { lcgStream } from '../../src/gameplay/rng';
import { composeRunStats } from '../../src/skills/stats';
import { resolveOffers } from '../skills/helpers';
import { addModifiers } from '../../src/equipment';
import { getCampaignMap } from '../../src/campaign';

function world(seed = 1, mapId = 1) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    campaign: { mapId },
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01);
  return w;
}
/** Steps the world, collecting events incrementally (the world history is bounded). */
function step(w: GameplayWorld, seconds: number, dt = 0.25, sink: WorldEvent[] = []) {
  let seq = w.getEvents().at(-1)?.sequence ?? 0;
  const end = w.time + seconds;
  while (w.time < end - 1e-9) {
    resolveOffers(w); // level-up choices pause the world; take the first offer
    if (w.paused) break;
    w.update(Math.min(dt, end - w.time));
    const fresh = w.getEvents(seq);
    if (fresh.length) seq = fresh.at(-1)!.sequence;
    sink.push(...fresh);
  }
  return sink;
}
const chestEvents = (events: WorldEvent[], type: ChestEvent['type']) =>
  events.filter((e) => e.channel === 'chests' && e.event.type === type);
/** Walks the player onto a chest through normal movement input; returns the events on the way. */
function walkTo(w: GameplayWorld, id: string) {
  const sink: WorldEvent[] = [];
  for (let i = 0; i < 400; i++) {
    const chest = w.getSnapshot().chests!.items.find((c) => c.id === id);
    if (!chest) break;
    const p = w.getSnapshot().playerBody;
    const d = Math.hypot(chest.x - p.x, chest.y - p.y) || 1;
    w.setMovement((chest.x - p.x) / d, (chest.y - p.y) / d);
    step(w, 0.05, 0.05, sink);
  }
  w.setMovement(0, 0);
  return sink;
}

describe('Task 12 Phase 3 — chest scheduling', () => {
  it('spawns every 45 s (0:45, 1:30, 2:15) 250–450 units from the player, inside the arena', () => {
    const w = world();
    const events = step(w, 136);
    const spawned = chestEvents(events, 'chest-spawned');
    expect(spawned.map((e) => e.time)).toEqual([45, 90, 135]);
    for (const e of spawned) {
      const c = (e.event as Extract<ChestEvent, { type: 'chest-spawned' }>).chest;
      expect(c.expiresAt - c.spawnedAt).toBe(CHEST_RULES.lifetime);
      // The player stands still here, so its position at spawn time is the start position.
      const p = w.getSnapshot().playerBody;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      expect(d).toBeGreaterThanOrEqual(250 - 1e-9);
      expect(d).toBeLessThanOrEqual(450 + 1e-9);
      expect(c.x).toBeGreaterThanOrEqual(CHEST_RULES.arenaMargin);
      expect(c.y).toBeGreaterThanOrEqual(CHEST_RULES.arenaMargin);
    }
    // Lifetime 60 s: the 0:45 chest expired at 1:45 (blinking from 1:40).
    expect(chestEvents(events, 'chest-expired').map((e) => e.time)).toEqual([105]);
    expect(w.getSnapshot().chests!.items).toHaveLength(2);
  });
  it('at 3 chests the scheduled spawn is skipped and the timer keeps running; blinking in the last 5 s', () => {
    const w = world();
    for (let i = 0; i < 3; i++) expect(w.debugSpawnChest('wooden')).not.toBeNull();
    expect(w.debugSpawnChest('wooden')).toBeNull(); // the limit applies to debug spawns too
    const events = step(w, 46);
    expect(chestEvents(events, 'chest-spawn-skipped').map((e) => [e.time, e.event])).toEqual([
      [45, { type: 'chest-spawn-skipped', reason: 'limit' }],
    ]);
    expect(w.getSnapshot().chests!.nextSpawnAt).toBe(90);
    step(w, 8.9); // 54.9 s: the debug chests (spawned at 0) still live, not blinking yet
    expect(w.getSnapshot().chests!.items.every((c) => !c.blinking)).toBe(true);
    step(w, 0.2); // 55.1 s: last 5 s
    expect(w.getSnapshot().chests!.items.every((c) => c.blinking)).toBe(true);
    const expired = chestEvents(step(w, 5), 'chest-expired');
    expect(expired.map((e) => e.time)).toEqual([60, 60, 60]);
  });
  it('frozen during pause: no spawn, no expiry, no buff time while paused', () => {
    const w = world();
    w.debugSpawnChest('wooden');
    w.debugGrantBuff('fury');
    step(w, 10);
    const before = w.getSnapshot().chests!;
    w.setPaused(true);
    w.update(100);
    expect(w.time).toBe(10);
    expect(w.getSnapshot().chests).toEqual(before);
    w.setPaused(false);
    expect(chestEvents(step(w, 35.5), 'chest-spawned').map((e) => e.time)).toEqual([45]);
  });
  it('type and content rolls are deterministic per seed; ≈ 75% wooden / 25% enchanted', () => {
    const run = (seed: number) => {
      const w = world(seed);
      return chestEvents(step(w, 300), 'chest-spawned').map((e) => e.event);
    };
    expect(run(9)).toEqual(run(9));
    expect(run(9)).not.toEqual(run(10));
    const chests = new RunChests(lcgStream(5), 3200);
    let enchanted = 0;
    const contents = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const e = chests.spawnAt(i, { x: 1600, y: 1600 });
      if (e.type !== 'chest-spawned') throw new Error('spawn failed');
      if (e.chest.type === 'enchanted') enchanted++;
      const content = chests.open(e.chest, true);
      contents.set(content, (contents.get(content) ?? 0) + 1);
    }
    expect(enchanted / 4000).toBeGreaterThan(0.22);
    expect(enchanted / 4000).toBeLessThan(0.28);
    for (const c of ['magnet', 'fury', 'haste', 'lightStep'])
      expect(contents.get(c)! / enchanted).toBeCloseTo(0.25, 1);
    expect(contents.get('heal')! / (4000 - enchanted)).toBeCloseTo(0.5, 1);
    // At full HP a wooden chest always gives gold.
    const full = new RunChests(lcgStream(6), 3200);
    for (let i = 0; i < 200; i++) {
      const e = full.spawnAt(i, { x: 1600, y: 1600 }, 'wooden');
      if (e.type === 'chest-spawned') expect(full.open(e.chest, false)).toBe('gold');
    }
  });
});

describe('Task 12 Phase 3 — opening and contents', () => {
  it('opens by touch only (player radius + 16), not by the pickup magnet', () => {
    const chests = new RunChests(lcgStream(1), 3200);
    const e = chests.spawnAt(0, { x: 1000, y: 1000 });
    if (e.type !== 'chest-spawned') throw new Error('spawn failed');
    const c = e.chest;
    expect(chests.touched({ x: c.x + 13 + 16, y: c.y, radius: 13 })).toHaveLength(1);
    expect(chests.touched({ x: c.x + 13 + 16.01, y: c.y, radius: 13 })).toHaveLength(0);
  });
  it('wooden heal: +15% Max HP through Combat Core, never above Max HP', () => {
    const w = world();
    const max = w.core.getEntity('player').maxHp;
    w.setPlayerHp(Math.round(max * 0.95));
    const id = w.debugSpawnChest('wooden', 'heal')!;
    const opened = chestEvents(walkTo(w, id), 'chest-opened');
    expect(opened).toHaveLength(1);
    expect(opened[0].event).toMatchObject({ content: 'heal' });
    expect(w.core.getEntity('player').currentHp).toBe(max);
    expect((opened[0].event as { amount: number }).amount).toBeCloseTo(
      max - Math.round(max * 0.95),
      9,
    );
  });
  it('wooden gold: a coin pile of max(5, 2% victory Gold) at the chest, collected by the normal pickup', () => {
    expect(chestGold(75)).toBe(5);
    expect(chestGold(750)).toBe(15);
    // Task 40: map 40's victory Gold is 600 (750 × 0.8) → 12.
    expect(getCampaignMap(40).victoryGold).toBe(600);
    const w = world(1, 40);
    const id = w.debugSpawnChest('wooden', 'gold')!;
    const events = walkTo(w, id);
    expect(chestEvents(events, 'chest-opened')[0].event).toMatchObject({
      content: 'gold',
      amount: chestGold(getCampaignMap(40).victoryGold),
    });
    step(w, 0.2);
    expect(w.getSnapshot().coins.collected).toBe(chestGold(600));
  });
  it('«Magnet» collects every crystal and coin on the map once (level-ups resolve normally)', () => {
    const w = world();
    for (let i = 0; i < 5; i++) w.dropTestCrystal(30, 900 + i * 70);
    w.debugGrantBuff('fury'); // unrelated buff keeps running
    const id = w.debugSpawnChest('enchanted', 'magnet')!;
    const events = walkTo(w, id);
    const opened = chestEvents(events, 'chest-opened');
    expect(opened[0].event).toMatchObject({ content: 'magnet', amount: 150 });
    expect(w.getSnapshot().crystals).toEqual([]);
    expect(w.getSnapshot().progression.totalXp).toBe(150);
    expect(events.some((e) => e.event.type === 'run-level-up')).toBe(true);
    const again = w.debugSpawnChest('enchanted', 'magnet')!;
    expect(chestEvents(walkTo(w, again), 'chest-opened')[0].event).toMatchObject({ amount: 0 });
    expect(w.getSnapshot().progression.totalXp).toBe(150);
  });
});

describe('Task 12 Phase 3 — buffs', () => {
  it('buffs compose through composeRunStats (caps once); the same buff refreshes, different buffs stack', () => {
    const w = world();
    const base = w.skills.effectiveStats;
    w.debugGrantBuff('fury');
    const primary = w.character.primaryAttributes;
    const expected = (ids: ('fury' | 'haste' | 'lightStep')[]) =>
      composeRunStats(primary, addModifiers(w.permanentModifiers, buffModifiers(ids)));
    expect(w.skills.effectiveStats).toEqual(expected(['fury']));
    expect(w.skills.effectiveStats.physicalDamage).toBeCloseTo(base.physicalDamage * 1.2, 9);
    expect(w.skills.effectiveStats.magicalDamage).toBeCloseTo(base.magicalDamage * 1.2, 9);
    step(w, 10);
    w.debugGrantBuff('fury'); // refresh: 20 s from now, no second +20%
    expect(w.getSnapshot().chests!.buffs).toEqual([
      { id: 'fury', name: 'Fury', remaining: 20, expiresAt: 30 },
    ]);
    expect(w.skills.effectiveStats).toEqual(expected(['fury']));
    w.debugGrantBuff('haste');
    w.debugGrantBuff('lightStep');
    expect(w.skills.effectiveStats).toEqual(expected(['fury', 'haste', 'lightStep']));
    expect(w.skills.effectiveStats.attackSpeed).toBe(base.attackSpeed + 25);
    // Caps apply once: a capped attribute stays at its cap with the buff.
    const capped = composeRunStats(primary, {
      ...addModifiers(w.permanentModifiers, buffModifiers(['haste'])),
      attackSpeed: 10_000,
    });
    expect(capped.attackSpeed).toBe(300);
    // Expiry at 30 s (fury) and 30 s (haste, light step granted at 10 s).
    const ended = chestEvents(step(w, 21), 'buff-ended');
    expect(ended.map((e) => [e.time, (e.event as { buff: string }).buff])).toEqual([
      [30, 'fury'],
      [30, 'haste'],
      [30, 'lightStep'],
    ]);
    expect(w.skills.effectiveStats).toEqual(base);
    const uptime = w.getSnapshot().runStats.chests.buffUptime;
    expect(uptime).toEqual({ fury: 30, haste: 20, lightStep: 20 });
    expect(BUFFS.fury.name).toBe('Fury');
  });
  it('buffs are kept on revive and removed at run end', () => {
    const w = world();
    w.setTestProtection(false);
    w.debugGrantBuff('haste');
    w.setPlayerHp(0);
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    w.decide('revive');
    expect(w.getSnapshot().chests!.buffs.map((b) => b.id)).toEqual(['haste']);
    const base = w.skills.effectiveStats.attackSpeed;
    w.debugForceOutcome('victory');
    w.update(0.05);
    expect(w.getSnapshot().campaign!.status).toBe('victory');
    expect(w.getSnapshot().chests!.buffs).toEqual([]);
    expect(w.skills.effectiveStats.attackSpeed).toBe(base - 25);
  });
  it('run stats count chests spawned / opened / expired by type and contents', () => {
    const w = world();
    const id = w.debugSpawnChest('enchanted', 'haste')!;
    walkTo(w, id);
    w.debugSpawnChest('wooden'); // after the walk, so the player cannot step on it on the way
    const s = w.getSnapshot().runStats.chests;
    expect(s.spawned).toEqual({ wooden: 1, enchanted: 1 });
    expect(s.opened).toEqual({ wooden: 0, enchanted: 1 });
    expect(s.contents).toEqual({ haste: 1 });
  });
});
