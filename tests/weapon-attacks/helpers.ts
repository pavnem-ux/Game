import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { CombatCore } from '../../src/combat-core';
import type { CombatEntityStats, EntityAffiliation, RandomSource } from '../../src/combat-core';
import { WeaponAttacks } from '../../src/weapon-attacks';
import type {
  CombatBody,
  WeaponConfig,
  WeaponEvent,
  AttackStartedEvent,
  WeaponImpactEvent,
} from '../../src/weapon-attacks';
import { TEST_WEAPONS } from './fixtures';
export function setup(
  weapon: WeaponConfig = TEST_WEAPONS.sword,
  random: RandomSource = () => 0.99,
  attackSpeedPercent = 100,
) {
  const core = new CombatCore(random),
    system = new WeaponAttacks(core);
  addEntity(core, system, 'hero', { x: 0, y: 0, radius: 10 }, 'player');
  system.equipWeapon({
    entityId: 'hero',
    characterClass: weapon.allowedClass,
    weapon,
    attackSpeedPercent,
    fallbackDirection: { x: 1, y: 0 },
  });
  return { core, system };
}
export function addEntity(
  core: CombatCore,
  system: WeaponAttacks,
  id: string,
  body: CombatBody,
  affiliation: EntityAffiliation = 'enemy',
  stats: Partial<CombatEntityStats> = {},
) {
  core.addEntity({
    id,
    affiliation,
    stats: {
      ...BASE_COMBAT_ATTRIBUTES,
      maxHp: 100000,
      physicalDamage: 20,
      magicalDamage: 40,
      criticalChance: 0,
      dodgeChance: 0,
      ...stats,
    },
  });
  system.setBody(id, body);
}
export const starts = (events: readonly WeaponEvent[]) =>
  events.filter((e): e is AttackStartedEvent => e.type === 'attack-started');
export const impacts = (events: readonly WeaponEvent[]) =>
  events.filter((e): e is WeaponImpactEvent => e.type === 'impact');
export function kill(core: CombatCore, id: string) {
  const attack = core.createAttack({
    attackerId: 'hero',
    damageType: 'physical',
    coefficient: 1e6,
  });
  core.resolveAttack(attack, id);
}
