import { describe, expect, it } from 'vitest';
import type { CharacterClass } from '../../src/character-stats';
import { COMBAT_ATTRIBUTE_CAPS } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import {
  SYNERGY_LEVEL_RULES,
  SYNERGY_MAIN_NUMBER,
  SYNERGY_RULES,
  SYNERGY_TUNING,
  SYNERGY_TUNING_LEVEL_II,
  bestSynergyPair,
  pairLevel,
  synergyLevel,
} from '../../src/skills';
import type { CombatTag, SynergyId, SynergyRule } from '../../src/skills';
import type { EffectType } from '../../src/status-effects';
import { TALENT_CONFIG } from '../../src/talents';
import { arena, stationaryMelee } from './helpers';

/** Talent ranks plus their prerequisite chain at rank 2 (as in tests/talents). */
function withPrerequisites(ranks: Record<string, number>) {
  const full: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    for (let n = TALENT_CONFIG.nodes.get(id)!; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!)
      full[n.requires] = Math.max(full[n.requires] ?? 0, 2);
    full[id] = rank;
  }
  return full;
}

const rule = (id: SynergyId) => SYNERGY_RULES.find((r) => r.id === id) as SynergyRule;
const ranks = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('Task 15 Phase 1 — synergyLevel (pure)', () => {
  it('level from the weakest rank of a pair: I both owned, II both ≥ 3, III both 5', () => {
    expect(SYNERGY_LEVEL_RULES).toEqual({
      levelTwoRank: 3,
      levelThreeRank: 5,
      levelTwoMultiplier: 1.5,
    });
    const [a, b] = rule('thermal_shock').unlockPairs[0];
    expect(pairLevel([a, b], ranks({}))).toBe(0);
    expect(pairLevel([a, b], ranks({ [a]: 5 }))).toBe(0);
    expect(pairLevel([a, b], ranks({ [a]: 5, [b]: 1 }))).toBe(1);
    expect(pairLevel([a, b], ranks({ [a]: 2, [b]: 5 }))).toBe(1);
    expect(pairLevel([a, b], ranks({ [a]: 3, [b]: 4 }))).toBe(2);
    expect(pairLevel([a, b], ranks({ [a]: 5, [b]: 4 }))).toBe(2);
    expect(pairLevel([a, b], ranks({ [a]: 5, [b]: 5 }))).toBe(3);
  });
  it('the best completed pair of the synergy decides; ties keep workbook order', () => {
    for (const r of SYNERGY_RULES) {
      expect(r.unlockPairs.length).toBeGreaterThanOrEqual(3);
      const [p0, p1] = r.unlockPairs;
      // p0 weak (I), p1 strong (III, unless p1 shares a skill with p0 at rank 1).
      const map = new Map<string, number>();
      for (const s of p1) map.set(s, 5);
      for (const s of p0) if (!map.has(s)) map.set(s, 1);
      const expected = Math.max(pairLevel(p0, map), pairLevel(p1, map));
      expect(synergyLevel(r, map)).toBe(expected);
      expect(bestSynergyPair(r, map).pair).toEqual(
        pairLevel(p1, map) > pairLevel(p0, map) ? p1 : p0,
      );
    }
    // Tie: both pairs at level I → the first pair in workbook order.
    const r = rule('wildfire');
    const all = new Map<string, number>();
    for (const p of r.unlockPairs) for (const s of p) all.set(s, 1);
    expect(bestSynergyPair(r, all)).toEqual({ level: 1, pair: r.unlockPairs[0] });
    expect(bestSynergyPair(r, new Map())).toEqual({ level: 0, pair: null });
  });
  it('levels across different pairs of one synergy: a second pair can lift it higher', () => {
    const r = rule('wildfire');
    const [p0, p1] = r.unlockPairs.filter(
      (p, i, all) => i === 0 || !p.some((s) => all[0].includes(s)),
    );
    const map = new Map<string, number>([
      [p0[0], 5],
      [p0[1], 3],
    ]);
    expect(synergyLevel(r, map)).toBe(2);
    map.set(p1[0], 5);
    map.set(p1[1], 5);
    expect(synergyLevel(r, map)).toBe(3);
    const best = bestSynergyPair(r, map);
    expect(best.level).toBe(3);
    expect(pairLevel(best.pair!, map)).toBe(3);
  });
});

describe('Task 15 Phase 1 — Level II values for all 12 synergies (catalog v3)', () => {
  it('only the main number is ×1.5; every other value is unchanged', () => {
    const expected: Record<keyof typeof SYNERGY_TUNING, number> = {
      thermalShock: 0.825,
      wildfire: 4.5,
      shatteredIce: 0.675,
      skullCrusher: 0.75,
      battleMomentum: 22.5,
      seismicImpact: 0.75,
      toxicBarrage: 0.9,
      plagueChain: 4.5,
      deadlyPrecision: 22.5,
      bloodFrenzy: 22.5,
      deepWounds: 4.5,
      finalCut: 1.8,
    };
    for (const key of Object.keys(expected) as (keyof typeof SYNERGY_TUNING)[]) {
      const field = SYNERGY_MAIN_NUMBER[key];
      const two = SYNERGY_TUNING_LEVEL_II[key] as Record<string, number>;
      const one = SYNERGY_TUNING[key] as Record<string, number>;
      expect(two[field]).toBe(expected[key]);
      expect({ ...two, [field]: 0 }).toEqual({ ...one, [field]: 0 });
    }
    expect(Object.isFrozen(SYNERGY_TUNING_LEVEL_II)).toBe(true);
  });
});

/** Far-away durable enemies; basic on-hit disabled. */
function setup(c: CharacterClass, count = 1, seed = 7) {
  const w = arena(c, { level: 10, onHit: [], seed });
  w.weapons.setAttackSpeed('player', 1);
  const ids = Array.from({ length: count }, (_, i) =>
    w.spawnEnemy('melee', 900 + i * 30, 0, stationaryMelee),
  );
  for (const id of ids) w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  return { w, ids };
}
const tags = (...t: CombatTag[]) => new Set<CombatTag>(t);
const strike = (w: GameplayWorld, target: string, t: ReadonlySet<CombatTag>) =>
  w.skills.hit(target, w.skills.attack(t, 0.01, t.has('magical') ? 'magical' : 'physical'), t);
const dot = (w: GameplayWorld, id: string, type: EffectType, damage = 0) =>
  w.skills.applyStatus(
    id,
    { effectType: type, rawDamagePerTick: damage, duration: 30, probabilityPercent: 100 },
    1,
  );

describe('Task 15 Phase 1 — resolver uses the level at trigger time', () => {
  it('world levels come from run ranks, rise with upgrades and reset in a new run', () => {
    const w = arena('mage');
    const [a, b] = rule('thermal_shock').unlockPairs[0];
    expect(w.skills.synergies.level('thermal_shock')).toBe(0);
    w.grantTestSkill(a, 1);
    w.grantTestSkill(b, 1);
    expect(w.skills.synergies.level('thermal_shock')).toBe(1);
    w.grantTestSkill(a, 3);
    expect(w.skills.synergies.level('thermal_shock')).toBe(1);
    w.grantTestSkill(b, 3);
    expect(w.skills.synergies.level('thermal_shock')).toBe(2);
    w.grantTestSkill(a, 5);
    w.grantTestSkill(b, 5);
    expect(w.skills.synergies.level('thermal_shock')).toBe(3);
    expect(arena('mage').skills.synergies.level('thermal_shock')).toBe(0);
    // Other classes' synergies have no level here.
    expect(w.skills.synergies.level('skull_crusher')).toBe(0);
  });
  it('a proc at level II deals ×1.5 of level I (Thermal Shock); level is read when it fires', () => {
    const procDamage = (level: 0 | 1 | 2) => {
      const { w, ids } = setup('mage');
      w.setTestSynergyLevel('thermal_shock', level);
      dot(w, ids[0], 'burn');
      const hp = w.core.getEntity(ids[0]).currentHp;
      strike(w, ids[0], tags('ice', 'magical'));
      return hp - w.core.getEntity(ids[0]).currentHp;
    };
    const base = procDamage(0);
    const one = procDamage(1) - base;
    const two = procDamage(2) - base;
    expect(one).toBeGreaterThan(0);
    expect(two / one).toBeCloseTo(1.5, 1);
  });
  it('II buffs and statuses use the ×1.5 values (Battle Momentum, Blood Frenzy, Wildfire, Deep Wounds, Deadly Precision)', () => {
    const { w: wr, ids: wi } = setup('warrior');
    wr.setTestSynergyLevel('battle_momentum', 2);
    const base = wr.getSnapshot().stats.attackSpeed;
    wr.core.updateEntityStats(wi[0], { ...wr.core.getEntity(wi[0]), maxHp: 1 });
    strike(wr, wi[0], tags('physical', 'melee'));
    expect(wr.getSnapshot().stats.attackSpeed).toBe(
      Math.min(COMBAT_ATTRIBUTE_CAPS.attackSpeed, base + 22.5),
    );

    const { w: rg, ids: ri } = setup('rogue');
    rg.setTestSynergyLevel('blood_frenzy', 2);
    rg.setTestSynergyLevel('deep_wounds', 2);
    const rbase = rg.getSnapshot().stats.attackSpeed;
    dot(rg, ri[0], 'bleed');
    strike(rg, ri[0], tags('physical', 'dagger'));
    expect(rg.skills.buff('blood_frenzy')!.value).toBe(22.5);
    expect(rg.getSnapshot().stats.attackSpeed).toBe(
      Math.min(COMBAT_ATTRIBUTE_CAPS.attackSpeed, rbase + 22.5),
    );
    const crit = { ...rg.skills.attack(tags('physical'), 0.01, 'physical'), critical: true };
    rg.skills.hit(ri[0], crit, tags('physical'));
    const bleed = rg.statuses.getGroup(ri[0], 'bleed')!;
    expect(
      bleed.stacks.some((s) => s.originId === 'synergy:deep_wounds' && s.rawDamagePerTick === 4.5),
    ).toBe(true);

    const { w: mg, ids: mi } = setup('mage', 3);
    mg.setTestSynergyLevel('wildfire', 2);
    dot(mg, mi[0], 'burn');
    mg.core.updateEntityStats(mi[0], { ...mg.core.getEntity(mi[0]), maxHp: 1 });
    strike(mg, mi[0], tags('magical'));
    const spread = mi.slice(1).map((id) => mg.statuses.getGroup(id, 'burn')!);
    expect(spread.every((g) => g.stacks[0].rawDamagePerTick === 4.5)).toBe(true);

    const { w: ar, ids: ai } = setup('archer');
    ar.setTestSynergyLevel('deadly_precision', 2);
    dot(ar, ai[0], 'poison');
    for (let i = 0; i < 3; i++) strike(ar, ai[0], tags('physical', 'projectile'));
    expect(ar.skills.synergies.focusMultiplier(ai[0])).toBeCloseTo(1.225, 10);
  });
  it('talents never unlock a synergy or raise its level', () => {
    const talented = new GameplayWorld({
      characterClass: 'mage',
      level: 30,
      seed: 7,
      initialEnemies: false,
      spawning: { enabled: false },
      talents: { ranks: withPrerequisites({ 'mage.b1.n04': 3, 'mage.b1.n05': 3 }) },
    });
    expect(talented.skills.synergies.level('thermal_shock')).toBe(0);
    expect(talented.skills.synergies.isEligible('wildfire')).toBe(false);
    const [a, b] = rule('wildfire').unlockPairs[0];
    talented.grantTestSkill(a, 1);
    talented.grantTestSkill(b, 1);
    expect(talented.skills.synergies.level('wildfire')).toBe(1);
  });
  it('the QA override validates input and returns to the rank level on null', () => {
    const w = arena('mage');
    w.setTestSynergyLevel('thermal_shock', 3);
    expect(w.skills.synergies.level('thermal_shock')).toBe(3);
    expect(w.skills.synergies.isEligible('thermal_shock')).toBe(true);
    w.setTestSynergyLevel('thermal_shock', null);
    expect(w.skills.synergies.level('thermal_shock')).toBe(0);
    expect(() => w.setTestSynergyLevel('skull_crusher', 1)).toThrow(RangeError);
    expect(() => w.setTestSynergyLevel('thermal_shock', 4 as never)).toThrow(RangeError);
  });
});
