import { cumulativeRanks } from '../config';
import type { SkillDefinition, SkillParams } from '../types';

function stat(
  id: string,
  name: string,
  icon: string,
  description: string,
  key: string,
  values: readonly [number, number, number, number, number],
  unit: string,
): SkillDefinition {
  const p = (v: number): SkillParams => ({ [key]: v });
  return Object.freeze({
    id,
    name,
    owner: 'universal',
    kind: 'passive',
    maxRank: 5,
    icon,
    description,
    tags: [],
    targeting: 'none',
    ranks: cumulativeRanks(p(values[0]), p(values[1]), p(values[2]), p(values[3]), p(values[4])),
    rankSummaries: values.map((v, i) => {
      const end = unit.endsWith('.') ? '' : '.';
      return i === 0
        ? `${description} +${v}${unit}${end}`
        : `${description}: +${values[i - 1]}${unit} → +${v}${unit}${end}`;
    }) as unknown as SkillDefinition['rankSummaries'],
  });
}

/** Nine universal passives; per-rank totals are provisional and stack through Character Stats caps. */
export const UNIVERSAL_SKILLS: readonly SkillDefinition[] = Object.freeze([
  stat(
    'power',
    'Power',
    '✹',
    'Physical and magic damage',
    'damagePercent',
    [6, 12, 18, 24, 32],
    '%',
  ),
  stat('haste', 'Haste', '≫', 'Attack speed', 'attackSpeed', [8, 16, 24, 32, 42], ' pts'),
  stat('vitality', 'Vitality', '♡', 'Max HP', 'maxHpPercent', [8, 16, 24, 32, 42], '%'),
  stat('fortitude', 'Fortitude', '⛊', 'Resistance', 'resistance', [4, 8, 13, 18, 24], ' pts'),
  stat('precision', 'Precision', '◉', 'Crit chance', 'criticalChance', [3, 6, 9, 12, 16], ' pts'),
  stat(
    'deadly_strikes',
    'Deadly Strikes',
    '✠',
    'Crit damage',
    'criticalDamage',
    [10, 20, 32, 44, 60],
    ' pts',
  ),
  stat(
    'swiftness',
    'Swiftness',
    '➹',
    'Movement speed',
    'movementSpeed',
    [5, 10, 15, 20, 26],
    ' pts',
  ),
  stat(
    'toxic_mastery',
    'Toxic Mastery',
    '⁂',
    'Poison, Burn and Bleed damage',
    'dotDamagePercent',
    [10, 20, 32, 44, 60],
    '%',
  ),
  stat(
    'lingering_effects',
    'Lingering Effects',
    '⧗',
    'Poison, Burn and Bleed duration',
    'dotDurationPercent',
    [10, 20, 30, 40, 55],
    '%',
  ),
]);
