import type { WeaponImpactEvent } from '../weapon-attacks';
import type { StatusEffects } from './StatusEffects';
import type {
  EffectDefinition,
  HitApplicationResult,
  OnHitEffectMapping,
  StatusEvent,
} from './types';
import { id, nonNegative, validateDefinition } from './validation';

/** No WeaponConfig change or implicit application on launch. Deliver resolved hits once, in time order. */
export class WeaponStatusAdapter {
  private readonly mapping = new Map<string, readonly EffectDefinition[]>();
  constructor(
    private readonly statuses: StatusEffects,
    input: OnHitEffectMapping,
  ) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new TypeError('On-hit mapping must be an object.');
    const entries = Object.entries(input).map(([weaponId, definitions]) => {
      id(weaponId, 'weaponId');
      if (!Array.isArray(definitions)) throw new TypeError('On-hit definitions must be an array.');
      return [weaponId, Object.freeze(definitions.map(validateDefinition))] as const;
    });
    for (const [weaponId, definitions] of entries) this.mapping.set(weaponId, definitions);
  }
  consumeImpact(impact: WeaponImpactEvent): HitApplicationResult {
    if (!impact || typeof impact !== 'object' || impact.type !== 'impact')
      throw new TypeError('Expected a WeaponImpactEvent.');
    this.statuses.assertTime(impact.time);
    id(impact.weaponId, 'weaponId');
    id(impact.targetId, 'targetId');
    if (!impact.attack || typeof impact.attack !== 'object')
      throw new TypeError('Impact attack snapshot is required.');
    id(impact.attack.attackerId, 'attackerId');
    id(impact.attack.id, 'attack id');
    if (impact.attack.damageType !== 'physical' && impact.attack.damageType !== 'magical')
      throw new TypeError('Invalid attack damage type.');
    nonNegative(impact.attack.coefficient, 'attack.coefficient');
    nonNegative(impact.attack.baseDamage, 'attack.baseDamage');
    nonNegative(impact.attack.rawDamage, 'attack.rawDamage');
    if (typeof impact.attack.critical !== 'boolean')
      throw new TypeError('attack.critical must be boolean.');

    const result = impact.result;
    if (
      !result ||
      typeof result !== 'object' ||
      !['hit', 'dodged', 'inactive'].includes(result.status)
    )
      throw new TypeError('Invalid impact DamageResult.');
    if (result.targetId !== impact.targetId || result.attackId !== impact.attack.id)
      throw new Error('Impact and DamageResult IDs must match.');
    nonNegative(result.appliedDamage, 'appliedDamage');
    nonNegative(result.damage, 'damage');
    nonNegative(result.previousHp, 'previousHp');
    nonNegative(result.currentHp, 'currentHp');
    if (
      result.appliedDamage > result.previousHp ||
      result.currentHp > result.previousHp ||
      result.appliedDamage !== result.previousHp - result.currentHp
    )
      throw new RangeError('Inconsistent impact HP loss.');
    if (result.status !== 'hit' && result.appliedDamage !== 0)
      throw new RangeError('Only a successful hit may lose HP.');
    // No cleanup or application before the complete hit envelope has been validated.
    this.statuses.isAlive(impact.attack.attackerId);
    const alive = this.statuses.isAlive(impact.targetId);
    this.statuses.validateCombatEvents(result.events);
    const definitions = this.mapping.get(impact.weaponId) ?? [];
    const eligible = result.status === 'hit' && this.hasHpLoss(impact) && alive;
    const applications = eligible
      ? this.statuses.applyBatch(
          definitions.map((definition) => ({
            ...definition,
            targetId: impact.targetId,
            sourceId: impact.attack.attackerId,
            originId: definition.originId ?? impact.weaponId,
          })),
        )
      : Object.freeze([]);
    const events: StatusEvent[] = [...this.statuses.consumeCombatEvents(result.events)];
    for (const application of applications) events.push(...application.events);
    return Object.freeze({ eligible, applications, events: Object.freeze(events) });
  }

  /** Default on-hit eligibility. Specialized integrations can handle prevented HP loss. */
  protected hasHpLoss(impact: WeaponImpactEvent): boolean {
    return impact.result.appliedDamage > 0;
  }
}
