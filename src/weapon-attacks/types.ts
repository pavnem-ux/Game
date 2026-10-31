import type { CharacterClass } from '../character-stats';
import type { AttackSnapshot, DamageResult } from '../combat-core';
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface CombatBody extends Point {
  readonly radius: number;
}
interface WeaponBase {
  readonly id: string;
  readonly damageCoefficient: number;
  readonly baseAttackInterval: number;
  readonly attackRange: number;
}
export interface SwordWeapon extends WeaponBase {
  readonly category: 'sword';
  readonly allowedClass: 'warrior';
  readonly damageType: 'physical';
  readonly pattern: 'melee_arc';
  readonly arcDegrees: number;
}
export interface DaggerWeapon extends WeaponBase {
  readonly category: 'dual_daggers';
  readonly allowedClass: 'rogue';
  readonly damageType: 'physical';
  readonly pattern: 'dual_melee';
  readonly arcDegrees: number;
  readonly secondStrikeFraction: number;
}
export interface ProjectileConfig {
  readonly speed: number;
  readonly radius: number;
  readonly maxTravelDistance: number;
}
export type ProjectileWeapon = WeaponBase & {
  readonly pattern: 'projectile';
  readonly projectile: ProjectileConfig;
} & (
    | { readonly category: 'staff'; readonly allowedClass: 'mage'; readonly damageType: 'magical' }
    | { readonly category: 'bow'; readonly allowedClass: 'archer'; readonly damageType: 'physical' }
  );
export type WeaponConfig = SwordWeapon | DaggerWeapon | ProjectileWeapon;
export interface EquipWeaponInput {
  readonly entityId: string;
  readonly characterClass: CharacterClass;
  readonly weapon: WeaponConfig;
  readonly attackSpeedPercent: number;
  /** Caller-supplied direction for exactly coincident source/target centers. */
  readonly fallbackDirection: Point;
  /** World-axis offset relative to the source's current position; defaults to zero. */
  readonly launchOffset?: Point;
}
export interface AttackStartedEvent {
  readonly type: 'attack-started';
  readonly time: number;
  readonly weaponId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly strike: 1 | 2;
  readonly attack: AttackSnapshot;
  readonly origin: Point;
  readonly direction: Point;
  readonly projectileId?: string;
}
export interface WeaponImpactEvent {
  readonly type: 'impact';
  readonly time: number;
  readonly weaponId: string;
  readonly attack: AttackSnapshot;
  readonly targetId: string;
  readonly result: DamageResult;
  readonly projectileId?: string;
}
export interface ProjectileExpiredEvent {
  readonly type: 'projectile-expired';
  readonly time: number;
  readonly projectileId: string;
  readonly weaponId: string;
  readonly position: Point;
  readonly distanceTraveled: number;
}
export interface StrikeSkippedEvent {
  readonly type: 'strike-skipped';
  readonly time: number;
  readonly sourceId: string;
  readonly weaponId: string;
  readonly reason: 'no-target' | 'source-dead';
}
export type WeaponEvent =
  | AttackStartedEvent
  | WeaponImpactEvent
  | ProjectileExpiredEvent
  | StrikeSkippedEvent;
export interface ProjectileSnapshot extends Point {
  readonly id: string;
  readonly weaponId: string;
  readonly sourceId: string;
  readonly direction: Point;
  readonly speed: number;
  readonly radius: number;
  readonly maxTravelDistance: number;
  readonly distanceTraveled: number;
  readonly attack: AttackSnapshot;
}
export interface WeaponState {
  readonly entityId: string;
  readonly weapon: WeaponConfig;
  readonly attackSpeedPercent: number;
  readonly nextCycleAt: number;
  readonly secondStrikeAt: number | null;
}
export interface UpdateOptions {
  readonly paused?: boolean;
}
