import { describe, expect, it } from 'vitest';
import { GameplayWorld, ALPHA_ENEMIES } from '../../src/gameplay';
import { QaGameplayWorld } from '../../src/gameplay/qa';
import { createTestingController, createTestingWorld } from '../../src/gameplay/testing';
import type { CharacterClass } from '../../src/character-stats';
import type { CombatTag } from '../../src/skills';
import { stunIndicator } from '../../src/engine/stun-indicator';

const options = (characterClass: CharacterClass = 'warrior') => ({
  characterClass,
  level: 10,
  seed: 7,
  initialEnemies: false,
  onHit: [],
  spawning: { enabled: false },
});
function enemy(w: GameplayWorld, distance = 900) {
  const id = w.spawnEnemy('melee', distance, 0, { ...ALPHA_ENEMIES.melee, movementSpeed: 0 });
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  return id;
}
const hit = (w: GameplayWorld, id: string) => {
  const tags = new Set<CombatTag>(['physical', 'melee', 'heavy_melee']);
  return w.skills.hit(id, w.skills.attack(tags, 0.01, 'physical'), tags);
};

describe('QA-only HP guard', () => {
  it('prevents lethal direct and periodic HP loss while preserving stats and barrier behavior', () => {
    const w = new QaGameplayWorld(options());
    const id = enemy(w);
    const before = w.getSnapshot();
    w.setGodMode(true);
    w.core.setBarrier('player', 10);
    const attack = w.core.createAttack({
      attackerId: id,
      damageType: 'physical',
      coefficient: 1e6,
    });
    const direct = w.core.resolveAttack(attack, 'player');
    expect(direct.status).toBe('hit');
    expect(direct.damage).toBeGreaterThan(before.player.maxHp);
    expect(direct.appliedDamage).toBe(0);
    expect(direct.absorbed).toBe(10);
    expect(w.core.getBarrier('player')).toBe(0);
    const periodic = w.core.applyPeriodicDamage({
      operationId: 'qa-test',
      targetId: 'player',
      effectId: 'poison',
      rawDamage: 1e6,
      sources: [{ applicationId: 'test', sourceId: id, rawDamage: 1e6 }],
    });
    expect(periodic.appliedDamage).toBe(0);
    expect(periodic.events).toEqual([]);
    expect(w.core.getEntity('player')).toEqual(before.player);
    expect(w.getSnapshot().stats).toEqual(before.stats);
    expect(w.character).toBe(before.character);
    w.setGodMode(false);
    expect(w.core.resolveAttack(attack, 'player').events.some((e) => e.type === 'death')).toBe(
      true,
    );
  });
  it('lets real enemy attacks, on-hit effects, status ticks and spawning continue', () => {
    const w = new QaGameplayWorld({
      ...options(),
      spawning: { enabled: true, interval: 1, minimumInterval: 1 },
    });
    w.setGodMode(true);
    const id = enemy(w, 0);
    const before = w.core.getEntity('player');
    w.applyEffect({
      sourceId: id,
      targetId: 'player',
      effectType: 'burn',
      probabilityPercent: 100,
      rawDamagePerTick: 1e6,
      duration: 20,
    });
    w.update(6);
    expect(w.time).toBe(6);
    expect(w.core.getEntity('player')).toEqual(before);
    const events = w.getEvents();
    expect(events.some((e) => e.event.type === 'contact-attempt' && !e.event.blocked)).toBe(true);
    expect(
      events.some(
        (e) => e.event.type === 'status-applied' && e.event.group.effectType === 'poison',
      ),
    ).toBe(true);
    expect(events.some((e) => e.event.type === 'status-tick' && e.event.result?.damage)).toBe(true);
    expect(w.getSnapshot().spawning.waves).toBe(6);
    expect(w.core.getEntity(id).currentHp).toBeLessThan(1e9);
    w.setGodMode(false);
    w.update(1);
    expect(w.core.getEntity('player').alive).toBe(false);
  });
  it('keeps ranged projectile launches and impacts on their normal schedule', () => {
    const w = new QaGameplayWorld(options());
    // Isolate the projectile guard from Dodge; seeded Dodge behavior has its own test below.
    w.core.updateEntityStats('player', { ...w.core.getEntity('player'), dodgeChance: 0 });
    const id = w.spawnEnemy('ranged', 250, 0, { ...ALPHA_ENEMIES.ranged, movementSpeed: 0 });
    w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
    w.setGodMode(true);
    const hp = w.core.getEntity('player').currentHp;
    w.update(2.22);
    expect(w.getEvents().filter((e) => e.event.type === 'enemy-projectile-launched')).toHaveLength(
      2,
    );
    expect(
      w
        .getEvents()
        .some(
          (e) => e.event.type === 'enemy-projectile-impact' && e.event.result?.status === 'hit',
        ),
    ).toBe(true);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    expect(w.enemies.getEnemy(id).nextAttackAt).toBeCloseTo(4.42, 9);
    w.setGodMode(false);
    w.update(1.5);
    expect(w.core.getEntity('player').currentHp).toBeLessThan(hp);
  });
  it('preserves Dodge RNG and outgoing damage when enabled, with normal behavior when off', () => {
    const normal = new GameplayWorld(options());
    const qa = new QaGameplayWorld(options());
    const a = enemy(normal, 250),
      b = enemy(qa, 250);
    normal.update(2);
    qa.update(2);
    expect(qa.getSnapshot()).toEqual(normal.getSnapshot());
    qa.setGodMode(true);
    const tags = new Set<CombatTag>(['physical']);
    const x = normal.skills.hit(a, normal.skills.attack(tags, 0.3, 'physical'), tags);
    const y = qa.skills.hit(b, qa.skills.attack(tags, 0.3, 'physical'), tags);
    expect(y?.result).toEqual(x?.result);
    for (let i = 0; i < 8; i++) {
      const attackA = normal.core.createAttack({
        attackerId: a,
        damageType: 'physical',
        coefficient: 0.01,
      });
      const attackB = qa.core.createAttack({
        attackerId: b,
        damageType: 'physical',
        coefficient: 0.01,
      });
      expect(attackB).toEqual(attackA);
      expect(qa.core.resolveAttack(attackB, 'player').status).toBe(
        normal.core.resolveAttack(attackA, 'player').status,
      );
    }
  });
  it('validates the toggle, preserves pause, resets OFF on new runs and keeps explicit QA HP controls', () => {
    let w = createTestingWorld(options()) as QaGameplayWorld;
    const controller = createTestingController(
      () => w,
      (input) => {
        w = createTestingWorld(input) as QaGameplayWorld;
      },
    );
    expect(controller.snapshot()?.godMode).toBe(false);
    expect(() => controller({ type: 'god-mode', enabled: 'yes' })).toThrow();
    w.setPaused(true);
    controller({ type: 'god-mode', enabled: true });
    w.update(100);
    expect(w.time).toBe(0);
    controller({ type: 'hp', value: 10 });
    expect(w.core.getEntity('player').currentHp).toBe(10);
    expect(controller.snapshot()?.godMode).toBe(true);
    controller({ type: 'restart', options: options() });
    expect(controller.snapshot()?.godMode).toBe(false);
  });
});

describe('event-backed QA synergy diagnostics', () => {
  it.each([
    ['warrior', 'ground_slam'],
    ['mage', 'elemental_mastery'],
    ['archer', 'toxic_volley'],
    ['rogue', 'blade_flurry'],
  ] as const)('%s shows exactly its three rules and authoritative prerequisites', (cls, skill) => {
    const w = new QaGameplayWorld(options(cls));
    expect(w.qaSnapshot().synergies).toHaveLength(3);
    expect(
      w.qaSnapshot().synergies.every((s) => !s.unlocked && s.count === 0 && s.lastTime === null),
    ).toBe(true);
    w.grantTestSkill('power');
    expect(w.qaSnapshot().synergies.every((s) => !s.unlocked)).toBe(true);
    w.grantTestSkill(skill);
    expect(w.qaSnapshot().synergies.every((s) => s.unlocked && s.count === 0)).toBe(true);
    expect(Object.isFrozen(w.qaSnapshot().synergies[0])).toBe(true);
  });
  it('counts simultaneous hit and kill rules from actual events, including time zero', () => {
    const w = new QaGameplayWorld(options());
    w.grantTestSkill('ground_slam');
    const id = enemy(w);
    w.skills.stun(id, 0.6);
    hit(w, id);
    const victim = enemy(w, 1100);
    w.core.updateEntityStats(victim, { ...w.core.getEntity(victim), maxHp: 1 });
    hit(w, victim);
    for (const s of w.qaSnapshot().synergies) {
      expect(s.count).toBe(1);
      expect(s.lastTime).toBe(0);
      expect(s.lastTargetId).not.toBeNull();
      expect(
        w
          .getEvents()
          .filter((e) => e.event.type === 'synergy-triggered' && e.event.synergyId === s.id),
      ).toHaveLength(s.count);
    }
  });
  it('counts beyond the bounded event history, and reset never resets the world or proc cooldowns', () => {
    const w = new QaGameplayWorld(options());
    w.grantTestSkill('ground_slam');
    w.setGodMode(true);
    for (let i = 0; i < 100; i++) {
      const id = enemy(w, 900 + i);
      w.skills.stun(id, 0.6);
      hit(w, id);
    }
    const before = w.getSnapshot();
    expect(w.getEvents()).toHaveLength(160);
    expect(w.qaSnapshot().synergies.find((s) => s.id === 'skull_crusher')?.count).toBe(100);
    expect(w.qaSnapshot().synergies.find((s) => s.id === 'seismic_impact')?.count).toBe(100);
    const history = w.getEvents();
    w.resetSynergyCounters();
    expect(w.getSnapshot()).toEqual(before);
    expect(w.getEvents()).toEqual(history);
    expect(w.qaSnapshot().godMode).toBe(true);
    expect(
      w.qaSnapshot().synergies.every((s) => s.count === 0 && s.lastTime === null && s.unlocked),
    ).toBe(true);
    hit(w, before.enemies[0].entityId);
    expect(w.qaSnapshot().synergies.every((s) => s.count === 0)).toBe(true);
  });
});

describe('Stun presentation follows authoritative control expiry', () => {
  it('appears for Stun, survives pause, and disappears exactly on expiry without confusing Slow/DoTs', () => {
    const w = new GameplayWorld(options());
    const id = enemy(w);
    expect(stunIndicator(w.enemies.getEnemy(id))).toBeNull();
    w.skills.slow(id, 0.5, 5);
    expect(stunIndicator(w.enemies.getEnemy(id))).toBeNull();
    w.skills.stun(id, 0.6);
    expect(stunIndicator(w.enemies.getEnemy(id))?.text).toBe('СТАН');
    w.update(0.59);
    expect(stunIndicator(w.enemies.getEnemy(id))).not.toBeNull();
    w.setPaused(true);
    w.update(100);
    expect(stunIndicator(w.enemies.getEnemy(id))).not.toBeNull();
    w.setPaused(false);
    w.update(0.01);
    expect(stunIndicator(w.enemies.getEnemy(id))).toBeNull();
    expect(w.skills.stun(id, 0.6)).toBe(false); // Existing immunity is unchanged.
    expect(stunIndicator({ ...w.enemies.getEnemy(id), alive: false })).toBeNull();
  });
});
