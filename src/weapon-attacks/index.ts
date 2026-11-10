export { WeaponAttacks } from './WeaponAttacks';
export { validateWeaponConfig } from './validation';
export {
  circleIntersectsSector,
  segmentCircleIntersection,
  edgeDistance,
  aimDirection,
} from './geometry';
export type {
  Point,
  CombatBody,
  SwordWeapon,
  DaggerWeapon,
  ProjectileWeapon,
  ProjectileConfig,
  WeaponConfig,
  EquipWeaponInput,
  AttackStartedEvent,
  WeaponImpactEvent,
  ProjectileExpiredEvent,
  StrikeSkippedEvent,
  WeaponEvent,
  ProjectileSnapshot,
  WeaponState,
  UpdateOptions,
  DamageModifierContext,
  WeaponAttacksOptions,
  ProjectileLaunchInput,
} from './types';
