import { describe, it, expect } from 'vitest';
import { GameplayWorld, ALPHA_ENEMIES, ALPHA_WEAPONS } from '../../src/gameplay';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import type { GameplayWorld as World } from '../../src/gameplay';
const world = (characterClass: (typeof CHARACTER_CLASSES)[number] = 'warrior') =>
  new GameplayWorld({ characterClass, initialEnemies: false, spawning: { enabled: false } });
const combat = (w: World) =>
  w
    .getEvents()
    .filter((e) => e.channel === 'combat')
    .map((e) => e.event);
const stationary = { ...ALPHA_ENEMIES.melee, movementSpeed: 0 };
function burn(
  w: World,
  targetId: string,
  damage = 200,
  type: 'poison' | 'burn' | 'bleed' = 'burn',
) {
  w.applyEffect({
    sourceId: 'player',
    targetId,
    effectType: type,
    duration: 5,
    probabilityPercent: 100,
    rawDamagePerTick: damage,
  });
}
function clocks(w: World) {
  return [w.time, w.weapons.time, w.enemies.time, w.statuses.time, w.survival.time];
}
describe('shared world chronological boundaries', () => {
  it.each(CHARACTER_CLASSES)(
    '%s starts with approved stats and damages using its real weapon',
    (characterClass) => {
      const w = world(characterClass);
      const id = w.spawnEnemy('melee', 60, 0, stationary);
      w.update(0.5);
      expect(w.getSnapshot().weapon.weapon.category).toBe(ALPHA_WEAPONS[characterClass].category);
      expect(w.core.getEntity(id).currentHp).toBeLessThan(90);
      expect(combat(w).some((e) => e.type === 'damage')).toBe(true);
      expect(clocks(w).every((t) => t === w.time)).toBe(true);
      if (characterClass === 'rogue')
        expect(w.getEvents().filter((e) => e.event.type === 'attack-started')).toHaveLength(2);
    },
  );
  it('allows only the first successful same-time incoming hit and consumes both cooldowns', () => {
    const w = world('mage');
    w.spawnEnemy('melee', 0, 0, stationary);
    w.spawnEnemy('melee', 0, 0, stationary);
    w.update(0);
    const hits = w
      .getEvents()
      .filter((e) => e.event.type === 'contact-attempt')
      .map((e) => e.event);
    expect(hits).toHaveLength(2);
    expect(hits.filter((e) => e.type === 'contact-attempt' && e.blocked)).toHaveLength(1);
    expect(w.survival.getState().directProtected).toBe(true);
  });
  it('resolves earlier DoT death before a later incoming attack in a large delta', () => {
    const w = world('mage');
    const id = w.spawnEnemy('melee', 150, 0, { ...stationary, movementSpeed: 90 });
    burn(w, id);
    w.update(5);
    expect(w.core.getEntity(id).alive).toBe(false);
    expect(combat(w).filter((e) => e.type === 'death')).toHaveLength(1);
    expect(combat(w).some((e) => e.type === 'damage' && e.targetId === 'player')).toBe(false);
    expect(w.getSnapshot().kills).toBe(1);
  });
  it('freezes every clock and projectile at the actual periodic death timestamp, discards remainder', () => {
    const w = world('archer');
    w.spawnEnemy('ranged', 300, 0);
    burn(w, 'player', 1000);
    w.update(30);
    expect(w.time).toBe(1);
    expect(clocks(w)).toEqual([1, 1, 1, 1, 1]);
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    const snapshot = w.getSnapshot();
    w.update(100);
    expect(w.getSnapshot()).toEqual(snapshot);
    w.decide('revive');
    expect(w.time).toBe(1);
    expect(w.core.getEntity('player').currentHp).toBe(w.core.getEntity('player').maxHp / 2);
    w.update(0.1);
    expect(clocks(w).every((t) => t === 1.1)).toBe(true);
  });
  it('freeze on lethal direct hit is global even with a huge frame delta', () => {
    const w = world();
    w.spawnEnemy('melee', 130, 0, {
      ...ALPHA_ENEMIES.melee,
      movementSpeed: 100,
      attackCoefficient: 1000,
    });
    w.update(40);
    expect(w.time).toBeCloseTo(1.03, 10);
    expect(clocks(w).every((t) => t === w.time)).toBe(true);
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    const saved = w.getSnapshot();
    w.update(50);
    expect(w.getSnapshot()).toEqual(saved);
  });
  it('resolves both valid simultaneous deaths without launching new actions by a dead entity', () => {
    const w = world();
    const id = w.spawnEnemy('melee', 500, 0, stationary);
    burn(w, 'player', 1000);
    burn(w, id, 1000);
    w.update(20);
    expect(w.time).toBe(1);
    expect(
      combat(w)
        .filter((e) => e.type === 'death')
        .map((e) => 'entityId' in e && e.entityId)
        .sort(),
    ).toEqual([id, 'player'].sort());
    expect(w.getSnapshot().kills).toBe(1);
  });
  it('keeps exact tick schedules across manual pause; revival cleans only player, preserves the world', () => {
    const w = world('mage');
    const id = w.spawnEnemy('ranged', 300, 0);
    burn(w, id, 1);
    burn(w, 'player', 1);
    w.update(0.2);
    w.setPaused(true);
    const paused = w.getSnapshot();
    w.update(100);
    expect(w.getSnapshot()).toEqual(paused);
    w.setPaused(false);
    w.setPlayerHp(0);
    const dead = w.getSnapshot();
    const groups = w.statuses.getGroups(id);
    w.decide('revive');
    const revived = w.getSnapshot();
    expect(revived.playerBody).toEqual(dead.playerBody);
    expect(revived.enemies.map((e) => [e.position, e.entity, e.nextAttackAt])).toEqual(
      dead.enemies.map((e) => [e.position, e.entity, e.nextAttackAt]),
    );
    expect(revived.playerProjectiles).toEqual(dead.playerProjectiles);
    expect(revived.enemyProjectiles).toEqual(dead.enemyProjectiles);
    expect(w.statuses.getGroups('player')).toEqual([]);
    expect(w.statuses.getGroups(id)).toEqual(groups);
    expect(w.survival.getState().fullInvulnerableUntil).toBe(3.2);
  });
  it('blocks effects/periodic/direct during full protection and expires on the exact boundary', () => {
    const w = world('mage');
    w.setPlayerHp(0);
    w.decide('revive');
    const hp = w.core.getEntity('player').currentHp;
    burn(w, 'player', 1000);
    expect(w.statuses.getGroups('player')).toEqual([]);
    const attacker = w.spawnEnemy('melee', 0, 0, { ...stationary, attackInterval: 1 });
    w.core.updateEntityStats(attacker, { ...w.core.getEntity(attacker), maxHp: 10000 });
    w.setTestProtection(false);
    w.update(2);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    expect(
      w.getEvents().filter((e) => e.event.type === 'contact-attempt' && e.event.blocked),
    ).toHaveLength(3);
    w.update(1);
    expect(w.core.getEntity('player').currentHp).toBeLessThan(hp);
    burn(w, 'player', 1000);
    expect(w.statuses.getGroups('player')).toHaveLength(1);
    w.update(1);
    expect(w.survival.getState().runState).toBe('ended');
  });
  it('is invariant to update partitioning with fixed input, seed and moving enemy hitboxes', () => {
    const a = new GameplayWorld({ characterClass: 'mage' }),
      b = new GameplayWorld({ characterClass: 'mage' });
    a.setMovement(1, 1);
    b.setMovement(1, 1);
    a.update(4);
    for (let i = 0; i < 240; i++) b.update(1 / 60);
    const x = a.getSnapshot(),
      y = b.getSnapshot();
    expect(x.time).toBeCloseTo(y.time, 10);
    expect(x.player).toEqual(y.player);
    expect(x.kills).toBe(y.kills);
    expect(x.playerBody.x).toBeCloseTo(y.playerBody.x, 9);
    x.enemies.forEach((e, i) => {
      expect(e.entity).toEqual(y.enemies[i].entity);
      expect(e.position.x).toBeCloseTo(y.enemies[i].position.x, 8);
    });
    expect(combat(a)).toEqual(combat(b));
  });
  it('creates fresh sessions, validates debug commands, bounds history and does not duplicate kills', () => {
    const w = world();
    const fresh = world();
    expect(w.core).not.toBe(fresh.core);
    expect(w.weapons).not.toBe(fresh.weapons);
    const id = w.spawnEnemy('melee', 50, 0, stationary);
    expect(() => w.spawnEnemy('melee', NaN)).toThrow();
    expect(() =>
      w.applyEffect(
        {
          sourceId: 'player',
          targetId: id,
          effectType: 'poison',
          duration: 3,
          probabilityPercent: 100,
          rawDamagePerTick: 1,
        },
        21,
      ),
    ).toThrow();
    expect(() => w.setPlayerHp(-1)).toThrow();
    expect(() => w.update(-1)).toThrow();
    w.clearEnemies();
    w.clearEnemies();
    w.update(10);
    expect(w.getSnapshot().kills).toBe(1);
    expect(w.getEvents().length).toBeLessThanOrEqual(160);
    expect(Object.isFrozen(w.getSnapshot().player)).toBe(true);
  });
});
