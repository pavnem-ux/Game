/** Usage-boundary helpers: percentage inputs are finalized human-readable percentages.
 * These functions neither add base values nor roll RNG nor apply gameplay effects.
 */
const PERCENT = 100;

export function applyResistance(incomingDamage: number, resistance: number): number {
  return (incomingDamage * PERCENT) / (PERCENT + resistance);
}

export function calculateCriticalDamage(ordinaryDamage: number, criticalDamage: number): number {
  return ordinaryDamage * (criticalDamage / PERCENT);
}

export function scaleAttackFrequency(
  weaponBaseAttackFrequency: number,
  attackSpeed: number,
): number {
  return weaponBaseAttackFrequency * (attackSpeed / PERCENT);
}

export function scaleMovementSpeed(baseMovementSpeed: number, movementSpeed: number): number {
  return baseMovementSpeed * (movementSpeed / PERCENT);
}

export function scaleCooldown(baseCooldown: number, cooldownReduction: number): number {
  return baseCooldown * (1 - cooldownReduction / PERCENT);
}

/** Area Size scales the radius of a circular damaging AoE, never ranges or projectile travel. */
export function scaleCircularAoeRadius(baseRadius: number, areaSize: number): number {
  return baseRadius * (areaSize / PERCENT);
}
