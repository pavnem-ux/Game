import { describe, expect, it } from 'vitest';
import { ALPHA, ALPHA_WEAPONS, GameplayWorld } from '../../src/gameplay';
import type { CharacterClass } from '../../src/character-stats';
import type { WorldEvent } from '../../src/gameplay';
import { arena, play, resolveOffers, ring, unlockClassSynergies } from '../skills/helpers';

/** Every recorded event, read incrementally (the world history itself is bounded). */
function collect(w: GameplayWorld) {
  const all: WorldEvent[] = [];
  let seq = 0;
  return {
    all,
    pull() {
      for (const e of w.getEvents(seq)) {
        all.push(e);
        seq = e.sequence;
      }
    },
  };
}
function run(w: GameplayWorld, seconds: number) {
  const log = collect(w);
  const end = w.time + seconds;
  while (w.time < end - 1e-9 && w.survival.getState().runState === 'active') {
    resolveOffers(w);
    w.update(Math.min(0.05, end - w.time));
    log.pull();
  }
  return log.all;
}
const damageTo = (events: readonly WorldEvent[], player: boolean) =>
  events.reduce((sum, { event: e }) => {
    if (e.type !== 'damage' && e.type !== 'periodic-damage') return sum;
    return (e.targetId === 'player') === player ? sum + e.appliedDamage : sum;
  }, 0);

describe('Task 08.5 §2.1 run statistics', () => {
  it.each<CharacterClass>(['mage', 'warrior', 'archer', 'rogue'])(
    '%s: damage dealt totals and per-source sums match the emitted damage events',
    (cls) => {
      const w = arena(cls, { seed: 11 });
      unlockClassSynergies(w, cls, 3);
      ring(w, 10, 60);
      ring(w, 8, 160);
      const events = run(w, 40);
      const stats = w.getSnapshot().runStats;
      expect(stats.damageDealt).toBeGreaterThan(0);
      expect(stats.damageDealt).toBeCloseTo(damageTo(events, false), 6);
      const perSource = stats.bySource.reduce((sum, s) => sum + s.damage, 0);
      expect(perSource).toBeCloseTo(stats.damageDealt, 6);
      // Every source is attributed: basic weapon, skills and (when they fired) synergies.
      const ids = stats.bySource.map((s) => s.source);
      expect(ids).toContain(`weapon:${ALPHA_WEAPONS[cls].id}`);
      expect(ids.some((id) => id.startsWith('skill:'))).toBe(true);
      expect(ids).not.toContain('unknown');
      for (const id of ids) expect(id).toMatch(/^(weapon|skill|synergy|status):[a-z_:-]+$/);
      const triggered = new Set(
        events.flatMap(({ event: e }) => (e.type === 'synergy-triggered' ? [e.synergyId] : [])),
      );
      for (const synergy of triggered) {
        // Damage synergies are attributed to themselves (buff-only ones deal no damage).
        const own = stats.bySource.find((s) => s.source === `synergy:${synergy}`);
        if (own) expect(own.damage).toBeGreaterThan(0);
      }
      expect(stats.bySource).toEqual([...stats.bySource].sort((a, b) => b.damage - a.damage));
    },
  );
  it.each<[CharacterClass, string]>([
    ['mage', 'thermal_shock'],
    ['warrior', 'skull_crusher'],
    ['archer', 'plague_chain'],
    ['rogue', 'final_cut'],
  ])('%s: %s damage is attributed to the synergy, not the skill that triggered it', (cls, id) => {
    const w = arena(cls, { seed: 3 });
    unlockClassSynergies(w, cls, 5);
    ring(w, 12, 70);
    ring(w, 8, 160);
    const events = run(w, 40);
    expect(
      events.some(({ event: e }) => e.type === 'synergy-triggered' && e.synergyId === id),
    ).toBe(true);
    const own = w.getSnapshot().runStats.bySource.find((s) => s.source === `synergy:${id}`);
    expect(own?.damage).toBeGreaterThan(0);
  });
  it('damage taken per enemy type matches the damage events on the player', () => {
    const w = arena('mage', { protect: false, level: 20 });
    for (let i = 0; i < 4; i++) w.spawnEnemy('melee', 30, i * 1.5);
    w.spawnEnemy('ranged', 200, 1);
    const events = run(w, 15);
    const stats = w.getSnapshot().runStats;
    expect(stats.damageTaken).toBeGreaterThan(0);
    expect(stats.damageTaken).toBeCloseTo(damageTo(events, true), 6);
    expect(stats.takenByType.reduce((sum, t) => sum + t.damage, 0)).toBeCloseTo(
      stats.damageTaken,
      6,
    );
    expect(stats.takenByType.map((t) => t.type)).toContain('melee');
    expect(stats.takenByType.map((t) => t.type)).not.toContain('unknown');
  });
  it('kill-all updates kills by type, elite/boss kills and the debug source once', () => {
    const w = new GameplayWorld({
      characterClass: 'rogue',
      seed: 2,
      initialEnemies: false,
      spawning: { enabled: false },
      campaign: { mapId: 1, runId: 'stats' },
    });
    w.spawnEnemy('melee', 200, 0);
    w.spawnEnemy('ranged', 200, 2);
    w.debugFireCampaignEvent('elite-1');
    w.debugFireCampaignEvent('boss');
    const all = { x: 0, y: 0, width: ALPHA.arenaSize, height: ALPHA.arenaSize };
    expect(w.debugKillInView(all)).toBe(4);
    const stats = w.getSnapshot().runStats;
    expect(stats.kills).toBe(4);
    expect(stats.kills).toBe(w.getSnapshot().kills);
    expect(Object.fromEntries(stats.killsByType.map((k) => [k.type, k.count]))).toEqual({
      melee: 1,
      ranged: 1,
      'elite-melee': 1,
      boss: 1,
    });
    expect(stats.eliteKills).toBe(1);
    expect(stats.bossKills).toBe(1);
    expect(stats.bySource.map((s) => s.source)).toEqual(['debug']);
    w.debugKillInView(all);
    expect(w.getSnapshot().runStats.kills).toBe(4);
  });
  it('level timeline, death time, revive and low-HP moments', () => {
    const w = arena('archer', { protect: false });
    w.grantTestXp(200);
    resolveOffers(w);
    w.update(0.05);
    const timeline = w.getSnapshot().runStats.levelTimeline;
    expect(timeline[0]).toEqual({ level: 1, time: 0 });
    expect(timeline.length).toBe(w.getSnapshot().progression.level);
    const max = w.getSnapshot().player.maxHp;
    w.setPlayerHp(Math.floor(max * 0.1));
    w.setPlayerHp(Math.floor(max * 0.15)); // still low: the same moment
    w.setPlayerHp(Math.floor(max * 0.9));
    w.setPlayerHp(Math.floor(max * 0.05)); // a second drop
    w.update(1);
    w.setPlayerHp(0);
    let s = w.getSnapshot().runStats;
    expect(s.deathTime).toBe(w.time);
    expect(s.reviveUsed).toBe(false);
    w.decide('revive');
    s = w.getSnapshot().runStats;
    expect(s.reviveUsed).toBe(true);
    expect(s.reviveTime).toBe(w.time);
    expect(s.deathTimes).toHaveLength(1);
    expect(s.lowHpMoments).toBe(2);
  });
  it('stats are per run: a new world starts empty; DPS covers the last 5 s only', () => {
    const w = arena('mage', { seed: 4 });
    ring(w, 8, 150);
    play(w, 6);
    const busy = w.getSnapshot().runStats;
    expect(busy.dps).toBeGreaterThan(0);
    expect(busy.dps).toBeLessThanOrEqual(busy.damageDealt / 5 + 1e-9);
    w.clearEnemies();
    play(w, 6);
    const recent = w.getSnapshot().runStats;
    // Only the debug clear happened in the last 6 s; it is 5+ s old now.
    expect(recent.dps).toBe(0);
    const fresh = arena('mage', { seed: 4 }).getSnapshot().runStats;
    expect(fresh).toMatchObject({
      damageDealt: 0,
      damageTaken: 0,
      kills: 0,
      bySource: [],
      deathTime: null,
      reviveUsed: false,
      lowHpMoments: 0,
      dps: 0,
    });
    expect(fresh.levelTimeline).toEqual([{ level: 1, time: 0 }]);
  });
});
