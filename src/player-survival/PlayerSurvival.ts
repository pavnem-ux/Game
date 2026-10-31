import type { CombatCore, CombatEvent, DamageResult, DeathEvent } from '../combat-core';
import { StatusEffects } from '../status-effects';
import { SURVIVAL_RULES } from './config';
import type {
  HostileDirectDamageContext,
  PlayerSurvivalState,
  RevivalDecision,
  SurvivalEvent,
  SurvivalResult,
  SurvivalRunState,
  SurvivalUpdateOptions,
  TargetSurvivalContext,
} from './types';
import {
  deathKey,
  immutableDeath,
  id,
  nonNegative,
  sameTime,
  validateDirectResult,
  validateEvents,
} from './validation';
export class PlayerSurvival {
  private clock = 0;
  private runState: SurvivalRunState = 'active';
  private used = false;
  private directUntil: number | null = null;
  private fullUntil: number | null = null;
  private sequence = 0;
  private readonly directNotifications = new Set<string>();
  private readonly handledDeaths = new Set<string>();
  constructor(
    private readonly core: CombatCore,
    readonly playerId: string,
  ) {
    const player = core.getEntity(playerId);
    if (player.affiliation !== 'player')
      throw new Error('Survival requires a player-affiliated entity.');
    if (!player.alive) throw new Error('A fresh survival session requires a living player.');
  }
  get time() {
    return this.clock;
  }
  getState(): PlayerSurvivalState {
    const alive = this.core.getEntity(this.playerId).alive,
      active = this.runState === 'active';
    const fullyProtected = active && alive && this.protectedUntil(this.fullUntil);
    const directProtected =
      active && alive && (fullyProtected || this.protectedUntil(this.directUntil));
    const canRevive = this.runState === 'awaiting-revival-choice' && !this.used && !alive;
    return Object.freeze({
      playerId: this.playerId,
      runState: this.runState,
      revivalUsed: this.used,
      time: this.clock,
      directInvulnerableUntil: this.directUntil,
      fullInvulnerableUntil: this.fullUntil,
      directProtected,
      fullyProtected,
      requiresWorldPause: !active || !alive,
      canPlayerAct: active && alive,
      canRevive,
      availableDecisions: Object.freeze(
        this.runState === 'awaiting-revival-choice'
          ? canRevive
            ? ['revive', 'finish-run']
            : ['finish-run']
          : [],
      ) as readonly RevivalDecision[],
    });
  }
  /** Absolute simulated time; inactive/explicitly paused sessions do not consume it. */
  advanceTo(time: number, options: SurvivalUpdateOptions = {}): SurvivalResult {
    nonNegative(time, 'simulation time');
    if (time < this.clock && !sameTime(time, this.clock))
      throw new RangeError('Cannot move survival time backwards.');
    if (
      !options ||
      typeof options !== 'object' ||
      (options.paused !== undefined && typeof options.paused !== 'boolean')
    )
      throw new TypeError('paused must be boolean.');
    if (options.paused || this.getState().requiresWorldPause) return this.result([]);
    if (
      !Number.isFinite(time + SURVIVAL_RULES.revivalProtectionSeconds) ||
      sameTime(time + SURVIVAL_RULES.directProtectionSeconds, time)
    )
      throw new RangeError('Protection timestamps are not representable.');
    if (time > this.clock) {
      this.clock = time;
      this.directNotifications.clear();
    }
    return this.result([]);
  }
  update(deltaSeconds: number, options: SurvivalUpdateOptions = {}): SurvivalResult {
    nonNegative(deltaSeconds, 'deltaSeconds');
    return this.advanceTo(this.clock + deltaSeconds, options);
  }
  canReceiveHostileDirectDamage(context: HostileDirectDamageContext): boolean {
    nonNegative(context?.time, 'event time');
    id(context.sourceId, 'sourceId');
    id(context.targetId, 'targetId');
    this.core.getEntity(context.sourceId);
    this.core.getEntity(context.targetId);
    if (context.targetId !== this.playerId) return true;
    this.assertTime(context.time);
    const state = this.getState();
    return state.canPlayerAct && !state.directProtected;
  }
  canReceivePeriodicDamage(context: TargetSurvivalContext): boolean {
    return this.targetEligibility(context);
  }
  canApplyNegativeEffect(context: TargetSurvivalContext): boolean {
    return this.targetEligibility(context);
  }
  recordDirectResult(time: number, result: DamageResult): SurvivalResult {
    this.assertTime(time);
    validateDirectResult(result, this.core);
    const key = JSON.stringify([result.attackId, result.targetId]);
    if (this.directNotifications.has(key)) return this.result([]);
    if (result.targetId !== this.playerId) return this.consumeCombatEvents(time, result.events);
    const player = this.core.getEntity(this.playerId);
    const playerDeath = result.events.find(
      (event): event is DeathEvent => event.type === 'death' && event.entityId === this.playerId,
    );
    if (playerDeath && player.alive && this.handledDeaths.has(deathKey(playerDeath)))
      return this.result([]);
    if (result.currentHp !== player.currentHp)
      throw new Error('Report direct results immediately, before later HP operations.');
    if (!player.alive && !playerDeath && this.runState === 'active')
      throw new Error('Lethal direct result must include its actual death event.');
    if (
      result.appliedDamage > 0 &&
      player.alive &&
      this.runState === 'active' &&
      this.getState().directProtected
    )
      throw new Error(
        'Direct damage was resolved during protection; check eligibility before Core.',
      );
    this.directNotifications.add(key);
    if (playerDeath) return this.consumeCombatEvents(time, result.events);
    if (
      result.status !== 'hit' ||
      result.appliedDamage <= 0 ||
      !player.alive ||
      this.runState !== 'active'
    )
      return this.result([]);
    this.directUntil = this.clock + SURVIVAL_RULES.directProtectionSeconds;
    return this.result([
      Object.freeze({
        ...this.base(),
        type: 'direct-protection-granted',
        expiresAt: this.directUntil,
        attackId: result.attackId,
      }),
    ]);
  }
  consumeCombatEvents(time: number, events: readonly CombatEvent[]): SurvivalResult {
    this.assertTime(time);
    validateEvents(events, this.core);
    const deaths = events.filter(
      (event): event is DeathEvent => event.type === 'death' && event.entityId === this.playerId,
    );
    // Validate the entire relevant batch before lifecycle mutation. Known stale death replays are harmless.
    const alive = this.core.getEntity(this.playerId).alive;
    for (const death of deaths)
      if (alive && !this.handledDeaths.has(deathKey(death)))
        throw new Error('Player death must be authoritative in Core.');
    if (deaths.length === 0 || alive || this.runState !== 'active') return this.result([]);
    const death = immutableDeath(deaths[0]);
    this.handledDeaths.add(deathKey(death));
    if (this.used) {
      this.runState = 'ended';
      return this.result([
        Object.freeze({ ...this.base(), type: 'run-ended', reason: 'revival-already-used', death }),
      ]);
    }
    this.runState = 'awaiting-revival-choice';
    return this.result([Object.freeze({ ...this.base(), type: 'revival-choice-required', death })]);
  }
  decide(decision: RevivalDecision, statuses?: StatusEffects): SurvivalResult {
    if (decision !== 'revive' && decision !== 'finish-run')
      throw new TypeError('Decision must be revive or finish-run.');
    if (decision === 'finish-run' && this.runState === 'ended') return this.result([]);
    if (this.runState !== 'awaiting-revival-choice')
      throw new Error('A decision requires awaiting-revival-choice.');
    if (decision === 'finish-run') {
      this.runState = 'ended';
      return this.result([
        Object.freeze({ ...this.base(), type: 'run-ended', reason: 'finish-run' }),
      ]);
    }
    if (this.used) throw new Error('The one revival has already been used.');
    const player = this.core.getEntity(this.playerId);
    if (player.alive) throw new Error('Revival requires a dead player.');
    if (!(statuses instanceof StatusEffects) || !statuses.usesCombatCore(this.core))
      throw new Error('Revival requires StatusEffects from the same CombatCore session.');
    statuses.assertTime(this.clock);
    const expiresAt = this.clock + SURVIVAL_RULES.revivalProtectionSeconds;
    if (!Number.isFinite(expiresAt) || sameTime(expiresAt, this.clock))
      throw new RangeError('Revival protection time is not representable.');
    const revival = this.core.reviveEntity(
      this.playerId,
      player.maxHp * SURVIVAL_RULES.revivalHpFraction,
    );
    const removedEffects = statuses.clearNegativeEffects(this.playerId);
    this.used = true;
    this.fullUntil = expiresAt;
    this.directUntil = null;
    this.runState = 'active';
    const event: SurvivalEvent = Object.freeze({
      ...this.base(),
      type: 'player-revived',
      restoredHp: revival.restoredHp,
      fullInvulnerableUntil: expiresAt,
    });
    return Object.freeze({ ...this.result([event]), revival, removedEffects });
  }
  private protectedUntil(until: number | null) {
    return until !== null && this.clock < until && !sameTime(this.clock, until);
  }
  private targetEligibility(context: TargetSurvivalContext) {
    nonNegative(context?.time, 'event time');
    id(context.targetId, 'targetId');
    this.core.getEntity(context.targetId);
    if (context.targetId !== this.playerId) return true;
    this.assertTime(context.time);
    const state = this.getState();
    return state.canPlayerAct && !state.fullyProtected;
  }
  private assertTime(time: number) {
    nonNegative(time, 'event time');
    if (!sameTime(time, this.clock))
      throw new RangeError(
        'Event time must match survival time; advance before resolving gameplay.',
      );
  }
  private base() {
    return { playerId: this.playerId, time: this.clock, sequence: ++this.sequence };
  }
  private result(events: SurvivalEvent[]): SurvivalResult {
    return Object.freeze({ state: this.getState(), events: Object.freeze(events) });
  }
}
