import {
  applyResistance,
  calculateCriticalDamage,
  COMBAT_ATTRIBUTE_CAPS,
} from '../character-stats';
import type { AttackRequest, AttackSnapshot, CombatEntity, RandomSource } from './types';
import { damageType, finiteNumber, identifier, nonNegative, rollChance } from './validation';

export function createAttackSnapshot(
  id: string,
  attacker: CombatEntity,
  request: AttackRequest,
  random: RandomSource,
): AttackSnapshot {
  identifier(id, 'attack id');
  identifier(request.attackerId, 'attackerId');
  if (request.attackerId !== attacker.id)
    throw new Error('Attack source does not match attacker entity.');
  if (!attacker.alive) throw new Error(`Entity ${attacker.id} is combat-inactive.`);
  damageType(request.damageType);
  nonNegative(request.coefficient, 'coefficient');
  const bonus = request.criticalChanceBonus ?? 0;
  nonNegative(bonus, 'criticalChanceBonus');
  const stat = request.damageType === 'physical' ? attacker.physicalDamage : attacker.magicalDamage;
  const baseDamage = stat * request.coefficient;
  nonNegative(baseDamage, 'calculated base damage');
  if (request.noCritical !== undefined && typeof request.noCritical !== 'boolean')
    throw new TypeError('noCritical must be a boolean.');
  if (request.forceCritical !== undefined && typeof request.forceCritical !== 'boolean')
    throw new TypeError('forceCritical must be a boolean.');
  if (request.noCritical && request.forceCritical)
    throw new RangeError('An attack cannot be both non-critical and always critical.');
  // Exactly one draw per attack; a bonus never exceeds the central Crit Chance cap.
  // Task 09.1: a `noCritical` attack draws nothing and is never critical.
  // Task 43: a `forceCritical` attack keeps its draw (same sequence) and is always critical.
  const rolled = request.noCritical
    ? false
    : rollChance(
        Math.min(COMBAT_ATTRIBUTE_CAPS.criticalChance, attacker.criticalChance + bonus),
        random,
      );
  const critical = request.forceCritical === true || rolled;
  const rawDamage = critical
    ? calculateCriticalDamage(baseDamage, attacker.criticalDamage)
    : baseDamage;
  nonNegative(rawDamage, 'calculated raw damage');
  return Object.freeze({
    id,
    attackerId: attacker.id,
    damageType: request.damageType,
    coefficient: request.coefficient,
    baseDamage,
    critical,
    rawDamage,
  });
}

/** Also validates deserialized/value snapshots before they can affect state. */
export function validateAttackSnapshot(attack: AttackSnapshot): void {
  if (!attack || typeof attack !== 'object')
    throw new TypeError('attack must be a snapshot object.');
  identifier(attack.id, 'attack id');
  identifier(attack.attackerId, 'attackerId');
  damageType(attack.damageType);
  nonNegative(attack.coefficient, 'coefficient');
  nonNegative(attack.baseDamage, 'baseDamage');
  nonNegative(attack.rawDamage, 'rawDamage');
  if (typeof attack.critical !== 'boolean') throw new TypeError('critical must be boolean.');
}

/** No crit roll here: every target uses the attack's already finalized raw damage. */
export function calculateSuccessfulDamage(rawDamage: number, resistance: number): number {
  nonNegative(rawDamage, 'rawDamage');
  nonNegative(resistance, 'resistance');
  if (rawDamage === 0) return 0;
  const mitigated = applyResistance(rawDamage, resistance);
  finiteNumber(mitigated, 'calculated mitigated damage');
  return Math.max(1, Math.round(mitigated));
}
