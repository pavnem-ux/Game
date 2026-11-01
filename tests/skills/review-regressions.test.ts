import { describe, expect, it } from 'vitest';
import { GameplayWorld, ALPHA_ENEMIES } from '../../src/gameplay';
import { arena, skillEvents, stationaryMelee } from './helpers';

const huge = (w: GameplayWorld, id: string) =>
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });

/** Regressions for Codex review findings on PR #3. */
describe('review regressions', () => {
  it('Split Shot shards are secondary: they never enter the synergy resolver', () => {
    const w = arena('archer', { level: 10, onHit: [] });
    w.weapons.setAttackSpeed('player', 1);
    const primary = w.spawnEnemy('melee', 150, 0, stationaryMelee);
    const behind = w.spawnEnemy('melee', 205, 0, stationaryMelee);
    huge(w, primary);
    huge(w, behind);
    w.skills.applyStatus(behind, {
      effectType: 'poison',
      rawDamagePerTick: 0,
      duration: 30,
      probabilityPercent: 100,
    });
    w.grantTestSkill('split_shot', 3);
    w.update(1);
    const shardHits = w
      .getEvents()
      .filter(
        (e) =>
          e.channel === 'weapon' &&
          e.event.type === 'impact' &&
          e.event.weaponId.endsWith(':split') &&
          e.event.targetId === behind,
      );
    expect(shardHits.length).toBeGreaterThan(0);
    // A procs-capable hit on a poisoned target would start a Deadly Precision focus.
    expect((w.skills.synergies as unknown as { focus: unknown }).focus).toBeNull();
  });
  it('filled circles include an enemy at their exact centre (Poison Trap on a lone enemy)', () => {
    const w = arena('archer', { level: 10, onHit: [] });
    w.weapons.setAttackSpeed('player', 1);
    const lone = w.spawnEnemy('melee', 300, 0, stationaryMelee);
    huge(w, lone);
    w.grantTestSkill('poison_trap', 1);
    w.update(1);
    expect(w.statuses.getGroup(lone, 'poison')?.stacks.length).toBe(2);
    expect(w.skills.inCircle(w.skills.body(lone)!, 10)).toEqual([lone]);
    expect(w.skills.inCircle(w.skills.body(lone)!, 40, 30)).toEqual([]);
  });
  it('automatic activation does not depend on frame endpoints (one 1 s frame vs 100 × 0.01 s)', () => {
    const run = (frames: number[]) => {
      const w = arena('mage', { seed: 7 });
      const id = w.spawnEnemy('melee', 520, 0, ALPHA_ENEMIES.melee);
      w.grantTestSkill('fireball', 1);
      for (const f of frames) w.update(f);
      return {
        hp: w.core.getEntity(id).currentHp,
        activations: skillEvents(w, 'skill-activated').map((e) => e.time),
      };
    };
    const one = run([1]);
    const many = run(Array.from({ length: 100 }, () => 0.01));
    expect(many.activations.length).toBeGreaterThan(0);
    expect(many.activations[0]).toBeCloseTo(one.activations[0], 9);
    expect(many.hp).toBe(one.hp);
  });
  it('lethal weapon impacts keep the victim position: Wildfire spreads from a staff kill', () => {
    const w = arena('mage', { level: 10, onHit: [] });
    w.grantTestSkill('elemental_mastery', 1);
    const victim = w.spawnEnemy('melee', 200, 0, stationaryMelee);
    const neighbour = w.spawnEnemy('melee', 240, 0, stationaryMelee);
    huge(w, neighbour);
    w.core.updateEntityStats(victim, { ...w.core.getEntity(victim), maxHp: 1 });
    w.skills.applyStatus(victim, {
      effectType: 'burn',
      rawDamagePerTick: 0,
      duration: 30,
      probabilityPercent: 100,
    });
    w.update(1);
    expect(w.core.getEntity(victim).alive).toBe(false);
    const wildfire = skillEvents(w, 'synergy-triggered').filter(
      (e) => (e.event as { synergyId: string }).synergyId === 'wildfire',
    );
    expect(wildfire).toHaveLength(1);
    expect((wildfire[0].event as { position: { x: number } }).position.x).toBeCloseTo(2000, 6);
    expect(w.statuses.getGroup(neighbour, 'burn')).not.toBeNull();
  });
  it('a lethal Fireball explodes around the victim, not around the player', () => {
    const w = arena('mage', { level: 10, onHit: [] });
    w.weapons.setAttackSpeed('player', 1);
    const victim = w.spawnEnemy('melee', 300, 0, stationaryMelee);
    huge(w, victim);
    w.grantTestSkill('fireball', 1);
    // The basic staff bolt (faster) lands first; only then make the Fireball the lethal hit.
    const staffLanded = () =>
      w
        .getEvents()
        .some(
          (e) =>
            e.channel === 'weapon' &&
            e.event.type === 'impact' &&
            !e.event.weaponId.startsWith('skill:'),
        );
    while (!staffLanded()) w.update(0.01);
    w.core.updateEntityStats(victim, { ...w.core.getEntity(victim), maxHp: 1 });
    w.update(1);
    expect(w.core.getEntity(victim).alive).toBe(false);
    const area = skillEvents(w, 'skill-area').find(
      (e) => (e.event as { sourceKey: string }).sourceKey === 'fireball',
    );
    expect(area).toBeDefined();
    expect((area!.event as { center: { x: number } }).center.x).toBeGreaterThan(2000);
  });
});
