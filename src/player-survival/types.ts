import type { DeathEvent, RevivalResult } from '../combat-core';
import type { StatusRemovedEvent } from '../status-effects';
export type SurvivalRunState = 'active' | 'awaiting-revival-choice' | 'ended';
export type RevivalDecision = 'revive' | 'finish-run';
export interface PlayerSurvivalState {
  readonly playerId: string;
  readonly runState: SurvivalRunState;
  readonly revivalUsed: boolean;
  readonly time: number;
  readonly directInvulnerableUntil: number | null;
  readonly fullInvulnerableUntil: number | null;
  readonly directProtected: boolean;
  readonly fullyProtected: boolean;
  readonly requiresWorldPause: boolean;
  readonly canPlayerAct: boolean;
  readonly canRevive: boolean;
  readonly availableDecisions: readonly RevivalDecision[];
}
interface LifecycleBase {
  readonly sequence: number;
  readonly time: number;
  readonly playerId: string;
}
export interface DirectProtectionEvent extends LifecycleBase {
  readonly type: 'direct-protection-granted';
  readonly expiresAt: number;
  readonly attackId: string;
}
export interface RevivalChoiceEvent extends LifecycleBase {
  readonly type: 'revival-choice-required';
  readonly death: DeathEvent;
}
export interface PlayerRevivedEvent extends LifecycleBase {
  readonly type: 'player-revived';
  readonly restoredHp: number;
  readonly fullInvulnerableUntil: number;
}
export interface RunEndedEvent extends LifecycleBase {
  readonly type: 'run-ended';
  readonly reason: 'finish-run' | 'revival-already-used';
  readonly death?: DeathEvent;
}
/** Task 14: hit protection granted by a gameplay action (dash i-frames), not by a hit. */
export interface ProtectionGrantedEvent extends LifecycleBase {
  readonly type: 'protection-granted';
  readonly source: 'dash';
  readonly expiresAt: number;
}
export type SurvivalEvent =
  | ProtectionGrantedEvent
  | DirectProtectionEvent
  | RevivalChoiceEvent
  | PlayerRevivedEvent
  | RunEndedEvent;
export interface SurvivalResult {
  readonly state: PlayerSurvivalState;
  readonly events: readonly SurvivalEvent[];
  readonly revival?: RevivalResult;
  readonly removedEffects?: readonly StatusRemovedEvent[];
}
export interface HostileDirectDamageContext {
  readonly time: number;
  readonly sourceId: string;
  readonly targetId: string;
}
export interface TargetSurvivalContext {
  readonly time: number;
  readonly targetId: string;
}
export interface SurvivalUpdateOptions {
  readonly paused?: boolean;
}
export type SurvivalEventObserver = (events: readonly SurvivalEvent[]) => void;
