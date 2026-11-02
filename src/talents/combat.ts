import type { CharacterClass } from '../character-stats';
import type { AttackSnapshot, DamageType } from '../combat-core';
import type { EffectType } from '../status-effects';
import type { CombatTag } from '../skills/types';
import type { DotReader } from './conditions';
import type { TalentRuntime } from './runtime';

/**
 * Task 09.1 talent combat dispatcher. The Skill Engine calls these hooks at the existing
 * combat points; per-class handlers read their catalog numbers through `params(nodeId)`.
 *
 * Shared rules (09.1):
 * - direct-damage bonuses apply only to the player's direct hits — never to DoT, talent hits,
 *   synergy procs or other secondary hits, unless a node says so (handled explicitly);
 * - talent % bonuses of one hit are summed, then applied once as ×(1 + Σ/100);
 * - crit-damage bonuses apply to critical hits only, exactly, using the snapshot's own crit
 *   multiplier (`rawDamage / baseDamage`).
 */
export interface Point2 {
  readonly x: number;
  readonly y: number;
}
export interface TalentEngine {
  readonly talents: TalentRuntime;
  readonly statuses: DotReader;
  readonly time: number;
  entity(id: string): {
    readonly currentHp: number;
    readonly maxHp: number;
    readonly alive: boolean;
  };
  talentStrike(
    nodeId: string,
    targetId: string,
    coefficient: number,
    damageType: DamageType,
    extraTags?: readonly CombatTag[],
    options?: { noCritical?: boolean },
  ): unknown;
  enemiesInCircle(center: Point2, radius: number): string[];
  applyStatus(
    targetId: string,
    definition: Readonly<{
      effectType: EffectType;
      rawDamagePerTick: number;
      duration: number;
      probabilityPercent: number;
    }>,
    stacks?: number,
    originId?: string,
  ): number;
  enemyPosition(id: string): Point2 | null;
  /** Control state of an enemy right now (Slow/Stun as the Skill Engine tracks them). */
  controlState(id: string): { readonly slowed: boolean; readonly stunned: boolean };
  readonly playerId: string;
  /** Task 09.1 C1: the Mage's enhanced (5th-slot) skill, null while that slot is empty. */
  enhancedSkillId(): string | null;
  /** Nearest living enemy to a point (ties: id ascending), null when there is none. */
  nearestEnemy(from: Point2): string | null;
  /** Heals the player through Combat Core (clamped; never revives). */
  healPlayer(amount: number): void;
  /** Shortens the remaining cooldown of an owned automatic skill (never below «ready now»). */
  reduceSkillCooldown(skillId: string, seconds: number): void;
  /** Grants a barrier through the single shared barrier slot (C2 rules). */
  grantBarrier(amount: number, duration: number): void;
  playerPosition(): Point2;
  facing(): Point2;
  currentSource(): string | null;
}
type Params = Readonly<Record<string, number>> | null;
export interface DirectHitContext {
  readonly targetId: string;
  readonly target: { readonly currentHp: number; readonly maxHp: number };
  readonly attack: AttackSnapshot;
  readonly tags: ReadonlySet<CombatTag>;
  readonly dagger: boolean;
  /** The skill whose code made this hit (null = basic weapon or other) and whether it is enhanced. */
  readonly skillId: string | null;
  readonly enhanced: boolean;
  /** Target slowed / stunned at the moment of the hit. */
  readonly slowed: boolean;
  readonly stunned: boolean;
  /** Targets the same attack hits (melee sector / skill area; 1 for single-target hits). */
  readonly targets: number;
  /** Player HP at the moment of the hit. */
  readonly player: { readonly currentHp: number; readonly maxHp: number };
  readonly statuses: DotReader;
  params(nodeId: string): Params;
}
export interface DirectBonus {
  /** Additive talent damage % for this hit. */
  readonly percent: number;
  /** Additive crit-damage percentage points (critical hits only). */
  readonly critDamage: number;
}
export interface TalentClassHandlers {
  direct?(ctx: DirectHitContext): DirectBonus;
  /** Crit-chance points added when an attack of these tags is created (unconditional only). */
  critChance?(tags: ReadonlySet<CombatTag>, params: (id: string) => Params): number;
  /** Multiplier on a player DoT application's damage per tick. */
  dotFactor?(effectType: EffectType, origin: DotOrigin, params: (id: string) => Params): number;
  /** Multiplier on a player DoT application's group duration. */
  dotDuration?(effectType: EffectType, origin: DotOrigin, params: (id: string) => Params): number;
  /** Synergy proc damage multiplier (only where a node names the synergy). */
  synergyFactor?(synergyId: string, params: (id: string) => Params): number;
  /** Status-spread synergy geometry (radius bonus, neighbour count) where a node names it. */
  synergySpread?(
    synergyId: string,
    base: Readonly<{ radius: number; maxTargets: number }>,
    params: (id: string) => Params,
  ): Readonly<{ radius: number; maxTargets: number }>;
  /** Radius multiplier for the AoE of a skill with these tags (`enhanced` = the C1 skill). */
  skillAreaFactor?(
    tags: ReadonlySet<CombatTag>,
    params: (id: string) => Params,
    enhanced: boolean,
  ): number;
  /** Slow fraction added to a Slow applied by a skill with these tags (before the cap). */
  slowBonus?(tags: ReadonlySet<CombatTag>, params: (id: string) => Params): number;
  /** Extra CDR points at the moment an automatic skill starts its cooldown (before caps). */
  cooldownReductionBonus?(engine: TalentEngine): number;
  /** Extra real automatic skill slots for the run (Mage superpower). */
  extraAutoSlots?(params: (id: string) => Params): number;
  /** Multiplier on the final (already CDR-scaled) cooldown of this automatic skill. */
  cooldownMultiplier?(skillId: string, enhanced: boolean, params: (id: string) => Params): number;
  /** A direct hit of a skill landed as a critical hit. */
  onSkillCrit?(engine: TalentEngine, skillId: string, tags: ReadonlySet<CombatTag>): void;
  /** The player took real direct damage (after mitigation and barrier absorption). */
  onPlayerDirectDamage?(engine: TalentEngine, attackerId: string): void;
  /** A player hit (direct or periodic) killed an enemy. */
  onKill?(engine: TalentEngine, cause: KillCause): void;
  /** Extra damage % points of a stacking skill buff (e.g. Battle Fury), given its stacks. */
  buffStackBonus?(
    buffId: string,
    stacks: number,
    maxStacks: number,
    params: (id: string) => Params,
  ): number;
  /** Seconds added to a Stun applied by a skill with these tags (before the duration limit). */
  stunBonus?(tags: ReadonlySet<CombatTag>, params: (id: string) => Params): number;
  /** Multiplier on enemy direct hits against the player (before resistance and rounding). */
  playerDamageTakenMultiplier?(params: (id: string) => Params): number;
  /** Stat modifiers that hold only while a condition on the player is true (e.g. HP < 30%). */
  conditionalStats?(engine: TalentEngine): Readonly<Record<string, number>>;
  /** The player's HP percentage changed (from → to); `damage` = caused by damage. */
  onPlayerHpChanged?(engine: TalentEngine, from: number, to: number, damage: boolean): void;
  onPlayerDodged?(engine: TalentEngine, attackerId: string): void;
  /** A player basic-weapon hit landed on a living enemy. */
  onBasicHit?(engine: TalentEngine, targetId: string): void;
  /** Multiplier on DoT damage an enemy receives (per tick). */
  dotTakenMultiplier?(engine: TalentEngine, targetId: string): number;
  /** Statuses were applied to these enemies (end of a boundary). */
  onStatusesApplied?(engine: TalentEngine, targetIds: readonly string[]): void;
}
export interface KillCause {
  readonly targetId: string;
  readonly direct: boolean;
  readonly tags: ReadonlySet<CombatTag>;
}
export interface DotOrigin {
  /** Applied by a dagger (Rogue basic weapon or a `dagger` skill). */
  readonly dagger: boolean;
  /** The skill whose code applied it (null = basic weapon, synergy, talent or other). */
  readonly skillId?: string | null;
  /** Applied by the Mage's enhanced skill. */
  readonly enhanced?: boolean;
}
const SECONDARY: readonly CombatTag[] = ['talent', 'secondary', 'synergy'];
const isSecondary = (tags: ReadonlySet<CombatTag>) => SECONDARY.some((t) => tags.has(t));

export class TalentCombat {
  constructor(
    private readonly engine: TalentEngine,
    private readonly handlers: TalentClassHandlers,
    readonly characterClass: CharacterClass,
  ) {}
  private readonly params = (id: string) => this.engine.talents.params(id);
  /** Multiplier for one player hit on `targetId` (1 = no talent effect). */
  hitMultiplier(
    attack: AttackSnapshot,
    targetId: string,
    tags?: ReadonlySet<CombatTag>,
    targets = 1,
  ): number {
    if (!tags) return 1;
    const source = this.engine.currentSource();
    if (source?.startsWith('synergy:') && this.handlers.synergyFactor)
      return this.handlers.synergyFactor(source.slice('synergy:'.length), this.params);
    if (isSecondary(tags)) return 1;
    if (!this.handlers.direct) return 1;
    const bonus = this.handlers.direct({
      targetId,
      target: this.engine.entity(targetId),
      attack,
      tags,
      dagger: tags.has('dagger'),
      skillId: source?.startsWith('skill:') ? source.slice(6) : null,
      enhanced: !!source && source === `skill:${this.engine.enhancedSkillId()}`,
      ...this.engine.controlState(targetId),
      targets,
      player: this.engine.entity(this.engine.playerId),
      statuses: this.engine.statuses,
      params: this.params,
    });
    let m = 1 + bonus.percent / 100;
    if (attack.critical && bonus.critDamage > 0 && attack.baseDamage > 0) {
      const k = attack.rawDamage / attack.baseDamage;
      m *= (k + bonus.critDamage / 100) / k;
    }
    return m;
  }
  critChance(tags: ReadonlySet<CombatTag>): number {
    return this.handlers.critChance?.(tags, this.params) ?? 0;
  }
  dotFactor(effectType: EffectType, origin: DotOrigin): number {
    const enhanced = !!origin.skillId && origin.skillId === this.engine.enhancedSkillId();
    return this.handlers.dotFactor?.(effectType, { ...origin, enhanced }, this.params) ?? 1;
  }
  dotDuration(effectType: EffectType, origin: DotOrigin): number {
    return this.handlers.dotDuration?.(effectType, origin, this.params) ?? 1;
  }
  synergySpread(
    synergyId: string,
    base: Readonly<{ radius: number; maxTargets: number }>,
  ): Readonly<{ radius: number; maxTargets: number }> {
    return this.handlers.synergySpread?.(synergyId, base, this.params) ?? base;
  }
  skillAreaFactor(tags: ReadonlySet<CombatTag>, skillId: string | null = null): number {
    const enhanced = !!skillId && skillId === this.engine.enhancedSkillId();
    return this.handlers.skillAreaFactor?.(tags, this.params, enhanced) ?? 1;
  }
  slowBonus(tags: ReadonlySet<CombatTag>): number {
    return this.handlers.slowBonus?.(tags, this.params) ?? 0;
  }
  extraAutoSlots(): number {
    return this.handlers.extraAutoSlots?.(this.params) ?? 0;
  }
  cooldownMultiplier(skillId: string): number {
    const enhanced = this.engine.enhancedSkillId() === skillId;
    return this.handlers.cooldownMultiplier?.(skillId, enhanced, this.params) ?? 1;
  }
  cooldownReductionBonus(): number {
    return this.handlers.cooldownReductionBonus?.(this.engine) ?? 0;
  }
  onSkillCrit(skillId: string, tags: ReadonlySet<CombatTag>): void {
    if (this.engine.talents.inProc || isSecondary(tags)) return;
    this.handlers.onSkillCrit?.(this.engine, skillId, tags);
  }
  onPlayerDirectDamage(attackerId: string): void {
    if (this.engine.talents.inProc || !this.engine.entity(this.engine.playerId).alive) return;
    this.handlers.onPlayerDirectDamage?.(this.engine, attackerId);
  }
  onKill(cause: KillCause): void {
    if (this.engine.talents.inProc || isSecondary(cause.tags)) return;
    this.handlers.onKill?.(this.engine, cause);
  }
  buffStackBonus(buffId: string, stacks: number, maxStacks: number): number {
    return this.handlers.buffStackBonus?.(buffId, stacks, maxStacks, this.params) ?? 0;
  }
  stunBonus(tags: ReadonlySet<CombatTag>): number {
    return this.handlers.stunBonus?.(tags, this.params) ?? 0;
  }
  playerDamageTakenMultiplier(): number {
    return this.handlers.playerDamageTakenMultiplier?.(this.params) ?? 1;
  }
  conditionalStats(): Readonly<Record<string, number>> | null {
    return this.handlers.conditionalStats?.(this.engine) ?? null;
  }
  onPlayerHpChanged(from: number, to: number, damage: boolean): void {
    if (this.engine.talents.inProc) return;
    this.handlers.onPlayerHpChanged?.(this.engine, from, to, damage);
  }
  onPlayerDodged(attackerId: string): void {
    if (this.engine.talents.inProc) return;
    this.handlers.onPlayerDodged?.(this.engine, attackerId);
  }
  onBasicHit(targetId: string): void {
    if (this.engine.talents.inProc || !this.engine.entity(targetId).alive) return;
    this.handlers.onBasicHit?.(this.engine, targetId);
  }
  dotTakenMultiplier(targetId: string): number {
    return this.handlers.dotTakenMultiplier?.(this.engine, targetId) ?? 1;
  }
  onStatusesApplied(targetIds: readonly string[]): void {
    if (this.engine.talents.inProc || !targetIds.length) return;
    this.handlers.onStatusesApplied?.(this.engine, targetIds);
  }
}
