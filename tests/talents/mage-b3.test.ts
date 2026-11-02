import { describe, expect, it } from 'vitest';
import { scaleCooldown } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import type { AttackSnapshot } from '../../src/combat-core';
import { RunSkills, SKILL_RULES } from '../../src/skills';
import type { CombatTag } from '../../src/skills';
import { TALENT_CONFIG } from '../../src/talents';
import type { TalentRanks } from '../../src/talents';
import { stationaryMelee } from '../skills/helpers';

function mage(ranks: TalentRanks) {
  const full: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const node = TALENT_CONFIG.nodes.get(id)!;
    for (let n = node; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!)
      full[n.requires] = Math.max(full[n.requires] ?? 0, 2);
    full[id] = Math.max(full[id] ?? 0, rank);
  }
  const w = new GameplayWorld({
    characterClass: 'mage',
    level: 50,
    seed: 5,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    talents: { ranks: full },
  });
  w.setTestProtection(true);
  return w;
}
const FIVE = ['fireball', 'flame_burst', 'inferno', 'frost_nova', 'ice_shards'] as const;
/** Acquire five actives; the 5th (ice_shards) is enhanced by default. */
function five(w: GameplayWorld) {
  for (const id of FIVE) w.grantTestSkill(id, 1);
}
function durable(w: GameplayWorld, distance: number, angle = 0) {
  const id = w.spawnEnemy('melee', distance, angle, stationaryMelee);
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  w.core.heal(id, 1e9);
  return id;
}
const tags = (...t: CombatTag[]) => new Set<CombatTag>(t);
const SKILL = tags('skill', 'magical', 'projectile');
const attack = (critical = false): AttackSnapshot =>
  ({
    id: 'attack-x',
    attackerId: 'player',
    damageType: 'magical',
    coefficient: 1,
    baseDamage: 10,
    critical,
    rawDamage: critical ? 20 : 10,
  }) as AttackSnapshot;
const inSource = <T>(w: GameplayWorld, source: string | null, run: () => T): T => {
  const previous = w.skills.currentSource();
  w.skills.setSource(source);
  try {
    return run();
  } finally {
    w.skills.setSource(previous);
  }
};
const m = (w: GameplayWorld, skill: string, crit = false) =>
  inSource(w, `skill:${skill}`, () =>
    w.skills.talentCombat.hitMultiplier(attack(crit), durable(w, 900), SKILL),
  );
const dotOf = (w: GameplayWorld, skill: string) =>
  inSource(
    w,
    `skill:${skill}`,
    () =>
      w.skills.playerEffect({
        effectType: 'poison',
        rawDamagePerTick: 10,
        duration: 4,
        probabilityPercent: 100,
      }).rawDamagePerTick,
  );
const areaOf = (w: GameplayWorld, skill: string) =>
  inSource(w, `skill:${skill}`, () => w.skills.area(100));

describe('Task 09.1 Phase 5 — Mage · Верховный маг (b3, C1)', () => {
  it('3.1 superpower: one extra real active slot (5); without it the 5th active is refused', () => {
    const plain = mage({});
    for (const id of FIVE.slice(0, 4)) plain.grantTestSkill(id, 1);
    expect(plain.getSnapshot().skills.slots.auto.max).toBe(SKILL_RULES.autoSlots);
    expect(() => plain.grantTestSkill('ice_shards', 1)).toThrow(/No free slot/);
    expect(plain.getSnapshot().skills.enhancedSkillId).toBeNull();
    const w = mage({ 'mage.b3.n01': 1 });
    expect(w.getSnapshot().skills.slots.auto.max).toBe(5);
    for (const id of FIVE.slice(0, 4)) w.grantTestSkill(id, 1);
    expect(w.getSnapshot().skills.enhancedSkillId).toBeNull(); // 5th slot empty → no enhanced
    w.grantTestSkill('ice_shards', 1);
    expect(w.getSnapshot().skills.slots.auto).toEqual({ used: 5, max: 5 });
    expect(() => w.grantTestSkill('blizzard', 1)).toThrow(/No free slot/);
  });
  it('C1: the 5th active is enhanced by default; a one-time choice among the five pauses the world', () => {
    const w = mage({ 'mage.b3.n01': 1 });
    five(w);
    const s = w.getSnapshot().skills;
    expect(s.enhancedSkillId).toBe('ice_shards');
    expect(s.enhancedChoice).toEqual([...FIVE]);
    expect(w.paused).toBe(true);
    const t = w.time;
    w.update(1);
    expect(w.time).toBe(t); // frozen until the choice
    expect(() => w.chooseEnhancedSkill('blizzard')).toThrow(/five/);
    w.chooseEnhancedSkill('fireball');
    expect(w.getSnapshot().skills.enhancedSkillId).toBe('fireball');
    expect(w.getSnapshot().skills.enhancedChoice).toBeNull();
    expect(w.paused).toBe(false);
    expect(() => w.chooseEnhancedSkill('inferno')).toThrow(/No enhanced-skill choice/);
    const events = w
      .getEvents()
      .filter((e) => e.event.type === 'enhanced-skill')
      .map((e) => e.event);
    expect(events).toEqual([
      { type: 'enhanced-skill', skillId: 'ice_shards', reason: 'default' },
      { type: 'enhanced-skill', skillId: 'fireball', reason: 'chosen' },
    ]);
  });
  it('C1: the slot is filled from the existing Task 07 pool through ordinary level-up offers', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const run = new RunSkills('mage', random);
    run.enableExtraAutoSlot();
    for (const id of FIVE.slice(0, 4)) run.grantForTesting(id, 1);
    let picked: string | null = null;
    for (let i = 0; i < 50 && !picked; i++) {
      run.queueLevelUps(1);
      const card = run.currentOffer!.cards.find(
        (c) => c.kind === 'skill' && c.isNew && c.skillKind === 'auto',
      );
      const key = card
        ? card.kind === 'skill'
          ? card.skillId
          : ''
        : run.currentOffer!.cards[0].kind === 'skill'
          ? (run.currentOffer!.cards[0] as { skillId: string }).skillId
          : `bonus:${(run.currentOffer!.cards[0] as { bonusId: string }).bonusId}`;
      const { events } = run.choose(key);
      if (card) {
        picked = key;
        expect(events).toContainEqual({ type: 'enhanced-skill', skillId: key, reason: 'default' });
      }
    }
    expect(picked).not.toBeNull();
    expect(run.enhancedSkillId).toBe(picked);
    expect(run.getState().slots.auto).toEqual({ used: 5, max: 5 });
    // Slots are now full: no further new active is ever offered.
    for (let i = 0; i < 20; i++) {
      run.queueLevelUps(1);
      for (const c of run.currentOffer!.cards)
        if (c.kind === 'skill' && c.skillKind === 'auto') expect(c.isNew).toBe(false);
      const c0 = run.currentOffer!.cards[0];
      run.choose(c0.kind === 'skill' ? c0.skillId : `bonus:${c0.bonusId}`);
    }
    expect(() => new RunSkills('mage', random).enableExtraAutoSlot()).not.toThrow();
    expect(() => run.enableExtraAutoSlot()).toThrow(/fixed/);
  });
  it('3.1 II/III: the enhanced skill’s direct damage +8/+15%; other skills unchanged', () => {
    for (const [rank, bonus] of [
      [1, 1],
      [2, 1.08],
      [3, 1.15],
    ] as const) {
      const w = mage({ 'mage.b3.n01': rank });
      expect(m(w, 'ice_shards')).toBe(1); // no enhanced skill yet
      five(w);
      expect(m(w, 'ice_shards')).toBeCloseTo(bonus, 10);
      expect(m(w, 'fireball')).toBe(1);
      expect(
        w.skills.talentCombat.hitMultiplier(attack(), durable(w, 900), tags('basic', 'magical')),
      ).toBe(1);
    }
  });
  it('3.2 Усиленный канал: enhanced AoE radius +5/10/15%; its DoT +8/+15% (II/III)', () => {
    for (const [rank, area, dot] of [
      [1, 1.05, 1],
      [2, 1.1, 1.08],
      [3, 1.15, 1.15],
    ] as const) {
      const w = mage({ 'mage.b3.n02': rank });
      five(w);
      const base = areaOf(w, 'fireball') / 1; // not enhanced (no Mage b1 talents)
      expect(areaOf(w, 'ice_shards')).toBeCloseTo(base * area, 10);
      expect(dotOf(w, 'ice_shards')).toBeCloseTo(10 * dot, 10);
      expect(dotOf(w, 'fireball')).toBe(10);
    }
  });
  it('3.3 Глубокая практика (+3.1 III): enhanced CD ×(1 − 5/10/15%) after CDR; other skills unchanged', () => {
    for (const [ranks, mult] of [
      [{ 'mage.b3.n03': 1 }, 0.95],
      [{ 'mage.b3.n03': 2 }, 0.9],
      [{ 'mage.b3.n03': 3 }, 0.85],
      [{ 'mage.b3.n01': 3 }, 0.95],
      [{ 'mage.b3.n01': 3, 'mage.b3.n03': 3 }, 0.8],
    ] as const) {
      const w = mage(ranks);
      five(w);
      expect(w.skills.talentCombat.cooldownMultiplier('ice_shards')).toBeCloseTo(mult, 10);
      expect(w.skills.talentCombat.cooldownMultiplier('fireball')).toBe(1);
    }
    // End to end: the real cooldown that starts after an enhanced activation.
    const w = mage({ 'mage.b3.n03': 3 });
    five(w);
    w.chooseEnhancedSkill('frost_nova');
    durable(w, 60);
    let seq = 0;
    const at: Record<string, number> = {};
    for (let i = 0; i < 200 && !(at.frost_nova !== undefined && at.fireball !== undefined); i++) {
      w.update(0.05);
      for (const e of w.getEvents(seq)) {
        seq = e.sequence;
        if (e.event.type === 'skill-activated') {
          const id = (e.event as { skillId: string }).skillId;
          if (at[id] === undefined) {
            at[id] = e.time;
            const cd = scaleCooldown(
              w.skills['params'](id).cooldown,
              w.skills.effectiveStats.cooldownReduction,
            );
            expect(w.skills['autos'].get(id)!.readyAt - e.time, id).toBeCloseTo(
              id === 'frost_nova' ? cd * 0.85 : cd,
              10,
            );
          }
        }
      }
    }
    expect(at.frost_nova).toBeDefined();
  });
  it('3.4 Архимагия: enhanced direct +10/18/28% (summed with 3.1); crit damage +15/+25 p.p.', () => {
    for (const [rank, bonus, critDamage] of [
      [1, 10, 0],
      [2, 18, 15],
      [3, 28, 25],
    ] as const) {
      const w = mage({ 'mage.b3.n04': rank }); // 3.1 at rank II via prerequisite (+8%)
      five(w);
      const direct = 1 + (8 + bonus) / 100;
      expect(m(w, 'ice_shards')).toBeCloseTo(direct, 10);
      // Crit snapshot multiplier k = 2: exact extra crit damage on critical hits only.
      expect(m(w, 'ice_shards', true)).toBeCloseTo((direct * (2 + critDamage / 100)) / 2, 10);
      expect(m(w, 'fireball', true)).toBe(1);
    }
  });
});
