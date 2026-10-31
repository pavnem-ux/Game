import { scaleAttackFrequency } from '../character-stats';
import type { CombatCore } from '../combat-core';
import { aimDirection, circleIntersectsSector, edgeDistance } from './geometry';
import { advanceProjectile, nextFlightEvent, projectileSnapshot } from './projectiles';
import type { FlightEvent, ProjectileState } from './projectiles';
import { compareIds, nearestTarget, validTarget } from './targeting';
import type {
  CombatBody,
  EquipWeaponInput,
  Point,
  ProjectileSnapshot,
  UpdateOptions,
  WeaponConfig,
  WeaponEvent,
  WeaponState,
} from './types';
import {
  cappedAttackSpeed,
  finite,
  nonNegative,
  normalizedDirection,
  positive,
  validatePoint,
  validateWeaponConfig,
} from './validation';
interface Equipped {
  entityId: string;
  weapon: WeaponConfig;
  attackSpeedPercent: number;
  fallbackDirection: Point;
  launchOffset: Point;
  nextCycleAt: number;
  pending: { at: number; originalTargetId: string } | null;
}
type CycleEvent = {
  at: number;
  priority: 2 | 3;
  order: string;
  kind: 'second' | 'cycle';
  equipped: Equipped;
};
type ScheduledEvent = FlightEvent | CycleEvent;
function earlier(a: ScheduledEvent, b: ScheduledEvent): boolean {
  if (a.at !== b.at) return a.at < b.at;
  if (a.priority !== b.priority) return a.priority < b.priority;
  return typeof a.order === 'number' && typeof b.order === 'number'
    ? a.order < b.order
    : compareIds(String(a.order), String(b.order)) < 0;
}

export class WeaponAttacks {
  private readonly bodies = new Map<string, CombatBody>();
  private readonly equipped = new Map<string, Equipped>();
  private readonly weaponIds = new Set<string>();
  private readonly projectiles = new Map<string, ProjectileState>();
  private clock = 0;
  private nextProjectileId = 1;
  constructor(private readonly core: CombatCore) {}
  get time() {
    return this.clock;
  }

  setBody(entityId: string, body: CombatBody): void {
    this.core.getEntity(entityId);
    validatePoint(body, 'body');
    nonNegative(body.radius, 'body.radius');
    this.bodies.set(entityId, Object.freeze({ x: body.x, y: body.y, radius: body.radius }));
  }

  equipWeapon(input: EquipWeaponInput): WeaponState {
    this.core.getEntity(input.entityId);
    if (this.equipped.has(input.entityId))
      throw new Error('Only one primary weapon may be equipped; switching is not implemented.');
    const weapon = validateWeaponConfig(input.weapon);
    if (weapon.allowedClass !== input.characterClass)
      throw new TypeError('Weapon is incompatible with character class.');
    if (this.weaponIds.has(weapon.id)) throw new Error(`Weapon ID already equipped: ${weapon.id}.`);
    if (!this.bodies.has(input.entityId))
      throw new Error('Register source geometry with setBody before equipping.');
    const fallbackDirection = normalizedDirection(input.fallbackDirection);
    const launchOffset = input.launchOffset ?? { x: 0, y: 0 };
    validatePoint(launchOffset, 'launchOffset');
    const speed = cappedAttackSpeed(input.attackSpeedPercent);
    this.interval(weapon, speed); // Reject unrepresentable intervals before registering anything.
    this.equipped.set(input.entityId, {
      entityId: input.entityId,
      weapon,
      attackSpeedPercent: speed,
      fallbackDirection,
      launchOffset: Object.freeze({ ...launchOffset }),
      nextCycleAt: this.clock,
      pending: null,
    });
    this.weaponIds.add(weapon.id);
    return this.getWeaponState(input.entityId);
  }

  setAttackSpeed(entityId: string, attackSpeedPercent: number): void {
    const owner = this.owner(entityId),
      speed = cappedAttackSpeed(attackSpeedPercent);
    this.interval(owner.weapon, speed);
    owner.attackSpeedPercent = speed;
  }
  setFallbackDirection(entityId: string, direction: Point): void {
    this.owner(entityId).fallbackDirection = normalizedDirection(direction);
  }
  getWeaponState(entityId: string): WeaponState {
    const w = this.owner(entityId);
    return Object.freeze({
      entityId,
      weapon: w.weapon,
      attackSpeedPercent: w.attackSpeedPercent,
      nextCycleAt: w.nextCycleAt,
      secondStrikeAt: w.pending?.at ?? null,
    });
  }
  getProjectiles(): readonly ProjectileSnapshot[] {
    return Object.freeze([...this.projectiles.values()].map(projectileSnapshot));
  }

  /** Event-driven catch-up: consume all elapsed scheduled events without dropped cycles. */
  update(deltaSeconds: number, options: UpdateOptions = {}): readonly WeaponEvent[] {
    nonNegative(deltaSeconds, 'deltaSeconds');
    if (options.paused !== undefined && typeof options.paused !== 'boolean')
      throw new TypeError('paused must be boolean.');
    const output: WeaponEvent[] = [];
    this.cancelDeadPending(output);
    if (options.paused) return Object.freeze(output.map((event) => Object.freeze(event)));
    const end = this.clock + deltaSeconds;
    finite(end, 'simulation time');
    for (;;) {
      const next = this.nextEvent(end);
      if (!next) {
        this.advance(end - this.clock);
        this.clock = end;
        break;
      }
      this.advance(next.at - this.clock);
      this.clock = next.at;
      if ('projectile' in next) this.finishFlight(next, output);
      else this.strikeEvent(next, output);
      this.cancelDeadPending(output);
    }
    return Object.freeze(output.map((event) => Object.freeze(event)));
  }

  private owner(id: string): Equipped {
    const owner = this.equipped.get(id);
    if (!owner) throw new Error(`No equipped weapon for ${id}.`);
    return owner;
  }
  private interval(weapon: WeaponConfig, speed: number): number {
    const interval = weapon.baseAttackInterval / scaleAttackFrequency(1, speed);
    positive(interval, 'effective interval');
    return interval;
  }
  private target(w: Equipped): string | null {
    const source = this.bodies.get(w.entityId);
    return source
      ? nearestTarget(this.core, this.bodies, w.entityId, source, w.weapon.attackRange)
      : null;
  }
  private nextEvent(end: number): ScheduledEvent | null {
    let next: ScheduledEvent | null = null;
    const consider = (event: ScheduledEvent) => {
      finite(event.at, 'scheduled event time');
      // Only machine-precision boundary snapping; no gameplay catch-up quantum.
      const tolerance = Number.EPSILON * 8 * Math.max(1, Math.abs(end), Math.abs(event.at));
      if (event.at > end + tolerance) return;
      event = { ...event, at: Math.max(this.clock, Math.min(end, event.at)) };
      if (!next || earlier(event, next)) next = event;
    };
    for (const p of this.projectiles.values())
      consider(nextFlightEvent(p, this.clock, this.core, this.bodies));
    for (const w of this.equipped.values()) {
      if (!this.core.getEntity(w.entityId).alive) continue;
      if (w.pending)
        consider({ at: w.pending.at, priority: 2, order: w.entityId, kind: 'second', equipped: w });
      if (this.target(w) !== null)
        consider({ at: w.nextCycleAt, priority: 3, order: w.entityId, kind: 'cycle', equipped: w });
    }
    return next;
  }
  private advance(dt: number) {
    for (const p of this.projectiles.values()) advanceProjectile(p, dt);
  }
  private cancelDeadPending(output: WeaponEvent[]) {
    for (const w of [...this.equipped.values()].sort((a, b) =>
      compareIds(a.entityId, b.entityId),
    )) {
      if (w.pending && !this.core.getEntity(w.entityId).alive) {
        w.pending = null;
        output.push({
          type: 'strike-skipped',
          time: this.clock,
          sourceId: w.entityId,
          weaponId: w.weapon.id,
          reason: 'source-dead',
        });
      }
    }
  }
  private strikeEvent(event: CycleEvent, output: WeaponEvent[]) {
    const w = event.equipped;
    if (!this.core.getEntity(w.entityId).alive) return;
    let targetId: string | null;
    if (event.kind === 'second') {
      const original = w.pending?.originalTargetId;
      w.pending = null;
      const origin = this.bodies.get(w.entityId)!,
        body = original ? this.bodies.get(original) : undefined;
      targetId =
        original &&
        body &&
        validTarget(this.core, w.entityId, this.core.getEntity(w.entityId).affiliation, original) &&
        edgeDistance(origin, body) <= w.weapon.attackRange
          ? original
          : this.target(w);
      if (targetId === null) {
        output.push({
          type: 'strike-skipped',
          time: this.clock,
          sourceId: w.entityId,
          weaponId: w.weapon.id,
          reason: 'no-target',
        });
        return;
      }
    } else {
      targetId = this.target(w);
      if (targetId === null) return;
      const duration = this.interval(w.weapon, w.attackSpeedPercent),
        nextAt = this.clock + duration;
      if (!Number.isFinite(nextAt) || nextAt <= this.clock)
        throw new RangeError('Cycle time is not representable at the current simulation time.');
      if (w.weapon.pattern === 'dual_melee') {
        const at = this.clock + duration * w.weapon.secondStrikeFraction;
        if (at <= this.clock || at >= nextAt)
          throw new RangeError('Second strike time is not representable inside this cycle.');
        w.pending = { at, originalTargetId: targetId };
      }
      w.nextCycleAt = nextAt;
    }
    this.initiate(w, targetId, event.kind === 'second' ? 2 : 1, output);
  }
  private initiate(w: Equipped, targetId: string, strike: 1 | 2, output: WeaponEvent[]) {
    const source = this.bodies.get(w.entityId)!,
      target = this.bodies.get(targetId)!;
    const origin = Object.freeze({
      x: source.x + (w.weapon.pattern === 'projectile' ? w.launchOffset.x : 0),
      y: source.y + (w.weapon.pattern === 'projectile' ? w.launchOffset.y : 0),
    });
    validatePoint(origin, 'launch origin');
    const direction = aimDirection(origin, target, w.fallbackDirection);
    const attack = this.core.createAttack({
      attackerId: w.entityId,
      damageType: w.weapon.damageType,
      coefficient: w.weapon.damageCoefficient,
    });
    if (w.weapon.pattern === 'projectile') {
      const id = `projectile-${this.nextProjectileId}`,
        sequence = this.nextProjectileId++;
      const data = Object.freeze({
        id,
        weaponId: w.weapon.id,
        sourceId: w.entityId,
        direction,
        speed: w.weapon.projectile.speed,
        radius: w.weapon.projectile.radius,
        maxTravelDistance: w.weapon.projectile.maxTravelDistance,
        attack,
      });
      this.projectiles.set(id, {
        data,
        origin,
        affiliation: this.core.getEntity(w.entityId).affiliation,
        sequence,
        distanceTraveled: 0,
        x: origin.x,
        y: origin.y,
      });
      output.push({
        type: 'attack-started',
        time: this.clock,
        weaponId: w.weapon.id,
        sourceId: w.entityId,
        targetId,
        strike,
        attack,
        origin,
        direction,
        projectileId: id,
      });
    } else {
      output.push({
        type: 'attack-started',
        time: this.clock,
        weaponId: w.weapon.id,
        sourceId: w.entityId,
        targetId,
        strike,
        attack,
        origin,
        direction,
      });
      const hitIds = new Set<string>();
      for (const id of [...this.bodies.keys()].sort(compareIds)) {
        if (
          hitIds.has(id) ||
          !validTarget(this.core, w.entityId, this.core.getEntity(w.entityId).affiliation, id)
        )
          continue;
        if (
          !circleIntersectsSector(
            this.bodies.get(id)!,
            origin,
            direction,
            w.weapon.attackRange,
            w.weapon.arcDegrees,
          )
        )
          continue;
        hitIds.add(id);
        const result = this.core.resolveAttack(attack, id);
        output.push({
          type: 'impact',
          time: this.clock,
          weaponId: w.weapon.id,
          attack,
          targetId: id,
          result,
        });
      }
    }
  }
  private finishFlight(event: FlightEvent, output: WeaponEvent[]) {
    const p = event.projectile;
    this.projectiles.delete(p.data.id);
    if (event.kind === 'collision') {
      const result = this.core.resolveAttack(p.data.attack, event.targetId!);
      output.push({
        type: 'impact',
        time: this.clock,
        weaponId: p.data.weaponId,
        attack: p.data.attack,
        targetId: event.targetId!,
        result,
        projectileId: p.data.id,
      });
    } else {
      output.push({
        type: 'projectile-expired',
        time: this.clock,
        weaponId: p.data.weaponId,
        projectileId: p.data.id,
        position: Object.freeze({ x: p.x, y: p.y }),
        distanceTraveled: p.distanceTraveled,
      });
    }
  }
}
