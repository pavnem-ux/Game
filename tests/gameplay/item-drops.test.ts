import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import {
  DROP_RULES,
  bossDropRarity,
  dropItemLevel,
  eliteDropRarity,
  rollDropItem,
  validateItem,
} from '../../src/equipment';
import type { DropDifficulty, Rarity } from '../../src/equipment';
import { lcgStream } from '../../src/gameplay/rng';

const ARENA = { x: -1e5, y: -1e5, width: 2e5, height: 2e5 };
const world = (seed: number, difficulty: DropDifficulty = 'normal', level = 20) => {
  const w = new GameplayWorld({
    characterClass: 'rogue',
    level,
    seed,
    initialEnemies: false,
    spawning: { enabled: false },
    campaign: { mapId: 3, difficulty },
  });
  w.setTestProtection(true);
  return w;
};
const loot = (w: GameplayWorld) => w.getSnapshot().loot!;

/** Task 42 §2 — item drops (provisional numbers). */
describe('Task 42 — drop rules', () => {
  it('item level = min(class level, cap); cap Normal 5 + map, Hard 10 + map, Nightmare / Trial 15 + map; ≤ 50', () => {
    expect(dropItemLevel(30, 3, 'normal')).toBe(8);
    expect(dropItemLevel(30, 3, 'hard')).toBe(13);
    expect(dropItemLevel(30, 3, 'nightmare')).toBe(18);
    expect(dropItemLevel(30, 3, 'trial')).toBe(18);
    expect(dropItemLevel(4, 3, 'normal')).toBe(4);
    expect(dropItemLevel(50, 40, 'trial')).toBe(50);
  });
  it('boss rarity follows the difficulty table; elites drop 5% (Rare 80 / Epic 20)', () => {
    const share = (d: DropDifficulty) => {
      const r = lcgStream(9);
      const n: Record<string, number> = {};
      for (let i = 0; i < 20000; i++) {
        const x = bossDropRarity(r, d);
        n[x] = (n[x] ?? 0) + 1;
      }
      return n;
    };
    for (const d of ['normal', 'hard', 'nightmare', 'trial'] as const) {
      const n = share(d);
      for (const [rarity, pct] of Object.entries(DROP_RULES.bossRarity[d]))
        expect(n[rarity] / 20000, `${d} ${rarity}`).toBeCloseTo(pct / 100, 1);
      expect(Object.keys(n).every((k) => k in DROP_RULES.bossRarity[d])).toBe(true);
    }
    const r = lcgStream(3);
    const elite: (Rarity | null)[] = Array.from({ length: 40000 }, () => eliteDropRarity(r));
    const drops = elite.filter((x) => x !== null);
    expect(drops.length / 40000).toBeCloseTo(0.05, 2);
    expect(drops.filter((x) => x === 'rare').length / drops.length).toBeCloseTo(0.8, 1);
    expect(drops.every((x) => x === 'rare' || x === 'epic')).toBe(true);
  });
  it('dropped items: valid Task 40 instances, any slot, weapons always for the played class', () => {
    const r = lcgStream(5);
    const slots = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const item = rollDropItem(r, {
        uid: `drop-${i + 1}`,
        rarity: 'epic',
        itemLevel: 12,
        characterClass: 'archer',
      });
      expect(validateItem(item)).toEqual(item);
      slots.add(item.slot);
      if (item.slot === 'weapon') expect(item.characterClass).toBe('archer');
    }
    expect(slots.size).toBe(7);
  });
});

describe('Task 42 — drops in the run', () => {
  it('a victory adds the boss item to the loot; ground items are collected at the run end', () => {
    const w = world(4, 'hard');
    expect(w.debugSpawnEliteDrop('rare')).toBe(true);
    const p = loot(w).pickups;
    expect(p).toHaveLength(1);
    expect(p[0].item).toMatchObject({ rarity: 'rare', itemLevel: 13 }); // map 3 Hard cap 13
    w.debugForceBossDropRarity('epic');
    w.debugForceOutcome('victory');
    const l = loot(w);
    expect(l.pickups).toHaveLength(0);
    expect(l.collected.map((i) => i.rarity)).toEqual(['rare', 'epic']);
    expect(new Set(l.collected.map((i) => i.uid)).size).toBe(2);
  });
  it('Task 43: the boss item can be a Legendary of the map pool; elite drops never are', () => {
    const w = world(4);
    w.debugForceLegendaryDrop(true);
    w.debugForceOutcome('victory');
    const boss = loot(w).collected.at(-1)!;
    // Map 3 pool #2 Stride, #5 Ring, #8 Thunder Kite (Archer) → the Rogue's first fitting is Stride.
    expect(boss).toMatchObject({
      rarity: 'legendary',
      legendaryId: 'ash_wolf_stride',
      slot: 'pants',
    });
    expect(boss.itemLevel).toBe(8);
  });
  it('a defeat keeps the elite items (no boss item); walking over a pickup collects it', () => {
    const w = world(6);
    expect(w.debugSpawnEliteDrop('epic')).toBe(true); // at the player → next step collects it
    w.update(0.05);
    expect(loot(w).pickups).toHaveLength(0);
    expect(loot(w).collected).toHaveLength(1);
    expect(w.getEvents().some((e) => e.event.type === 'item-collected')).toBe(true);
    w.debugSpawnEliteDrop('rare');
    w.setTestProtection(false);
    w.debugForceOutcome('defeat');
    expect(loot(w).collected.map((i) => i.rarity)).toEqual(['epic', 'rare']);
  });
  it('elite kills roll from the seeded stream: same seed → same items at any step size', () => {
    const run = (seed: number, step: number) => {
      const w = world(seed);
      for (const id of ['elite-1', 'elite-2', 'elite-3', 'elite-4']) w.debugFireCampaignEvent(id);
      expect(w.debugKillInView(ARENA)).toBe(4); // four elite rolls (5% each)
      for (const r of ['rare', 'epic', 'uncommon'] as const) w.debugSpawnEliteDrop(r);
      for (let t = 0; t < 1 - 1e-9; t += step) w.update(step);
      const l = loot(w);
      return [...l.collected, ...l.pickups.map((p) => p.item)];
    };
    const a = run(11, 0.25);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(run(11, 0.05)).toEqual(a);
    expect(run(12, 0.25)).not.toEqual(a);
    // Without a campaign there is no loot at all.
    const sandbox = new GameplayWorld({ characterClass: 'mage', seed: 1 });
    expect(sandbox.getSnapshot().loot).toBeUndefined();
  });
});
