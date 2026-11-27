import { describe, expect, it } from 'vitest';
import {
  EquipmentError,
  RARITY_CONFIG,
  affixMax,
  generateItem,
  reforgeChoices,
  reforgeCost,
  reforgeItem,
  validateItem,
} from '../../src/equipment';
import type { Rarity } from '../../src/equipment';
import { lcgStream } from '../../src/gameplay/rng';
import { createProfile, grantItem, reforgeProfileItem } from '../../src/profile';

const item = (rarity: Rarity, itemLevel = 25) =>
  generateItem(lcgStream(7), {
    uid: 'i1',
    slot: 'gloves',
    rarity,
    itemLevel,
    characterClass: 'warrior',
  });

/** Task 42 §4 — reforge (provisional numbers). */
describe('Task 42 — reforge', () => {
  it('cost = base × max(0.2, L/50) × 1.25^n (Rare 300 / Epic 450 / Legendary 600)', () => {
    expect(reforgeCost(item('rare', 25))).toBe(150);
    expect(reforgeCost(item('epic', 50))).toBe(450);
    expect(reforgeCost(item('legendary', 1))).toBe(120); // the 0.2 floor
    expect(reforgeCost({ ...item('rare', 50), reforges: 2 })).toBe(Math.round(300 * 1.25 ** 2));
    expect(() => reforgeCost(item('uncommon'))).toThrow(RangeError);
  });
  it('replaces the picked stat with a new one from the pool, rolled in the rarity range', () => {
    const it0 = item('epic');
    const target = it0.affixes[1].stat;
    for (let seed = 1; seed <= 50; seed++) {
      const r = reforgeItem(lcgStream(seed), it0, target, 'warrior');
      expect(validateItem(r)).toEqual(r);
      expect(r.reforges).toBe(1);
      expect(r.affixes[0]).toEqual(it0.affixes[0]);
      expect(r.affixes[2]).toEqual(it0.affixes[2]);
      const fresh = r.affixes[1];
      expect(reforgeChoices(it0, 'warrior')).toContain(fresh.stat);
      expect(it0.affixes.map((a) => a.stat)).not.toContain(fresh.stat);
      const share = fresh.value / affixMax(fresh.stat, 25);
      expect(share).toBeGreaterThanOrEqual(RARITY_CONFIG.epic.rollMin - 0.05);
      expect(share).toBeLessThanOrEqual(1 + 1e-9);
    }
    const legendary = { ...item('legendary'), legendaryId: 'future-effect' };
    expect(
      reforgeItem(lcgStream(1), legendary, legendary.affixes[0].stat, 'warrior').legendaryId,
    ).toBe('future-effect');
    expect(() => reforgeItem(lcgStream(1), it0, 'goldFindPercent', 'warrior')).toThrow(RangeError);
  });
  it('on the profile: Gold paid, count saved, deterministic for the same state; refusals change nothing', () => {
    let p = { ...createProfile('rf', '2026-11-27T00:00:00.000Z'), gold: 10_000 };
    p = grantItem(p, { slot: 'ring', rarity: 'rare', itemLevel: 50, characterClass: 'mage' });
    p = grantItem(p, { slot: 'ring', rarity: 'uncommon', itemLevel: 5, characterClass: 'mage' });
    const stat = p.items[0].affixes[0].stat;
    const a = reforgeProfileItem(p, 'i1', stat, 'mage');
    expect(a).toEqual(reforgeProfileItem(p, 'i1', stat, 'mage'));
    expect(a.gold).toBe(10_000 - 300);
    expect(a.items[0].reforges).toBe(1);
    expect(reforgeCost(a.items[0])).toBe(375);
    const reason = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as EquipmentError).reason;
      }
      return null;
    };
    expect(reason(() => reforgeProfileItem(p, 'i2', p.items[1].affixes[0].stat, 'mage'))).toBe(
      'not-eligible',
    );
    expect(reason(() => reforgeProfileItem(p, 'i9', stat, 'mage'))).toBe('not-owned');
    expect(reason(() => reforgeProfileItem({ ...p, gold: 299 }, 'i1', stat, 'mage'))).toBe('gold');
  });
});
