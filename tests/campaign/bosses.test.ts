import { describe, expect, it } from 'vitest';
import {
  BOSS_DEFINITIONS,
  CAMPAIGN_MAPS,
  bossSignature,
  getBossDefinition,
  validateBossDefinitions,
} from '../../src/campaign';
import { CONTROL_RULES } from '../../src/skills';
import type { CombatTag } from '../../src/skills';
import { ALPHA_ENEMIES, GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import { XP_RULES } from '../../src/gameplay/experience';
import { resolveOffers } from '../skills/helpers';

function world(mapId: number) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed: 13,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    campaign: { mapId },
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01);
  return w;
}
function run(w: GameplayWorld, until: number, step: number, sink: WorldEvent[] = []) {
  let seq = w.getEvents().at(-1)?.sequence ?? 0;
  while (w.time < until - 1e-9 && w.getSnapshot().campaign!.status === 'active') {
    resolveOffers(w);
    if (w.paused) break;
    w.update(Math.min(step, until - w.time));
    const fresh = w.getEvents(seq);
    if (fresh.length) seq = fresh.at(-1)!.sequence;
    sink.push(...fresh);
  }
  return sink;
}
const hitBoss = (w: GameplayWorld, id: string, coefficient: number) => {
  const t = new Set<CombatTag>(['physical']);
  return w.skills.hit(id, w.skills.attack(t, coefficient, 'physical'), t, { procs: false });
};

describe('boss configs (Task 08 §2.3)', () => {
  it('one valid boss per map with ≥2 abilities and a distinct ability combination', () => {
    expect(() => validateBossDefinitions()).not.toThrow();
    // Task 10: 40 bosses; Act I (Task 08) keeps distinct ability-kind combinations.
    expect(Object.keys(BOSS_DEFINITIONS)).toHaveLength(40);
    const sigs = CAMPAIGN_MAPS.slice(0, 10).map((m) => bossSignature(getBossDefinition(m.bossId)));
    expect(new Set(sigs).size).toBe(10);
    for (const m of CAMPAIGN_MAPS)
      expect(getBossDefinition(m.bossId).abilities.length).toBeGreaterThanOrEqual(2);
    expect(bossSignature(getBossDefinition('last_dark'))).toBe(
      'charge+circle_aoe+radial_burst+speed_buff+summon',
    );
    expect(() => getBossDefinition('nope')).toThrow();
  });
  it.each([1, 2, 10])(
    'map %i spawns its own boss with a notification, name and HP bar data',
    (mapId) => {
      const w = world(mapId);
      const events = run(w, CAMPAIGN_MAPS[mapId - 1].durationSeconds + 0.01, 5);
      const map = CAMPAIGN_MAPS[mapId - 1];
      const def = getBossDefinition(map.bossId);
      const spawned = events.filter((e) => e.event.type === 'boss-spawned');
      expect(spawned).toHaveLength(1);
      expect(spawned[0].event).toMatchObject({ bossId: map.bossId, bossName: map.bossName });
      const boss = w.getSnapshot().campaign!.boss!;
      expect(boss).toMatchObject({ bossId: map.bossId, name: map.bossName, alive: true });
      expect(boss.hp).toBe(boss.maxHp);
      const normal = w.core.getEntity(w.spawnEnemy('melee', 300));
      expect(boss.maxHp).toBeCloseTo(normal.maxHp * def.hpMultiplier, 6);
      const e = w.getSnapshot().enemies.find((x) => x.entityId === boss.enemyId)!;
      expect(e.config.behavior).toBe(def.behavior);
      expect(e.config.radius).toBeCloseTo(ALPHA_ENEMIES[def.behavior].radius * def.radiusScale, 9);
    },
  );
  it('the boss death event fires exactly once with the boss XP reward', () => {
    const w = world(3);
    run(w, CAMPAIGN_MAPS[2].durationSeconds + 0.01, 5);
    const id = w.getSnapshot().campaign!.boss!.enemyId;
    hitBoss(w, id, 1e7);
    hitBoss(w, id, 1e7); // dead target: ignored
    w.update(0.1);
    const defeated = w.getEvents().filter((e) => e.event.type === 'boss-defeated');
    expect(defeated).toHaveLength(1);
    const reward = w
      .getEvents()
      .find(
        (e) => e.event.type === 'enemy-rewarded' && (e.event as { enemyId: string }).enemyId === id,
      )!.event as { xp: number };
    expect(reward.xp).toBe(XP_RULES.meleeReward + getBossDefinition('stone_colossus').xpReward);
    expect(w.getSnapshot().campaign!.boss!.alive).toBe(false);
    // Map 3's boss appears when its 11:00 timer ends: its death wins the map at once.
    expect(w.getSnapshot().campaign).toMatchObject({ bossKilled: true, status: 'victory' });
  });
  it('CC limits: shorter stuns, longer immunity and a lower Slow cap on the boss only', () => {
    const w = world(1);
    run(w, CAMPAIGN_MAPS[0].durationSeconds + 0.01, 5);
    const id = w.getSnapshot().campaign!.boss!.enemyId;
    const def = getBossDefinition('thornwarden');
    const t0 = w.time;
    expect(w.skills.stun(id, 1)).toBe(true);
    // Stunned for 1 × stunScale; immune until stun end + boss immunity.
    w.update(def.control.stunScale + 0.01);
    expect(w.skills.preHit(id).stunned).toBe(false);
    expect(w.skills.stun(id, 1)).toBe(false); // still immune
    w.update(def.control.stunImmunity - 0.05);
    expect(w.skills.stun(id, 1)).toBe(false);
    w.update(0.1);
    expect(w.skills.stun(id, 1)).toBe(true);
    expect(w.time - t0).toBeGreaterThan(def.control.stunScale + def.control.stunImmunity);
    // Slow is capped at the boss limit; a normal enemy keeps the global 60% cap.
    w.skills.slow(id, 0.6, 2);
    const normal = w.spawnEnemy('melee', 300);
    w.skills.slow(normal, 0.6, 2);
    w.update(0.05);
    const enemies = w.getSnapshot().enemies;
    const bossSpeed = enemies.find((x) => x.entityId === id)!.control!.movementMultiplier;
    const normalSpeed = enemies.find((x) => x.entityId === normal)!.control!.movementMultiplier;
    expect(bossSpeed).toBeCloseTo(1 - def.control.maxSlow, 9);
    expect(normalSpeed).toBeCloseTo(1 - CONTROL_RULES.maxSlow, 9);
    // Normal enemies keep full Task 07 stun rules.
    expect(w.skills.stun(normal, 1)).toBe(true);
  });
});
