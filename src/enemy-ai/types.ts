import type { AttackSnapshot, DamageResult, DamageType } from '../combat-core';
import type { CombatBody, Point, ProjectileConfig } from '../weapon-attacks';
export type EnemyBehaviorState = 'idle' | 'chase' | 'approach' | 'attack' | 'retreat' | 'dead';
interface EnemyConfigBase {
  readonly movementSpeed: number;
  readonly radius: number;
  readonly attackInterval: number;
  readonly attackCoefficient: number;
  readonly damageType: DamageType;
}
export interface MeleeEnemyConfig extends EnemyConfigBase {
  readonly behavior: 'melee';
}
export interface RangedEnemyConfig extends EnemyConfigBase {
  readonly behavior: 'ranged';
  readonly attackRange: number;
  readonly retreatDistance: number;
  readonly hysteresis: number;
  readonly projectile: ProjectileConfig;
}
/**
 * Task 12 (additive): keeps range like the ranged enemy, then marks the player's current position
 * with a telegraph circle; after `telegraph.delay` the circle deals the enemy's damage to the
 * player if the player's body overlaps it. The mark never follows the player.
 */
export interface ArtilleryEnemyConfig extends EnemyConfigBase {
  readonly behavior: 'artillery';
  readonly attackRange: number;
  readonly retreatDistance: number;
  readonly hysteresis: number;
  readonly telegraph: Readonly<{ radius: number; delay: number }>;
}
export type EnemyConfig = MeleeEnemyConfig | RangedEnemyConfig | ArtilleryEnemyConfig;
export interface EnemyRegistration {
  readonly entityId: string;
  readonly position: Point;
  readonly config: EnemyConfig;
}
export interface SeparationConfig {
  readonly cellSize: number;
  readonly padding: number;
  readonly strength: number;
}
export interface EnemyDamageContext {
  readonly time: number;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: 'contact' | 'projectile' | 'artillery';
  readonly attack: AttackSnapshot | null;
}
export type DirectDamagePolicy = (context: EnemyDamageContext) => boolean;
export type DirectDamageObserver = (context: EnemyDamageContext, result: DamageResult) => void;
export interface EnemyAIOptions {
  readonly playerId: string;
  readonly movementStep: number;
  readonly separation: SeparationConfig;
  readonly canResolveDirectDamage?: DirectDamagePolicy;
  readonly onDirectDamageResolved?: DirectDamageObserver;
  /**
   * Task 09.1 (additive): multiplier on enemy direct hits (contact and projectiles) against the
   * player, applied by Combat Core before resistance and its single rounding. Pure, ≥ 0; default 1.
   */
  readonly playerDamageMultiplier?: (attack: AttackSnapshot) => number;
}
export interface EnemySnapshot {
  readonly entityId: string;
  readonly config: EnemyConfig;
  readonly position: Point;
  readonly velocity: Point;
  readonly state: EnemyBehaviorState;
  readonly alive: boolean;
  readonly nextAttackAt: number;
  /** Task 07: present only while crowd-controlled. */
  readonly control?: EnemyControl;
  /** Task 08: present only while a boss speed boost (> 1) is active. */
  readonly speedBoost?: number;
}
/** Task 07 crowd-control state supplied by the owner of Slow/Stun timers. */
export interface EnemyControl {
  /** Movement multiplier in (0, 1]; 1 means not slowed. */
  readonly movementMultiplier: number;
  /** Stunned enemies neither move nor start attacks; launched projectiles continue. */
  readonly stunned: boolean;
}
export interface EnemyStateEvent {
  readonly type: 'enemy-state-changed';
  readonly time: number;
  readonly entityId: string;
  readonly previous: EnemyBehaviorState;
  readonly state: EnemyBehaviorState;
}
export interface ContactAttackEvent {
  readonly type: 'contact-attempt';
  readonly time: number;
  readonly sourceId: string;
  readonly targetId: string;
  readonly blocked: boolean;
  readonly attack: AttackSnapshot | null;
  readonly result: DamageResult | null;
}
export interface EnemyProjectileSnapshot extends Point {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly attack: AttackSnapshot;
  readonly origin: Point;
  readonly direction: Point;
  readonly speed: number;
  readonly radius: number;
  readonly maxTravelDistance: number;
  readonly distanceTraveled: number;
}
export interface EnemyProjectileLaunchEvent {
  readonly type: 'enemy-projectile-launched';
  readonly time: number;
  readonly projectile: EnemyProjectileSnapshot;
}
export interface EnemyProjectileImpactEvent {
  readonly type: 'enemy-projectile-impact';
  readonly time: number;
  readonly projectile: EnemyProjectileSnapshot;
  readonly blocked: boolean;
  readonly result: DamageResult | null;
}
export interface EnemyProjectileExpiredEvent {
  readonly type: 'enemy-projectile-expired';
  readonly time: number;
  readonly projectile: EnemyProjectileSnapshot;
}
export type EnemyProjectileEvent =
  | EnemyProjectileLaunchEvent
  | EnemyProjectileImpactEvent
  | EnemyProjectileExpiredEvent;
/** Task 12: a pending artillery strike (telegraph circle on the ground). */
export interface ArtilleryStrikeSnapshot {
  readonly id: string;
  readonly sourceId: string;
  readonly center: Point;
  readonly radius: number;
  readonly markedAt: number;
  readonly landsAt: number;
}
export interface ArtilleryMarkedEvent {
  readonly type: 'artillery-marked';
  readonly time: number;
  readonly strike: ArtilleryStrikeSnapshot;
}
/**
 * The strike landed: `hit` when the player overlapped the circle and the source was alive;
 * `cancelled` when the source died or was removed first (no damage).
 */
export interface ArtilleryStrikeEvent {
  readonly type: 'artillery-strike';
  readonly time: number;
  readonly strike: ArtilleryStrikeSnapshot;
  readonly hit: boolean;
  readonly cancelled: boolean;
  readonly blocked: boolean;
  readonly attack: AttackSnapshot | null;
  readonly result: DamageResult | null;
}
export type EnemyEvent =
  | EnemyStateEvent
  | ContactAttackEvent
  | EnemyProjectileEvent
  | ArtilleryMarkedEvent
  | ArtilleryStrikeEvent;
export interface EnemyUpdateOptions {
  readonly paused?: boolean;
  readonly shouldPause?: () => boolean;
}
export interface SeparationStats {
  readonly livingEnemies: number;
  readonly cells: number;
  readonly queries: number;
  readonly neighborChecks: number;
}
export interface EnemyProjectileLaunch {
  readonly sourceId: string;
  readonly origin: Point;
  readonly target: CombatBody;
  readonly damageType: DamageType;
  readonly coefficient: number;
  readonly projectile: ProjectileConfig;
  /** Used only if source and player centers coincide. */
  readonly fallbackDirection: Point;
}
export interface EnemyProjectileDue {
  readonly id: string;
  readonly at: number;
  readonly kind: 'impact' | 'expire';
  readonly sequence: number;
}
