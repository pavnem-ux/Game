import type { AttackSnapshot, CombatCore } from '../combat-core';
import { aimDirection, segmentCircleIntersection } from '../weapon-attacks';
import type { CombatBody } from '../weapon-attacks';
import type {
  DirectDamagePolicy,
  DirectDamageObserver,
  EnemyProjectileDue,
  EnemyProjectileEvent,
  EnemyProjectileLaunch,
  EnemyProjectileLaunchEvent,
  EnemyProjectileSnapshot,
} from './types';
import { body, finite, nonNegative, point, policyResult, projectile, unit } from './validation';
interface Flight {
  view: Omit<EnemyProjectileSnapshot, 'x' | 'y' | 'distanceTraveled'>;
  distance: number;
  x: number;
  y: number;
  sequence: number;
}
export class EnemyProjectiles {
  private readonly flights = new Map<string, Flight>();
  private sequence = 0;
  constructor(
    private readonly core: CombatCore,
    readonly playerId: string,
    private readonly canResolveDirectDamage?: DirectDamagePolicy,
    private readonly onDirectDamageResolved?: DirectDamageObserver,
    private readonly playerDamageMultiplier?: (attack: AttackSnapshot) => number,
  ) {
    if (core.getEntity(playerId).affiliation !== 'player')
      throw new Error('Projectile target must be the player.');
    if (canResolveDirectDamage !== undefined && typeof canResolveDirectDamage !== 'function')
      throw new TypeError('Direct damage policy must be a function.');
    if (onDirectDamageResolved !== undefined && typeof onDirectDamageResolved !== 'function')
      throw new TypeError('Direct damage observer must be a function.');
  }
  launch(time: number, input: EnemyProjectileLaunch): EnemyProjectileLaunchEvent {
    nonNegative(time, 'launch time');
    const source = this.core.getEntity(input.sourceId),
      target = this.core.getEntity(this.playerId);
    if (!source.alive || source.affiliation !== 'enemy')
      throw new Error('Only a living enemy may launch.');
    if (!target.alive) throw new Error('Cannot launch at a dead player.');
    const origin = point(input.origin, 'launch origin'),
      targetBody = body(input.target),
      config = projectile(input.projectile),
      fallback = unit(input.fallbackDirection);
    const direction = aimDirection(origin, targetBody, fallback);
    point(direction, 'flight direction');
    const attack = this.core.createAttack({
      attackerId: source.id,
      damageType: input.damageType,
      coefficient: input.coefficient,
    });
    const sequence = this.sequence + 1,
      id = `enemy-projectile-${sequence}`;
    const view = Object.freeze({
      id,
      sourceId: source.id,
      targetId: this.playerId,
      attack,
      origin,
      direction,
      speed: config.speed,
      radius: config.radius,
      maxTravelDistance: config.maxTravelDistance,
    });
    const flight: Flight = { view, x: origin.x, y: origin.y, distance: 0, sequence };
    this.flights.set(id, flight);
    this.sequence = sequence;
    return Object.freeze({
      type: 'enemy-projectile-launched',
      time,
      projectile: this.snapshot(flight),
    });
  }
  getProjectiles(): readonly EnemyProjectileSnapshot[] {
    return Object.freeze([...this.flights.values()].map((f) => this.snapshot(f)));
  }
  nextEvent(now: number, player: CombatBody): EnemyProjectileDue | null {
    nonNegative(now, 'projectile time');
    const target = body(player);
    let next: EnemyProjectileDue | null = null;
    for (const f of this.flights.values()) {
      const remaining = Math.max(0, f.view.maxTravelDistance - f.distance),
        end = { x: f.x + f.view.direction.x * remaining, y: f.y + f.view.direction.y * remaining };
      const fraction = this.core.getEntity(this.playerId).alive
        ? segmentCircleIntersection(f, end, target, f.view.radius + target.radius)
        : null;
      const event: EnemyProjectileDue = {
        id: f.view.id,
        sequence: f.sequence,
        at: now + (remaining * (fraction ?? 1)) / f.view.speed,
        kind: fraction === null ? 'expire' : 'impact',
      };
      finite(event.at, 'projectile event time');
      if (
        !next ||
        event.at < next.at ||
        (event.at === next.at &&
          ((event.kind === 'impact' && next.kind === 'expire') ||
            (event.kind === next.kind && event.sequence < next.sequence)))
      )
        next = event;
    }
    return next ? Object.freeze(next) : null;
  }
  advance(delta: number) {
    nonNegative(delta, 'projectile delta');
    const positions: { flight: Flight; distance: number; x: number; y: number }[] = [];
    for (const f of this.flights.values()) {
      const distance = Math.min(f.view.maxTravelDistance, f.distance + f.view.speed * delta);
      const x = f.view.origin.x + f.view.direction.x * distance;
      const y = f.view.origin.y + f.view.direction.y * distance;
      finite(x, 'projectile position.x');
      finite(y, 'projectile position.y');
      positions.push({ flight: f, distance, x, y });
    }
    for (const p of positions) {
      p.flight.distance = p.distance;
      p.flight.x = p.x;
      p.flight.y = p.y;
    }
  }
  resolve(event: EnemyProjectileDue, time: number): EnemyProjectileEvent {
    nonNegative(time, 'impact time');
    const f = this.flights.get(event.id);
    if (!f) throw new Error('Unknown or consumed enemy projectile.');
    if (event.kind === 'expire') {
      f.distance = f.view.maxTravelDistance;
      f.x = f.view.origin.x + f.view.direction.x * f.distance;
      f.y = f.view.origin.y + f.view.direction.y * f.distance;
      this.flights.delete(event.id);
      return Object.freeze({
        type: 'enemy-projectile-expired',
        time,
        projectile: this.snapshot(f),
      });
    }
    const blocked = this.canResolveDirectDamage
      ? !policyResult(
          this.canResolveDirectDamage(
            Object.freeze({
              time,
              sourceId: f.view.sourceId,
              targetId: this.playerId,
              kind: 'projectile',
              attack: f.view.attack,
            }),
          ),
        )
      : false;
    const result = blocked
      ? null
      : this.core.resolveAttack(f.view.attack, this.playerId, {
          damageMultiplier: this.playerDamageMultiplier?.(f.view.attack) ?? 1,
        });
    this.flights.delete(event.id);
    if (result)
      this.onDirectDamageResolved?.(
        Object.freeze({
          time,
          sourceId: f.view.sourceId,
          targetId: this.playerId,
          kind: 'projectile',
          attack: f.view.attack,
        }),
        result,
      );
    return Object.freeze({
      type: 'enemy-projectile-impact',
      time,
      projectile: this.snapshot(f),
      blocked,
      result,
    });
  }
  clear() {
    this.flights.clear();
  }
  private snapshot(f: Flight): EnemyProjectileSnapshot {
    return Object.freeze({ ...f.view, x: f.x, y: f.y, distanceTraveled: f.distance });
  }
}
