import { validateAdvance } from '../simulation-boundary';
import type { SimulationBoundary } from '../simulation-boundary';
import type { CombatCore, CombatEvent } from '../combat-core';
import { edgeDistance, segmentCircleIntersection } from '../weapon-attacks';
import type { CombatBody } from '../weapon-attacks';
import { EnemyProjectiles } from './EnemyProjectiles';
import { SpatialGrid } from './SpatialGrid';
import {
  circleCrossings,
  desiredState,
  futureCrossings,
  goalVelocity,
  separatedVelocity,
} from './movement';
import type { EnemyActor } from './movement';
import type {
  EnemyAIOptions,
  EnemyEvent,
  EnemyRegistration,
  EnemySnapshot,
  EnemyUpdateOptions,
  SeparationStats,
  EnemyProjectileDue,
  EnemyBehaviorState,
  EnemyControl,
  EnemyProjectileLaunch,
  EnemyProjectileLaunchEvent,
} from './types';
import {
  EPS,
  body,
  compareIds,
  enemyConfig,
  finite,
  nonNegative,
  point,
  policyResult,
  positive,
  sameTime,
  separationConfig,
} from './validation';
type Scheduled =
  | {
      at: number;
      priority: number;
      key: string;
      kind: 'steer' | 'motion' | 'attempt';
      enemy?: EnemyActor;
    }
  | { at: number; priority: number; key: string; kind: 'flight'; flight: EnemyProjectileDue };
const ZERO = Object.freeze({ x: 0, y: 0 });
export class EnemyAI {
  private readonly positionErrors = new Map<string, { x: number; y: number }>();
  private readonly actors = new Map<string, EnemyActor>();
  private readonly grid: SpatialGrid;
  private readonly flights: EnemyProjectiles;
  private readonly options: EnemyAIOptions;
  private player: CombatBody | null = null;
  private clock = 0;
  private steeringIndex = 1;
  private dirty = true;
  private disposed = false;
  private stats: SeparationStats = Object.freeze({
    livingEnemies: 0,
    cells: 0,
    queries: 0,
    neighborChecks: 0,
  });
  constructor(
    private readonly core: CombatCore,
    input: EnemyAIOptions,
  ) {
    if (!input || typeof input !== 'object') throw new TypeError('EnemyAI options are required.');
    if (core.getEntity(input.playerId).affiliation !== 'player')
      throw new Error('EnemyAI target must have player affiliation.');
    positive(input.movementStep, 'movementStep');
    if (sameTime(input.movementStep, 0))
      throw new RangeError('movementStep is below simulation clock precision.');
    if (
      input.canResolveDirectDamage !== undefined &&
      typeof input.canResolveDirectDamage !== 'function'
    )
      throw new TypeError('Damage policy must be a function.');
    if (
      input.onDirectDamageResolved !== undefined &&
      typeof input.onDirectDamageResolved !== 'function'
    )
      throw new TypeError('Direct damage observer must be a function.');
    this.options = Object.freeze({ ...input, separation: separationConfig(input.separation) });
    this.grid = new SpatialGrid(this.options.separation.cellSize);
    this.flights = new EnemyProjectiles(
      core,
      input.playerId,
      input.canResolveDirectDamage,
      input.onDirectDamageResolved,
    );
  }
  get time() {
    return this.clock;
  }
  registerEnemy(input: EnemyRegistration): EnemySnapshot {
    this.active();
    if (!input || typeof input !== 'object')
      throw new TypeError('Enemy registration must be an object.');
    const entity = this.core.getEntity(input.entityId);
    if (entity.affiliation !== 'enemy')
      throw new Error('Only enemy-affiliated entities can register AI.');
    if (this.actors.has(entity.id)) throw new Error('Enemy AI ID already registered.');
    const config = enemyConfig(input.config),
      position = point(input.position, 'enemy position');
    const nextSteeringIndex = Math.max(
      this.steeringIndex,
      Math.floor(this.clock / this.options.movementStep) + 1,
    );
    if (
      !Number.isSafeInteger(nextSteeringIndex) ||
      sameTime(this.clock + config.attackInterval, this.clock)
    )
      throw new RangeError('Enemy timing is not representable at the current clock precision.');
    this.positionErrors.set(entity.id, { x: 0, y: 0 });
    this.actors.set(entity.id, {
      id: entity.id,
      config,
      x: position.x,
      y: position.y,
      vx: 0,
      vy: 0,
      state: entity.alive ? 'idle' : 'dead',
      nextAttackAt: this.clock,
    });
    this.dirty = true;
    this.steeringIndex = nextSteeringIndex;
    return this.getEnemy(entity.id);
  }
  unregisterEnemy(id: string): void {
    this.active();
    if (!this.actors.delete(id)) throw new Error(`Unknown enemy AI: ${id}.`);
    this.positionErrors.delete(id);
    this.dirty = true;
  }
  getEnemy(id: string): EnemySnapshot {
    this.active();
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`Unknown enemy AI: ${id}.`);
    const alive = this.core.getEntity(id).alive;
    const playerAlive = this.core.getEntity(this.options.playerId).alive;
    const controlled = actor.stunned || (actor.speedFactor ?? 1) !== 1;
    return Object.freeze({
      entityId: id,
      config: actor.config,
      position: Object.freeze({ x: actor.x, y: actor.y }),
      velocity: alive && playerAlive ? Object.freeze({ x: actor.vx, y: actor.vy }) : ZERO,
      state: !alive ? 'dead' : playerAlive ? actor.state : 'idle',
      alive,
      nextAttackAt: actor.nextAttackAt,
      ...((actor.speedBoost ?? 1) !== 1 ? { speedBoost: actor.speedBoost } : {}),
      ...(controlled
        ? {
            control: Object.freeze({
              movementMultiplier: actor.speedFactor ?? 1,
              stunned: actor.stunned === true,
            }),
          }
        : {}),
    });
  }
  /**
   * Task 07: apply Slow/Stun at the current boundary. Velocities are recomputed on the next
   * prepareBoundary/steer, so control changes never rewrite already elapsed motion.
   */
  setControl(id: string, control: EnemyControl): void {
    this.active();
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`Unknown enemy AI: ${id}.`);
    if (!control || typeof control !== 'object') throw new TypeError('Invalid enemy control.');
    finite(control.movementMultiplier, 'movementMultiplier');
    if (control.movementMultiplier <= 0 || control.movementMultiplier > 1)
      throw new RangeError('movementMultiplier must be in (0, 1].');
    if (typeof control.stunned !== 'boolean') throw new TypeError('stunned must be boolean.');
    if (actor.speedFactor === control.movementMultiplier && actor.stunned === control.stunned)
      return;
    actor.speedFactor = control.movementMultiplier;
    actor.stunned = control.stunned;
    this.dirty = true;
  }
  /**
   * Task 08 (additive): temporary speed multiplier ≥ 1 for boss charge/speed abilities, set at a
   * boundary. Independent of Slow/Stun (which still apply); 1 removes the boost.
   */
  setSpeedBoost(id: string, multiplier: number): void {
    this.active();
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`Unknown enemy AI: ${id}.`);
    finite(multiplier, 'speed boost');
    if (multiplier < 1 || multiplier > 5) throw new RangeError('Speed boost must be in [1, 5].');
    if ((actor.speedBoost ?? 1) === multiplier) return;
    actor.speedBoost = multiplier;
    this.dirty = true;
  }
  /**
   * Task 08 (additive): launch a hostile projectile from a living enemy at the current boundary
   * (boss radial burst). Flight, collision and survival policies are the existing ones.
   */
  launchProjectile(input: EnemyProjectileLaunch): EnemyProjectileLaunchEvent {
    this.active();
    if (!this.actors.has(input.sourceId)) throw new Error(`Unknown enemy AI: ${input.sourceId}.`);
    return this.flights.launch(this.clock, input);
  }
  getEnemies(): readonly EnemySnapshot[] {
    this.active();
    return Object.freeze([...this.actors.keys()].sort(compareIds).map((id) => this.getEnemy(id)));
  }
  getProjectiles() {
    this.active();
    return this.flights.getProjectiles();
  }
  getSeparationStats(): SeparationStats {
    this.active();
    return this.stats;
  }
  dispose() {
    this.actors.clear();
    this.positionErrors.clear();
    this.flights.clear();
    this.grid.clear();
    this.disposed = true;
  }
  /** Does not replay external event timestamps: call only at the same global simulation instant. */
  consumeCombatEvents(events: readonly CombatEvent[]): readonly EnemyEvent[] {
    this.active();
    if (!Array.isArray(events)) throw new TypeError('Combat events must be an array.');
    for (const e of events) {
      if (
        !e ||
        typeof e !== 'object' ||
        ![
          'damage',
          'dodge',
          'death',
          'healing',
          'max-hp-changed',
          'periodic-damage',
          'revived',
        ].includes(e.type)
      )
        throw new TypeError('Invalid CombatEvent.');
      if (e.type === 'death' && this.core.getEntity(e.entityId).alive)
        throw new Error('Death must be authoritative in Core.');
    }
    const output: EnemyEvent[] = [];
    this.synchronize(output);
    return Object.freeze(output);
  }
  update(
    deltaSeconds: number,
    playerInput: CombatBody,
    options: EnemyUpdateOptions = {},
  ): readonly EnemyEvent[] {
    this.active();
    nonNegative(deltaSeconds, 'deltaSeconds');
    const player = body(playerInput);
    if (
      !options ||
      typeof options !== 'object' ||
      (options.paused !== undefined && typeof options.paused !== 'boolean')
    )
      throw new TypeError('paused must be boolean.');
    if (options.shouldPause !== undefined && typeof options.shouldPause !== 'function')
      throw new TypeError('shouldPause must be a function.');
    const pausedNow = () =>
      options.shouldPause ? policyResult(options.shouldPause(), 'shouldPause') : false;
    const initiallyPaused = options.paused || pausedNow();
    const end = initiallyPaused ? this.clock : this.clock + deltaSeconds;
    finite(end, 'simulation time');
    if (
      !this.player ||
      this.player.x !== player.x ||
      this.player.y !== player.y ||
      this.player.radius !== player.radius
    )
      this.dirty = true;
    this.player = player;
    const output: EnemyEvent[] = [];
    this.synchronize(output);
    if (initiallyPaused) return Object.freeze(output);
    if (this.dirty) this.steer(output);
    let pauseAt: number | null = null;
    for (;;) {
      const limit = pauseAt ?? end;
      const event = this.nextEvent(limit);
      if (!event) {
        this.advance(limit - this.clock);
        this.clock = limit;
        break;
      }
      this.advance(event.at - this.clock);
      this.clock = event.at;
      this.resolveScheduled(event, output);
      if (pauseAt === null && pausedNow()) pauseAt = this.clock;
    }
    return Object.freeze(output);
  }
  /** Sample player geometry, synchronize Core liveness and prepare piecewise-linear velocities. */
  prepareBoundary(playerInput: CombatBody): readonly EnemyEvent[] {
    this.active();
    const player = body(playerInput);
    if (
      !this.player ||
      this.player.x !== player.x ||
      this.player.y !== player.y ||
      this.player.radius !== player.radius
    )
      this.dirty = true;
    this.player = player;
    const output: EnemyEvent[] = [];
    this.synchronize(output);
    if (this.dirty) this.steer(output);
    return Object.freeze(output);
  }
  peekBoundary(end: number): SimulationBoundary | null {
    this.active();
    validateAdvance(this.clock, end, null);
    if (!this.player) throw new Error('Call prepareBoundary before stepping EnemyAI.');
    const event = this.nextEvent(end);
    return event ? Object.freeze({ time: event.at, priority: event.priority }) : null;
  }
  advanceToBoundary(time: number): void {
    validateAdvance(this.clock, time, this.peekBoundary(time)?.time ?? null);
    this.advance(time - this.clock);
    this.clock = time;
  }
  resolveBoundary(): readonly EnemyEvent[] {
    const output: EnemyEvent[] = [];
    const event = this.nextEvent(this.clock);
    if (event) this.resolveScheduled(event, output);
    return Object.freeze(output);
  }
  private resolveScheduled(event: Scheduled, output: EnemyEvent[]) {
    if (event.kind === 'flight') output.push(this.flights.resolve(event.flight, this.clock));
    else if (event.kind === 'attempt') this.attempt(event.enemy!, output);
    else {
      if (event.kind === 'steer') this.steeringIndex++;
      this.dirty = true;
    }
    this.synchronize(output);
    if (this.dirty) this.steer(output);
  }
  private active() {
    if (this.disposed) throw new Error('EnemyAI has been disposed.');
  }
  private ordered() {
    return [...this.actors.values()].sort((a, b) => compareIds(a.id, b.id));
  }
  private state(actor: EnemyActor, state: EnemyBehaviorState, output: EnemyEvent[]) {
    if (actor.state === state) return;
    const previous = actor.state;
    actor.state = state;
    output.push(
      Object.freeze({
        type: 'enemy-state-changed',
        time: this.clock,
        entityId: actor.id,
        previous,
        state,
      }),
    );
  }
  private synchronize(output: EnemyEvent[]) {
    const playerAlive = this.core.getEntity(this.options.playerId).alive;
    for (const actor of this.ordered()) {
      if (!this.core.getEntity(actor.id).alive) {
        if (actor.state !== 'dead') {
          this.state(actor, 'dead', output);
          this.dirty = true;
        }
        actor.vx = actor.vy = 0;
      } else if (playerAlive && (actor.state === 'idle' || actor.state === 'dead')) {
        this.dirty = true;
        this.steeringIndex = Math.max(
          this.steeringIndex,
          Math.floor(this.clock / this.options.movementStep) + 1,
        );
      } else if (!playerAlive) {
        if (actor.state !== 'idle') {
          this.state(actor, 'idle', output);
          this.dirty = true;
        }
        actor.vx = actor.vy = 0;
      }
    }
  }
  private steer(output: EnemyEvent[]) {
    this.grid.clear();
    const living = this.ordered().filter((actor) => this.core.getEntity(actor.id).alive);
    const playerAlive = this.core.getEntity(this.options.playerId).alive;
    if (!playerAlive || !this.player) {
      for (const actor of living) actor.vx = actor.vy = 0;
      this.stats = Object.freeze({
        livingEnemies: living.length,
        cells: 0,
        queries: 0,
        neighborChecks: 0,
      });
      this.dirty = false;
      return;
    }
    let maxRadius = 0;
    for (const actor of living) {
      this.grid.insert(actor.id, actor);
      maxRadius = Math.max(maxRadius, actor.config.radius);
      this.state(actor, desiredState(actor, this.player), output);
    }
    let checks = 0;
    const velocities = new Map<string, { x: number; y: number }>();
    for (const actor of living) {
      const result = separatedVelocity(
        actor,
        goalVelocity(actor, this.player),
        this.actors,
        this.grid,
        maxRadius,
        this.options.separation,
      );
      velocities.set(actor.id, result.velocity);
      checks += result.checks;
    }
    for (const actor of living) {
      const v = velocities.get(actor.id)!;
      actor.vx = v.x;
      actor.vy = v.y;
    }
    this.stats = Object.freeze({
      livingEnemies: living.length,
      cells: this.grid.cellCount,
      queries: this.options.separation.strength === 0 ? 0 : living.length,
      neighborChecks: checks,
    });
    this.dirty = false;
  }
  private nextEvent(end: number): Scheduled | null {
    let next: Scheduled | null = null;
    const consider = (candidate: Scheduled) => {
      finite(candidate.at, 'event time');
      if (candidate.at > end && !sameTime(candidate.at, end)) return;
      const event = { ...candidate, at: Math.max(this.clock, Math.min(end, candidate.at)) };
      if (
        !next ||
        event.at < next.at ||
        (event.at === next.at &&
          (event.priority < next.priority ||
            (event.priority === next.priority && compareIds(event.key, next.key) < 0)))
      )
        next = event;
    };
    const flight = this.flights.nextEvent(this.clock, this.player!);
    if (flight)
      consider({
        kind: 'flight',
        flight,
        at: flight.at,
        priority: flight.kind === 'impact' ? 0 : 1,
        key: String(flight.sequence).padStart(16, '0'),
      });
    if (!this.core.getEntity(this.options.playerId).alive) return next;
    const living = this.ordered().filter((actor) => this.core.getEntity(actor.id).alive);
    if (living.length === 0) return next;
    const steeringAt = this.steeringIndex * this.options.movementStep;
    if (steeringAt <= this.clock && !sameTime(steeringAt, this.clock))
      throw new RangeError('Steering clock failed to advance.');
    consider({ kind: 'steer', at: steeringAt, priority: 3, key: '' });
    const horizon = Math.max(this.clock, Math.min(end, steeringAt));
    for (const actor of living) {
      if (actor.stunned) continue;
      const ready = Math.max(this.clock, actor.nextAttackAt);
      if (ready <= horizon || sameTime(ready, horizon)) {
        const start = {
            x: actor.x + actor.vx * (ready - this.clock),
            y: actor.y + actor.vy * (ready - this.clock),
          },
          remaining = Math.max(0, horizon - ready),
          finish = { x: start.x + actor.vx * remaining, y: start.y + actor.vy * remaining };
        const range =
          this.player!.radius +
          (actor.config.behavior === 'melee' ? actor.config.radius : actor.config.attackRange);
        const fraction = segmentCircleIntersection(start, finish, this.player!, range);
        if (fraction !== null)
          consider({
            kind: 'attempt',
            at: ready + fraction * remaining,
            priority: 4,
            key: actor.id,
            enemy: actor,
          });
      }
      let radius: number | null = null;
      if (actor.config.behavior === 'melee') radius = 0;
      else if (actor.state === 'approach')
        radius = this.player!.radius + actor.config.attackRange - actor.config.hysteresis;
      else if (actor.state === 'retreat')
        radius = this.player!.radius + actor.config.retreatDistance + actor.config.hysteresis;
      if (radius !== null) {
        const crossings = futureCrossings(
          this.clock,
          circleCrossings(actor, this.player!, radius, horizon - this.clock),
        );
        if (crossings.length)
          consider({
            kind: 'motion',
            at: this.clock + Math.min(...crossings),
            priority: 2,
            key: actor.id,
            enemy: actor,
          });
      }
    }
    return next;
  }
  private advance(dt: number) {
    const positions: { actor: EnemyActor; x: number; y: number; ex: number; ey: number }[] = [];
    for (const actor of this.actors.values())
      if (this.core.getEntity(actor.id).alive) {
        // Compensated sums prevent frame partitioning from moving a geometric tie in time.
        const error = this.positionErrors.get(actor.id)!;
        const dx = actor.vx * dt - error.x,
          dy = actor.vy * dt - error.y;
        const x = actor.x + dx,
          y = actor.y + dy;
        const ex = x - actor.x - dx,
          ey = y - actor.y - dy;
        finite(x, 'enemy position.x');
        finite(y, 'enemy position.y');
        positions.push({ actor, x, y, ex, ey });
      }
    this.flights.advance(dt);
    for (const { actor, x, y, ex, ey } of positions) {
      this.positionErrors.set(actor.id, { x: ex, y: ey });
      actor.x = x;
      actor.y = y;
    }
  }
  private attempt(actor: EnemyActor, output: EnemyEvent[]) {
    const player = this.core.getEntity(this.options.playerId);
    if (!player.alive || !this.core.getEntity(actor.id).alive || actor.stunned) return;
    const overlap =
      actor.config.behavior === 'melee'
        ? Math.hypot(actor.x - this.player!.x, actor.y - this.player!.y) <=
          actor.config.radius + this.player!.radius + EPS
        : edgeDistance(actor, this.player!) <= actor.config.attackRange + EPS;
    if (!overlap || (actor.nextAttackAt > this.clock && !sameTime(actor.nextAttackAt, this.clock)))
      return;
    const next = this.clock + actor.config.attackInterval;
    if (!Number.isFinite(next) || next <= this.clock)
      throw new RangeError('Enemy attack interval is not representable.');
    if (actor.config.behavior === 'ranged') {
      const event = this.flights.launch(this.clock, {
        sourceId: actor.id,
        origin: actor,
        target: this.player!,
        damageType: actor.config.damageType,
        coefficient: actor.config.attackCoefficient,
        projectile: actor.config.projectile,
        fallbackDirection: { x: 1, y: 0 },
      });
      actor.nextAttackAt = next;
      output.push(event);
      return;
    }
    const blocked = this.options.canResolveDirectDamage
      ? !policyResult(
          this.options.canResolveDirectDamage(
            Object.freeze({
              time: this.clock,
              sourceId: actor.id,
              targetId: this.options.playerId,
              kind: 'contact',
              attack: null,
            }),
          ),
        )
      : false;
    const attack = blocked
      ? null
      : this.core.createAttack({
          attackerId: actor.id,
          damageType: actor.config.damageType,
          coefficient: actor.config.attackCoefficient,
        });
    const result = attack ? this.core.resolveAttack(attack, this.options.playerId) : null;
    actor.nextAttackAt = next;
    if (result)
      this.options.onDirectDamageResolved?.(
        Object.freeze({
          time: this.clock,
          sourceId: actor.id,
          targetId: this.options.playerId,
          kind: 'contact',
          attack,
        }),
        result,
      );
    output.push(
      Object.freeze({
        type: 'contact-attempt',
        time: this.clock,
        sourceId: actor.id,
        targetId: this.options.playerId,
        blocked,
        attack,
        result,
      }),
    );
  }
}
