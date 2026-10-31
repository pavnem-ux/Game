import type { EnemyAIOptions } from '../enemy-ai';
import type { StatusEffectsOptions } from '../status-effects';
import type { PlayerSurvival } from './PlayerSurvival';
import type { SurvivalEventObserver, SurvivalResult } from './types';

function observer(onEvents: SurvivalEventObserver | undefined) {
  if (onEvents !== undefined && typeof onEvents !== 'function')
    throw new TypeError('onEvents must be a function.');
  return (result: SurvivalResult) => {
    if (result.events.length) onEvents?.(result.events);
  };
}
/** Policies/notifications only: these adapters do not advance any world module. */
export function createEnemySurvivalPolicies(
  survival: PlayerSurvival,
  onEvents?: SurvivalEventObserver,
): Pick<EnemyAIOptions, 'canResolveDirectDamage' | 'onDirectDamageResolved'> {
  const emit = observer(onEvents);
  return Object.freeze({
    canResolveDirectDamage: (context) => {
      if (context.targetId === survival.playerId) emit(survival.advanceTo(context.time));
      return survival.canReceiveHostileDirectDamage(context);
    },
    onDirectDamageResolved: (context, result) => {
      if (result.targetId === survival.playerId)
        emit(survival.recordDirectResult(context.time, result));
    },
  });
}
export function createStatusSurvivalPolicies(
  survival: PlayerSurvival,
  onEvents?: SurvivalEventObserver,
): Pick<StatusEffectsOptions, 'canApply' | 'canDamage' | 'onPeriodicDamageResolved'> {
  const emit = observer(onEvents);
  return Object.freeze({
    canApply: (context) => {
      if (context.application.targetId === survival.playerId)
        emit(survival.advanceTo(context.time));
      return survival.canApplyNegativeEffect({
        time: context.time,
        targetId: context.application.targetId,
      });
    },
    canDamage: (context) => {
      if (context.group.targetId === survival.playerId) emit(survival.advanceTo(context.time));
      return survival.canReceivePeriodicDamage({
        time: context.time,
        targetId: context.group.targetId,
      });
    },
    onPeriodicDamageResolved: (context, result) => {
      if (result.targetId === survival.playerId)
        emit(survival.consumeCombatEvents(context.time, result.events));
    },
  });
}
export function createSurvivalPausePolicy(
  survival: PlayerSurvival,
): Readonly<{ shouldPause: () => boolean }> {
  return Object.freeze({ shouldPause: () => survival.getState().requiresWorldPause });
}
