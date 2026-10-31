import type { CombatEntity, PeriodicDamageRequest } from './types';
import { identifier, nonNegative } from './validation';

/** Validate and detach all attribution before an HP operation can mutate anything. */
export function validatePeriodicRequest(
  request: PeriodicDamageRequest,
  lookup: (id: string) => CombatEntity,
): PeriodicDamageRequest {
  if (!request || typeof request !== 'object')
    throw new TypeError('periodic damage request must be an object.');
  identifier(request.operationId, 'operationId');
  identifier(request.targetId, 'targetId');
  identifier(request.effectId, 'effectId');
  nonNegative(request.rawDamage, 'rawDamage');
  lookup(request.targetId);
  if (!Array.isArray(request.sources) || request.sources.length === 0)
    throw new TypeError('Periodic sources must be a non-empty array.');
  const ids = new Set<string>();
  let total = 0;
  const sources = request.sources.map((source) => {
    if (!source || typeof source !== 'object')
      throw new TypeError('Periodic source must be an object.');
    identifier(source.applicationId, 'applicationId');
    identifier(source.sourceId, 'sourceId');
    if (ids.has(source.applicationId)) throw new Error('Duplicate periodic applicationId.');
    ids.add(source.applicationId);
    if (source.originId !== undefined) identifier(source.originId, 'originId');
    nonNegative(source.rawDamage, 'source.rawDamage');
    lookup(source.sourceId);
    total += source.rawDamage;
    return Object.freeze({
      applicationId: source.applicationId,
      sourceId: source.sourceId,
      ...(source.originId === undefined ? {} : { originId: source.originId }),
      rawDamage: source.rawDamage,
    });
  });
  nonNegative(total, 'aggregate source damage');
  if (
    Math.abs(total - request.rawDamage) >
    Number.EPSILON * 8 * Math.max(1, total, request.rawDamage)
  )
    throw new RangeError('Periodic rawDamage must match the sum of source contributions.');
  return Object.freeze({
    operationId: request.operationId,
    targetId: request.targetId,
    effectId: request.effectId,
    rawDamage: request.rawDamage,
    sources: Object.freeze(sources),
  });
}
