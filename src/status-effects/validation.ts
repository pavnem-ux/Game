import type { EffectApplication, EffectDefinition, EffectType } from './types';
import { EFFECT_TYPES } from './config';
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
export function effectType(value: unknown): asserts value is EffectType {
  if (!EFFECT_TYPES.some((type) => type === value))
    throw new TypeError('effectType must be poison, burn or bleed.');
}
export function validateDefinition(input: EffectDefinition): EffectDefinition {
  if (!input || typeof input !== 'object')
    throw new TypeError('Effect definition must be an object.');
  effectType(input.effectType);
  nonNegative(input.rawDamagePerTick, 'rawDamagePerTick');
  finite(input.duration, 'duration');
  if (input.duration <= 0) throw new RangeError('duration must be positive.');
  nonNegative(input.probabilityPercent, 'probabilityPercent');
  if (input.probabilityPercent > 100)
    throw new RangeError('probabilityPercent must not exceed 100.');
  if (input.originId !== undefined) id(input.originId, 'originId');
  return Object.freeze({
    effectType: input.effectType,
    rawDamagePerTick: input.rawDamagePerTick,
    duration: input.duration,
    probabilityPercent: input.probabilityPercent,
    ...(input.originId === undefined ? {} : { originId: input.originId }),
  });
}
export function validateApplication(input: EffectApplication): EffectApplication {
  const definition = validateDefinition(input);
  id(input.targetId, 'targetId');
  id(input.sourceId, 'sourceId');
  return Object.freeze({ ...definition, targetId: input.targetId, sourceId: input.sourceId });
}
export function booleanResult(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must return boolean.`);
  return value;
}
export function roll(probability: number, random: () => number): boolean {
  const value = random();
  finite(value, 'RNG result');
  if (value < 0 || value >= 1) throw new RangeError('RNG result must be in [0, 1).');
  return value < probability / 100;
}
export function sameTime(a: number, b: number): boolean {
  return Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));
}
