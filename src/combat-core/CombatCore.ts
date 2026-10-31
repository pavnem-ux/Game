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
} from './types';
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

  resolveAttack(attack: AttackSnapshot, targetId: string): DamageResult {
    validateAttackSnapshot(attack);
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
    const damage = calculateSuccessfulDamage(attack.rawDamage, target.resistance);
    const currentHp = Math.max(0, target.currentHp - damage);
    const appliedDamage = target.currentHp - currentHp;
    const next = this.store({ ...target, currentHp, alive: currentHp > 0 });
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
      currentHp,
      events: events(emitted),
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

  private store(entity: CombatEntity): CombatEntity {
    const snapshot = Object.freeze(entity);
    this.entities.set(entity.id, snapshot);
    return snapshot;
  }
}
