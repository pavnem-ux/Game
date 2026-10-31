import type { CombatCore, CombatEvent, DamageResult, DeathEvent } from '../combat-core';
export function finite(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new RangeError(`${name} must be finite.`);
}
export function nonNegative(value: unknown, name: string): asserts value is number {
  finite(value, name);
  if (value < 0) throw new RangeError(`${name} must be non-negative.`);
}
export function id(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim())
    throw new TypeError(`${name} must be a non-empty identifier.`);
}
export function sameTime(a: number, b: number) {
  return Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));
}
export function validateEvents(events: readonly CombatEvent[], core: CombatCore): void {
  if (!Array.isArray(events)) throw new TypeError('Combat events must be an array.');
  for (const event of events) {
    if (
      !event ||
      typeof event !== 'object' ||
      ![
        'damage',
        'dodge',
        'death',
        'healing',
        'max-hp-changed',
        'periodic-damage',
        'revived',
      ].includes(event.type)
    )
      throw new TypeError('Invalid CombatEvent.');
    if (event.type === 'death') {
      id(event.entityId, 'death.entityId');
      id(event.attackId, 'death.attackId');
      id(event.sourceId, 'death.sourceId');
      core.getEntity(event.entityId);
      core.getEntity(event.sourceId);
    }
  }
}
export function validateDirectResult(result: DamageResult, core: CombatCore): void {
  if (
    !result ||
    typeof result !== 'object' ||
    !['hit', 'dodged', 'inactive'].includes(result.status)
  )
    throw new TypeError('Expected a direct DamageResult.');
  id(result.attackId, 'attackId');
  id(result.targetId, 'targetId');
  core.getEntity(result.targetId);
  for (const key of ['damage', 'appliedDamage', 'previousHp', 'currentHp'] as const)
    nonNegative(result[key], key);
  if (
    result.currentHp > result.previousHp ||
    result.appliedDamage !== result.previousHp - result.currentHp
  )
    throw new RangeError('Inconsistent direct HP loss.');
  if (result.status !== 'hit' && result.appliedDamage !== 0)
    throw new RangeError('Only a hit can lose HP.');
  validateEvents(result.events, core);
  if (
    result.events.some(
      (event) => event.type !== 'damage' && event.type !== 'dodge' && event.type !== 'death',
    )
  )
    throw new TypeError('Periodic damage is not a direct hit.');
  for (const event of result.events) {
    if (event.type === 'damage' || event.type === 'dodge') {
      if (event.targetId !== result.targetId || event.attackId !== result.attackId)
        throw new Error('Direct event identity mismatch.');
    }
    if (
      event.type === 'death' &&
      (event.entityId !== result.targetId || event.attackId !== result.attackId)
    )
      throw new Error('Direct death identity mismatch.');
  }
  if (
    result.appliedDamage > 0 &&
    !result.events.some(
      (event) => event.type === 'damage' && event.appliedDamage === result.appliedDamage,
    )
  )
    throw new Error('A positive direct result must include its real damage event.');
}
export function deathKey(event: { entityId: string; sourceId: string; attackId: string }) {
  return JSON.stringify([event.entityId, event.sourceId, event.attackId]);
}

export function immutableDeath(event: DeathEvent): DeathEvent {
  const periodic = event.periodic;
  if (periodic) {
    id(periodic.effectId, 'periodic.effectId');
    if (!Array.isArray(periodic.sources) || periodic.sources.length === 0)
      throw new TypeError('Periodic death sources are required.');
    for (const source of periodic.sources) {
      id(source.applicationId, 'applicationId');
      id(source.sourceId, 'sourceId');
      nonNegative(source.rawDamage, 'rawDamage');
      if (source.originId !== undefined) id(source.originId, 'originId');
    }
  }
  return Object.freeze({
    type: 'death',
    entityId: event.entityId,
    sourceId: event.sourceId,
    attackId: event.attackId,
    ...(periodic
      ? {
          periodic: Object.freeze({
            effectId: periodic.effectId,
            sources: Object.freeze(periodic.sources.map((source) => Object.freeze({ ...source }))),
          }),
        }
      : {}),
  });
}
