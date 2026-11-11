import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import type { CombatTag } from '../../src/skills';
import { resolveOffers } from '../skills/helpers';
import { bossSpawnTime } from '../../src/campaign';

/** Map 10's boss appears when its 15:00 timer ends (the map is won when it dies). */
const B = bossSpawnTime(10);

function world(protect = true) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed: 21,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    campaign: { mapId: 10 }, // last_dark: all five ability kinds
  });
  w.setTestProtection(protect);
  w.weapons.setAttackSpeed('player', 0.01); // the staff must not kill the boss during checks
  return w;
}
/** Steps the world, collecting campaign/enemy events incrementally (history is bounded). */
function run(w: GameplayWorld, until: number, step: number, sink: WorldEvent[] = []) {
  let seq = w.getEvents().at(-1)?.sequence ?? 0;
  while (w.time < until - 1e-9 && w.getSnapshot().campaign!.status === 'active') {
    resolveOffers(w);
    if (w.paused) break; // revival prompt or resolved run: the world is frozen by design
    w.update(Math.min(step, until - w.time));
    const fresh = w.getEvents(seq);
    if (fresh.length) seq = fresh.at(-1)!.sequence;
    sink.push(...fresh);
  }
  return sink;
}
const boss = (o: WorldEvent[], type: string, id?: string) =>
  o.filter(
    (e) =>
      e.channel === 'campaign' &&
      e.event.type === type &&
      (id === undefined || (e.event as { abilityId: string }).abilityId === id),
  );

describe('boss abilities in the world (Task 08 §2.2)', () => {
  it('all five abilities act through the existing systems after the boss spawns', () => {
    const w = world();
    run(w, B, 5);
    const bossId = w.getSnapshot().campaign!.bossEnemyId!;
    expect(bossId).not.toBeNull();
    const events = run(w, B + 40, 0.05);
    for (const id of ['void_bloom', 'collapse', 'night_rush', 'dread_tide', 'last_shadows'])
      expect(boss(events, 'boss-ability-executed', id).length, id).toBeGreaterThan(0);
    // Radial burst launched existing enemy projectiles from the boss.
    const launched = events.filter(
      (e) =>
        e.channel === 'enemy' &&
        e.event.type === 'enemy-projectile-launched' &&
        e.event.projectile.sourceId === bossId,
    );
    expect(launched.length % 16).toBe(0);
    expect(launched.length).toBeGreaterThanOrEqual(16);
    // Summon added regular enemies.
    expect(boss(events, 'boss-ability-executed', 'last_shadows')[0].event).toMatchObject({
      count: 4,
    });
    // Dangerous attacks were telegraphed with geometry before executing.
    const slamStart = boss(events, 'boss-cast-started', 'collapse')[0];
    const slamExec = boss(events, 'boss-ability-executed', 'collapse')[0];
    expect(slamExec.time - slamStart.time).toBeCloseTo(1.3, 9);
    expect(
      (slamStart.event as { telegraph: { center: unknown; radius: number } }).telegraph,
    ).toMatchObject({ radius: 125 });
  });
  it('speed abilities boost the boss through EnemyAI and reset afterwards', () => {
    const w = world();
    run(w, B, 5);
    const bossId = w.getSnapshot().campaign!.bossEnemyId!;
    let boosted = 0;
    let seq = 0;
    while (w.time < B + 40) {
      w.update(0.05);
      const e = w.getSnapshot().enemies.find((x) => x.entityId === bossId);
      if (e?.speedBoost) boosted = Math.max(boosted, e.speedBoost);
      seq++;
    }
    expect(boosted).toBe(3.8);
    // After every effect has ended, no boost remains.
    const effects = w.getSnapshot().campaign!.bossEffects;
    const e = w.getSnapshot().enemies.find((x) => x.entityId === bossId)!;
    if (effects.length === 0) expect(e.speedBoost).toBeUndefined();
  });
  it('boss damage goes through Combat Core and the survival policies', () => {
    const shielded = world(true);
    run(shielded, B + 40, 0.05);
    expect(shielded.core.getEntity('player').currentHp).toBe(
      shielded.core.getEntity('player').maxHp,
    );
    const exposed = world(true);
    run(exposed, B, 5); // protected until the boss spawns
    const bossId = exposed.getSnapshot().campaign!.bossEnemyId!;
    expect(bossId).not.toBeNull();
    // Remove everything except the boss so only boss damage reaches the player.
    const t = new Set<CombatTag>(['physical']);
    for (const e of exposed.getSnapshot().enemies)
      if (e.alive && e.entityId !== bossId)
        exposed.skills.hit(e.entityId, exposed.skills.attack(t, 1e7, 'physical'), t, {
          procs: false,
        });
    exposed.setTestProtection(false);
    const events = run(exposed, B + 40, 0.05);
    const damage = events.filter(
      (e) =>
        e.channel === 'combat' &&
        e.event.type === 'damage' &&
        e.event.targetId === 'player' &&
        e.event.sourceId === bossId,
    );
    expect(damage.length).toBeGreaterThan(0);
  });
  it('the ability timeline is identical for small and large frames (deterministic)', () => {
    const timeline = (step: number) => {
      const w = world();
      run(w, B, 5);
      const out: string[] = [];
      let seq = w.getEvents().at(-1)?.sequence ?? 0;
      while (w.time < B + 30 - 1e-9) {
        w.update(Math.min(step, B + 30 - w.time));
        const fresh = w.getEvents(seq);
        if (fresh.length) seq = fresh.at(-1)!.sequence;
        for (const e of fresh)
          if (e.channel === 'campaign' && e.event.type.startsWith('boss-'))
            out.push(
              `${e.time.toFixed(6)}:${e.event.type}:${(e.event as { abilityId?: string }).abilityId}`,
            );
      }
      return out;
    };
    const small = timeline(0.05);
    expect(small.length).toBeGreaterThan(8);
    expect(timeline(1)).toEqual(small);
  });
  it('no boss actions while paused, and none after the boss dies', () => {
    const w = world();
    run(w, B + 3, 5);
    const before = w.getSnapshot().campaign!.bossCast;
    w.setPaused(true);
    w.update(60);
    expect(w.getSnapshot().campaign!.bossCast).toEqual(before);
    w.setPaused(false);
    w.clearEnemies();
    w.update(0.05);
    // The boss appears at the end of the timer, so its death wins the map at once.
    expect(w.getSnapshot().campaign).toMatchObject({ bossKilled: true, status: 'victory' });
    const time = w.time;
    w.update(60);
    expect(w.time).toBe(time); // resolved: the world is frozen, no further boss actions
    expect(boss(w.getEvents(), 'boss-ability-executed').every((e) => e.time <= time)).toBe(true);
  });
});
