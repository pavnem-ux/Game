import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import type { CharacterClass } from '../../src/character-stats';
import {
  SYNERGY_RULES,
  cardSynergyHints,
  getSkill,
  skillsForClass,
  synergyOverview,
  synergyUnlocked,
} from '../../src/skills';
import { arena } from './helpers';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('Skills overview synergy model is derived from the pair table', () => {
  it('every rule has player-facing condition/effect text', () => {
    for (const rule of SYNERGY_RULES) {
      expect(rule.condition.length).toBeGreaterThan(10);
      expect(rule.effect.length).toBeGreaterThan(5);
    }
  });
  it('lists the class rules in order with ALL allowed pairs as readable skill names', () => {
    for (const c of CHARACTER_CLASSES) {
      const info = synergyOverview(c, []);
      expect(info.map((s) => s.id)).toEqual(
        SYNERGY_RULES.filter((r) => r.characterClass === c).map((r) => r.id),
      );
      for (const s of info) {
        const rule = SYNERGY_RULES.find((r) => r.id === s.id)!;
        expect(s.pairs.map((p) => p.skills.map((k) => k.skillId))).toEqual(
          rule.unlockPairs.map((p) => [...p]),
        );
        expect(s.pairs.map((p) => p.skills.map((k) => k.name))).toEqual(
          rule.unlockPairs.map((p) => p.map((id) => getSkill(id).name)),
        );
        expect(s.status).toBe('locked');
        expect(s.completedPairs).toEqual([]);
        expect(s.pairs.every((p) => !p.complete && p.missing.length === 2)).toBe(true);
        // No internal tags or IDs leak into player text.
        expect(s.explanation).not.toMatch(/[a-z]+_[a-z]+/);
      }
    }
  });
  it('Locked/Available always matches the combat resolver for random acquired-skill sets', () => {
    for (const c of CHARACTER_CLASSES) {
      const random = seeded(c.length * 17);
      for (let trial = 0; trial < 16; trial++) {
        const w = arena(c);
        for (const d of skillsForClass(c))
          if (random() < 0.35)
            try {
              w.grantTestSkill(d.id, 1);
            } catch {
              // Slot limits may reject some picks; the remaining set is still a valid run.
            }
        const owned = w.getSnapshot().skills.owned.map((o) => o.skillId);
        for (const info of synergyOverview(c, owned)) {
          expect(info.status === 'available').toBe(w.skills.synergies.isEligible(info.id));
          expect(info.completedPairs.length > 0).toBe(info.status === 'available');
        }
      }
    }
  });
  it('marks the completed pair and what is missing (owner examples)', () => {
    const mage = synergyOverview('mage', ['fireball']);
    const thermal = mage.find((s) => s.id === 'thermal_shock')!;
    expect(thermal.status).toBe('locked');
    expect(thermal.pairs[0].missing).toEqual(['Кольцо льда']);
    expect(thermal.explanation).toBe('Не хватает одного навыка: Кольцо льда или Ледяные осколки.');
    const open = synergyOverview('mage', ['fireball', 'frost_nova']);
    const t = open.find((s) => s.id === 'thermal_shock')!;
    expect(t.status).toBe('available');
    expect(t.completedPairs).toEqual(['Огненный шар + Кольцо льда']);
    expect(t.pairs[0].complete).toBe(true);
    expect(t.explanation).toMatch(/^Открыто парой: Огненный шар \+ Кольцо льда\. Сработает в бою/);
    const warrior = synergyOverview('warrior', ['ground_slam']);
    const seismic = warrior.find((s) => s.id === 'seismic_impact')!;
    expect(seismic.status).toBe('locked');
    expect(seismic.explanation).toBe('Не хватает одного навыка: Землетрясение или Удар щитом.');
  });
});

describe('level-up card hints', () => {
  it('a card that completes a pair with an acquired partner reports exactly those unlocks', () => {
    expect(
      cardSynergyHints('mage', ['fireball'], 'frost_nova').unlocks.map((u) => [
        u.synergy.name,
        u.withSkills,
      ]),
    ).toEqual([['Термошок', ['Огненный шар']]]);
    // Toxic Volley + Split Shot is a pair of two rules: both unlock.
    expect(
      cardSynergyHints('archer', ['toxic_volley'], 'split_shot').unlocks.map((u) => u.synergy.id),
    ).toEqual(['toxic_barrage', 'plague_chain']);
  });
  it('a first half of a pair is shown as a half pair with all possible partners, never as an unlock', () => {
    const h = cardSynergyHints('mage', [], 'frost_nova');
    expect(h.unlocks).toEqual([]);
    expect(h.halfPairs.map((x) => [x.synergy.name, x.partners])).toEqual([
      ['Термошок', ['Огненный шар', 'Инферно']],
      ['Расколотый лёд', ['Ледяные осколки', 'Буран']],
    ]);
  });
  it('an already unlocked synergy gets no further hint: one more pair never stacks', () => {
    const h = cardSynergyHints('mage', ['fireball', 'frost_nova'], 'ice_shards');
    expect(h.unlocks.map((u) => u.synergy.id)).toEqual(['shattered_ice']);
    expect(h.halfPairs).toEqual([]);
  });
  it('upgrades of owned skills never claim a new unlock', () => {
    const h = cardSynergyHints('archer', ['toxic_volley', 'multishot'], 'toxic_volley');
    expect(h.unlocks).toEqual([]);
    expect(h.halfPairs).toEqual([]);
    expect(h.alreadyOpened.map((x) => x.id)).toEqual(['toxic_barrage']);
  });
  it('universal passives and skills outside every pair produce no hints', () => {
    for (const c of CHARACTER_CLASSES)
      for (const id of ['power', 'haste', 'vitality', 'precision', 'toxic_mastery']) {
        expect(cardSynergyHints(c, [], id)).toEqual({
          unlocks: [],
          halfPairs: [],
          alreadyOpened: [],
        });
        expect(cardSynergyHints(c, ['power'], id).unlocks).toEqual([]);
      }
    expect(cardSynergyHints('rogue', [], 'shadow_strike').halfPairs).toEqual([]);
  });
  it('hints agree with the resolver for every offer card and after rerolls', () => {
    for (const c of CHARACTER_CLASSES as readonly CharacterClass[]) {
      const w = arena(c, { seed: c.length });
      w.grantTestXp(400);
      let guard = 0;
      while (w.run.currentOffer && guard++ < 12) {
        const owned = w.getSnapshot().skills.owned.map((o) => o.skillId);
        for (const card of w.run.currentOffer.cards) {
          if (card.kind !== 'skill') continue;
          const hints = cardSynergyHints(c, owned, card.skillId);
          for (const rule of SYNERGY_RULES.filter((r) => r.characterClass === c)) {
            const before = w.skills.synergies.isEligible(rule.id);
            const after = synergyUnlocked(rule, [...owned, card.skillId]);
            expect(hints.unlocks.some((u) => u.synergy.id === rule.id)).toBe(
              !before && after && card.isNew,
            );
          }
        }
        if (w.run.currentOffer.rerollAvailable && guard % 2 === 0) w.rerollSkillOffer();
        else {
          const first = w.run.currentOffer.cards[0];
          w.chooseSkill(first.kind === 'skill' ? first.skillId : `bonus:${first.bonusId}`);
        }
      }
    }
  });
});
