import { sameInstant } from '../simulation-boundary';

/**
 * Task 08 boss ability library (pure, framework-independent). A `BossController` is a boundary
 * module driven by GameplayWorld (peek → resolve at the exact simulation time): abilities telegraph
 * (windup), execute, then go on cooldown; one cast at a time with a global gap. All effects go
 * through a host implemented by the world, so damage stays in Combat Core and the existing
 * survival policies (hit protection, revival invulnerability, test protection) apply.
 */
export type BossAbilityKind = 'radial_burst' | 'circle_aoe' | 'charge' | 'speed_buff' | 'summon';
interface AbilityBase {
  readonly id: string;
  readonly cooldown: number;
  /** Telegraph duration before the effect (0 = instant). Dangerous kinds require ≥ MIN_TELEGRAPH. */
  readonly windup: number;
  /** First possible cast, in seconds after the boss spawns. */
  readonly initialDelay: number;
}
export type BossAbility =
  | (AbilityBase & {
      readonly kind: 'radial_burst';
      readonly projectiles: number;
      readonly coefficient: number;
      readonly speed: number;
    })
  | (AbilityBase & {
      readonly kind: 'circle_aoe';
      readonly radius: number;
      readonly coefficient: number;
    })
  | (AbilityBase & {
      readonly kind: 'charge';
      readonly duration: number;
      readonly speedMultiplier: number;
      readonly impactCoefficient: number;
      /** Extra edge distance within which the charge end hits the player. */
      readonly impactRange: number;
    })
  | (AbilityBase & {
      readonly kind: 'speed_buff';
      readonly duration: number;
      readonly multiplier: number;
    })
  | (AbilityBase & {
      readonly kind: 'summon';
      readonly count: number;
      readonly profile: 'melee' | 'ranged';
    });

/** Minimum telegraph for dangerous attacks (provisional, owner-tunable). */
export const MIN_TELEGRAPH = 0.8;
/** Minimum time between the end of one cast and the start of the next. */
export const GLOBAL_CAST_GAP = 1.2;
const DANGEROUS: ReadonlySet<BossAbilityKind> = new Set(['circle_aoe', 'charge']);

export interface Point2 {
  readonly x: number;
  readonly y: number;
}
export interface BossHost {
  bossPosition(): Point2;
  /** Player centre and radius at the current boundary. */
  playerBody(): Point2 & { readonly radius: number };
  bossRadius(): number;
  /** One hostile direct hit on the player through Core + survival policies; true if it landed. */
  strikePlayer(abilityId: string, coefficient: number): boolean;
  /** Launch `count` projectiles evenly around the boss; returns the number launched. */
  launchRadial(abilityId: string, count: number, coefficient: number, speed: number): number;
  setSpeedBoost(multiplier: number): void;
  /** Summons adds next to the boss within the enemy cap; returns the number spawned. */
  summon(abilityId: string, count: number, profile: 'melee' | 'ranged'): number;
}
export interface BossCastState {
  readonly abilityId: string;
  readonly kind: BossAbilityKind;
  readonly startedAt: number;
  readonly executeAt: number;
  /** Telegraph geometry captured at cast start. */
  readonly center?: Point2;
  readonly radius?: number;
  readonly direction?: Point2;
}
export interface BossAbilityOutcome {
  readonly type: 'boss-cast-started' | 'boss-ability-executed' | 'boss-effect-ended';
  readonly abilityId: string;
  readonly kind: BossAbilityKind;
  readonly telegraph?: BossCastState;
  /** Hits landed / projectiles launched / adds summoned (executed events). */
  readonly count?: number;
}

export function validateBossAbilities(abilities: readonly BossAbility[]): void {
  if (abilities.length < 2) throw new Error('A boss needs at least two abilities.');
  const ids = new Set<string>();
  for (const a of abilities) {
    if (!a.id || ids.has(a.id)) throw new Error('Boss ability ids must be unique.');
    ids.add(a.id);
    for (const [key, value] of Object.entries(a))
      if (typeof value === 'number' && (!Number.isFinite(value) || value < 0))
        throw new RangeError(`Invalid ${a.id}.${key}.`);
    if (a.cooldown <= 0) throw new RangeError(`${a.id} needs a positive cooldown.`);
    if (DANGEROUS.has(a.kind) && a.windup < MIN_TELEGRAPH)
      throw new RangeError(`${a.id} is dangerous and must telegraph ≥ ${MIN_TELEGRAPH} s.`);
    if (a.kind === 'radial_burst' && (!Number.isInteger(a.projectiles) || a.projectiles < 3))
      throw new RangeError(`${a.id} needs ≥ 3 projectiles.`);
    if (a.kind === 'summon' && (!Number.isInteger(a.count) || a.count < 1 || a.count > 6))
      throw new RangeError(`${a.id} summons 1–6 adds.`);
    if (
      (a.kind === 'charge' && a.speedMultiplier < 1) ||
      (a.kind === 'speed_buff' && a.multiplier < 1)
    )
      throw new RangeError(`${a.id} speed multiplier must be ≥ 1.`);
  }
}

const due = (at: number, now: number) => at < now || sameInstant(at, now);

export class BossController {
  private readonly readyAt = new Map<string, number>();
  private cast: BossCastState | null = null;
  private nextCastAt: number;
  /** Active timed movement effects (charge/speed buff): ability id → end time + multiplier. */
  private readonly effects = new Map<string, { until: number; multiplier: number }>();
  private readonly executions = new Map<string, number[]>();
  constructor(
    readonly abilities: readonly BossAbility[],
    readonly spawnedAt: number,
  ) {
    validateBossAbilities(abilities);
    for (const a of abilities) this.readyAt.set(a.id, spawnedAt + a.initialDelay);
    this.nextCastAt = spawnedAt;
  }
  /** Earliest pending boundary (cast execution, effect end, or next possible cast start). */
  peek(): number | null {
    let next = Infinity;
    if (this.cast) next = this.cast.executeAt;
    for (const e of this.effects.values()) next = Math.min(next, e.until);
    if (!this.cast) {
      let ready = Infinity;
      for (const a of this.abilities) ready = Math.min(ready, this.readyAt.get(a.id)!);
      next = Math.min(next, Math.max(ready, this.nextCastAt));
    }
    return Number.isFinite(next) ? next : null;
  }
  /** Resolves everything due at `now` (effect ends → cast execution → at most one cast start). */
  resolve(now: number, host: BossHost): readonly BossAbilityOutcome[] {
    const out: BossAbilityOutcome[] = [];
    for (const [id, effect] of [...this.effects]) {
      if (!due(effect.until, now)) continue;
      this.effects.delete(id);
      const ability = this.ability(id);
      host.setSpeedBoost(this.speedNow());
      let count: number | undefined;
      if (ability.kind === 'charge') {
        // Charge impact at the end of the dash, if the boss reached the player.
        const boss = host.bossPosition(),
          player = host.playerBody();
        const gap =
          Math.hypot(player.x - boss.x, player.y - boss.y) - player.radius - host.bossRadius();
        count =
          gap <= ability.impactRange && host.strikePlayer(id, ability.impactCoefficient) ? 1 : 0;
      }
      out.push(
        Object.freeze({
          type: 'boss-effect-ended',
          abilityId: id,
          kind: ability.kind,
          ...(count !== undefined ? { count } : {}),
        }),
      );
    }
    if (this.cast && due(this.cast.executeAt, now)) {
      const cast = this.cast;
      const ability = this.ability(cast.abilityId);
      this.cast = null;
      const count = this.execute(ability, cast, now, host);
      this.readyAt.set(ability.id, now + ability.cooldown);
      this.nextCastAt = now + GLOBAL_CAST_GAP;
      const log = this.executions.get(ability.id) ?? [];
      log.push(now);
      this.executions.set(ability.id, log);
      out.push(
        Object.freeze({
          type: 'boss-ability-executed',
          abilityId: ability.id,
          kind: ability.kind,
          count,
        }),
      );
    }
    if (!this.cast && due(this.nextCastAt, now)) {
      const ability = this.abilities.find((a) => due(this.readyAt.get(a.id)!, now));
      if (ability) {
        this.cast = this.telegraph(ability, now, host);
        out.push(
          Object.freeze({
            type: 'boss-cast-started',
            abilityId: ability.id,
            kind: ability.kind,
            telegraph: this.cast,
          }),
        );
        // Instant abilities execute at the same boundary.
        if (ability.windup === 0) out.push(...this.resolve(now, host));
      }
    }
    return Object.freeze(out);
  }
  /** Current telegraph (null when idle). */
  currentCast(): BossCastState | null {
    return this.cast;
  }
  activeEffects(): readonly Readonly<{ abilityId: string; until: number; multiplier: number }>[] {
    return Object.freeze(
      [...this.effects].map(([abilityId, e]) => Object.freeze({ abilityId, ...e })),
    );
  }
  /** Execution times per ability (tests/QA). */
  executionLog(abilityId: string): readonly number[] {
    return Object.freeze([...(this.executions.get(abilityId) ?? [])]);
  }
  private ability(id: string): BossAbility {
    return this.abilities.find((a) => a.id === id)!;
  }
  private speedNow(): number {
    let m = 1;
    for (const e of this.effects.values()) m = Math.max(m, e.multiplier);
    return m;
  }
  private telegraph(ability: BossAbility, now: number, host: BossHost): BossCastState {
    const boss = host.bossPosition(),
      player = host.playerBody();
    const base = {
      abilityId: ability.id,
      kind: ability.kind,
      startedAt: now,
      executeAt: now + ability.windup,
    };
    if (ability.kind === 'circle_aoe')
      return Object.freeze({
        ...base,
        center: Object.freeze({ x: player.x, y: player.y }),
        radius: ability.radius,
      });
    if (ability.kind === 'charge') {
      const d = Math.hypot(player.x - boss.x, player.y - boss.y) || 1;
      return Object.freeze({
        ...base,
        center: Object.freeze({ x: boss.x, y: boss.y }),
        direction: Object.freeze({ x: (player.x - boss.x) / d, y: (player.y - boss.y) / d }),
      });
    }
    return Object.freeze({ ...base, center: Object.freeze({ x: boss.x, y: boss.y }) });
  }
  private execute(ability: BossAbility, cast: BossCastState, now: number, host: BossHost): number {
    switch (ability.kind) {
      case 'radial_burst':
        return host.launchRadial(
          ability.id,
          ability.projectiles,
          ability.coefficient,
          ability.speed,
        );
      case 'circle_aoe': {
        const p = host.playerBody();
        const inside =
          Math.hypot(p.x - cast.center!.x, p.y - cast.center!.y) <= ability.radius + p.radius;
        return inside && host.strikePlayer(ability.id, ability.coefficient) ? 1 : 0;
      }
      case 'charge':
      case 'speed_buff': {
        const multiplier = ability.kind === 'charge' ? ability.speedMultiplier : ability.multiplier;
        this.effects.set(ability.id, { until: now + ability.duration, multiplier });
        host.setSpeedBoost(this.speedNow());
        return 0;
      }
      case 'summon':
        return host.summon(ability.id, ability.count, ability.profile);
    }
  }
}
