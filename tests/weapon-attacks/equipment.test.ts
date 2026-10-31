import { describe, expect, it } from 'vitest';
import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { CombatCore } from '../../src/combat-core';
import { WeaponAttacks, validateWeaponConfig } from '../../src/weapon-attacks';
import type { WeaponConfig } from '../../src/weapon-attacks';
import { TEST_WEAPONS } from './fixtures';
import { addEntity, setup, starts } from './helpers';
describe('weapon validation and one equipped instance', () => {
  it.each(Object.values(TEST_WEAPONS))('accepts $category only for $allowedClass', (weapon) => {
    const { system } = setup(weapon);
    expect(system.getWeaponState('hero').weapon.category).toBe(weapon.category);
  });
  it.each(['warrior', 'mage', 'archer'] as const)('rejects daggers for %s', (characterClass) => {
    const core = new CombatCore(),
      system = new WeaponAttacks(core);
    addEntity(core, system, 'hero', { x: 0, y: 0, radius: 1 }, 'player');
    expect(() =>
      system.equipWeapon({
        entityId: 'hero',
        characterClass,
        weapon: TEST_WEAPONS.daggers,
        attackSpeedPercent: 100,
        fallbackDirection: { x: 1, y: 0 },
      }),
    ).toThrow(/incompatible/);
  });
  it('rejects a second primary weapon or shared weapon instance ID', () => {
    const { core, system } = setup();
    expect(() =>
      system.equipWeapon({
        entityId: 'hero',
        characterClass: 'warrior',
        weapon: { ...TEST_WEAPONS.sword, id: 'another' },
        attackSpeedPercent: 100,
        fallbackDirection: { x: 1, y: 0 },
      }),
    ).toThrow(/one primary/);
    addEntity(core, system, 'other', { x: 10, y: 0, radius: 1 });
    expect(() =>
      system.equipWeapon({
        entityId: 'other',
        characterClass: 'warrior',
        weapon: TEST_WEAPONS.sword,
        attackSpeedPercent: 100,
        fallbackDirection: { x: 1, y: 0 },
      }),
    ).toThrow(/ID already/);
  });
  it('accepts independent coefficients, intervals and ranges for the same category', () => {
    const slow = setup({
      ...TEST_WEAPONS.sword,
      id: 'slow',
      damageCoefficient: 2,
      baseAttackInterval: 2,
      attackRange: 100,
    });
    addEntity(slow.core, slow.system, 'target', { x: 95, y: 0, radius: 1 });
    const fast = setup({
      ...TEST_WEAPONS.sword,
      id: 'fast',
      damageCoefficient: 0.5,
      baseAttackInterval: 0.25,
      attackRange: 20,
    });
    addEntity(fast.core, fast.system, 'target', { x: 15, y: 0, radius: 1 });
    expect(starts(slow.system.update(1)).map((e) => e.attack.baseDamage)).toEqual([40]);
    expect(starts(fast.system.update(1)).map((e) => e.attack.baseDamage)).toEqual([
      10, 10, 10, 10, 10,
    ]);
  });
  it('uses Character Stats attack-speed cap without a duplicated numerical rule', () => {
    const { system } = setup(TEST_WEAPONS.sword, () => 0.99, 999);
    expect(system.getWeaponState('hero').attackSpeedPercent).toBe(300);
    system.setAttackSpeed('hero', 500);
    expect(system.getWeaponState('hero').attackSpeedPercent).toBe(300);
  });
  it('has no production fixture defaults or dependence on screen size', () => {
    const { system } = setup(TEST_WEAPONS.staff);
    expect(Object.isFrozen(system.getWeaponState('hero').weapon)).toBe(true);
    expect(
      Object.isFrozen(
        system.getWeaponState('hero').weapon.pattern === 'projectile' &&
          (system.getWeaponState('hero').weapon as typeof TEST_WEAPONS.staff).projectile,
      ),
    ).toBe(true);
  });
  it('retains the existing negative-Resistance rejection and fractional healing behavior', () => {
    const { core } = setup();
    expect(() =>
      core.updateEntityStats('hero', { ...core.getEntity('hero'), resistance: -1 }),
    ).toThrow(/non-negative/);
    core.addEntity({
      id: 'fraction',
      affiliation: 'player',
      stats: BASE_COMBAT_ATTRIBUTES,
      currentHp: 50,
    });
    expect(core.heal('fraction', 0.125).entity.currentHp).toBe(50.125);
  });
  it('supports the caller-provided direction for coincident target centers', () => {
    const { core, system } = setup();
    addEntity(core, system, 'target', { x: 0, y: 0, radius: 1 });
    system.setFallbackDirection('hero', { x: 0, y: 2 });
    expect(starts(system.update(0))[0].direction).toEqual({ x: 0, y: 1 });
  });
});
describe('invalid inputs', () => {
  it.each([
    { damageCoefficient: -1 },
    { damageCoefficient: NaN },
    { baseAttackInterval: 0 },
    { baseAttackInterval: Infinity },
    { attackRange: -1 },
    { arcDegrees: 0 },
    { arcDegrees: 361 },
    { id: '' },
    { category: 'axe' },
    { allowedClass: 'mage' },
    { damageType: 'magical' },
    { pattern: 'projectile' },
  ])('rejects malformed sword config %j', (patch) =>
    expect(() =>
      validateWeaponConfig({ ...TEST_WEAPONS.sword, ...patch } as WeaponConfig),
    ).toThrow(),
  );
  it.each([
    { speed: 0 },
    { speed: NaN },
    { radius: -1 },
    { maxTravelDistance: 0 },
    { maxTravelDistance: Infinity },
  ])('rejects projectile config %j', (patch) =>
    expect(() =>
      validateWeaponConfig({
        ...TEST_WEAPONS.bow,
        projectile: { ...TEST_WEAPONS.bow.projectile, ...patch },
      }),
    ).toThrow(),
  );
  it.each([0, 1, -0.1, NaN])('rejects second-strike fraction %s', (secondStrikeFraction) =>
    expect(() => validateWeaponConfig({ ...TEST_WEAPONS.daggers, secondStrikeFraction })).toThrow(),
  );
  it.each([-1, NaN, Infinity])('rejects delta %s without advancing simulation', (dt) => {
    const { system } = setup();
    expect(() => system.update(dt)).toThrow();
    expect(system.time).toBe(0);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid attack speed %s', (speed) =>
    expect(() => setup(TEST_WEAPONS.sword, () => 0.99, speed)).toThrow(),
  );
  it('validates geometry and requires existing Combat Core entity registration', () => {
    const { system } = setup();
    expect(() => system.setBody('missing', { x: 0, y: 0, radius: 1 })).toThrow(
      /Unknown combat entity/,
    );
    expect(() => system.setBody('hero', { x: NaN, y: 0, radius: 1 })).toThrow();
    expect(() => system.setBody('hero', { x: 0, y: 0, radius: -1 })).toThrow();
    expect(() => system.setFallbackDirection('hero', { x: 0, y: 0 })).toThrow();
  });
  it('rejects weapon registration before source geometry without reserving the weapon ID', () => {
    const core = new CombatCore(),
      system = new WeaponAttacks(core);
    core.addEntity({ id: 'hero', affiliation: 'player', stats: BASE_COMBAT_ATTRIBUTES });
    const input = {
      entityId: 'hero',
      characterClass: 'warrior',
      weapon: TEST_WEAPONS.sword,
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    } as const;
    expect(() => system.equipWeapon(input)).toThrow(/geometry/);
    system.setBody('hero', { x: 0, y: 0, radius: 1 });
    expect(() => system.equipWeapon(input)).not.toThrow();
  });
});
