import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import type { CharacterClass } from '../../src/character-stats';
import {
  SYNERGY_RULES,
  SYNERGY_TAG_LABELS,
  cardSynergyHints,
  getSkill,
  skillUnlocksSynergy,
  skillsForClass,
  synergyOverview,
} from '../../src/skills';
import { arena } from './helpers';

const names = (refs: readonly { name: string }[]) => refs.map((r) => r.name);
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('Skills overview synergy model is derived from the authoritative rules', () => {
  it('every rule has player-facing condition/effect text and labelled prerequisite tags', () => {
    for (const rule of SYNERGY_RULES) {
      expect(rule.condition.length).toBeGreaterThan(10);
      expect(rule.effect.length).toBeGreaterThan(5);
      for (const tag of rule.requiredSkillTags) expect(SYNERGY_TAG_LABELS[tag]).toBeTruthy();
    }
  });
  it('lists the class rules in catalogue order with exactly the class skills that satisfy them', () => {
    for (const c of CHARACTER_CLASSES) {
      const info = synergyOverview(c, []);
      expect(info.map((s) => s.id)).toEqual(
        SYNERGY_RULES.filter((r) => r.characterClass === c).map((r) => r.id),
      );
      for (const s of info) {
        const rule = SYNERGY_RULES.find((r) => r.id === s.id)!;
        const expected = skillsForClass(c)
          .filter((skill) => skill.tags.some((t) => rule.requiredSkillTags.includes(t)))
          .map((skill) => skill.id);
        expect(s.unlockingSkills.map((u) => u.skillId)).toEqual(expected);
        expect(expected.length).toBeGreaterThan(0);
        expect(s.status).toBe('locked');
        expect(s.contributors).toEqual([]);
        expect(s.explanation).toMatch(/^Не хватает:/);
      }
    }
  });
  it('Locked/Available always matches the combat resolver for random acquired-skill sets', () => {
    for (const c of CHARACTER_CLASSES) {
      const random = seeded(c.length * 17);
      for (let trial = 0; trial < 12; trial++) {
        const w = arena(c);
        const pool = skillsForClass(c).map((d) => d.id);
        const wanted = pool.filter(() => random() < 0.25);
        for (const id of wanted)
          try {
            w.grantTestSkill(id, 1);
          } catch {
            // Slot limits may reject some picks; the remaining set is still a valid run.
          }
        const owned = w.getSnapshot().skills.owned.map((o) => o.skillId);
        for (const info of synergyOverview(c, owned)) {
          expect(info.status === 'available').toBe(w.skills.synergies.isEligible(info.id));
          expect(info.unlockingSkills.filter((u) => u.owned).map((u) => u.name)).toEqual(
            info.contributors,
          );
        }
      }
    }
  });
  it('matches the owner examples: Thermal Shock needs an ice skill, Seismic Impact a heavy melee skill', () => {
    const mage = synergyOverview('mage', ['fireball']);
    const thermal = mage.find((s) => s.id === 'thermal_shock')!;
    expect(thermal.status).toBe('locked');
    expect(thermal.requirement).toBe('ледяной навык');
    expect(names(thermal.unlockingSkills)).toEqual([
      'Кольцо льда',
      'Ледяные осколки',
      'Буран',
      'Власть стихий',
    ]);
    expect(thermal.condition).toMatch(/ледяной удар.*Burn/);
    const warrior = synergyOverview('warrior', ['ground_slam']);
    const seismic = warrior.find((s) => s.id === 'seismic_impact')!;
    expect(seismic.status).toBe('available');
    expect(seismic.contributors).toEqual(['Удар о землю']);
    expect(names(seismic.unlockingSkills)).toEqual(['Удар о землю', 'Удар щитом', 'Землетрясение']);
    expect(seismic.explanation).toMatch(/Сработает в бою/);
  });
});

describe('level-up card hints', () => {
  it('a new skill that opens locked rules reports exactly those unlocks', () => {
    expect(names(cardSynergyHints('mage', [], 'frost_nova').unlocks)).toEqual([
      'Термошок',
      'Расколотый лёд',
    ]);
    expect(names(cardSynergyHints('mage', [], 'fireball').unlocks)).toEqual(['Лесной пожар']);
    expect(names(cardSynergyHints('warrior', [], 'shield_bash').unlocks)).toEqual([
      'Сокрушитель черепов',
      'Боевой напор',
      'Сейсмический удар',
    ]);
  });
  it('a new skill feeding an already open rule shows the owned partner instead of a new unlock', () => {
    const h = cardSynergyHints('mage', ['ice_shards'], 'blizzard');
    expect(h.unlocks).toEqual([]);
    expect(h.combinesWith.map((c) => [c.synergy.name, c.ownedSkills])).toEqual([
      ['Термошок', ['Ледяные осколки']],
      ['Расколотый лёд', ['Ледяные осколки']],
    ]);
    const mixed = cardSynergyHints('warrior', ['whirlwind'], 'earthquake');
    expect(names(mixed.unlocks)).toEqual(['Сейсмический удар']);
    expect(mixed.combinesWith.map((c) => c.synergy.name)).toEqual([
      'Сокрушитель черепов',
      'Боевой напор',
    ]);
  });
  it('upgrades of owned skills never claim a new unlock', () => {
    const h = cardSynergyHints('archer', ['toxic_volley'], 'toxic_volley');
    expect(h.unlocks).toEqual([]);
    expect(h.combinesWith).toEqual([]);
    expect(h.alreadyOpened.length).toBeGreaterThan(0);
  });
  it('universal passives and prerequisite-free skills produce no hints', () => {
    for (const c of CHARACTER_CLASSES)
      for (const id of ['power', 'haste', 'vitality', 'precision', 'toxic_mastery']) {
        expect(cardSynergyHints(c, [], id)).toEqual({
          unlocks: [],
          combinesWith: [],
          alreadyOpened: [],
        });
        expect(cardSynergyHints(c, ['power'], id).unlocks).toEqual([]);
      }
    expect(cardSynergyHints('warrior', [], 'war_cry').unlocks).toEqual([]);
  });
  it('hints agree with the resolver before/after choosing the card, for every offer card and after rerolls', () => {
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
            const after = before || skillUnlocksSynergy(rule, getSkill(card.skillId));
            expect(hints.unlocks.some((u) => u.id === rule.id)).toBe(
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
