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
    'Мощь',
    '✹',
    'Физический и магический урон',
    'damagePercent',
    [6, 12, 18, 24, 32],
    '%',
  ),
  stat('haste', 'Спешка', '≫', 'Скорость атаки', 'attackSpeed', [8, 16, 24, 32, 42], ' п.'),
  stat('vitality', 'Живучесть', '♡', 'Max HP', 'maxHpPercent', [8, 16, 24, 32, 42], '%'),
  stat('fortitude', 'Стойкость', '⛊', 'Сопротивление', 'resistance', [4, 8, 13, 18, 24], ' п.'),
  stat('precision', 'Точность', '◉', 'Шанс крита', 'criticalChance', [3, 6, 9, 12, 16], ' п.'),
  stat(
    'deadly_strikes',
    'Смертельные удары',
    '✠',
    'Урон крита',
    'criticalDamage',
    [10, 20, 32, 44, 60],
    ' п.',
  ),
  stat(
    'swiftness',
    'Стремительность',
    '➹',
    'Скорость движения',
    'movementSpeed',
    [5, 10, 15, 20, 26],
    ' п.',
  ),
  stat(
    'toxic_mastery',
    'Мастер ядов',
    '⁂',
    'Урон Poison, Burn и Bleed',
    'dotDamagePercent',
    [10, 20, 32, 44, 60],
    '%',
  ),
  stat(
    'lingering_effects',
    'Затяжные эффекты',
    '⧗',
    'Длительность Poison, Burn и Bleed',
    'dotDurationPercent',
    [10, 20, 30, 40, 55],
    '%',
  ),
]);
