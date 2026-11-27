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
  it('40 maps; acts of 10 with English names; maps 11–40 last 15 min with the boss at the end', () => {
    expect(CAMPAIGN_MAPS).toHaveLength(40);
    expect(CAMPAIGN_MAPS.map((m) => m.id)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(CAMPAIGN_ACTS.map((a) => [a.roman, a.name, a.firstMap, a.lastMap])).toEqual([
      ['I', 'Forgotten Tales', 1, 10],
      ['II', 'Enchanted Lands', 11, 20],
      ['III', 'Kingdom of the Dead', 21, 30],
      ['IV', 'The Last Tale', 31, 40],
    ]);
    for (const m of CAMPAIGN_MAPS) {
      expect(m.act).toBe(actOf(m.id).id);
      // Task 23: display names are English (no Cyrillic), ids unchanged.
      expect(m.name).toMatch(/^[^\u0400-\u04ff]+$/);
      expect(m.bossName).toMatch(/^[^\u0400-\u04ff]+$/);
      if (m.id > 10) expect(m.durationSeconds).toBe(900);
      // Owner decision (Task 11 review): the boss appears when the map timer ends (was 10:00).
      const boss = campaignSchedule(m).filter((e) => e.kind === 'boss');
      expect(boss.map((e) => e.time)).toEqual([m.durationSeconds]);
    }
    expect(new Set(CAMPAIGN_MAPS.map((m) => m.name)).size).toBe(40);
    expect(new Set(CAMPAIGN_MAPS.map((m) => m.bossName)).size).toBe(40);
    expect(() => validateCampaignConfig()).not.toThrow();
  });
  it('maps 1–10 snapshot: identical to Task 08 except the Gold source, the ranged share and the boss time', () => {
    for (const before of act1.maps) {
      const id = before.map.id;
      const now = getCampaignMap(id);
      // Every Task 08 field is unchanged (Gold now comes from its own table; Task 40 scales it
      // ×0.8, checked below).
      expect(now).toMatchObject({ ...before.map, victoryGold: now.victoryGold });
      expect(now.victoryGold).toBe(victoryGold(id));
      expect(now).toMatchObject({
        act: 1,
        reservedSlots: CAMPAIGN_BALANCE.reservedSlots,
        elite: {
          interval: 120,
          perEvent: 1,
          hpMultiplier: 10 /* Task 39 (was 2.5) */,
          damageMultiplier: 1.4,
        },
      });
      // Elite/boss schedule: byte-identical on the 10-minute maps 1–2 (boss already at the end).
      // Longer maps (owner decision, Task 11 review): the boss moves from 10:00 to the end and
      // 10:00 becomes an ordinary elite slot; elites stay every 2:00 strictly before the end.
      const schedule = JSON.parse(JSON.stringify(campaignSchedule(now)));
      type Ev = { kind: string; time: number };
      if (now.durationSeconds === 600) expect(schedule).toEqual(before.schedule);
      else {
        const old = (before.schedule as Ev[]).filter((e) => e.kind === 'elite').map((e) => e.time);
        const elites = (schedule as Ev[]).filter((e) => e.kind === 'elite').map((e) => e.time);
        expect(elites).toEqual([...old, 600].sort((a, b) => a - b));
        expect((before.schedule as Ev[]).find((e) => e.kind === 'boss')!.time).toBe(600);
        expect((schedule as Ev[]).filter((e) => e.kind !== 'elite')).toEqual([
          { id: 'boss', kind: 'boss', time: now.durationSeconds },
          { id: 'end', kind: 'end', time: now.durationSeconds },
        ]);
      }
      // Spawner: only the ranged share differs (0.18 → 0.12).
      const s = spawning(id);
      expect({ ...s, rangedShare: before.spawning.rangedShare }).toEqual(before.spawning);
      expect(before.spawning.rangedShare).toBe(0.18);
      expect(s.rangedShare).toBe(0.12);
    }
  });
  // Task 40: damage +0.08 per map after map 10 (was +0.10).
  it('difficulty: spawn rate frozen at map 10; HP/damage +0.15/+0.08 per map after it (11, 20, 40)', () => {
    const m10 = getCampaignMap(10).difficulty;
    expect(m10).toEqual({ hp: 2.08, damage: 1.72, spawnRate: 1.72 });
    for (const [id, hp, damage] of [
      [11, 2.23, 1.8],
      [20, 3.58, 2.52],
      [40, 6.58, 4.12],
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
  // Task 40: the whole table ×0.8 (rounded).
  it('§1.3: victory XP 100 + 50·id (map 40: 2100); Gold table 75…300, then 300 + 15·(id − 10), ×0.8 (map 40: 600)', () => {
    for (const m of CAMPAIGN_MAPS) {
      expect(m.victoryXp).toBe(100 + 50 * m.id);
      expect(m.victoryGold).toBe(
        Math.round((m.id <= 10 ? (100 + 50 * m.id) / 2 : 300 + 15 * (m.id - 10)) * 0.8),
      );
      // Task 11: Gold of a victory = coins + 40% bonus; the Task 10 table is the 100% reference.
      const coins = m.victoryGold - Math.round(m.victoryGold * 0.4);
      expect(runRewards({ mapId: m.id, outcome: 'victory', elapsed: 900, coins })).toMatchObject({
        xp: m.victoryXp,
        gold: m.victoryGold,
      });
    }
    expect([getCampaignMap(40).victoryXp, getCampaignMap(40).victoryGold]).toEqual([2100, 600]);
    expect(getCampaignMap(11).victoryGold).toBe(252);
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
