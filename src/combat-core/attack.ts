import { applyResistance, calculateCriticalDamage } from '../character-stats';
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
  const stat = request.damageType === 'physical' ? attacker.physicalDamage : attacker.magicalDamage;
  const baseDamage = stat * request.coefficient;
  nonNegative(baseDamage, 'calculated base damage');
  const critical = rollChance(attacker.criticalChance, random);
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
