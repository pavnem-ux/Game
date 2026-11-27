import { COMBAT_ATTRIBUTE_CAPS } from '../character-stats';
import { AFFIX_RULES } from './config';
import type { AffixStat } from './config';

/**
 * Task 44: the one formatter for stat values shown to the player (no rule or number changes).
 * Every percent-like stat is shown with «%» (never «pp» or a bare number); flat main stats are
 * plain numbers («Damage +14», «HP +60», «Armor +20»). Each stat has a one-line explanation and,
 * where one exists, its cap.
 */
export type MainStatKey = 'physicalDamage' | 'magicalDamage' | 'maxHp' | 'resistance';
export type StatKey = AffixStat | MainStatKey;

interface StatInfo {
  readonly label: string;
  readonly unit: string;
  readonly decimals: number;
  readonly explain: string;
  /** The central cap of the final value (percent), shown with the explanation. */
  readonly cap?: number;
}
const MAIN: Readonly<Record<MainStatKey, StatInfo>> = Object.freeze({
  physicalDamage: {
    label: 'Damage',
    unit: '',
    decimals: 1,
    explain: 'Flat damage added to every hit.',
  },
  magicalDamage: {
    label: 'Damage',
    unit: '',
    decimals: 1,
    explain: 'Flat damage added to every hit.',
  },
  maxHp: { label: 'HP', unit: '', decimals: 1, explain: 'More maximum health.' },
  resistance: { label: 'Armor', unit: '', decimals: 1, explain: 'Reduces damage you take.' },
});
const EXPLAIN: Readonly<Record<AffixStat, string>> = Object.freeze({
  physicalDamagePercent: "More damage of your class's type.",
  magicalDamagePercent: "More damage of your class's type.",
  damagePercent: 'More damage from all your hits.',
  attackSpeed: 'Attack this much faster.',
  criticalChance: 'Added to your chance to land a critical hit.',
  criticalDamage: 'Critical hits deal this much more.',
  cooldownReduction: 'Skills recharge faster.',
  eliteDamagePercent: 'More damage to elites and bosses.',
  areaSizePercent: 'Larger areas for your attacks and skills.',
  maxHpPercent: 'More maximum health.',
  hpRegenPercent: 'Heal this share of max HP every second.',
  dodgeChance: 'Added to your chance to avoid a hit.',
  movementSpeedPercent: 'Move faster.',
  pickupRadiusPercent: 'Collect crystals and coins from farther away.',
  runXpPercent: 'More experience from crystals during a run.',
  goldFindPercent: 'More Gold from coins (up to 25% from gear).',
});
const CAPS: Partial<Record<StatKey, number>> = {
  criticalChance: COMBAT_ATTRIBUTE_CAPS.criticalChance,
  cooldownReduction: COMBAT_ATTRIBUTE_CAPS.cooldownReduction,
  dodgeChance: COMBAT_ATTRIBUTE_CAPS.dodgeChance,
};
export function statInfo(key: StatKey): StatInfo {
  if (key in MAIN) return MAIN[key as MainStatKey];
  const r = AFFIX_RULES[key as AffixStat];
  const cap = CAPS[key];
  return {
    label: r.label,
    unit: r.unit,
    decimals: r.decimals,
    explain: EXPLAIN[key as AffixStat],
    ...(cap !== undefined ? { cap } : {}),
  };
}
/** A number at most `decimals` places, without trailing zeros («12», «3.2», «0.36»). */
export function statNumber(value: number, decimals = 1): string {
  const p = 10 ** decimals;
  const r = Math.round(value * p) / p;
  return Number.isInteger(r) ? String(r) : r.toFixed(decimals).replace(/0+$/, '');
}
/** «+3.2%», «+14», «−2%» (U+2212 minus), «+0.36% max HP / s». */
export function formatStatValue(key: StatKey, value: number, decimals?: number): string {
  const info = statInfo(key);
  const sign = value < 0 ? '−' : '+';
  return `${sign}${statNumber(Math.abs(value), decimals ?? info.decimals)}${info.unit}`;
}
/** «Crit chance +3.2%», «Armor +20». */
export const formatStatLine = (key: StatKey, value: number) =>
  `${statInfo(key).label} ${formatStatValue(key, value)}`;
/** The one-line explanation, with the cap where one exists: «Crit chance (max 75%): …». */
export function statExplanation(key: StatKey): string {
  const info = statInfo(key);
  return `${info.label}${info.cap !== undefined ? ` (max ${info.cap}%)` : ''}: ${info.explain}`;
}
