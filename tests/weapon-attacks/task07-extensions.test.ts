import { describe, expect, it } from 'vitest';
import { CombatCore } from '../../src/combat-core';
import { WeaponAttacks } from '../../src/weapon-attacks';
import { TEST_WEAPONS } from './fixtures';
import { addEntity, impacts, setup } from './helpers';

describe('Task 07 additive Weapon Attacks extensions', () => {
  it('launches ability projectiles through the swept-collision engine with piercing', () => {
    const { core, system } = setup(TEST_WEAPONS.staff);
    system.setAttackSpeed('hero', 1);
    system.update(0, { paused: true });
    for (const [id, x] of [
      ['a', 100],
      ['b', 200],
      ['c', 300],
    ] as const)
      addEntity(core, system, id, { x, y: 0, radius: 10 });
    const attack = core.createAttack({ attackerId: 'hero', damageType: 'magical', coefficient: 1 });
    const id = system.launchProjectile({
      sourceId: 'hero',
      weaponId: 'skill:test',
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 100,
      radius: 2,
      maxTravelDistance: 1000,
      attack,
      pierce: 1,
    });
    const hits = impacts(system.update(5)).filter((e) => e.projectileId === id);
    // Pierce 1 = two distinct targets; each at most once; then the projectile ends.
    expect(hits.map((h) => h.targetId)).toEqual(['a', 'b']);
    expect(system.getProjectiles().some((p) => p.id === id)).toBe(false);
  });
  it('rejects invalid launches and equipped weapon IDs', () => {
    const { core, system } = setup(TEST_WEAPONS.staff);
    const attack = core.createAttack({ attackerId: 'hero', damageType: 'magical', coefficient: 1 });
    const base = {
      sourceId: 'hero',
      weaponId: 'skill:x',
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 100,
      radius: 2,
      maxTravelDistance: 100,
      attack,
    };
    expect(() => system.launchProjectile({ ...base, weaponId: TEST_WEAPONS.staff.id })).toThrow();
    expect(() => system.launchProjectile({ ...base, pierce: -1 })).toThrow();
    expect(() => system.launchProjectile({ ...base, speed: 0 })).toThrow();
    expect(() => system.launchProjectile({ ...base, direction: { x: 0, y: 0 } })).toThrow();
  });
  it('applies a pure target-specific damage modifier to weapon hits', () => {
    const core = new CombatCore(() => 0.99);
    const system = new WeaponAttacks(core, {
      damageModifier: (c) => (c.targetId === 'marked' ? 2 : 1),
    });
    addEntity(core, system, 'hero', { x: 0, y: 0, radius: 10 }, 'player');
    system.equipWeapon({
      entityId: 'hero',
      characterClass: 'warrior',
      weapon: TEST_WEAPONS.sword,
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    });
    addEntity(core, system, 'marked', { x: 40, y: 0, radius: 10 });
    addEntity(core, system, 'plain', { x: 40, y: 5, radius: 10 });
    const [a, b] = impacts(system.update(0));
    expect(a.result.damage).toBe(2 * b.result.damage);
    expect(() => new WeaponAttacks(core, { damageModifier: 1 as never })).toThrow();
  });
});
