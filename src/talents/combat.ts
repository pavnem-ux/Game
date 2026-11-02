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
  enemyPosition(id: string): Point2 | null;
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
  /** Synergy proc damage multiplier (only where a node names the synergy). */
  synergyFactor?(synergyId: string, params: (id: string) => Params): number;
  onPlayerDodged?(engine: TalentEngine, attackerId: string): void;
}
export interface DotOrigin {
  /** Applied by a dagger (Rogue basic weapon or a `dagger` skill). */
  readonly dagger: boolean;
}

export class TalentCombat {
  constructor(
    private readonly engine: TalentEngine,
    private readonly handlers: TalentClassHandlers,
    readonly characterClass: CharacterClass,
  ) {}
  private readonly params = (id: string) => this.engine.talents.params(id);
  /** Multiplier for one player hit on `targetId` (1 = no talent effect). */
  hitMultiplier(attack: AttackSnapshot, targetId: string, tags?: ReadonlySet<CombatTag>): number {
    if (!tags) return 1;
    const source = this.engine.currentSource();
    if (source?.startsWith('synergy:') && this.handlers.synergyFactor)
      return this.handlers.synergyFactor(source.slice('synergy:'.length), this.params);
    if (tags.has('talent') || tags.has('secondary') || tags.has('synergy')) return 1;
    if (!this.handlers.direct) return 1;
    const bonus = this.handlers.direct({
      targetId,
      target: this.engine.entity(targetId),
      attack,
      tags,
      dagger: tags.has('dagger'),
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
    return this.handlers.dotFactor?.(effectType, origin, this.params) ?? 1;
  }
  onPlayerDodged(attackerId: string): void {
    if (this.engine.talents.inProc) return;
    this.handlers.onPlayerDodged?.(this.engine, attackerId);
  }
}
