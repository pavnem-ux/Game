import { describe, expect, it, vi } from 'vitest';
import { EnemyAI } from '../../src/enemy-ai';
import { WeaponAttacks } from '../../src/weapon-attacks';
import { StatusEffects } from '../../src/status-effects';
import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { CombatCore } from '../../src/combat-core';
import {
  PlayerSurvival,
  createEnemySurvivalPolicies,
  createStatusSurvivalPolicies,
  createSurvivalPausePolicy,
} from '../../src/player-survival';
import { AI_OPTIONS, NORMAL_MELEE, RANGED } from '../enemy-ai/fixtures';
import { addEnemy, contacts, launches, impacts, PLAYER } from '../enemy-ai/helpers';
import { TEST_WEAPONS } from '../weapon-attacks/fixtures';
import { world, die } from './helpers';
function aiFor(w: ReturnType<typeof world>) {
  return new EnemyAI(w.core, {
    ...AI_OPTIONS,
    ...createEnemySurvivalPolicies(w.survival, (events) => w.events.push(...events)),
  });
}
describe('synchronous EnemyAI damage policies and post-hit notifications', () => {
  it('allows only the first successful simultaneous contact hit, while all cooldowns are consumed', () => {
    const w = world();
    const ai = aiFor(w);
    for (const id of ['c', 'a', 'b'])
      addEnemy(w.core, ai, id, { x: 0, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    const attempts = contacts(ai.update(0, PLAYER));
    expect(attempts.map((e) => [e.sourceId, e.blocked])).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
    ]);
    expect(w.core.getEntity('player').currentHp).toBe(80);
    expect(w.events.filter((e) => e.type === 'direct-protection-granted')).toHaveLength(1);
    for (const id of ['a', 'b', 'c']) expect(ai.getEnemy(id).nextAttackAt).toBe(1);
  });
  it('does not protect after Dodge, but activates before the next attacker after actual HP loss', () => {
    const values = [0.99, 0, 0.99, 0.99];
    const w = world({ random: () => values.shift()!, playerStats: { dodgeChance: 60 } });
    const ai = aiFor(w);
    for (const id of ['a', 'b', 'c']) addEnemy(w.core, ai, id, { x: 0, y: 0 });
    const attempts = contacts(ai.update(0, PLAYER));
    expect(attempts[0].result?.status).toBe('dodged');
    expect(attempts[1].result?.appliedDamage).toBe(20);
    expect(attempts[2]).toMatchObject({ blocked: true, attack: null, result: null });
    expect(values).toHaveLength(0);
  });
  it('blocks hostile projectiles during ordinary direct-hit protection and consumes them', () => {
    const w = world();
    const ai = aiFor(w);
    addEnemy(w.core, ai, 'a-contact', { x: 0, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    addEnemy(w.core, ai, 'z-shooter', { x: 30, y: 0 }, { ...RANGED, movementSpeed: 0 });
    const events = ai.update(0.1, PLAYER);
    expect(contacts(events)[0].result?.appliedDamage).toBe(20);
    expect(launches(events)).toHaveLength(1);
    expect(impacts(events)[0]).toMatchObject({ blocked: true, result: null });
    expect(ai.getProjectiles()).toEqual([]);
    expect(w.core.getEntity('player').currentHp).toBe(80);
    expect(w.survival.getState().directInvulnerableUntil).toBe(0.3);
  });
  it('starts protection immediately on a projectile hit before a simultaneous contact attempt', () => {
    const w = world();
    const ai = aiFor(w);
    addEnemy(w.core, ai, 'a-shooter', { x: 15, y: 0 }, { ...RANGED, movementSpeed: 0 });
    addEnemy(w.core, ai, 'z-contact', { x: 0, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    const events = ai.update(0, PLAYER);
    expect(impacts(events)[0].result?.appliedDamage).toBe(30);
    expect(contacts(events)[0].blocked).toBe(true);
    expect(w.core.getEntity('player').currentHp).toBe(70);
  });
  it('gives exact timestamp protection during a large local AI update', () => {
    const w = world({ playerStats: { maxHp: 1000 } });
    const ai = aiFor(w);
    addEnemy(
      w.core,
      ai,
      'a',
      { x: 0, y: 0 },
      { ...NORMAL_MELEE, movementSpeed: 0, attackInterval: 0.1 },
    );
    const attempts = contacts(ai.update(0.6, PLAYER));
    const successful = attempts.filter((e) => e.result?.appliedDamage);
    expect(successful).toHaveLength(3);
    successful.forEach((e, i) => expect(e.time).toBeCloseTo(i * 0.3, 12));
    expect(w.core.getEntity('player').currentHp).toBe(940);
  });
  it('interrupts a local AI batch at death without advancing the intact world through the decision', () => {
    const w = world({ playerStats: { maxHp: 10 } });
    const ai = aiFor(w);
    addEnemy(w.core, ai, 'enemy-dealer', { x: 100, y: 0 }, NORMAL_MELEE);
    const events = ai.update(20, PLAYER, createSurvivalPausePolicy(w.survival));
    expect(contacts(events)).toHaveLength(1);
    expect(ai.time).toBeCloseTo(0.8);
    expect(w.survival.time).toBeCloseTo(0.8);
    const position = ai.getEnemy('enemy-dealer').position;
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    expect(ai.update(50, PLAYER, createSurvivalPausePolicy(w.survival))).toEqual([]);
    expect(ai.getEnemy('enemy-dealer').position).toEqual(position);
    expect(ai.time).toBeCloseTo(0.8);
  });
});
describe('manual revival preserves other systems and existing projectiles', () => {
  it('preserves positions, enemy HP, weapon state and launched projectiles across a paused manual decision', () => {
    const w = world({ playerStats: { maxHp: 1001 } }),
      ai = aiFor(w);
    addEnemy(w.core, ai, 'a-shooter', { x: 150, y: 0 }, { ...RANGED, movementSpeed: 0 });
    addEnemy(
      w.core,
      ai,
      'z-killer',
      { x: 0, y: 0 },
      { ...NORMAL_MELEE, movementSpeed: 0, attackCoefficient: 1000 },
    );
    const weapons = new WeaponAttacks(w.core);
    weapons.setBody('player', PLAYER);
    weapons.setBody('a-shooter', { x: 150, y: 0, radius: 10 });
    weapons.equipWeapon({
      entityId: 'player',
      characterClass: 'archer',
      weapon: TEST_WEAPONS.bow,
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    });
    weapons.update(0);
    const outgoing = weapons.getProjectiles(),
      weaponState = weapons.getWeaponState('player');
    w.statuses.apply({
      sourceId: 'player',
      targetId: 'enemy',
      effectType: 'poison',
      duration: 10,
      probabilityPercent: 100,
      rawDamagePerTick: 1,
    });
    const otherEffects = w.statuses.getGroups('enemy');
    ai.update(20, PLAYER, createSurvivalPausePolicy(w.survival));
    expect(ai.time).toBe(0);
    const hostile = ai.getProjectiles(),
      positions = ai.getEnemies().map((e) => e.position),
      enemy = w.core.getEntity('a-shooter');
    expect(hostile).toHaveLength(1);
    ai.update(100, PLAYER, createSurvivalPausePolicy(w.survival));
    weapons.update(100, { paused: true });
    w.statuses.update(100, createSurvivalPausePolicy(w.survival));
    w.survival.update(100, { paused: true });
    const revived = w.survival.decide('revive', w.statuses);
    expect(revived.state.time).toBe(0);
    expect(w.core.getEntity('player').currentHp).toBe(500.5);
    expect(ai.getProjectiles()).toEqual(hostile);
    expect(ai.getEnemies().map((e) => e.position)).toEqual(positions);
    expect(w.core.getEntity('a-shooter')).toBe(enemy);
    expect(weapons.getProjectiles()).toEqual(outgoing);
    expect(weapons.getWeaponState('player')).toEqual(weaponState);
    expect(w.statuses.getGroups('enemy')).toEqual(otherEffects);
    const resumed = ai.update(0.5, PLAYER, createSurvivalPausePolicy(w.survival));
    expect(impacts(resumed)[0]).toMatchObject({ blocked: true, result: null });
    expect(ai.getProjectiles()).toEqual([]);
    expect(w.core.getEntity('player').currentHp).toBe(500.5);
    expect(ai.getEnemy('a-shooter').state).not.toBe('idle');
  });
  it('accepts the Core revived event in EnemyAI and resumes previously idle movement', () => {
    const w = world(),
      ai = aiFor(w);
    addEnemy(w.core, ai, 'follower', { x: 300, y: 0 });
    die(w);
    ai.update(0, PLAYER, { paused: true });
    expect(ai.getEnemy('follower').state).toBe('idle');
    const revival = w.survival.decide('revive', w.statuses);
    expect(() => ai.consumeCombatEvents(revival.revival!.events)).not.toThrow();
    ai.update(0.1, PLAYER, createSurvivalPausePolicy(w.survival));
    expect(ai.getEnemy('follower').position.x).toBeCloseTo(290);
  });
  it('uses post-hit notification before the next policy check in the standalone projectile component', () => {
    const w = world(),
      ai = aiFor(w);
    for (const id of ['a', 'b'])
      addEnemy(w.core, ai, id, { x: 100, y: 0 }, { ...RANGED, movementSpeed: 0 });
    const hits = impacts(ai.update(0.4, PLAYER));
    expect(hits).toHaveLength(2);
    expect(hits[0].result?.appliedDamage).toBe(30);
    expect(hits[1]).toMatchObject({ blocked: true, result: null });
    expect(w.core.getEntity('player').currentHp).toBe(70);
  });
});
describe('same-frame death handling and narrow pause boundaries', () => {
  it('preserves both player and last enemy deaths from already-created attacks', () => {
    const w = world();
    const outgoing = w.core.createAttack({
        attackerId: 'player',
        damageType: 'physical',
        coefficient: 10000,
      }),
      incoming = w.core.createAttack({
        attackerId: 'enemy',
        damageType: 'physical',
        coefficient: 10000,
      });
    const player = w.core.resolveAttack(incoming, 'player');
    w.survival.recordDirectResult(0, player);
    expect(
      w.survival.canReceiveHostileDirectDamage({ time: 0, sourceId: 'player', targetId: 'enemy' }),
    ).toBe(true);
    const enemy = w.core.resolveAttack(outgoing, 'enemy');
    const both = [...player.events, ...enemy.events];
    expect(both.filter((e) => e.type === 'death')).toHaveLength(2);
    const copy = [...both];
    w.survival.consumeCombatEvents(0, both);
    expect(both).toEqual(copy);
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    expect(w.core.getEntity('enemy').alive).toBe(false);
    expect(() =>
      w.core.createAttack({ attackerId: 'player', damageType: 'physical', coefficient: 1 }),
    ).toThrow(/inactive/);
  });
  it('finishes already-due local periodic deaths at the same timestamp, then stops future time', () => {
    const core = new CombatCore(() => 0.99);
    for (const id of ['a-player', 'z-enemy'])
      core.addEntity({
        id,
        affiliation: id === 'a-player' ? 'player' : 'enemy',
        stats: { ...BASE_COMBAT_ATTRIBUTES, maxHp: 10, dodgeChance: 0, criticalChance: 0 },
      });
    const survival = new PlayerSurvival(core, 'a-player'),
      statuses = new StatusEffects(core, {
        random: () => 0.1,
        ...createStatusSurvivalPolicies(survival),
      });
    for (const [sourceId, targetId] of [
      ['a-player', 'z-enemy'],
      ['z-enemy', 'a-player'],
    ])
      statuses.apply({
        sourceId,
        targetId,
        effectType: 'poison',
        duration: 3,
        probabilityPercent: 100,
        rawDamagePerTick: 20,
      });
    const events = statuses.update(10, createSurvivalPausePolicy(survival));
    const deaths = events
      .filter((e) => e.type === 'status-tick')
      .flatMap((e) => e.result?.events ?? [])
      .filter((e) => e.type === 'death');
    expect(deaths.map((e) => e.entityId)).toEqual(['a-player', 'z-enemy']);
    expect(statuses.time).toBe(1);
    expect(survival.time).toBe(1);
    expect(survival.getState().runState).toBe('awaiting-revival-choice');
  });
  it('exposes pause as a contract rather than taking ownership of independent world clocks', () => {
    const w = world(),
      ai = aiFor(w);
    w.survival.advanceTo(0.2);
    expect(ai.time).toBe(0);
    expect(w.statuses.time).toBe(0);
    w.statuses.advanceTo(0.2);
    die(w, 0.2);
    expect(createSurvivalPausePolicy(w.survival).shouldPause()).toBe(true);
    expect(ai.time).toBe(0);
  });
});

describe('full-protection cooldown behavior', () => {
  it('consumes every contact cooldown during full revival protection without extending it', () => {
    const w = world();
    die(w);
    w.survival.decide('revive', w.statuses);
    const ai = aiFor(w);
    addEnemy(w.core, ai, 'guard', { x: 0, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    const attempts = contacts(ai.update(1, PLAYER, createSurvivalPausePolicy(w.survival)));
    expect(attempts.map((e) => [e.time, e.blocked])).toEqual([
      [0, true],
      [1, true],
    ]);
    expect(attempts.every((e) => e.result === null && e.attack === null)).toBe(true);
    expect(ai.getEnemy('guard').nextAttackAt).toBe(2);
    expect(w.core.getEntity('player').currentHp).toBe(50);
    expect(w.survival.getState().fullInvulnerableUntil).toBe(3);
  });
  it('rejects invalid post-result observers and interruption predicates before world changes', () => {
    const w = world();
    expect(
      () =>
        new EnemyAI(w.core, {
          ...AI_OPTIONS,
          onDirectDamageResolved: 1,
        } as unknown as ConstructorParameters<typeof EnemyAI>[1]),
    ).toThrow(/observer/);
    expect(
      () =>
        new StatusEffects(w.core, {
          onPeriodicDamageResolved: 1,
        } as unknown as ConstructorParameters<typeof StatusEffects>[1]),
    ).toThrow(/function/);
    const ai = aiFor(w);
    expect(() =>
      ai.update(1, PLAYER, { shouldPause: 1 } as unknown as { shouldPause: () => boolean }),
    ).toThrow(/function/);
    expect(() =>
      w.statuses.update(1, { shouldPause: () => undefined as unknown as boolean }),
    ).toThrow(/boolean/);
    expect(ai.time).toBe(0);
    expect(w.statuses.time).toBe(0);
  });
});
