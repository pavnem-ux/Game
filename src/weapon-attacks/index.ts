export { WeaponAttacks } from './WeaponAttacks';
export { validateWeaponConfig } from './validation';
export { circleIntersectsSector, segmentCircleIntersection, edgeDistance } from './geometry';
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
} from './types';
