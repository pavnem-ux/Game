import type { EffectType, StatusGroupSnapshot, StatusStack } from './types';
export interface StatusGroup {
  id: string;
  targetId: string;
  effectType: EffectType;
  createdAt: number;
  expiresAt: number;
  nextTickAt: number;
  tickIndex: number;
  stacks: StatusStack[];
}
export function snapshot(group: StatusGroup): StatusGroupSnapshot {
  return Object.freeze({
    id: group.id,
    targetId: group.targetId,
    effectType: group.effectType,
    createdAt: group.createdAt,
    expiresAt: group.expiresAt,
    nextTickAt: group.nextTickAt,
    stacks: Object.freeze([...group.stacks]),
  });
}
