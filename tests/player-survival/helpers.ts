import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { CombatCore } from '../../src/combat-core';
import type { CombatEntityStats, DamageResult, RandomSource } from '../../src/combat-core';
import { StatusEffects } from '../../src/status-effects';
import type { StatusEffectsOptions } from '../../src/status-effects';
import { PlayerSurvival, createStatusSurvivalPolicies } from '../../src/player-survival';
import type { SurvivalEvent } from '../../src/player-survival';
export function world(
  options: {
    playerStats?: Partial<CombatEntityStats>;
    random?: RandomSource;
    statusOverride?: StatusEffectsOptions;
  } = {},
) {
  const core = new CombatCore(options.random ?? (() => 0.99));
  core.addEntity({
    id: 'player',
    affiliation: 'player',
    stats: {
      ...BASE_COMBAT_ATTRIBUTES,
      maxHp: 100,
      physicalDamage: 20,
      magicalDamage: 40,
      criticalChance: 0,
      dodgeChance: 0,
      ...options.playerStats,
    },
  });
  for (const id of ['source', 'enemy'])
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
      },
    });
  const survival = new PlayerSurvival(core, 'player');
  const events: SurvivalEvent[] = [];
  const statuses = new StatusEffects(core, {
    random: () => 0.1,
    ...createStatusSurvivalPolicies(survival, (e) => events.push(...e)),
    ...options.statusOverride,
  });
  return { core, survival, statuses, events };
}
export type World = ReturnType<typeof world>;
export function direct(w: World, time = w.survival.time, coefficient = 1, targetId = 'player') {
  w.survival.advanceTo(time);
  const context = { time, sourceId: 'source', targetId };
  if (!w.survival.canReceiveHostileDirectDamage(context)) return null;
  const attack = w.core.createAttack({ attackerId: 'source', damageType: 'physical', coefficient });
  const result = w.core.resolveAttack(attack, targetId);
  return { result, notification: w.survival.recordDirectResult(time, result) };
}
export function die(w: World, time = w.survival.time) {
  const hit = direct(w, time, 1e6);
  if (!hit) throw new Error('Test death was blocked.');
  return hit;
}
export function dot(
  w: World,
  type: 'poison' | 'burn' | 'bleed' = 'poison',
  rawDamagePerTick = 10,
  targetId = 'player',
  duration = 5,
) {
  return w.statuses.apply({
    sourceId: 'source',
    targetId,
    effectType: type,
    rawDamagePerTick,
    duration,
    probabilityPercent: 100,
    originId: 'test-dot',
  });
}
export function notify(w: World, result: DamageResult, time = w.survival.time) {
  return w.survival.recordDirectResult(time, result);
}
