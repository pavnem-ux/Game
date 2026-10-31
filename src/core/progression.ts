import { CLASS } from '../config/game.ts';
import type { Stats, UpgradeId } from './types.ts';
export const freshRanks = (): Record<UpgradeId, number> => ({
  power: 0,
  haste: 0,
  vitality: 0,
  stride: 0,
  magnet: 0,
  multishot: 0,
});
export const xpForLevel = (level: number) =>
  Math.floor(12 + (level - 1) * 8 + (level - 1) ** 1.25 * 2);
export function addExperience(level: number, xp: number, gain: number) {
  let levels = 0;
  xp += gain;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
    levels++;
  }
  return { level, xp, levels };
}
export function calculateStats(level: number, ranks: Record<UpgradeId, number>): Stats {
  const b = CLASS.stats;
  return {
    maxHp: b.maxHp + (level - 1) * CLASS.growth.hp + ranks.vitality * 25,
    armor: b.armor,
    speed: b.speed * (1 + ranks.stride * 0.12),
    damage: (b.damage + (level - 1) * CLASS.growth.damage) * (1 + ranks.power * 0.25),
    interval: Math.max(0.12, b.interval * 0.85 ** ranks.haste),
    pickup: b.pickup * (1 + ranks.magnet * 0.35),
    projectiles: Math.min(6, 1 + ranks.multishot),
  };
}
export const damageAfterArmor = (damage: number, armor: number) =>
  Math.max(1, damage * (100 / (100 + armor * 8)));
export function difficulty(seconds: number) {
  const minutes = seconds / 60;
  return {
    health: 1 + minutes * 0.24,
    speed: 1 + Math.min(1.4, minutes * 0.08),
    damage: 1 + minutes * 0.13,
    spawnInterval: Math.max(0.12, 0.85 / (1 + minutes * 0.3)),
    batch: 1 + Math.floor(minutes / 3),
  };
}
