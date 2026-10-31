import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { CombatCore } from '../../src/combat-core';
import type { CombatEntityStats, PeriodicDamageRequest } from '../../src/combat-core';
import { StatusEffects } from '../../src/status-effects';
import type {
  EffectApplication,
  StatusEffectsOptions,
  StatusEvent,
  StatusTickEvent,
} from '../../src/status-effects';
export function setup(options: StatusEffectsOptions = {}, target: Partial<CombatEntityStats> = {}) {
  const core = new CombatCore(() => 0.99);
  for (const id of ['source', 'other', 'target', 'target-b'])
    core.addEntity({
      id,
      affiliation: id.startsWith('target') ? 'enemy' : 'player',
      stats: {
        ...BASE_COMBAT_ATTRIBUTES,
        maxHp: 1000,
        physicalDamage: 20,
        magicalDamage: 40,
        criticalChance: 0,
        dodgeChance: 0,
        ...(id === 'target' ? target : {}),
      },
    });
  return { core, statuses: new StatusEffects(core, { random: () => 0.1, ...options }) };
}
export function application(patch: Partial<EffectApplication> = {}): EffectApplication {
  return {
    sourceId: 'source',
    targetId: 'target',
    effectType: 'poison',
    rawDamagePerTick: 10,
    duration: 4,
    probabilityPercent: 100,
    ...patch,
  };
}
export function periodic(
  targetId = 'target',
  rawDamage = 10,
  sourceId = 'source',
): PeriodicDamageRequest {
  return {
    operationId: 'test-periodic',
    targetId,
    effectId: 'test-effect',
    rawDamage,
    sources: [{ applicationId: 'test-stack', sourceId, rawDamage }],
  };
}
export function kill(core: CombatCore, targetId: string, sourceId = 'other') {
  return core.applyPeriodicDamage(periodic(targetId, 1e6, sourceId));
}
export const ticks = (events: readonly StatusEvent[]) =>
  events.filter((e): e is StatusTickEvent => e.type === 'status-tick');
