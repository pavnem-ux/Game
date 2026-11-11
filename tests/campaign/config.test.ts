import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_BALANCE,
  bossSpawnTime,
  CAMPAIGN_MAPS,
  getCampaignMap,
  mapDifficulty,
  validateCampaignConfig,
} from '../../src/campaign';

/** Task 10 keeps Act I (maps 1–10) as specified by Task 08; Acts II–IV are in maps-40.test.ts. */
const ACT_I = CAMPAIGN_MAPS.slice(0, 10);

describe('campaign config (Task 08 §1.1)', () => {
  it('Act I has 10 maps with the specified durations', () => {
    expect(ACT_I).toHaveLength(10);
    expect(ACT_I.map((m) => m.durationSeconds / 60)).toEqual([
      10, 10, 11, 11, 12, 12, 13, 13, 14, 15,
    ]);
    expect(ACT_I.map((m) => m.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('victory XP = 100 + 50i and (Act I, Task 10 table) Gold = XP / 2', () => {
    for (const m of ACT_I) {
      expect(m.victoryXp).toBe(100 + 50 * m.id);
      expect(m.victoryGold).toBe((100 + 50 * m.id) / 2);
    }
  });
  it('difficulty scales with k = i − 1 (Act I)', () => {
    for (const m of ACT_I) {
      const k = m.id - 1;
      expect(m.difficulty.hp).toBeCloseTo(1 + 0.12 * k, 12);
      expect(m.difficulty.damage).toBeCloseTo(1 + 0.08 * k, 12);
      expect(m.difficulty.spawnRate).toBeCloseTo(1 + 0.08 * k, 12);
    }
    expect(getCampaignMap(1).difficulty).toEqual({ hp: 1, damage: 1, spawnRate: 1 });
    expect(mapDifficulty(3, { difficulty: { hp: 2 } }).hp).toBe(2);
  });
  it('elite and boss parameters, stages and unique bosses', () => {
    expect(CAMPAIGN_BALANCE.elite).toMatchObject({
      interval: 120,
      hpMultiplier: 2.5,
      damageMultiplier: 1.4,
    });
    // Owner decision (Task 11 review): the boss appears when the map timer ends (≥ 10:00).
    expect(CAMPAIGN_BALANCE.boss.minSpawnTime).toBe(600);
    for (const m of CAMPAIGN_MAPS) expect(bossSpawnTime(m.id)).toBe(m.durationSeconds);
    expect(CAMPAIGN_BALANCE.stages.map((s) => s.id)).toEqual([
      'opening',
      'escalation',
      'midgame',
      'late',
      'boss',
    ]);
    expect(new Set(CAMPAIGN_MAPS.map((m) => m.bossId)).size).toBe(CAMPAIGN_MAPS.length);
    expect(CAMPAIGN_MAPS.every((m) => m.bossName.length > 0 && m.name.length > 0)).toBe(true);
  });
  it('rejects unknown maps and inconsistent configurations', () => {
    expect(() => getCampaignMap(0)).toThrow();
    expect(() => getCampaignMap(41)).toThrow();
    expect(() => getCampaignMap(1.5)).toThrow();
    expect(() => validateCampaignConfig()).not.toThrow();
    expect(() => validateCampaignConfig(CAMPAIGN_MAPS.slice(1))).toThrow();
    const broken = CAMPAIGN_MAPS.map((m) => (m.id === 2 ? { ...m, durationSeconds: 300 } : m));
    expect(() => validateCampaignConfig(broken)).toThrow();
    const dupBoss = CAMPAIGN_MAPS.map((m) => (m.id === 2 ? { ...m, bossId: 'thornwarden' } : m));
    expect(() => validateCampaignConfig(dupBoss)).toThrow();
    expect(Object.isFrozen(CAMPAIGN_MAPS[0])).toBe(true);
  });
});
