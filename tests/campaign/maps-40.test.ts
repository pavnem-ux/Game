import { describe, expect, it } from 'vitest';
import act1 from './fixtures/act1-task08.json';
import {
  CAMPAIGN_ACTS,
  CAMPAIGN_BALANCE,
  CAMPAIGN_MAPS,
  actOf,
  campaignSchedule,
  campaignSpawning,
  eliteProfile,
  getCampaignMap,
  validateCampaignConfig,
  victoryGold,
} from '../../src/campaign';
import { ALPHA } from '../../src/gameplay';
import { XP_RULES } from '../../src/gameplay/experience';
import { spawningSettings } from '../../src/gameplay/spawning';
import { applyRunResult, createProfile, nextMapAfter, runRewards } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';

const spawning = (id: number) =>
  campaignSpawning(getCampaignMap(id), spawningSettings(), ALPHA.enemyCap);

describe('Task 10 Phase 1 — 40 maps in 4 acts', () => {
  it('40 maps; acts of 10 with Russian names; maps 11–40 last 15 min with the boss at 10:00', () => {
    expect(CAMPAIGN_MAPS).toHaveLength(40);
    expect(CAMPAIGN_MAPS.map((m) => m.id)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(CAMPAIGN_ACTS.map((a) => [a.roman, a.name, a.firstMap, a.lastMap])).toEqual([
      ['I', 'Забытые сказки', 1, 10],
      ['II', 'Заколдованные земли', 11, 20],
      ['III', 'Мёртвое царство', 21, 30],
      ['IV', 'Последняя сказка', 31, 40],
    ]);
    for (const m of CAMPAIGN_MAPS) {
      expect(m.act).toBe(actOf(m.id).id);
      expect(m.name).toMatch(/[А-ЯЁа-яё]/);
      expect(m.bossName).toMatch(/[А-ЯЁа-яё]/);
      if (m.id > 10) expect(m.durationSeconds).toBe(900);
      const boss = campaignSchedule(m).filter((e) => e.kind === 'boss');
      expect(boss.map((e) => e.time)).toEqual([600]);
    }
    expect(new Set(CAMPAIGN_MAPS.map((m) => m.name)).size).toBe(40);
    expect(new Set(CAMPAIGN_MAPS.map((m) => m.bossName)).size).toBe(40);
    expect(() => validateCampaignConfig()).not.toThrow();
  });
  it('maps 1–10 snapshot: identical to Task 08 except the Gold source and the ranged share', () => {
    for (const before of act1.maps) {
      const id = before.map.id;
      const now = getCampaignMap(id);
      // Every Task 08 field is unchanged (Gold now comes from its own table, with equal values).
      expect(now).toMatchObject(before.map);
      expect(now.victoryGold).toBe(victoryGold(id));
      expect(now).toMatchObject({
        act: 1,
        reservedSlots: CAMPAIGN_BALANCE.reservedSlots,
        elite: { interval: 120, perEvent: 1, hpMultiplier: 2.5, damageMultiplier: 1.4 },
      });
      // Elite/boss schedule byte-identical.
      expect(JSON.parse(JSON.stringify(campaignSchedule(now)))).toEqual(before.schedule);
      // Spawner: only the ranged share differs (0.18 → 0.12).
      const s = spawning(id);
      expect({ ...s, rangedShare: before.spawning.rangedShare }).toEqual(before.spawning);
      expect(before.spawning.rangedShare).toBe(0.18);
      expect(s.rangedShare).toBe(0.12);
    }
  });
  it('difficulty: spawn rate frozen at map 10; HP/damage +0.15/+0.10 per map after it (11, 20, 40)', () => {
    const m10 = getCampaignMap(10).difficulty;
    expect(m10).toEqual({ hp: 2.08, damage: 1.72, spawnRate: 1.72 });
    for (const [id, hp, damage] of [
      [11, 2.23, 1.82],
      [20, 3.58, 2.72],
      [40, 6.58, 4.72],
    ] as const) {
      const d = getCampaignMap(id).difficulty;
      expect(d.hp).toBeCloseTo(hp, 10);
      expect(d.damage).toBeCloseTo(damage, 10);
      expect(d.spawnRate).toBeCloseTo(m10.spawnRate, 10);
      expect(spawning(id).interval).toBeCloseTo(spawning(10).interval, 10);
    }
  });
  it('§1.3: crystals 8 / 12 (−20%), elite extra XP 32 (−20%), level cost unchanged', () => {
    expect(act1.xp).toEqual({ melee: 10, ranged: 15 });
    expect([XP_RULES.meleeReward, XP_RULES.rangedReward]).toEqual([8, 12]);
    expect(act1.eliteXp).toEqual({ melee: 40, ranged: 40 });
    expect([eliteProfile('melee').extraXp, eliteProfile('ranged').extraXp]).toEqual([32, 32]);
    expect([XP_RULES.baseCost, XP_RULES.costPerLevel]).toEqual([20, 10]);
  });
  it('§1.3: victory XP 100 + 50·id (map 40: 2100); Gold table 75…300, then 300 + 15·(id − 10) (map 40: 750)', () => {
    for (const m of CAMPAIGN_MAPS) {
      expect(m.victoryXp).toBe(100 + 50 * m.id);
      expect(m.victoryGold).toBe(m.id <= 10 ? (100 + 50 * m.id) / 2 : 300 + 15 * (m.id - 10));
      // Task 11: Gold of a victory = coins + 40% bonus; the Task 10 table is the 100% reference.
      const coins = m.victoryGold - Math.round(m.victoryGold * 0.4);
      expect(runRewards({ mapId: m.id, outcome: 'victory', elapsed: 900, coins })).toMatchObject({
        xp: m.victoryXp,
        gold: m.victoryGold,
      });
    }
    expect([getCampaignMap(40).victoryXp, getCampaignMap(40).victoryGold]).toEqual([2100, 750]);
    expect(getCampaignMap(11).victoryGold).toBe(315);
  });
  it('unlock chain 10 → 11 → … → 40 through victories; 40 is last', () => {
    let p: PlayerProfile = createProfile('t10', '2026-11-10T00:00:00.000Z');
    for (let id = 1; id <= 40; id++) {
      expect(p.highestUnlockedMap).toBe(id);
      const { profile, summary } = applyRunResult(
        p,
        {
          runId: `r${id}`,
          mapId: id,
          characterClass: 'warrior',
          outcome: 'victory',
          elapsed: getCampaignMap(id).durationSeconds,
          kills: 1,
          eliteKills: 0,
          bossKilled: true,
          runLevel: 1,
        },
        '2026-11-10T00:00:00.000Z',
      );
      expect(summary.newlyUnlockedMap).toBe(id < 40 ? id + 1 : null);
      p = profile;
    }
    expect(nextMapAfter(10)).toBe(11);
    expect(nextMapAfter(40)).toBeNull();
  });
});
