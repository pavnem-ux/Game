export { PlayerSurvival } from './PlayerSurvival';
export { SURVIVAL_RULES } from './config';
export {
  createEnemySurvivalPolicies,
  createStatusSurvivalPolicies,
  createSurvivalPausePolicy,
} from './integration';
export type {
  SurvivalRunState,
  RevivalDecision,
  PlayerSurvivalState,
  DirectProtectionEvent,
  RevivalChoiceEvent,
  PlayerRevivedEvent,
  RunEndedEvent,
  SurvivalEvent,
  SurvivalResult,
  HostileDirectDamageContext,
  TargetSurvivalContext,
  SurvivalUpdateOptions,
  SurvivalEventObserver,
} from './types';
