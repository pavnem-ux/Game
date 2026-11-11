import type { CharacterClass } from '../character-stats';
import type { Point } from '../weapon-attacks';

export type SkillKind = 'auto' | 'passive';
export type SkillOwner = CharacterClass | 'universal';
/** Generic combat metadata. Synergies read tags, never skill IDs. */
export type CombatTag =
  | 'basic'
  | 'skill'
  | 'physical'
  | 'magical'
  | 'fire'
  | 'ice'
  | 'poison'
  | 'melee'
  | 'heavy_melee'
  | 'dagger'
  | 'projectile'
  | 'area'
  | 'zone'
  | 'mark'
  | 'buff'
  | 'trap'
  | 'synergy'
  | 'secondary'
  /** Task 09: hits created by talents (secondary; never procs synergies/passives). */
  | 'talent'
  /** Task 09.1 G6: the Warrior's off-hand sword (a talent secondary weapon). */
  | 'offhand'
  /** Task 09.1 G8: the Archer's ballista projectiles (a talent weapon). */
  | 'ballista';
export type TargetingRule =
  | 'nearest'
  | 'cluster'
  | 'self'
  | 'lowest-hp'
  | 'random-nearby'
  | 'weapon'
  | 'none';
/** Every rank holds the full set of numeric parameters (totals, not increments). */
export type SkillParams = Readonly<Record<string, number>>;
export type RankTuple<T> = readonly [T, T, T, T, T];

export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly owner: SkillOwner;
  readonly kind: SkillKind;
  readonly maxRank: 5;
  readonly icon: string;
  readonly description: string;
  readonly tags: readonly CombatTag[];
  readonly targeting: TargetingRule;
  /** Provisional tuning. Index 0 = rank I. */
  readonly ranks: RankTuple<SkillParams>;
  /** Localized summary of the change gained at each rank (I = base effect). */
  readonly rankSummaries: RankTuple<string>;
}

export type BonusRewardId = 'recovery' | 'barrier' | 'gold';
export interface SkillCard {
  readonly kind: 'skill';
  readonly skillId: string;
  readonly name: string;
  readonly icon: string;
  readonly skillKind: SkillKind;
  readonly isNew: boolean;
  readonly currentRank: number;
  readonly nextRank: number;
  readonly summary: string;
}
export interface BonusCard {
  readonly kind: 'bonus';
  readonly bonusId: BonusRewardId;
  readonly name: string;
  readonly icon: string;
  readonly summary: string;
}
export type OfferCard = SkillCard | BonusCard;
export interface LevelUpOffer {
  readonly id: number;
  readonly mode: 'skills' | 'bonus';
  readonly cards: readonly OfferCard[];
  readonly rerollAvailable: boolean;
}
export interface OwnedSkill {
  readonly skillId: string;
  readonly name: string;
  readonly icon: string;
  readonly kind: SkillKind;
  readonly rank: number;
}
export interface SlotUsage {
  readonly used: number;
  readonly max: number;
}
export interface RunSkillsSnapshot {
  readonly owned: readonly OwnedSkill[];
  readonly slots: Readonly<{ auto: SlotUsage; passive: SlotUsage }>;
  readonly rerolls: number;
  /** Task 14: banishes left this run, skills banished (never offered again), offers skipped. */
  readonly banishes: number;
  readonly banished: readonly string[];
  readonly skips: number;
  /** Task 14: per offered card key, why it cannot be banished (null = it can). */
  readonly banishBlocked: Readonly<Record<string, string | null>>;
  readonly pendingChoices: number;
  readonly offer: LevelUpOffer | null;
  readonly gold: number;
  readonly bonusesClaimed: Readonly<Record<BonusRewardId, number>>;
  /**
   * Task 09.1 C1 (Mage superpower): the active skill in the extra 5th slot (null while it is
   * empty), and the one-time choice among the five actives offered when the 5th is acquired.
   */
  readonly enhancedSkillId?: string | null;
  readonly enhancedChoice?: readonly string[] | null;
}
export interface EnhancedSkillEvent {
  readonly type: 'enhanced-skill';
  readonly skillId: string;
  /** `default` = assigned on acquiring the 5th active; `chosen` = the player's one-time choice. */
  readonly reason: 'default' | 'chosen';
}
export type ChoiceResult =
  | { readonly type: 'skill'; readonly skillId: string; readonly rank: number }
  | { readonly type: 'bonus'; readonly bonusId: BonusRewardId };

export interface SkillChosenEvent {
  readonly type: 'skill-chosen';
  readonly skillId: string;
  readonly rank: number;
}
export interface BonusClaimedEvent {
  readonly type: 'bonus-claimed';
  readonly bonusId: BonusRewardId;
  readonly amount: number;
}
export interface OfferEvent {
  readonly type: 'skill-offer';
  readonly offerId: number;
  readonly mode: 'skills' | 'bonus';
  readonly cardIds: readonly string[];
  readonly reroll: boolean;
}
export interface PoolWarningEvent {
  readonly type: 'skill-pool-warning';
  readonly message: string;
}
export interface SkillActivatedEvent {
  readonly type: 'skill-activated';
  readonly skillId: string;
  readonly rank: number;
  readonly origin: Point;
  readonly targetId?: string;
}
/** Presentation geometry of an instantaneous area hit. */
export interface SkillAreaEvent {
  readonly type: 'skill-area';
  readonly sourceKey: string;
  readonly shape: 'circle' | 'ring' | 'cone';
  readonly center: Point;
  readonly radius: number;
  readonly innerRadius?: number;
  readonly direction?: Point;
  readonly arcDegrees?: number;
  readonly hits: number;
}
export interface SynergyTriggeredEvent {
  readonly type: 'synergy-triggered';
  readonly synergyId: string;
  readonly targetId: string;
  readonly position: Point;
}
/** Task 07.2 v2: acquiring a skill completed the first unlock pair of a synergy (emitted once). */
export interface SynergyUnlockedEvent {
  readonly type: 'synergy-unlocked';
  readonly synergyId: string;
  /** The completed pair (skill IDs, workbook order); the acquired skill is one of them. */
  readonly pair: readonly [string, string];
  readonly skillId: string;
}
export interface ControlEvent {
  readonly type: 'control-applied' | 'control-expired';
  readonly targetId: string;
  readonly control: 'slow' | 'stun';
  readonly until?: number;
}
/** Task 14: a card was banished from the run pool; its slot got `replacement` (null = none). */
export interface SkillBanishedEvent {
  readonly type: 'skill-banished';
  readonly offerId: number;
  readonly skillId: string;
  readonly replacement: string | null;
}
/** Task 14: the offer was skipped (no card taken). The world pays the skip coins. */
export interface OfferSkippedEvent {
  readonly type: 'skill-offer-skipped';
  readonly offerId: number;
}
export type SkillEvent =
  | SkillBanishedEvent
  | OfferSkippedEvent
  | SkillChosenEvent
  | BonusClaimedEvent
  | OfferEvent
  | PoolWarningEvent
  | SkillActivatedEvent
  | SkillAreaEvent
  | SynergyTriggeredEvent
  | SynergyUnlockedEvent
  | EnhancedSkillEvent
  | ControlEvent;

export interface ZoneSnapshot {
  readonly id: string;
  readonly sourceKey: string;
  readonly center: Point;
  readonly radius: number;
  readonly expiresAt: number;
  readonly armedAt?: number;
}
export interface MarkSnapshot {
  readonly targetId: string;
  readonly kind: 'hunter' | 'death';
  readonly expiresAt: number;
}
export interface ControlSnapshot {
  readonly targetId: string;
  readonly slow: number;
  readonly slowUntil: number;
  readonly stunUntil: number;
  readonly stunImmuneUntil: number;
}
export interface BuffSnapshot {
  readonly id: string;
  readonly stacks: number;
  readonly expiresAt: number;
}
export interface SkillCombatSnapshot {
  readonly zones: readonly ZoneSnapshot[];
  readonly marks: readonly MarkSnapshot[];
  readonly controls: readonly ControlSnapshot[];
  readonly buffs: readonly BuffSnapshot[];
  readonly barrier: number;
  readonly barrierExpiresAt: number | null;
  readonly cooldowns: Readonly<Record<string, number>>;
}
