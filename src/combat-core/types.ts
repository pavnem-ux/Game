import type { CombatAttributes } from '../character-stats';

export type EntityAffiliation = 'player' | 'enemy';
export type DamageType = 'physical' | 'magical';
export type RandomSource = () => number;

/** A subset of the authoritative Character Stats contract, percentages still in points. */
export type CombatEntityStats = Pick<
  CombatAttributes,
  | 'maxHp'
  | 'physicalDamage'
  | 'magicalDamage'
  | 'resistance'
  | 'criticalChance'
  | 'criticalDamage'
  | 'dodgeChance'
>;

export interface CombatEntity extends CombatEntityStats {
  readonly id: string;
  readonly affiliation: EntityAffiliation;
  readonly currentHp: number;
  readonly alive: boolean;
}

export interface CombatEntityInput {
  readonly id: string;
  readonly affiliation: EntityAffiliation;
  readonly stats: CombatEntityStats;
  readonly currentHp?: number;
}

export interface AttackRequest {
  readonly attackerId: string;
  readonly damageType: DamageType;
  readonly coefficient: number;
  /** Task 07: additive crit-chance points for this attack only; the global crit cap still applies. */
  readonly criticalChanceBonus?: number;
  /**
   * Task 09.1 (additive): an attack that can never be critical (G4 shadow copy). No crit roll is
   * drawn for it; every other attack keeps exactly one draw.
   */
  readonly noCritical?: boolean;
  /**
   * Task 43 (additive): an attack that is always critical (Legendary «Stride of the Ash Wolf»). It
   * still draws its one crit roll, so the seeded sequence is unchanged; never with `noCritical`.
   */
  readonly forceCritical?: boolean;
}
/** Task 07: per-target resolution options. One attack snapshot keeps exactly one crit roll. */
export interface ResolveAttackOptions {
  /** Target-specific multiplier on the snapshot's raw damage (marks/focus bonuses). Default 1. */
  readonly damageMultiplier?: number;
}

/** Contains values only: no reference to the attacker's mutable lifecycle or stats. */
export interface AttackSnapshot extends AttackRequest {
  readonly id: string;
  readonly baseDamage: number;
  readonly critical: boolean;
  /** Damage after the attack's critical multiplier, before target defenses. */
  readonly rawDamage: number;
}

export interface DamageEvent {
  readonly type: 'damage';
  readonly attackId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly damageType: DamageType;
  readonly critical: boolean;
  readonly damage: number;
  readonly appliedDamage: number;
}

export interface DodgeEvent {
  readonly type: 'dodge';
  readonly attackId: string;
  readonly sourceId: string;
  readonly targetId: string;
}

export interface DeathEvent {
  readonly type: 'death';
  readonly entityId: string;
  readonly sourceId: string;
  readonly attackId: string;
  /** Present only for periodic damage; preserves all contributing sources. */
  readonly periodic?: PeriodicDamageMetadata;
}

export interface PeriodicDamageSource {
  readonly applicationId: string;
  readonly sourceId: string;
  readonly originId?: string;
  readonly rawDamage: number;
}
export interface PeriodicDamageMetadata {
  readonly effectId: string;
  readonly sources: readonly PeriodicDamageSource[];
}
export interface PeriodicDamageRequest extends PeriodicDamageMetadata {
  readonly operationId: string;
  readonly targetId: string;
  readonly rawDamage: number;
}
export interface PeriodicDamageEvent {
  readonly type: 'periodic-damage';
  readonly operationId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly damage: number;
  readonly appliedDamage: number;
  readonly periodic: PeriodicDamageMetadata;
}
export interface PeriodicDamageResult {
  readonly operationId: string;
  readonly targetId: string;
  readonly status: 'hit' | 'inactive';
  readonly damage: number;
  readonly appliedDamage: number;
  /** Task 07: damage absorbed by a temporary barrier; present only when positive. */
  readonly absorbed?: number;
  readonly previousHp: number;
  readonly currentHp: number;
  readonly events: readonly (PeriodicDamageEvent | DeathEvent)[];
}

export interface RevivalEvent {
  readonly type: 'revived';
  readonly entityId: string;
  readonly previousHp: 0;
  readonly currentHp: number;
  readonly maxHp: number;
}
export interface RevivalResult {
  readonly entity: CombatEntity;
  readonly restoredHp: number;
  readonly events: readonly RevivalEvent[];
}

export interface HealingEvent {
  readonly type: 'healing';
  readonly entityId: string;
  readonly amount: number;
}

export interface MaxHpChangedEvent {
  readonly type: 'max-hp-changed';
  readonly entityId: string;
  readonly previousMaxHp: number;
  readonly maxHp: number;
  readonly previousHp: number;
  readonly currentHp: number;
}

export type CombatEvent =
  | DamageEvent
  | DodgeEvent
  | DeathEvent
  | HealingEvent
  | MaxHpChangedEvent
  | PeriodicDamageEvent
  | RevivalEvent;

export interface DamageResult {
  readonly attackId: string;
  readonly targetId: string;
  readonly status: 'hit' | 'dodged' | 'inactive';
  /** Rounded, mitigated damage before limiting the HP loss to remaining HP. */
  readonly damage: number;
  readonly appliedDamage: number;
  /** Task 07: damage absorbed by a temporary barrier; present only when positive. */
  readonly absorbed?: number;
  readonly previousHp: number;
  readonly currentHp: number;
  readonly events: readonly CombatEvent[];
}

export interface HealingResult {
  readonly entity: CombatEntity;
  readonly healed: number;
  readonly events: readonly HealingEvent[];
}

/** Task 38: HP paid by choice (Cursed Altar) — not damage, never lethal, no events. */
export interface HpPaymentResult {
  readonly entity: CombatEntity;
  readonly paid: number;
}

export interface EntityChangeResult {
  readonly entity: CombatEntity;
  readonly events: readonly MaxHpChangedEvent[];
}
