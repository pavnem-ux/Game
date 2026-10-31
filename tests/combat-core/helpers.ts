import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { CombatCore } from '../../src/combat-core';
import type { CombatEntityStats } from '../../src/combat-core';

export function addPair(
  core: CombatCore,
  attacker: Partial<CombatEntityStats> = {},
  target: Partial<CombatEntityStats> = {},
) {
  core.addEntity({
    id: 'source',
    affiliation: 'player',
    stats: {
      ...BASE_COMBAT_ATTRIBUTES,
      physicalDamage: 20,
      magicalDamage: 35,
      criticalChance: 0,
      dodgeChance: 0,
      ...attacker,
    },
  });
  core.addEntity({
    id: 'target',
    affiliation: 'enemy',
    stats: { ...BASE_COMBAT_ATTRIBUTES, maxHp: 100, resistance: 0, dodgeChance: 0, ...target },
  });
}
