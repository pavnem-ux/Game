import type { PeriodicDamageResult, RandomSource } from '../combat-core';
export type EffectType = 'poison' | 'burn' | 'bleed';
export interface EffectDefinition {
  readonly effectType: EffectType;
  readonly rawDamagePerTick: number;
  readonly duration: number;
  readonly probabilityPercent: number;
  readonly originId?: string;
}
export interface EffectApplication extends EffectDefinition {
  readonly targetId: string;
  readonly sourceId: string;
}
export interface StatusStack {
  readonly id: string;
  readonly effectType: EffectType;
  readonly sourceId: string;
  readonly originId?: string;
  readonly rawDamagePerTick: number;
  readonly sequence: number;
}
export interface StatusGroupSnapshot {
  readonly id: string;
  readonly targetId: string;
  readonly effectType: EffectType;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly nextTickAt: number;
  readonly stacks: readonly StatusStack[];
}
export interface StatusAppliedEvent {
  readonly type: 'status-applied';
  readonly time: number;
  readonly group: StatusGroupSnapshot;
  readonly stack: StatusStack;
  readonly replacedStackId?: string;
}
export interface StatusRemovedEvent {
  readonly type: 'status-removed';
  readonly time: number;
  readonly group: StatusGroupSnapshot;
  readonly reason: 'expired' | 'target-dead';
}
export interface StatusTickEvent {
  readonly type: 'status-tick';
  readonly time: number;
  readonly group: StatusGroupSnapshot;
  readonly rawDamage: number;
  readonly outcome: 'resolved' | 'blocked';
  readonly result: PeriodicDamageResult | null;
}
export type StatusEvent = StatusAppliedEvent | StatusRemovedEvent | StatusTickEvent;
export interface ApplicationResult {
  readonly status: 'applied' | 'failed-roll' | 'blocked' | 'inactive';
  readonly stack: StatusStack | null;
  readonly group: StatusGroupSnapshot | null;
  readonly events: readonly StatusEvent[];
}
export interface ApplicationEligibility {
  readonly application: EffectApplication;
  readonly time: number;
}
export interface DamageEligibility {
  readonly group: StatusGroupSnapshot;
  readonly rawDamage: number;
  readonly time: number;
}
export interface StatusEffectsOptions {
  readonly random?: RandomSource;
  readonly canApply?: (context: ApplicationEligibility) => boolean;
  readonly canDamage?: (context: DamageEligibility) => boolean;
}
export interface StatusUpdateOptions {
  readonly paused?: boolean;
}
export type OnHitEffectMapping = Readonly<Record<string, readonly EffectDefinition[]>>;
export interface HitApplicationResult {
  readonly eligible: boolean;
  readonly applications: readonly ApplicationResult[];
  readonly events: readonly StatusEvent[];
}
