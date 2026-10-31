import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { CombatCore } from '../../src/combat-core';
import type { CombatEntityStats, RandomSource } from '../../src/combat-core';
import { EnemyAI } from '../../src/enemy-ai';
import type {
  EnemyAIOptions,
  EnemyConfig,
  EnemyEvent,
  ContactAttackEvent,
  EnemyProjectileLaunchEvent,
  EnemyProjectileImpactEvent,
} from '../../src/enemy-ai';
import type { CombatBody, Point } from '../../src/weapon-attacks';
import { AI_OPTIONS, NORMAL_MELEE } from './fixtures';
export const PLAYER: CombatBody = { x: 0, y: 0, radius: 10 };
export function setup(
  options: Partial<EnemyAIOptions> = {},
  random: RandomSource = () => 0.99,
  playerStats: Partial<CombatEntityStats> = {},
) {
  const core = new CombatCore(random);
  core.addEntity({
    id: 'player',
    affiliation: 'player',
    stats: {
      ...BASE_COMBAT_ATTRIBUTES,
      maxHp: 100000,
      physicalDamage: 20,
      magicalDamage: 40,
      criticalChance: 0,
      dodgeChance: 0,
      ...playerStats,
    },
  });
  return { core, ai: new EnemyAI(core, { ...AI_OPTIONS, ...options }) };
}
export function addEnemy(
  core: CombatCore,
  ai: EnemyAI,
  id = 'enemy',
  position: Point = { x: 100, y: 0 },
  config: EnemyConfig = NORMAL_MELEE,
  stats: Partial<CombatEntityStats> = {},
) {
  core.addEntity({
    id,
    affiliation: 'enemy',
    stats: {
      ...BASE_COMBAT_ATTRIBUTES,
      maxHp: 1000,
      physicalDamage: 20,
      magicalDamage: 40,
      criticalChance: 0,
      dodgeChance: 0,
      ...stats,
    },
  });
  return ai.registerEnemy({ entityId: id, position, config });
}
export function kill(core: CombatCore, targetId: string, sourceId = 'player') {
  return core.applyPeriodicDamage({
    operationId: 'test-kill',
    targetId,
    effectId: 'test',
    rawDamage: 1e6,
    sources: [{ sourceId, applicationId: 'test-stack', rawDamage: 1e6 }],
  });
}
export const contacts = (events: readonly EnemyEvent[]) =>
  events.filter((e): e is ContactAttackEvent => e.type === 'contact-attempt');
export const launches = (events: readonly EnemyEvent[]) =>
  events.filter((e): e is EnemyProjectileLaunchEvent => e.type === 'enemy-projectile-launched');
export const impacts = (events: readonly EnemyEvent[]) =>
  events.filter((e): e is EnemyProjectileImpactEvent => e.type === 'enemy-projectile-impact');
