import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_DIFFICULTIES,
  CAMPAIGN_MAPS,
  campaignSchedule,
  getCampaignMap,
} from '../../src/campaign';
import { getBossDefinition } from '../../src/campaign/bosses';
import { GameplayWorld } from '../../src/gameplay';
import { resolveOffers } from '../skills/helpers';

/** Task 39: map difficulty tiers (Normal / Hard / Nightmare / Elite Trial) and elites ×10. */
describe('Task 39 — tier variants of a map', () => {
  it('Normal is the map itself; elites have ×10 the normal enemy health', () => {
    for (const map of CAMPAIGN_MAPS) {
      expect(getCampaignMap(map.id, 'normal')).toBe(map);
      expect(map.tier).toBe('normal');
      expect(map.elite.hpMultiplier).toBeCloseTo(
        10 * (map.modifiers.some((m) => m.id === 'elites') ? 1.25 : 1),
        12,
      );
    }
    expect(CAMPAIGN_DIFFICULTIES).toEqual(['normal', 'hard', 'nightmare', 'trial']);
    expect(() => getCampaignMap(1, 'insane' as never)).toThrow(RangeError);
  });
  it('Hard / Nightmare: +50% / +100% health and damage for every monster, rewards ×1.5 / ×2', () => {
    for (const id of [1, 17, 40]) {
      const normal = getCampaignMap(id);
      for (const [tier, k] of [
        ['hard', 1.5],
        ['nightmare', 2],
      ] as const) {
        const m = getCampaignMap(id, tier);
        expect(m.tier).toBe(tier);
        expect(m.difficulty.hp).toBeCloseTo(normal.difficulty.hp * k, 12);
        expect(m.difficulty.damage).toBeCloseTo(normal.difficulty.damage * k, 12);
        // Everything else is the Normal map: waves, duration, schedule, elites (relative), boss.
        expect(m.difficulty.spawnRate).toBe(normal.difficulty.spawnRate);
        expect(m.durationSeconds).toBe(normal.durationSeconds);
        expect(campaignSchedule(m)).toEqual(campaignSchedule(normal));
        expect(m.elite).toEqual(normal.elite);
        expect([m.waves, m.bossScale, m.goldScale, m.oreScale, m.xpScale]).toEqual([
          true,
          1,
          k,
          k,
          1,
        ]);
        expect(getCampaignMap(id, tier)).toBe(m); // cached
      }
    }
  });
  it('Elite Trial: 3 minutes, 5 elites every 30 s (×3), the boss at 3:00 (×3), no waves', () => {
    const normal = getCampaignMap(4);
    const m = getCampaignMap(4, 'trial');
    // Task 40: the Trial pays Gold ×1, Ore ×2, class XP ×0.2.
    expect([m.durationSeconds, m.waves, m.bossScale, m.goldScale, m.oreScale, m.xpScale]).toEqual([
      180,
      false,
      3,
      1,
      2,
      0.2,
    ]);
    expect(m.difficulty).toEqual(normal.difficulty);
    expect(m.elite.hpMultiplier).toBeCloseTo(normal.elite.hpMultiplier * 3, 12);
    expect(m.elite.damageMultiplier).toBeCloseTo(normal.elite.damageMultiplier * 3, 12);
    const plan = campaignSchedule(m).map((e) =>
      e.kind === 'elite' ? `${e.time}:${e.profile}` : `${e.time}:${e.kind}`,
    );
    // Owner change: a wave of 5 every 30 s (0:00 … 2:30); profiles keep alternating (melee first).
    const elites = [0, 30, 60, 90, 120, 150].flatMap((t, w) =>
      Array.from({ length: 5 }, (_, i) => `${t}:${(w * 5 + i) % 2 === 0 ? 'melee' : 'ranged'}`),
    );
    expect(plan).toEqual([...elites, '180:boss', '180:end']);
    expect(m.reservedSlots).toBeGreaterThanOrEqual(31);
  });
});

describe('Task 39 — tiers in the world', () => {
  const world = (mapId: number, difficulty: 'normal' | 'hard' | 'nightmare' | 'trial') => {
    const w = new GameplayWorld({
      characterClass: 'mage',
      seed: 5,
      campaign: { mapId, difficulty },
    });
    w.setTestProtection(true);
    return w;
  };
  it('Hard / Nightmare enemies have ×1.5 / ×2 health and damage of the Normal ones', () => {
    const stats = (tier: 'normal' | 'hard' | 'nightmare') => {
      const w = world(3, tier);
      return w.core.getEntity(w.spawnEnemy('melee', 300));
    };
    const n = stats('normal');
    expect(stats('hard').maxHp).toBeCloseTo(n.maxHp * 1.5, 6);
    expect(stats('hard').physicalDamage).toBeCloseTo(n.physicalDamage * 1.5, 6);
    expect(stats('nightmare').maxHp).toBeCloseTo(n.maxHp * 2, 6);
    expect(stats('nightmare').physicalDamage).toBeCloseTo(n.physicalDamage * 2, 6);
  });
  it('Elite Trial: no ordinary enemies; 5 elites at once (×30 health); the ×3 boss at 3:00', () => {
    const w = world(4, 'trial');
    const base = new GameplayWorld({ characterClass: 'mage', seed: 5, campaign: { mapId: 4 } });
    const normal = base.core.getEntity(base.spawnEnemy('melee', 300));
    expect(w.getSnapshot().enemies).toHaveLength(0); // no initial enemies
    w.update(0.5);
    let c = w.getSnapshot().campaign!;
    expect(c.eliteEnemyIds).toHaveLength(5);
    expect(w.getSnapshot().enemies).toHaveLength(5); // and no waves
    const elite = w.core.getEntity(c.eliteEnemyIds[0]);
    expect(elite.maxHp).toBeCloseTo(normal.maxHp * 10 * 3, 6);
    expect(elite.physicalDamage).toBeCloseTo(normal.physicalDamage * 1.4 * 3, 6);
    for (let i = 0; i < 1000 && w.time < 181; i++) {
      resolveOffers(w);
      w.update(1);
    }
    c = w.getSnapshot().campaign!;
    expect(c.eliteEnemyIds).toHaveLength(30);
    expect(c.bossEnemyId).not.toBeNull();
    const boss = w.core.getEntity(c.bossEnemyId!);
    const def = getBossDefinition(getCampaignMap(4).bossId);
    expect(boss.maxHp).toBeCloseTo(normal.maxHp * def.hpMultiplier * 3, 6);
    // Only scheduled enemies ever appeared.
    expect(
      w
        .getSnapshot()
        .enemies.every((e) => c.eliteEnemyIds.includes(e.entityId) || e.entityId === c.bossEnemyId),
    ).toBe(true);
  }, 30_000);
});
