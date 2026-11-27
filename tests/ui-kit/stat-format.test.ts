import { describe, expect, it } from 'vitest';
import {
  AFFIX_RULES,
  affixText,
  defaultLoadout,
  statSummary,
  formatStatLine,
  formatStatValue,
  statExplanation,
} from '../../src/equipment';
import type { AffixStat } from '../../src/equipment';
import { mainStatLines } from '../../src/gameplay-ui/item-view';
import { generateItem } from '../../src/equipment';
import { lcgStream } from '../../src/gameplay/rng';
import { petAura } from '../../src/pets';

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

describe('Task 44 — Bag «Stats» totals', () => {
  it('final run-start values with the gear share; no gear → share 0', async () => {
    const { permanentStats } = await import('../../src/equipment');
    const ring = generateItem(lcgStream(5), {
      uid: 'i1',
      slot: 'ring',
      itemLevel: 10,
      rarity: 'rare',
      characterClass: 'mage',
      stats: ['criticalChance', 'goldFindPercent'],
    });
    const loadout = { ...defaultLoadout('mage'), ring: 'i1' };
    const lines = statSummary('mage', 10, {}, loadout, [ring]);
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    const full = permanentStats('mage', 10, {}, loadout, [ring]);
    const bare = permanentStats('mage', 10, {}, null, [ring]);
    expect(by.damage.value).toBeCloseTo(full.magicalDamage, 9);
    expect(by.damage.gear).toBeCloseTo(full.magicalDamage - bare.magicalDamage, 9);
    expect(by.criticalChance.gear).toBeCloseTo(ring.affixes[0].value, 9);
    expect(by.goldFindPercent).toMatchObject({
      value: ring.affixes[1].value,
      gear: ring.affixes[1].value,
    });
    expect(lines.map((l) => l.label)).toEqual([
      'Damage',
      'Max HP',
      'Armor',
      'Attack speed',
      'Crit chance',
      'Crit damage',
      'Cooldown reduction',
      'Dodge',
      'Movement speed',
      'Pickup radius',
      'Run XP',
      'Gold find',
    ]);
    const none = statSummary('mage', 10, {}, defaultLoadout('mage'), []);
    expect(none.filter((l) => l.key !== 'damage' && l.gear !== 0)).toEqual([]);
  });
  it('Task 45: the active pet aura joins the Stats values, reported as its own share', () => {
    const base = statSummary('warrior', 10, {}, defaultLoadout('warrior'), []);
    const aura = petAura('hedgehog', 1);
    const withPet = statSummary('warrior', 10, {}, defaultLoadout('warrior'), [], undefined, aura);
    const armor = (ls: typeof base) => ls.find((l) => l.key === 'resistance')!;
    expect(aura.resistance).toBeGreaterThan(0);
    expect(armor(withPet).value).toBeCloseTo(armor(base).value + aura.resistance, 6);
    expect(armor(withPet).pet).toBeCloseTo(aura.resistance, 6);
    expect(armor(withPet).gear).toBeCloseTo(armor(base).gear, 6);
    expect(base.every((l) => l.pet === 0)).toBe(true);
    const wolf = statSummary('archer', 10, {}, null, [], undefined, petAura('wolf', 3));
    expect(wolf.find((l) => l.key === 'attackSpeed')!.pet).toBeGreaterThan(0);
    expect(wolf.find((l) => l.key === 'movementSpeed')!.pet).toBeGreaterThan(0);
    expect(petAura('kitten', 5)).toEqual({
      resistance: 0,
      attackSpeed: 0,
      movementSpeedPercent: 0,
    });
  });
});
