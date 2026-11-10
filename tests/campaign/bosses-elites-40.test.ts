import { describe, expect, it } from 'vitest';
import {
  BOSS_ABILITY_COUNTS,
  BOSS_DEFINITIONS,
  CAMPAIGN_MAPS,
  bossParamSignature,
  campaignSchedule,
  getBossDefinition,
  getCampaignMap,
  scheduledEnemyCount,
  validateBossDefinitions,
} from '../../src/campaign';
import { ALPHA, ALPHA_ENEMIES, GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';

const LATER = CAMPAIGN_MAPS.slice(10);
const stationary = { ...ALPHA_ENEMIES.melee, movementSpeed: 0 };

describe('Task 10 Phase 2 — bosses 11–40', () => {
  it('30 new boss configs, one per map, all valid', () => {
    expect(() => validateBossDefinitions()).not.toThrow();
    expect(LATER).toHaveLength(30);
    for (const m of LATER) expect(getBossDefinition(m.bossId).id).toBe(m.bossId);
    expect(Object.keys(BOSS_DEFINITIONS)).toHaveLength(40);
  });
  it('ability counts per act: II–III 2–3, IV exactly 3', () => {
    expect(BOSS_ABILITY_COUNTS).toEqual({ 2: [2, 3], 3: [2, 3], 4: [3, 3] });
    for (const m of LATER) {
      const n = getBossDefinition(m.bossId).abilities.length;
      const [min, max] = BOSS_ABILITY_COUNTS[m.act];
      expect(n, m.bossId).toBeGreaterThanOrEqual(min);
      expect(n, m.bossId).toBeLessThanOrEqual(max);
    }
  });
  it('no two of the 40 bosses share an ability set with identical parameters (ids ignored)', () => {
    const sigs = CAMPAIGN_MAPS.map((m) => bossParamSignature(getBossDefinition(m.bossId)));
    expect(new Set(sigs).size).toBe(40);
    // The signature ignores ability ids: renaming does not make a copy unique.
    const def = getBossDefinition('old_leshy');
    const renamed = { ...def, abilities: def.abilities.map((a) => ({ ...a, id: `${a.id}-x` })) };
    expect(bossParamSignature(renamed)).toBe(bossParamSignature(def));
  });
  it('Act IV: shorter cooldowns than any Acts II–III ability of the same kind', () => {
    const byAct = (act: number) =>
      LATER.filter((m) => m.act === act).flatMap((m) => getBossDefinition(m.bossId).abilities);
    const earlier = [...byAct(2), ...byAct(3)];
    for (const a of byAct(4)) {
      const same = earlier.filter((e) => e.kind === a.kind).map((e) => e.cooldown);
      if (same.length) expect(a.cooldown, a.id).toBeLessThan(Math.min(...same));
    }
  });
});

describe('Task 10 Phase 2 — elites per act', () => {
  const times = (id: number) => [
    ...new Set(
      campaignSchedule(getCampaignMap(id))
        .filter((e) => e.kind === 'elite')
        .map((e) => e.time),
    ),
  ];
  it('elite intervals I 2:00, II 1:45, III 1:30, IV 1:15 — strictly before the end; boss once at 10:00', () => {
    expect(times(10)).toEqual([120, 240, 360, 480, 720, 840]);
    expect(times(11)).toEqual([105, 210, 315, 420, 525, 630, 735, 840]);
    expect(times(21)).toEqual([90, 180, 270, 360, 450, 540, 630, 720, 810]);
    expect(times(31)).toEqual([75, 150, 225, 300, 375, 450, 525, 675, 750, 825]);
    for (const m of CAMPAIGN_MAPS) {
      const events = campaignSchedule(m);
      expect(events.filter((e) => e.kind === 'boss').map((e) => e.time)).toEqual([600]);
      expect(events.filter((e) => e.kind === 'elite' && e.time === 600)).toEqual([]);
      expect(
        events.filter((e) => e.kind === 'elite').every((e) => e.time < m.durationSeconds),
      ).toBe(true);
      expect(events.at(-1)).toMatchObject({ kind: 'end', time: m.durationSeconds });
    }
  });
  it('2 elites per event on maps 25–30 and 35–40 (alternating profiles), 1 elsewhere', () => {
    for (const m of CAMPAIGN_MAPS) {
      const double = (m.id >= 25 && m.id <= 30) || (m.id >= 35 && m.id <= 40);
      expect(m.elite.perEvent, `map ${m.id}`).toBe(double ? 2 : 1);
      const elites = campaignSchedule(m).filter((e) => e.kind === 'elite');
      expect(elites).toHaveLength(times(m.id).length * m.elite.perEvent);
      if (double) {
        const first = elites.filter((e) => e.time === elites[0].time);
        expect(first.map((e) => e.kind === 'elite' && e.profile)).toEqual(['melee', 'ranged']);
      }
      expect(scheduledEnemyCount(m)).toBeLessThanOrEqual(m.reservedSlots);
    }
    expect(getCampaignMap(40).reservedSlots).toBe(21);
  });
  it('map 40: with automatic waves at their cap, all 20 elites and the boss still spawn (≤ 120 enemies)', () => {
    const w = new GameplayWorld({
      characterClass: 'mage',
      seed: 3,
      initialEnemies: false,
      spawning: { enabled: false },
      onHit: [],
      campaign: { mapId: 40 },
    });
    w.setTestProtection(true);
    w.weapons.setAttackSpeed('player', 0.01);
    const autoCap = ALPHA.enemyCap - getCampaignMap(40).reservedSlots;
    for (let i = 0; i < autoCap; i++)
      w.spawnEnemy('melee', 1500, (i / autoCap) * Math.PI * 2, stationary);
    // Fire every scheduled elite/boss event now (debug path = the normal spawn pipeline).
    for (const e of campaignSchedule(getCampaignMap(40)))
      if (e.kind !== 'end') expect(w.debugFireCampaignEvent(e.id), e.id).toBe(true);
    const events: WorldEvent[] = [...w.getEvents()];
    const peak = w.getSnapshot().enemies.filter((e) => e.alive).length;
    expect(peak).toBe(ALPHA.enemyCap); // 99 automatic + 20 elites + boss
    const kinds = events.filter((e) => e.channel === 'campaign').map((e) => e.event.type);
    expect(kinds.filter((k) => k === 'elite-spawned')).toHaveLength(20);
    expect(kinds.filter((k) => k === 'boss-spawned')).toHaveLength(1);
    expect(peak).toBeLessThanOrEqual(ALPHA.enemyCap);
  });
  it('map 25 in real simulation time: two elites at 1:30 and two at 3:00 (Act III)', () => {
    const w = new GameplayWorld({
      characterClass: 'mage',
      seed: 5,
      initialEnemies: false,
      spawning: { enabled: false },
      onHit: [],
      campaign: { mapId: 25 },
    });
    w.setTestProtection(true);
    w.weapons.setAttackSpeed('player', 0.01);
    while (w.time < 200 - 1e-9) w.update(Math.min(5, 200 - w.time));
    // The world event history is bounded; the snapshot's fired log is authoritative.
    const log = w.getSnapshot().campaign!.firedLog;
    expect(log.map((e) => e.id)).toEqual(['elite-1', 'elite-2', 'elite-3', 'elite-4']);
    const spawned = log.map((e) => e.time);
    expect(w.getSnapshot().campaign!.eliteEnemyIds).toHaveLength(4);
    expect(spawned).toHaveLength(4);
    expect(spawned[0]).toBeCloseTo(90, 9);
    expect(spawned[1]).toBeCloseTo(90, 9);
    expect(spawned[2]).toBeCloseTo(180, 9);
    expect(spawned[3]).toBeCloseTo(180, 9);
  });
});
