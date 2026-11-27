import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateCharacterStats } from '../../src/character-stats';
import { defaultLoadout, offerItem, permanentStats } from '../../src/equipment';
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
  // Task 40: an item instance — a Common level-10 armor: +35 HP (10 + 2.5·10), +8 resistance (2 + 0.6·10).
  it('matches the equipment pipeline: equipping an armor shows its HP and resistance gain', () => {
    const progress = { level: 10, talents: {} };
    const armor = offerItem(
      { id: 'armor:common', slot: 'armor', rarity: 'common', itemLevel: 10, stat: null, price: 0 },
      'warrior',
      'i1',
    );
    const loadout = { ...defaultLoadout('warrior') };
    const before = permanentStats('warrior', progress.level, progress.talents, loadout, [armor]);
    const after = permanentStats(
      'warrior',
      progress.level,
      progress.talents,
      { ...loadout, armor: 'i1' },
      [armor],
    );
    const rows = compareStats(before, after);
    expect(rows.map((r) => r.key)).toEqual(['maxHp', 'resistance']);
    expect(rows.every((r) => r.direction === 'up')).toBe(true);
    expect(rows[1].text).toBe('+8');
  });
  it('renders the compare list with green/red classes, or the empty text', () => {
    const html = renderToStaticMarkup(
      createElement(CompareList, {
        deltas: compareStats(base, {
          ...base,
          maxHp: base.maxHp + 5,
          resistance: base.resistance - 1,
        }),
        empty: 'No changes',
      }),
    );
    expect(html).toContain('class="delta-up"');
    expect(html).toContain('class="delta-down"');
    expect(
      renderToStaticMarkup(createElement(CompareList, { deltas: [], empty: 'No changes' })),
    ).toContain('No changes');
  });
});

describe('Task 13 UI kit — disabled states and formatting', () => {
  it('disabledReason returns the first failing reason, or null', () => {
    expect(disabledReason([])).toBeNull();
    expect(
      disabledReason([
        [false, 'a'],
        [true, 'Not enough Gold'],
        [true, 'Locked'],
      ]),
    ).toBe('Not enough Gold');
    expect(disabledReason([[false, 'a']])).toBeNull();
  });
  it('a Button with a reason is disabled, shows the reason as title and accessible description', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { disabledReason: 'Not enough Gold' }, 'Buy'),
    );
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain('title="Not enough Gold"');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain('class="visually-hidden"');
    const enabled = renderToStaticMarkup(createElement(Button, { disabledReason: null }, 'Buy'));
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
      createElement(ProgressBar, { label: 'XP', value: 30, max: 120 }),
    );
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain('width:25%');
  });
  it('gold, stats and ranks format for display', () => {
    expect(formatGold(2530)).toBe('2,530');
    expect(formatGold(75)).toBe('75');
    expect(formatStat(12.345, 1)).toBe('12.3');
    expect(formatStat(12.5, 0)).toBe('13');
    expect([0, 1, 2, 3].map(romanRank)).toEqual(['', 'I', 'II', 'III']);
    expect(renderToStaticMarkup(createElement(CurrencyBadge, { amount: 2530 }))).toContain(
      'aria-label="Gold: 2530"',
    );
  });
});
