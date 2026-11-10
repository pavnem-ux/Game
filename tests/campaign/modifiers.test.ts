import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_BALANCE,
  CAMPAIGN_MAPS,
  MAP_MODIFIERS,
  campaignSchedule,
  campaignSpawning,
  eliteEnemyConfig,
  getBossDefinition,
  getCampaignMap,
  mapDifficulty,
} from '../../src/campaign';
import { ALPHA, ALPHA_ENEMIES, GameplayWorld } from '../../src/gameplay';
import { spawningSettings } from '../../src/gameplay/spawning';

const has = (id: number, m: string) => getCampaignMap(id).modifiers.some((x) => x.id === m);
function world(mapId: number) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed: 7,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    campaign: { mapId },
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01);
  return w;
}
const alive = (w: GameplayWorld) => w.getSnapshot().enemies.filter((e) => e.alive);

describe('Task 10 Phase 3 — per-map modifiers (existing levers only)', () => {
  it('at most 2 per map, none on Act I, Russian labels, a ranged override never above 0.18', () => {
    for (const m of CAMPAIGN_MAPS) {
      expect(m.modifiers.length).toBeLessThanOrEqual(2);
      if (m.id <= 10) expect(m.modifiers).toEqual([]);
      for (const x of m.modifiers) expect(x.label).toMatch(/[А-ЯЁа-яё]/);
      if (m.rangedShare !== undefined)
        expect(m.rangedShare).toBeLessThanOrEqual(CAMPAIGN_BALANCE.maxRangedShare);
    }
    expect(CAMPAIGN_MAPS.filter((m) => m.modifiers.length > 0).length).toBeGreaterThan(10);
  });
  it('each modifier changes only its own lever (config level)', () => {
    for (const m of CAMPAIGN_MAPS) {
      // Untouched by every modifier: difficulty, durations, rewards, schedule times and reserve.
      expect(m.difficulty).toEqual(mapDifficulty(m.id));
      expect(campaignSchedule(m).map((e) => e.time)).toEqual(
        campaignSchedule({ ...m, modifiers: [] }).map((e) => e.time),
      );
      // swift → enemy movement speed only.
      expect(m.enemySpeedScale).toBe(has(m.id, 'swift') ? MAP_MODIFIERS.swift.enemySpeed : 1);
      // ranged15/18 → ranged share only.
      const share = campaignSpawning(m, spawningSettings(), ALPHA.enemyCap).rangedShare;
      expect(share).toBe(
        has(m.id, 'ranged18') ? 0.18 : has(m.id, 'ranged15') ? 0.15 : CAMPAIGN_BALANCE.rangedShare,
      );
      // elites → elite HP/damage only.
      expect(m.elite.hpMultiplier).toBeCloseTo(2.5 * (has(m.id, 'elites') ? 1.25 : 1), 12);
      expect(m.elite.damageMultiplier).toBeCloseTo(1.4 * (has(m.id, 'elites') ? 1.15 : 1), 12);
    }
  });
  it('swift (map 12): automatic enemies, elites and boss adds ×1.1 speed; the boss keeps its own speed', () => {
    const swift = world(12);
    const plain = world(11);
    expect(has(12, 'swift') && !has(11, 'swift')).toBe(true);
    swift['spawnOffscreen'](3, 0);
    plain['spawnOffscreen'](3, 0);
    const speeds = (w: GameplayWorld) => alive(w).map((e) => e.config.movementSpeed);
    expect(new Set(speeds(swift))).toEqual(new Set([ALPHA_ENEMIES.melee.movementSpeed * 1.1]));
    expect(new Set(speeds(plain))).toEqual(new Set([ALPHA_ENEMIES.melee.movementSpeed]));
    for (const w of [swift, plain]) w.clearEnemies();
    swift.debugFireCampaignEvent('elite-1');
    const elite = alive(swift)[0];
    const base = eliteEnemyConfig(ALPHA_ENEMIES.melee, 'melee').movementSpeed;
    expect(elite.config.movementSpeed).toBeCloseTo(base * 1.1, 10);
    swift.clearEnemies();
    swift.debugFireCampaignEvent('boss');
    const def = getBossDefinition(getCampaignMap(12).bossId);
    expect(alive(swift)[0].config.movementSpeed).toBeCloseTo(
      ALPHA_ENEMIES[def.behavior].movementSpeed * def.speedScale,
      10,
    );
  });
  it('elites (map 15): elite HP ×1.25 and damage ×1.15 vs a map without it; normal enemies unchanged', () => {
    expect(has(15, 'elites') && !has(14, 'elites')).toBe(true);
    const ratio = (id: number) => {
      const w = world(id);
      w['spawnOffscreen'](1, 0);
      const normal = alive(w)[0].entity;
      w.debugFireCampaignEvent('elite-1');
      const elite = alive(w).find((e) => e.entityId !== alive(w)[0].entityId)!.entity;
      return [elite.maxHp / normal.maxHp, elite.physicalDamage / normal.physicalDamage];
    };
    const [hp15, dmg15] = ratio(15);
    const [hp14, dmg14] = ratio(14);
    expect(hp14).toBeCloseTo(2.5, 10);
    expect(dmg14).toBeCloseTo(1.4, 10);
    expect(hp15).toBeCloseTo(2.5 * 1.25, 10);
    expect(dmg15).toBeCloseTo(1.4 * 1.15, 10);
  });
  it('ranged15 (map 13): normal spawns follow the 0.15 share deterministically', () => {
    expect(has(13, 'ranged15')).toBe(true);
    const w = world(13);
    w['spawnOffscreen'](100, 0);
    const ranged = alive(w).filter((e) => e.config.behavior === 'ranged').length;
    expect(ranged).toBe(15);
    const plain = world(11);
    plain['spawnOffscreen'](100, 0);
    expect(alive(plain).filter((e) => e.config.behavior === 'ranged').length).toBe(12);
  });
});
