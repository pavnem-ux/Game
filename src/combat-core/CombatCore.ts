import type {
  AttackRequest,
  AttackSnapshot,
  CombatEntity,
  CombatEntityInput,
  CombatEntityStats,
  CombatEvent,
  DamageResult,
  EntityChangeResult,
  HealingResult,
  MaxHpChangedEvent,
  RandomSource,
  PeriodicDamageRequest,
  PeriodicDamageResult,
  PeriodicDamageEvent,
  DeathEvent,
  RevivalResult,
  ResolveAttackOptions,
} from './types';
import { validatePeriodicRequest } from './periodic';
import { createAttackSnapshot, calculateSuccessfulDamage, validateAttackSnapshot } from './attack';
import {
  finiteNumber,
  identifier,
  nonNegative,
  normalizeEntityStats,
  rollChance,
} from './validation';

function events<T extends CombatEvent>(items: T[]): readonly T[] {
  return Object.freeze(items.map((event) => Object.freeze(event)));
}

/** One instance owns one combat session. No renderer, timers, subscriptions or global registry. */
export class CombatCore {
  private readonly entities = new Map<string, CombatEntity>();
  /** Task 07: temporary absorb amounts. Kept outside entity snapshots; lifetime owned by caller. */
  private readonly barriers = new Map<string, number>();
  private nextAttackId = 1;
  private readonly random: RandomSource;

  constructor(random: RandomSource = Math.random) {
    if (typeof random !== 'function') throw new TypeError('random must be a function.');
    this.random = random;
  }

  addEntity(input: CombatEntityInput): CombatEntity {
    if (!input || typeof input !== 'object') throw new TypeError('entity input must be an object.');
    identifier(input.id, 'entity id');
    if (this.entities.has(input.id)) throw new Error(`Entity ID already exists: ${input.id}.`);
    if (input.affiliation !== 'player' && input.affiliation !== 'enemy') {
      throw new TypeError('affiliation must be player or enemy.');
    }
    const stats = normalizeEntityStats(input.stats);
    const currentHp = input.currentHp === undefined ? stats.maxHp : input.currentHp;
    nonNegative(currentHp, 'currentHp');
    if (currentHp > stats.maxHp) throw new RangeError('currentHp must not exceed maxHp.');
    return this.store({
      ...stats,
      id: input.id,
      affiliation: input.affiliation,
      currentHp,
      alive: currentHp > 0,
    });
  }

  getEntity(id: string): CombatEntity {
    identifier(id, 'entity id');
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown combat entity: ${id}.`);
    return entity;
  }

  createAttack(request: AttackRequest): AttackSnapshot {
    if (!request || typeof request !== 'object')
      throw new TypeError('attack request must be an object.');
    const attack = createAttackSnapshot(
      `attack-${this.nextAttackId}`,
      this.getEntity(request.attackerId),
      request,
      this.random,
    );
    this.nextAttackId++;
    return attack;
  }

  resolveAttack(
    attack: AttackSnapshot,
    targetId: string,
    options: ResolveAttackOptions = {},
  ): DamageResult {
    validateAttackSnapshot(attack);
    if (!options || typeof options !== 'object') throw new TypeError('options must be an object.');
    const multiplier = options.damageMultiplier ?? 1;
    nonNegative(multiplier, 'damageMultiplier');
    const target = this.getEntity(targetId);
    const unchanged = {
      attackId: attack.id,
      targetId,
      damage: 0,
      appliedDamage: 0,
      previousHp: target.currentHp,
      currentHp: target.currentHp,
    };
    if (!target.alive)
      return Object.freeze({ ...unchanged, status: 'inactive', events: events([]) });
    if (rollChance(target.dodgeChance, this.random)) {
      return Object.freeze({
        ...unchanged,
        status: 'dodged',
        events: events([
          { type: 'dodge', attackId: attack.id, sourceId: attack.attackerId, targetId },
        ]),
      });
    }
    const damage = calculateSuccessfulDamage(attack.rawDamage * multiplier, target.resistance);
    const { currentHp, appliedDamage, absorbed, next } = this.reduceHp(target, damage);
    const emitted: CombatEvent[] = [];
    if (appliedDamage > 0)
      emitted.push({
        type: 'damage',
        attackId: attack.id,
        sourceId: attack.attackerId,
        targetId,
        damageType: attack.damageType,
        critical: attack.critical,
        damage,
        appliedDamage,
      });
    if (!next.alive)
      emitted.push({
        type: 'death',
        entityId: targetId,
        sourceId: attack.attackerId,
        attackId: attack.id,
      });
    return Object.freeze({
      ...unchanged,
      status: 'hit',
      damage,
      appliedDamage,
      ...(absorbed > 0 ? { absorbed } : {}),
      currentHp,
      events: events(emitted),
    });
  }

  /** Task 07: replace the entity's temporary barrier; 0 removes it. Caller owns its expiry. */
  setBarrier(entityId: string, amount: number): void {
    nonNegative(amount, 'barrier amount');
    this.getEntity(entityId);
    if (amount === 0) this.barriers.delete(entityId);
    else this.barriers.set(entityId, amount);
  }
  getBarrier(entityId: string): number {
    this.getEntity(entityId);
    return this.barriers.get(entityId) ?? 0;
  }

  /** Non-critical and non-dodgeable; this operation never draws RNG. */
  applyPeriodicDamage(input: PeriodicDamageRequest): PeriodicDamageResult {
    const request = validatePeriodicRequest(input, (id) => this.getEntity(id));
    const target = this.getEntity(request.targetId);
    const unchanged = {
      operationId: request.operationId,
      targetId: target.id,
      damage: 0,
      appliedDamage: 0,
      previousHp: target.currentHp,
      currentHp: target.currentHp,
    };
    if (!target.alive)
      return Object.freeze({ ...unchanged, status: 'inactive', events: events([]) });
    const damage = calculateSuccessfulDamage(request.rawDamage, target.resistance);
    const { currentHp, appliedDamage, absorbed, next } = this.reduceHp(target, damage);
    const periodic = Object.freeze({ effectId: request.effectId, sources: request.sources });
    // Representative legacy source field, not a kill/reward policy. All sources remain attached.
    const sourceId = request.sources[0].sourceId;
    const emitted: (PeriodicDamageEvent | DeathEvent)[] = [];
    if (appliedDamage > 0)
      emitted.push({
        type: 'periodic-damage',
        operationId: request.operationId,
        sourceId,
        targetId: target.id,
        damage,
        appliedDamage,
        periodic,
      });
    if (!next.alive)
      emitted.push({
        type: 'death',
        entityId: target.id,
        sourceId,
        attackId: request.operationId,
        periodic,
      });
    return Object.freeze({
      ...unchanged,
      status: 'hit',
      damage,
      appliedDamage,
      ...(absorbed > 0 ? { absorbed } : {}),
      currentHp,
      events: events(emitted),
    });
  }

  /** Explicit dead-to-alive operation. Run revival limits are owned by Player Survival. */
  reviveEntity(entityId: string, restoredHp: number): RevivalResult {
    nonNegative(restoredHp, 'restoredHp');
    if (restoredHp === 0) throw new RangeError('restoredHp must be positive.');
    const entity = this.getEntity(entityId);
    if (entity.alive) throw new Error('Cannot revive a living entity.');
    if (restoredHp > entity.maxHp)
      throw new RangeError('restoredHp must not exceed current Max HP.');
    const next = this.store({ ...entity, currentHp: restoredHp, alive: true });
    return Object.freeze({
      entity: next,
      restoredHp,
      events: events([
        { type: 'revived', entityId, previousHp: 0, currentHp: restoredHp, maxHp: entity.maxHp },
      ]),
    });
  }

  heal(entityId: string, amount: number): HealingResult {
    nonNegative(amount, 'healing amount');
    const entity = this.getEntity(entityId);
    if (!entity.alive) return Object.freeze({ entity, healed: 0, events: events([]) });
    const currentHp = entity.currentHp + Math.min(amount, entity.maxHp - entity.currentHp);
    const healed = currentHp - entity.currentHp;
    const next = this.store({ ...entity, currentHp });
    return Object.freeze({
      entity: next,
      healed,
      events: events(healed > 0 ? [{ type: 'healing', entityId, amount: healed }] : []),
    });
  }

  changeMaxHp(entityId: string, delta: number): EntityChangeResult {
    finiteNumber(delta, 'Max HP delta');
    const entity = this.getEntity(entityId);
    return this.updateEntityStats(entityId, { ...entity, maxHp: entity.maxHp + delta });
  }

  /** Receives complete combined stats; does not invent modifier stacking rules. */
  updateEntityStats(entityId: string, stats: CombatEntityStats): EntityChangeResult {
    const entity = this.getEntity(entityId);
    const normalized = normalizeEntityStats(stats);
    const delta = normalized.maxHp - entity.maxHp;
    const adjustedHp = entity.currentHp + delta;
    const currentHp = entity.alive
      ? Math.min(normalized.maxHp, delta < 0 ? Math.max(1, adjustedHp) : adjustedHp)
      : 0;
    const next = this.store({ ...entity, ...normalized, currentHp, alive: entity.alive });
    const changed: MaxHpChangedEvent[] =
      delta === 0
        ? []
        : [
            {
              type: 'max-hp-changed',
              entityId,
              previousMaxHp: entity.maxHp,
              maxHp: next.maxHp,
              previousHp: entity.currentHp,
              currentHp,
            },
          ];
    return Object.freeze({ entity: next, events: events(changed) });
  }

  private reduceHp(target: CombatEntity, damage: number) {
    const barrier = this.barriers.get(target.id) ?? 0;
    const absorbed = Math.min(barrier, damage);
    if (absorbed > 0) {
      if (barrier - absorbed > 0) this.barriers.set(target.id, barrier - absorbed);
      else this.barriers.delete(target.id);
    }
    const currentHp = Math.max(0, target.currentHp - (damage - absorbed));
    const appliedDamage = target.currentHp - currentHp;
    const next = this.store({ ...target, currentHp, alive: currentHp > 0 });
    return { currentHp, appliedDamage, absorbed, next };
  }

  private store(entity: CombatEntity): CombatEntity {
    const snapshot = Object.freeze(entity);
    this.entities.set(entity.id, snapshot);
    return snapshot;
  }
}
