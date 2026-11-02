import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import type { CharacterClass } from '../../src/character-stats';
import { talentPoints } from '../../src/profile';
import {
  TALENT_CONFIG,
  TalentRuleError,
  availableTalentPoints,
  checkPurchase,
  purchaseRank,
  spentTalentPoints,
  superpowerActive,
  validateTalentRanks,
} from '../../src/talents';
import type { TalentNode, TalentRanks } from '../../src/talents';

/** Ranks that satisfy every prerequisite of `node` (previous nodes at rank II). */
function prerequisitesFor(node: TalentNode): TalentRanks {
  const ranks: Record<string, number> = {};
  for (let n = node; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!) ranks[n.requires] = 2;
  return ranks;
}

describe('Task 09 §1.1 tree rules', () => {
  it('4 classes × 3 branches × all nodes × ranks I–III: each rank buys once, never above III', () => {
    let checked = 0;
    for (const cls of CHARACTER_CLASSES)
      for (const branch of TALENT_CONFIG.branchesOf(cls))
        for (const node of branch.nodes) {
          let ranks = prerequisitesFor(node);
          for (const rank of [1, 2, 3]) {
            const check = checkPurchase(cls, 50, ranks, node.id);
            expect(check, `${node.id} rank ${rank}`).toEqual({ ok: true, nextRank: rank });
            ranks = purchaseRank(cls, 50, ranks, node.id);
            expect(ranks[node.id]).toBe(rank);
            checked++;
          }
          expect(checkPurchase(cls, 50, ranks, node.id)).toEqual({ ok: false, reason: 'max-rank' });
          expect(() => purchaseRank(cls, 50, ranks, node.id)).toThrow(TalentRuleError);
        }
    expect(checked).toBe(168);
  });
  it('the next node needs the previous one at rank II; rank III is optional', () => {
    const cls: CharacterClass = 'rogue';
    let ranks: TalentRanks = {};
    expect(checkPurchase(cls, 50, ranks, 'rogue.b1.n02')).toEqual({
      ok: false,
      reason: 'prerequisite',
    });
    ranks = purchaseRank(cls, 50, ranks, 'rogue.b1.n01');
    expect(checkPurchase(cls, 50, ranks, 'rogue.b1.n02').ok).toBe(false); // rank I is not enough
    ranks = purchaseRank(cls, 50, ranks, 'rogue.b1.n01');
    expect(checkPurchase(cls, 50, ranks, 'rogue.b1.n02').ok).toBe(true); // rank II opens it
    ranks = purchaseRank(cls, 50, ranks, 'rogue.b1.n02');
    ranks = purchaseRank(cls, 50, ranks, 'rogue.b1.n02');
    expect(checkPurchase(cls, 50, ranks, 'rogue.b1.n03').ok).toBe(true); // n01 rank III not needed
    // Branches are independent: branch 2 node 1 needs nothing from branch 1.
    expect(checkPurchase(cls, 1, {}, 'rogue.b2.n01')).toEqual({ ok: false, reason: 'no-points' });
    expect(checkPurchase(cls, 2, {}, 'rogue.b2.n01').ok).toBe(true);
  });
  it('points are derived from level, spent = ranks, and never go negative', () => {
    for (let level = 1; level <= 50; level++) {
      expect(availableTalentPoints(level, {})).toBe(talentPoints(level));
      expect(availableTalentPoints(level, {})).toBeGreaterThanOrEqual(0);
    }
    expect(talentPoints(50)).toBe(26);
    expect(talentPoints(30) - talentPoints(29)).toBe(2); // even level + bonus at 30
    let ranks: TalentRanks = {};
    for (let i = 0; i < 1; i++) ranks = purchaseRank('mage', 2, ranks, 'mage.b1.n01');
    expect(spentTalentPoints(ranks)).toBe(1);
    expect(availableTalentPoints(2, ranks)).toBe(0);
    expect(checkPurchase('mage', 2, ranks, 'mage.b1.n01')).toEqual({
      ok: false,
      reason: 'no-points',
    });
    // An over-spent tree (only possible through bad data) reports 0, and validation rejects it.
    expect(availableTalentPoints(2, { 'mage.b1.n01': 3 })).toBe(0);
    expect(validateTalentRanks('mage', 2, { 'mage.b1.n01': 3 }).ok).toBe(false);
  });
  it('branch 3 opens at permanent level 30 (not before), with enough points', () => {
    for (const cls of CHARACTER_CLASSES) {
      const id = `${cls}.b3.n01`;
      expect(checkPurchase(cls, 29, {}, id)).toEqual({ ok: false, reason: 'level' });
      expect(checkPurchase(cls, 30, {}, id)).toEqual({ ok: true, nextRank: 1 });
    }
  });
  it('the superpower is inactive until rank I of the branch-3 first node is bought', () => {
    for (const cls of CHARACTER_CLASSES) {
      expect(superpowerActive(cls, {})).toBe(false);
      // Level 30 alone (or other branches maxed) does not activate it.
      expect(superpowerActive(cls, { [`${cls}.b1.n01`]: 3, [`${cls}.b2.n01`]: 3 })).toBe(false);
      const ranks = purchaseRank(cls, 30, {}, `${cls}.b3.n01`);
      expect(superpowerActive(cls, ranks)).toBe(true);
    }
  });
  it('class trees are independent: another class node cannot be bought or stored', () => {
    expect(checkPurchase('warrior', 50, {}, 'mage.b1.n01')).toEqual({
      ok: false,
      reason: 'wrong-class',
    });
    expect(checkPurchase('warrior', 50, {}, 'nope.b1.n01')).toEqual({
      ok: false,
      reason: 'unknown-node',
    });
    expect(validateTalentRanks('warrior', 50, { 'mage.b1.n01': 1 }).ok).toBe(false);
    const mage = purchaseRank('mage', 50, {}, 'mage.b1.n01');
    expect(superpowerActive('warrior', mage)).toBe(false);
  });
  it('validation: known ids, whole ranks 0–3, prerequisites, level gate, spent ≤ earned', () => {
    const ok = validateTalentRanks('archer', 30, {
      'archer.b1.n01': 2,
      'archer.b1.n02': 3,
      'archer.b3.n01': 1,
      'archer.b2.n01': 0,
    });
    expect(ok).toEqual({
      ok: true,
      ranks: { 'archer.b1.n01': 2, 'archer.b1.n02': 3, 'archer.b3.n01': 1 },
    });
    for (const bad of [
      null,
      [],
      'x',
      { 'archer.b1.n01': 4 },
      { 'archer.b1.n01': -1 },
      { 'archer.b1.n01': 1.5 },
      { 'archer.b1.n01': '2' },
      { 'archer.b9.n01': 1 },
      { 'archer.b1.n02': 1 }, // missing prerequisite
      { 'archer.b1.n01': 1, 'archer.b1.n02': 1 }, // prerequisite only at rank I
    ])
      expect(validateTalentRanks('archer', 30, bad).ok, JSON.stringify(bad)).toBe(false);
    // Level gate: branch 3 is invalid below level 30.
    expect(validateTalentRanks('archer', 29, { 'archer.b3.n01': 1 }).ok).toBe(false);
    expect(validateTalentRanks('archer', 30, { 'archer.b3.n01': 1 }).ok).toBe(true);
    expect(validateTalentRanks('archer', 1, {}).ok).toBe(true);
  });
});
