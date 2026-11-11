import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateCharacterStats } from '../../src/character-stats';
import { permanentStats } from '../../src/equipment';
import {
  Button,
  CompareList,
  CurrencyBadge,
  ProgressBar,
  compareStats,
  disabledReason,
  formatGold,
  formatStat,
  progressFraction,
  romanRank,
} from '../../src/gameplay-ui/kit';

describe('Task 13 UI kit — compare tooltip values', () => {
  const base = calculateCharacterStats('warrior', 10).combatAttributes;
  it('lists only stats whose displayed value changes, with +/− and green/red direction', () => {
    const after = { ...base, maxHp: base.maxHp + 25, resistance: base.resistance - 2.4 };
    const rows = compareStats(base, after);
    expect(rows.map((r) => [r.key, r.text, r.direction])).toEqual([
      ['maxHp', '+25', 'up'],
      ['resistance', '−2', 'down'],
    ]);
    expect(rows[1].text.charCodeAt(0)).toBe(0x2212); // a real minus sign
  });
  it('rounds at the row precision: a change that rounds to zero is hidden unless all rows are asked', () => {
    const after = {
      ...base,
      criticalChance: base.criticalChance + 0.04,
      attackSpeed: base.attackSpeed + 0.4,
    };
    expect(compareStats(base, after)).toEqual([]);
    const all = compareStats(base, after, { all: true });
    expect(all).toHaveLength(11);
    expect(all.every((r) => r.direction === 'same' && r.text === '±0')).toBe(true);
    const crit = compareStats(base, { ...base, criticalChance: base.criticalChance + 1.26 });
    expect(crit.map((r) => r.text)).toEqual(['+1.3']);
  });
  it('matches the equipment pipeline: equipping a plate shows its HP and resistance gain', () => {
    const progress = { level: 10, talents: {} };
    const loadout = { weapon: 'starter_sword', armor: null, amulet: null, ring: null };
    const before = permanentStats('warrior', progress.level, progress.talents, loadout);
    const after = permanentStats('warrior', progress.level, progress.talents, {
      ...loadout,
      armor: 'plate-t1',
    });
    const rows = compareStats(before, after);
    expect(rows.map((r) => r.key)).toEqual(['maxHp', 'resistance']);
    expect(rows.every((r) => r.direction === 'up')).toBe(true);
    expect(rows[1].text).toBe('+2');
  });
  it('renders the compare list with green/red classes, or the empty text', () => {
    const html = renderToStaticMarkup(
      createElement(CompareList, {
        deltas: compareStats(base, {
          ...base,
          maxHp: base.maxHp + 5,
          resistance: base.resistance - 1,
        }),
        empty: 'Без изменений',
      }),
    );
    expect(html).toContain('class="delta-up"');
    expect(html).toContain('class="delta-down"');
    expect(
      renderToStaticMarkup(createElement(CompareList, { deltas: [], empty: 'Без изменений' })),
    ).toContain('Без изменений');
  });
});

describe('Task 13 UI kit — disabled states and formatting', () => {
  it('disabledReason returns the first failing reason, or null', () => {
    expect(disabledReason([])).toBeNull();
    expect(
      disabledReason([
        [false, 'a'],
        [true, 'Не хватает золота'],
        [true, 'Закрыто'],
      ]),
    ).toBe('Не хватает золота');
    expect(disabledReason([[false, 'a']])).toBeNull();
  });
  it('a Button with a reason is disabled, shows the reason as title and accessible description', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { disabledReason: 'Не хватает золота' }, 'Купить'),
    );
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain('title="Не хватает золота"');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain('class="visually-hidden"');
    const enabled = renderToStaticMarkup(createElement(Button, { disabledReason: null }, 'Купить'));
    expect(enabled).not.toContain('disabled');
    expect(renderToStaticMarkup(createElement(Button, { disabled: true }, 'X'))).toContain(
      'disabled=""',
    );
  });
  it('progress fraction clamps to 0–1 and never divides by zero', () => {
    expect(progressFraction(5, 10)).toBe(0.5);
    expect(progressFraction(15, 10)).toBe(1);
    expect(progressFraction(-1, 10)).toBe(0);
    expect(progressFraction(3, 0)).toBe(0);
    expect(progressFraction(NaN, 10)).toBe(0);
    const html = renderToStaticMarkup(
      createElement(ProgressBar, { label: 'Опыт', value: 30, max: 120 }),
    );
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain('width:25%');
  });
  it('gold, stats and ranks format for display', () => {
    expect(formatGold(2530)).toBe('2 530');
    expect(formatGold(75)).toBe('75');
    expect(formatStat(12.345, 1)).toBe('12.3');
    expect(formatStat(12.5, 0)).toBe('13');
    expect([0, 1, 2, 3].map(romanRank)).toEqual(['', 'I', 'II', 'III']);
    expect(renderToStaticMarkup(createElement(CurrencyBadge, { amount: 2530 }))).toContain(
      'aria-label="Золото: 2530"',
    );
  });
});
