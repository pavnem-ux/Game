import { describe, expect, it } from 'vitest';
import { GameplayWorld, ALPHA, ALPHA_ENEMIES, ALPHA_WEAPONS } from '../../src/gameplay';
import { defaultOnHit } from '../../src/gameplay/config';
import { spawningSettings } from '../../src/gameplay/spawning';

const isolated = () =>
  new GameplayWorld({
    characterClass: 'mage',
    initialEnemies: false,
    onHit: [],
    spawning: { enabled: false },
  });
const heals = (w: GameplayWorld) => w.getEvents().filter((e) => e.event.type === 'healing');
const levelHeals = (w: GameplayWorld) =>
  w.getEvents().filter((e) => e.event.type === 'run-level-healed');

describe('Task 07.1 run-level healing', () => {
  it('heals 15% of current Max HP exactly once for a single run level', () => {
    const w = isolated();
    const max = w.core.getEntity('player').maxHp;
    const character = w.character;
    w.setPlayerHp(max * 0.2);
    w.grantTestXp(20);
    expect(w.core.getEntity('player').currentHp).toBeCloseTo(max * 0.35, 10);
    expect(heals(w)).toHaveLength(1);
    expect(levelHeals(w)).toHaveLength(1);
    expect(w.run.pendingChoices).toBe(1);
    expect(w.character).toEqual(character);
    w.update(100);
    expect(heals(w)).toHaveLength(1);
  });
  it('heals separately for each of three queued levels, never on choice or reroll', () => {
    const w = isolated();
    const max = w.core.getEntity('player').maxHp;
    w.setPlayerHp(max * 0.1);
    w.grantTestXp(92); // levels 2, 3, 4: 20 + 30 + 42
    expect(w.getSnapshot().progression.level).toBe(4);
    expect(w.run.pendingChoices).toBe(3);
    expect(w.core.getEntity('player').currentHp).toBeCloseTo(max * 0.55, 10);
    expect(heals(w)).toHaveLength(3);
    expect(levelHeals(w).map((e) => e.event.type === 'run-level-healed' && e.event.level)).toEqual([
      2, 3, 4,
    ]);
    w.rerollSkillOffer();
    while (w.run.currentOffer) {
      const card = w.run.currentOffer.cards[0];
      w.chooseSkill(card.kind === 'skill' ? card.skillId : `bonus:${card.bonusId}`);
    }
    expect(levelHeals(w)).toHaveLength(3);
    expect(heals(w)).toHaveLength(3);
  });
  it('caps healing and records each level even when already full', () => {
    const w = isolated();
    const max = w.core.getEntity('player').maxHp;
    w.setPlayerHp(max - 1);
    w.grantTestXp(92); // levels 2, 3, 4: 20 + 30 + 42
    expect(w.core.getEntity('player').currentHp).toBe(max);
    expect(heals(w)).toHaveLength(1); // Core only emits healing when HP actually increases.
    expect(levelHeals(w)).toHaveLength(3);
    expect(levelHeals(w).map((e) => e.event.type === 'run-level-healed' && e.event.healed)).toEqual(
      [1, 0, 0],
    );
  });
  it('uses Max HP after acquired run passives rather than the permanent snapshot', () => {
    const w = isolated();
    w.grantTestSkill('vitality', 2);
    const max = w.core.getEntity('player').maxHp;
    expect(max).toBeGreaterThan(w.character.combatAttributes.maxHp);
    const hp = max - Math.floor(max * 0.8);
    w.setPlayerHp(hp);
    w.grantTestXp(20);
    expect(w.core.getEntity('player').currentHp).toBeCloseTo(hp + max * 0.15, 10);
    expect(levelHeals(w)).toHaveLength(1);
  });
  it('does not heal for XP without a level or for incoming damage', () => {
    const w = isolated();
    const hp = w.core.getEntity('player').maxHp / 2;
    w.setPlayerHp(hp);
    w.grantTestXp(19);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    w.spawnEnemy('melee', 0, 0, { ...ALPHA_ENEMIES.melee, movementSpeed: 0 });
    w.update(0);
    expect(w.core.getEntity('player').currentHp).toBeLessThan(hp);
    expect(heals(w)).toEqual([]);
    expect(levelHeals(w)).toEqual([]);
  });
  it('uses the same healing path for a collected XP crystal and retains fractional HP', () => {
    const w = isolated();
    const max = w.core.getEntity('player').maxHp;
    w.setPlayerHp(1);
    w.core.heal('player', 0.25);
    w.dropTestCrystal(50, 0);
    w.update(1 / 60);
    expect(w.getSnapshot().progression.level).toBe(3);
    expect(w.core.getEntity('player').currentHp).toBeCloseTo(1.25 + max * 0.3, 10);
    expect(heals(w)).toHaveLength(2);
    expect(levelHeals(w)).toHaveLength(2);
  });
  it('does not revive a dead player via test XP or replay healing after revival', () => {
    const w = isolated();
    w.setPlayerHp(0);
    expect(() => w.grantTestXp(20)).toThrow();
    expect(w.core.getEntity('player').alive).toBe(false);
    expect(levelHeals(w)).toEqual([]);
    w.decide('revive');
    const hp = w.core.getEntity('player').currentHp;
    w.update(1);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    expect(levelHeals(w)).toEqual([]);
  });
});

describe('Task 07.1 standard enemy balance', () => {
  it.each([
    ['melee', 80, 1.17],
    ['ranged', 65.6, 2.21],
  ] as const)('%s has reduced speed and increased attack interval', (kind, speed, interval) => {
    expect(ALPHA_ENEMIES[kind].movementSpeed).toBeCloseTo(speed, 10);
    expect(ALPHA_ENEMIES[kind].attackInterval).toBeCloseTo(interval, 10);
    expect(ALPHA_ENEMIES[kind].attackCoefficient).toBe(1);
    expect(ALPHA.baseMovementSpeed).toBe(185);
    const w = isolated();
    const id = w.spawnEnemy(kind, 1000, 0);
    const before = w.enemies.getEnemy(id).position.x;
    w.update(0.5);
    expect(before - w.enemies.getEnemy(id).position.x).toBeCloseTo(speed * 0.5, 8);
  });
  it.each(['melee', 'ranged'] as const)('%s keeps Slow and Stun behavior', (kind) => {
    const w = isolated();
    const id = w.spawnEnemy(kind, 1000, 0);
    w.skills.slow(id, 0.5, 10);
    const before = w.enemies.getEnemy(id).position.x;
    w.update(0.5);
    const after = w.enemies.getEnemy(id).position.x;
    expect(before - after).toBeCloseTo(ALPHA_ENEMIES[kind].movementSpeed * 0.25, 8);
    w.skills.stun(id, 0.5);
    w.update(0.25);
    expect(w.enemies.getEnemy(id).position.x).toBe(after);
  });
  it.each(['melee', 'ranged'] as const)(
    '%s repeats attacks on the configured cooldown under any frame partition',
    (kind) => {
      const run = (partition: boolean) => {
        const w = isolated();
        w.setTestProtection(true);
        const id = w.spawnEnemy(kind, kind === 'melee' ? 0 : 250, 0, {
          ...ALPHA_ENEMIES[kind],
          movementSpeed: 0,
        });
        w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
        const duration = ALPHA_ENEMIES[kind].attackInterval * 3;
        if (partition) for (let i = 0; i < 100; i++) w.update(duration / 100);
        else w.update(duration);
        return w
          .getEvents()
          .filter(
            (e) =>
              e.event.type === (kind === 'melee' ? 'contact-attempt' : 'enemy-projectile-launched'),
          )
          .map((e) => e.time);
      };
      const times = run(false);
      expect(times).toHaveLength(4);
      times.forEach((t, i) => expect(t).toBeCloseTo(i * ALPHA_ENEMIES[kind].attackInterval, 9));
      const partitioned = run(true);
      expect(partitioned).toHaveLength(times.length);
      partitioned.forEach((t, i) => expect(t).toBeCloseTo(times[i], 9));
    },
  );
  it('removes only the Warrior starting Bleed and preserves its weapon tuning', () => {
    expect(defaultOnHit('warrior')).toEqual([]);
    expect(defaultOnHit('rogue')[0].effectType).toBe('bleed');
    expect(defaultOnHit('mage')[0].effectType).toBe('burn');
    expect(defaultOnHit('archer')[0].effectType).toBe('poison');
    expect(ALPHA_WEAPONS.warrior).toMatchObject({
      damageCoefficient: 1.3,
      baseAttackInterval: 0.8,
      attackRange: 115,
      arcDegrees: 130,
    });
  });
  it('uses 18% ranged by default, including two in the initial twelve enemies', () => {
    const w = new GameplayWorld({ characterClass: 'warrior' });
    const state = w.getSnapshot();
    expect(state.spawning.settings.rangedShare).toBe(0.18);
    expect(state.enemies).toHaveLength(12);
    expect(state.enemies.filter((e) => e.config.behavior === 'ranged')).toHaveLength(2);
  });
  it.each([0, 0.18, 0.5, 1])('spawns a configurable deterministic ranged share of %s', (share) => {
    const w = new GameplayWorld({
      characterClass: 'warrior',
      initialEnemies: false,
      spawning: {
        rangedShare: share,
        interval: 1,
        minimumInterval: 1,
        count: 10,
        maximumCount: 10,
      },
    });
    w.setTestProtection(true);
    let ranged = 0;
    for (let wave = 0; wave < 10; wave++) {
      w.update(1);
      const enemies = w.getSnapshot().enemies;
      expect(enemies).toHaveLength(10);
      ranged += enemies.filter((e) => e.config.behavior === 'ranged').length;
      w.clearEnemies();
    }
    expect(ranged).toBe(Math.floor(100 * share));
    expect(w.getSnapshot().spawning.waves).toBe(10);
  });
  it.each([-0.01, 1.01, NaN, Infinity])('rejects invalid ranged share %s', (rangedShare) => {
    expect(() => spawningSettings({ rangedShare })).toThrow();
  });
});
