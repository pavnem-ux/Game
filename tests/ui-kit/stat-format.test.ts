import { describe, expect, it } from 'vitest';
import {
  AFFIX_RULES,
  affixText,
  formatStatLine,
  formatStatValue,
  statExplanation,
} from '../../src/equipment';
import type { AffixStat } from '../../src/equipment';
import { mainStatLines } from '../../src/gameplay-ui/item-view';
import { generateItem } from '../../src/equipment';
import { lcgStream } from '../../src/gameplay/rng';

/** Task 44 — one stat formatter: «%» everywhere, flat main stats plain, explanations with caps. */
describe('Task 44 — readable stats', () => {
  it('every secondary stat is shown with «%» (never «pp» or a bare number)', () => {
    for (const stat of Object.keys(AFFIX_RULES) as AffixStat[]) {
      const text = formatStatValue(stat, 3.2);
      expect(text, stat).toMatch(/^\+3\.2%( max HP \/ s)?$/);
      expect(affixText({ stat, value: 3.2 })).not.toMatch(/\bpp\b/);
    }
    expect(formatStatValue('criticalChance', 3.2)).toBe('+3.2%');
    expect(formatStatValue('attackSpeed', 3.4)).toBe('+3.4%');
    expect(formatStatValue('hpRegenPercent', 0.36)).toBe('+0.36% max HP / s');
    expect(formatStatValue('dodgeChance', -2)).toBe('−2%');
  });
  it('flat main stats stay plain numbers; resistance is «Armor»', () => {
    expect(formatStatLine('physicalDamage', 14)).toBe('Damage +14');
    expect(formatStatLine('maxHp', 60)).toBe('HP +60');
    expect(formatStatLine('resistance', 20)).toBe('Armor +20');
    const armor = generateItem(lcgStream(1), {
      uid: 'i1',
      slot: 'armor',
      itemLevel: 12,
      rarity: 'common',
      characterClass: 'warrior',
    });
    expect(mainStatLines(armor, 'warrior')).toEqual(['HP +40', 'Armor +9']);
  });
  it('each stat explains itself; capped stats show the cap', () => {
    expect(statExplanation('criticalChance')).toBe(
      'Crit chance (max 75%): Added to your chance to land a critical hit.',
    );
    expect(statExplanation('cooldownReduction')).toContain('(max 50%)');
    expect(statExplanation('dodgeChance')).toContain('(max 60%)');
    expect(statExplanation('resistance')).toBe('Armor: Reduces damage you take.');
    expect(statExplanation('goldFindPercent')).toContain('up to 25% from gear');
    for (const stat of Object.keys(AFFIX_RULES) as AffixStat[])
      expect(statExplanation(stat).length).toBeGreaterThan(10);
  });
});
