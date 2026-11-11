import { describe, expect, it } from 'vitest';
import {
  ALPHA_ENEMIES,
  ALPHA_ENEMY_STATS,
  ENEMY_MIX,
  GameplayWorld,
  NEW_ENEMY_TYPES,
  enemyKindConfig,
  enemyMix,
} from '../../src/gameplay';
import type { EnemyKind, WorldEvent } from '../../src/gameplay';
import { ALPHA_BALANCE } from '../../src/gameplay/config';
import { CAMPAIGN_BALANCE, getCampaignMap, scaleEnemyStats } from '../../src/campaign';
import type { CombatTag } from '../../src/skills';

function world(mapId: number | null, seed = 1, spawning = false) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed,
    initialEnemies: false,
    ...(spawning ? {} : { spawning: { enabled: false } }),
    onHit: [],
    ...(mapId ? { campaign: { mapId } } : {}),
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01);
  return w;
}
const kill = (w: GameplayWorld, id: string) => {
  const t = new Set<CombatTag>(['physical']);
  w.skills.hit(id, w.skills.attack(t, 1e7, 'physical'), t, { procs: false });
};
/** Steps the world, collecting events incrementally (the world history is bounded). */
function step(w: GameplayWorld, seconds: number, dt = 0.05, sink: WorldEvent[] = []) {
  let seq = w.getEvents().at(-1)?.sequence ?? 0;
  const end = w.time + seconds;
  while (w.time < end - 1e-9) {
    w.update(Math.min(dt, end - w.time));
    const fresh = w.getEvents(seq);
    if (fresh.length) seq = fresh.at(-1)!.sequence;
    sink.push(...fresh);
  }
  return sink;
}
const ofType = (events: WorldEvent[], type: string) => events.filter((e) => e.event.type === type);

describe('Task 12 Phase 2 — new enemy kinds', () => {
  it('per-type stats from the melee enemy × factors; map HP/damage/speed multipliers apply on top', () => {
    const map = getCampaignMap(20);
    const base = scaleEnemyStats(ALPHA_ENEMY_STATS, map.difficulty);
    const w = world(20);
    const melee = ALPHA_ENEMIES.melee;
    for (const kind of ['swift', 'brute', 'bombard'] as const) {
      const t = NEW_ENEMY_TYPES[kind];
      const id = w.spawnEnemy(kind, 900);
      const e = w.core.getEntity(id);
      expect(e.maxHp, kind).toBeCloseTo(base.maxHp * t.hp, 9);
      if (kind === 'bombard') expect(e.magicalDamage).toBeCloseTo(base.physicalDamage * 1.2, 9);
      else expect(e.physicalDamage, kind).toBeCloseTo(base.physicalDamage * t.damage, 9);
      const c = w.enemies.getEnemy(id).config;
      expect(c.radius).toBe(t.radius);
      expect(c.movementSpeed).toBeCloseTo(melee.movementSpeed * t.speed * map.enemySpeedScale, 9);
      expect(w.getSnapshot().enemies.find((x) => x.entityId === id)!.kind).toBe(kind);
    }
    expect(enemyKindConfig('brute').attackInterval).toBeCloseTo(melee.attackInterval * 1.4, 9);
    expect(enemyKindConfig('bombard')).toMatchObject({
      behavior: 'artillery',
      damageType: 'magical',
      attackRange: 420,
      attackInterval: 3.2 * ALPHA_BALANCE.enemyAttackIntervalMultiplier,
      telegraph: { radius: 70, delay: 1 },
    });
    // The existing kinds are unchanged.
    expect(enemyKindConfig('melee')).toBe(ALPHA_ENEMIES.melee);
    expect(enemyKindConfig('ranged')).toBe(ALPHA_ENEMIES.ranged);
    expect(() => w.spawnEnemy('dragon' as EnemyKind)).toThrow();
  });
  it('a kill gives the kind’s run XP once (swift 5, brute 20, bombard 12)', () => {
    const w = world(null);
    for (const [kind, xp] of [
      ['swift', 5],
      ['brute', 20],
      ['bombard', 12],
    ] as const) {
      const id = w.spawnEnemy(kind, 900);
      kill(w, id);
      kill(w, id); // already dead: no second reward
      const rewards = w
        .getEvents()
        .filter(
          (e) =>
            e.event.type === 'enemy-rewarded' && (e.event as { enemyId: string }).enemyId === id,
        );
      expect(rewards.map((e) => (e.event as { xp: number }).xp)).toEqual([xp]);
    }
    expect(w.getSnapshot().runStats.killsByType).toEqual(
      expect.arrayContaining([
        { type: 'swift', count: 1 },
        { type: 'brute', count: 1 },
        { type: 'bombard', count: 1 },
      ]),
    );
  });
});

describe('Task 12 Phase 2 — bombard artillery', () => {
  function bombardWorld() {
    const w = world(null);
    w.setTestProtection(false);
    const id = w.spawnEnemy('bombard', 300, 0);
    return { w, id };
  }
  it('marks the player’s position; 1.0 s later the circle deals magical damage through Combat Core', () => {
    const { w, id } = bombardWorld();
    const events = step(w, 0.2);
    const [marked] = ofType(events, 'artillery-marked');
    const strike = (marked.event as { strike: { center: object; landsAt: number } }).strike;
    expect(strike.center).toEqual({
      x: w.getSnapshot().playerBody.x,
      y: w.getSnapshot().playerBody.y,
    });
    expect(strike.landsAt).toBeCloseTo(marked.time + 1, 9);
    expect(w.getSnapshot().artilleryStrikes).toHaveLength(1);
    const hp = w.core.getEntity('player').currentHp;
    // Nothing lands before 1.0 s.
    const before = step(w, strike.landsAt - w.time - 0.01, 0.01);
    expect(ofType(before, 'artillery-strike')).toEqual([]);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    const after = step(w, 0.05, 0.01);
    const [landed] = ofType(after, 'artillery-strike');
    expect(landed.time).toBeCloseTo(strike.landsAt, 9);
    expect(landed.event).toMatchObject({ hit: true, cancelled: false, blocked: false });
    const damage = after.filter(
      (e) =>
        e.channel === 'combat' &&
        e.event.type === 'damage' &&
        e.event.targetId === 'player' &&
        e.event.sourceId === id,
    );
    expect(damage).toHaveLength(1);
    expect((damage[0].event as { damageType: string }).damageType).toBe('magical');
    expect(w.core.getEntity('player').currentHp).toBeLessThan(hp);
    expect(w.getSnapshot().runStats.takenByType.find((t) => t.type === 'bombard')!.damage).toBe(
      hp - w.core.getEntity('player').currentHp,
    );
  });
  it('the mark does not follow the player: leaving the circle avoids the damage', () => {
    const { w } = bombardWorld();
    const events = step(w, 0.2);
    const marked = ofType(events, 'artillery-marked')[0].event as {
      strike: { center: { x: number; y: number } };
    };
    const hp = w.core.getEntity('player').currentHp;
    w.setMovement(0, 1); // walk away for the rest of the telegraph
    const after = step(w, 1.0);
    const [landed] = ofType(after, 'artillery-strike');
    expect((landed.event as { strike: { center: object } }).strike.center).toEqual(
      marked.strike.center,
    );
    expect(landed.event).toMatchObject({ hit: false, result: null });
    const body = w.getSnapshot().playerBody;
    expect(
      Math.hypot(body.x - marked.strike.center.x, body.y - marked.strike.center.y),
    ).toBeGreaterThan(70 + body.radius);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
  });
  it('pause freezes the telegraph; a stunned bombard starts no new mark; a dead one cancels its strike', () => {
    const { w, id } = bombardWorld();
    step(w, 0.2);
    const [strike] = w.getSnapshot().artilleryStrikes;
    w.setPaused(true);
    const t = w.time;
    w.update(10);
    expect(w.time).toBe(t);
    expect(w.getSnapshot().artilleryStrikes).toEqual([strike]);
    w.setPaused(false);
    // Kill the source before the strike lands: no damage, the strike is cancelled.
    const hp = w.core.getEntity('player').currentHp;
    kill(w, id);
    const landed = ofType(step(w, 1.0), 'artillery-strike');
    expect(landed[0].event).toMatchObject({ cancelled: true, hit: false, result: null });
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    // Stun: a fresh bombard stunned before its first attack marks nothing while stunned.
    const s = world(null);
    const b = s.spawnEnemy('bombard', 300, 0);
    expect(s.skills.stun(b, 2)).toBe(true);
    expect(ofType(step(s, 1), 'artillery-marked')).toEqual([]);
    expect(ofType(step(s, 2), 'artillery-marked').length).toBeGreaterThan(0);
  });
});

describe('Task 12 Phase 2 — spawn mix per act', () => {
  it('shares per act; each kind from its first map (swift 2, brute 4, bombard 6)', () => {
    expect(enemyMix(1)).toEqual({ swift: 0, brute: 0, bombard: 0 });
    expect(enemyMix(2)).toEqual({ swift: 0.15, brute: 0, bombard: 0 });
    expect(enemyMix(4)).toEqual({ swift: 0.15, brute: 0.08, bombard: 0 });
    expect(enemyMix(6)).toEqual({ swift: 0.15, brute: 0.08, bombard: 0.05 });
    expect(enemyMix(15)).toEqual(ENEMY_MIX.acts[2]);
    expect(enemyMix(25)).toEqual(ENEMY_MIX.acts[3]);
    expect(enemyMix(40)).toEqual({ swift: 0.22, brute: 0.14, bombard: 0.12 });
  });
  it.each([1, 6, 15, 25, 40])(
    'map %i: automatic spawns follow the shares within ±1 over a wave set; cap respected; same seed → same sequence',
    (mapId) => {
      const run = (seed: number) => {
        const w = world(mapId, seed, true);
        const kinds: EnemyKind[] = [];
        let peak = 0;
        for (const e of step(w, 150, 0.5)) {
          if (e.event.type === 'wave-spawned')
            kinds.push(...(e.event as unknown as { kinds: EnemyKind[] }).kinds);
          peak = Math.max(peak, w.getSnapshot().enemies.filter((x) => x.alive).length);
        }
        return { w, kinds, peak };
      };
      const { w, kinds, peak } = run(3);
      const n = kinds.length;
      expect(n).toBeGreaterThan(80);
      expect(peak).toBeLessThanOrEqual(120); // waves stop at 120 − reserved; elites use the reserve
      const counts = w.autoSpawnCounts();
      const mix = enemyMix(mapId);
      for (const kind of ['swift', 'brute', 'bombard'] as const) {
        expect(counts[kind], kind).toBe(kinds.filter((k) => k === kind).length);
        expect(Math.abs(counts[kind] - n * mix[kind]), kind).toBeLessThanOrEqual(1);
      }
      const ranged = getCampaignMap(mapId).rangedShare ?? CAMPAIGN_BALANCE.rangedShare;
      expect(Math.abs(counts.ranged - n * ranged)).toBeLessThanOrEqual(1);
      expect(run(3).kinds).toEqual(kinds);
    },
    120_000,
  );
});
