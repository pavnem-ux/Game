import { describe, expect, it, vi } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { AttackSnapshot } from '../../src/combat-core';
import type { CombatTag } from '../../src/skills';
import type { EffectType } from '../../src/status-effects';
import { TALENT_CONFIG } from '../../src/talents';
import type { TalentRanks } from '../../src/talents';
import { stationaryMelee } from '../skills/helpers';

/** Mage level 50 with the given ranks (prerequisites filled to rank II automatically). */
function mage(ranks: TalentRanks, protect = true) {
  const full: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const node = TALENT_CONFIG.nodes.get(id)!;
    for (let n = node; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!)
      full[n.requires] = Math.max(full[n.requires] ?? 0, 2);
    full[id] = rank;
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
  if (protect) w.setTestProtection(true);
  return w;
}
/** A stationary test enemy with a large HP pool. */
function durable(w: GameplayWorld, distance: number, angle = 0) {
  const id = w.spawnEnemy('melee', distance, angle, stationaryMelee);
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  w.core.heal(id, 1e9);
  return id;
}
const tags = (...t: CombatTag[]) => new Set<CombatTag>(t);
const FIRE = tags('skill', 'magical', 'fire', 'projectile');
const ICE = tags('skill', 'magical', 'ice', 'area');
const BASIC = tags('basic', 'magical', 'projectile');
const attack = (critical = false): AttackSnapshot =>
  ({
    id: 'attack-x',
    attackerId: 'player',
    damageType: 'magical',
    coefficient: 1,
    baseDamage: 10,
    critical,
    rawDamage: critical ? 15 : 10,
  }) as AttackSnapshot;
const m = (w: GameplayWorld, target: string, t: ReadonlySet<CombatTag>, crit = false) =>
  w.skills.talentCombat.hitMultiplier(attack(crit), target, t);
const inSource = <T>(w: GameplayWorld, source: string | null, run: () => T): T => {
  const previous = w.skills.currentSource();
  w.skills.setSource(source);
  try {
    return run();
  } finally {
    w.skills.setSource(previous);
  }
};
const setHpPercent = (w: GameplayWorld, percent: number) => {
  const p = w.core.getEntity('player');
  w.core.heal('player', p.maxHp);
  const raw = p.maxHp * (1 - percent / 100) * ((100 + p.resistance) / 100);
  w.core.applyPeriodicDamage({
    operationId: `test-hp-${percent}-${w.time}`,
    targetId: 'player',
    effectId: 'test',
    rawDamage: raw,
    sources: [{ applicationId: 'test', sourceId: 'player', rawDamage: raw }],
  });
};
const burn = { effectType: 'burn' as EffectType, rawDamagePerTick: 10, duration: 4 };
const def = (effectType: EffectType = 'burn') => ({
  ...burn,
  effectType,
  probabilityPercent: 100,
});

describe('Task 09.1 Phase 4 — Mage · Повелитель стихий (b1)', () => {
  it('1.1 Стихийный резонанс: fire/ice direct skills +5/9/14%; AoE radius of those skills +4/8%', () => {
    for (const [rank, damage, area] of [
      [1, 1.05, 1],
      [2, 1.09, 1.04],
      [3, 1.14, 1.08],
    ] as const) {
      const w = mage({ 'mage.b1.n01': rank });
      const e = durable(w, 900);
      expect(m(w, e, FIRE)).toBeCloseTo(damage, 10);
      expect(m(w, e, ICE)).toBeCloseTo(damage, 10);
      expect(m(w, e, BASIC)).toBe(1); // not a skill
      expect(m(w, e, tags('skill', 'magical', 'ice', 'synergy'))).toBe(1);
      const base = inSource(w, null, () => w.skills.area(100));
      expect(inSource(w, 'skill:frost_nova', () => w.skills.area(100))).toBeCloseTo(
        base * area,
        10,
      );
      // Synergy areas and non-skill areas are unchanged.
      expect(inSource(w, 'synergy:wildfire', () => w.skills.area(100))).toBe(base);
    }
  });
  it('1.2 Жар пламени: Burn from Mage skills +8/15/24% per tick; II/III group duration +10/15%', () => {
    for (const [rank, damage, duration] of [
      [1, 1.08, 1],
      [2, 1.15, 1.1],
      [3, 1.24, 1.15],
    ] as const) {
      const w = mage({ 'mage.b1.n02': rank });
      const skill = inSource(w, 'skill:fireball', () => w.skills.playerEffect(def()));
      expect(skill.rawDamagePerTick).toBeCloseTo(10 * damage, 10);
      expect(skill.duration).toBeCloseTo(4 * duration, 10);
      // The basic weapon, synergies and other DoT types are not affected.
      expect(w.skills.playerEffect(def(), { basic: true })).toMatchObject(burn);
      expect(inSource(w, 'synergy:wildfire', () => w.skills.playerEffect(def()))).toMatchObject(
        burn,
      );
      expect(
        inSource(w, 'skill:fireball', () => w.skills.playerEffect(def('poison'))),
      ).toMatchObject({ ...burn, effectType: 'poison' });
      // End to end: the real group's timer is the extended duration.
      const e = durable(w, 900);
      inSource(w, 'skill:fireball', () => w.skills.applyStatus(e, def()));
      const g = w.statuses.getGroup(e, 'burn')!;
      expect(g.expiresAt - w.time).toBeCloseTo(4 * duration, 10);
      expect(g.stacks[0].rawDamagePerTick).toBeCloseTo(10 * damage, 10);
    }
  });
  it('1.3 Холодная концентрация: ice attacks +6/10/16% on slowed targets; ice-skill Slow +3/+5 p.p. under the cap', () => {
    for (const [rank, damage, slow] of [
      [1, 1.06, 0],
      [2, 1.1, 0.03],
      [3, 1.16, 0.05],
    ] as const) {
      const w = mage({ 'mage.b1.n03': rank });
      const e = durable(w, 900);
      // Probe tags without 'skill' so the prerequisite 1.1 (fire/ice skills) does not interfere.
      const ice = tags('magical', 'ice', 'projectile');
      expect(m(w, e, ice)).toBe(1); // not slowed yet
      inSource(w, 'skill:frost_nova', () => w.skills.slow(e, 0.3, 5));
      expect(w.skills['controls'].get(e)!.slow).toBeCloseTo(0.3 + slow, 10);
      expect(m(w, e, ice)).toBeCloseTo(damage, 10);
      expect(m(w, e, tags('magical', 'fire'))).toBe(1);
      // A fire skill's (or a non-skill) Slow gets no bonus; the global cap still applies.
      const e2 = durable(w, 900, 1);
      inSource(w, 'skill:fireball', () => w.skills.slow(e2, 0.3, 5));
      expect(w.skills['controls'].get(e2)!.slow).toBe(0.3);
      const e3 = durable(w, 900, 2);
      inSource(w, 'skill:frost_nova', () => w.skills.slow(e3, 0.6, 5));
      expect(w.skills['controls'].get(e3)!.slow).toBe(0.6);
    }
  });
  it('1.4 Точное сочетание: Thermal Shock +10% (I–II) / +20% (III); Shattered Ice +12% (II) / +22% (III)', () => {
    for (const [rank, thermal, shattered] of [
      [1, 1.1, 1],
      [2, 1.1, 1.12],
      [3, 1.2, 1.22],
    ] as const) {
      const w = mage({ 'mage.b1.n04': rank });
      const e = durable(w, 900);
      const synergy = tags('synergy', 'secondary', 'magical');
      expect(inSource(w, 'synergy:thermal_shock', () => m(w, e, synergy))).toBeCloseTo(thermal, 10);
      expect(inSource(w, 'synergy:shattered_ice', () => m(w, e, synergy))).toBeCloseTo(
        shattered,
        10,
      );
      expect(inSource(w, 'synergy:wildfire', () => m(w, e, synergy))).toBe(1);
    }
  });
  it('1.5 Повеление стихиям: Wildfire radius +10/20/30, neighbours 3/4/5 (end to end, no cascade)', () => {
    for (const [rank, radius, neighbours] of [
      [1, 140, 3],
      [2, 150, 4],
      [3, 160, 5],
    ] as const) {
      const w = mage({ 'mage.b1.n05': rank });
      expect(
        w.skills.talentCombat.synergySpread('wildfire', { radius: 130, maxTargets: 3 }),
      ).toEqual({ radius, maxTargets: neighbours });
      expect(
        w.skills.talentCombat.synergySpread('plague_chain', { radius: 130, maxTargets: 3 }),
      ).toEqual({ radius: 130, maxTargets: 3 });
      for (const s of ['fireball', 'flame_burst']) w.grantTestSkill(s, 1); // opens Wildfire
      const victim = durable(w, 900);
      const around = Array.from({ length: 7 }, (_, i) => durable(w, 950, (i - 3) * 0.04));
      w.skills.applyStatus(victim, def());
      w.core.updateEntityStats(victim, { ...w.core.getEntity(victim), maxHp: 1 });
      const a = w.skills.attack(FIRE, 0.01, 'magical');
      w.skills.hit(victim, a, FIRE);
      expect(w.core.getEntity(victim).alive).toBe(false);
      const spread = around.filter((id) => w.statuses.getGroup(id, 'burn'));
      expect(spread).toHaveLength(neighbours);
    }
  });
});

describe('Task 09.1 Phase 4 — Mage · Арканист (b2)', () => {
  it('2.1 Арканный поток: CDR +3/5/8 p.p.; magical damage +3/5% (composed once)', () => {
    const base = mage({}).skills.effectiveStats;
    for (const [rank, cdr, magical] of [
      [1, 3, 1],
      [2, 5, 1.03],
      [3, 8, 1.05],
    ] as const) {
      const s = mage({ 'mage.b2.n01': rank }).skills.effectiveStats;
      expect(s.cooldownReduction - base.cooldownReduction).toBeCloseTo(cdr, 10);
      expect(s.magicalDamage / base.magicalDamage).toBeCloseTo(magical, 10);
      expect(s.physicalDamage).toBe(base.physicalDamage);
    }
  });
  it('2.2 Магическая точность: magical-skill crit chance +3/5/8; crit damage +10/+20 p.p. (crits only)', () => {
    for (const [rank, chance, critDamage] of [
      [1, 3, 0],
      [2, 5, 10],
      [3, 8, 20],
    ] as const) {
      const w = mage({ 'mage.b2.n02': rank });
      expect(w.skills.talentCombat.critChance(FIRE)).toBe(chance);
      expect(w.skills.talentCombat.critChance(BASIC)).toBe(0);
      expect(w.skills.weaponAttackBonus()).toEqual({});
      const e = durable(w, 900);
      expect(m(w, e, FIRE)).toBe(1);
      expect(m(w, e, FIRE, true)).toBeCloseTo((1.5 + critDamage / 100) / 1.5, 10);
      expect(m(w, e, BASIC, true)).toBe(1);
      // A real skill snapshot carries the talent crit bonus.
      const create = vi.spyOn(w.core, 'createAttack');
      w.skills.attack(FIRE, 1, 'magical');
      expect(create.mock.calls[0][0].criticalChanceBonus).toBe(chance);
    }
  });
  it('2.3 Защитная печать (C2): barrier 10/15/20% Max HP for 3/3/4 s after real direct damage; CD 20/18/15 s', () => {
    for (const [rank, percent, duration, cooldown] of [
      [1, 10, 3, 20],
      [2, 15, 3, 18],
      [3, 20, 4, 15],
    ] as const) {
      const w = mage({ 'mage.b2.n03': rank });
      const maxHp = w.core.getEntity('player').maxHp;
      w.skills.onPlayerDirectDamage('enemy-x');
      expect(w.core.getBarrier('player')).toBeCloseTo((maxHp * percent) / 100, 10);
      expect(w.skills.snapshot().barrierExpiresAt! - w.time).toBeCloseTo(duration, 10);
      w.update(duration + 0.01);
      expect(w.core.getBarrier('player')).toBe(0);
      w.skills.onPlayerDirectDamage('enemy-x'); // node cooldown running
      expect(w.core.getBarrier('player')).toBe(0);
      w.update(cooldown - duration);
      w.skills.onPlayerDirectDamage('enemy-x');
      expect(w.core.getBarrier('player')).toBeCloseTo((maxHp * percent) / 100, 10);
    }
  });
  it('C2: one shared barrier slot — a weaker barrier never lowers a stronger one, only extends its expiry', () => {
    const w = mage({ 'mage.b2.n03': 1 });
    const maxHp = w.core.getEntity('player').maxHp;
    w.skills.grantBarrier(maxHp, 1);
    w.skills.onPlayerDirectDamage('enemy-x');
    expect(w.core.getBarrier('player')).toBe(maxHp);
    expect(w.skills.snapshot().barrierExpiresAt! - w.time).toBeCloseTo(3, 10);
    // A stronger new barrier replaces strength and expiry.
    w.skills.grantBarrier(maxHp * 2, 0.5);
    expect(w.core.getBarrier('player')).toBe(maxHp * 2);
    expect(w.skills.snapshot().barrierExpiresAt! - w.time).toBeCloseTo(0.5, 10);
  });
  it('C2 end to end: a real enemy hit grants the barrier after the hit (the triggering hit is not absorbed)', () => {
    const w = mage({ 'mage.b2.n03': 3 }, false);
    w.core.updateEntityStats('player', { ...w.core.getEntity('player'), maxHp: 1e5 });
    w.core.heal('player', 1e5);
    durable(w, 20); // already in contact range; survives the Mage's own attacks
    let seq = 0;
    let first: { appliedDamage: number } | null = null;
    for (let i = 0; i < 200 && !first; i++) {
      w.update(0.05);
      for (const e of w.getEvents(seq)) {
        seq = e.sequence;
        if (e.event.type === 'damage' && e.event.targetId === 'player') first ??= e.event;
      }
    }
    expect(first!.appliedDamage).toBeGreaterThan(0);
    expect((first as { absorbed?: number }).absorbed).toBeUndefined();
    expect(w.core.getBarrier('player')).toBeCloseTo(1e5 * 0.2, 6);
  });
  it('2.4 Концентрация: HP strictly above 70% → active magical skills +6/10/15%; II/III CDR +3/+5 p.p.', () => {
    for (const [rank, damage, cdr] of [
      [1, 1.06, 0],
      [2, 1.1, 3],
      [3, 1.15, 5],
    ] as const) {
      const w = mage({ 'mage.b2.n04': rank });
      const e = durable(w, 900);
      const stats = w.skills.effectiveStats.cooldownReduction;
      expect(m(w, e, FIRE)).toBeCloseTo(damage, 10);
      expect(m(w, e, BASIC)).toBe(1);
      expect(w.skills['cooldownReduction']()).toBeCloseTo(stats + cdr, 10);
      setHpPercent(w, 70);
      expect(m(w, e, FIRE)).toBe(1);
      expect(w.skills['cooldownReduction']()).toBe(stats);
    }
  });
  it('2.4: the conditional CDR shortens the real cooldown that starts while HP > 70%', () => {
    const w = mage({ 'mage.b2.n04': 3 });
    w.grantTestSkill('frost_nova', 1);
    durable(w, 60);
    let at: number | null = null;
    let seq = 0;
    for (let i = 0; i < 400 && at === null; i++) {
      w.update(0.05);
      for (const e of w.getEvents(seq)) {
        seq = e.sequence;
        if (e.event.type === 'skill-activated') at ??= e.time;
      }
    }
    const cdr = w.skills.effectiveStats.cooldownReduction + 5;
    const base = w.skills['params']('frost_nova').cooldown;
    expect(w.skills['autos'].get('frost_nova')!.readyAt - at!).toBeCloseTo(
      base * (1 - cdr / 100),
      10,
    );
  });
  it('2.5 Арканное превосходство: magical skill crits cut that skill’s remaining CD by 0.1/0.2/0.3 s; ICD 1/1/0.8 s', () => {
    for (const [rank, reduce, icd] of [
      [1, 0.1, 1],
      [2, 0.2, 1],
      [3, 0.3, 0.8],
    ] as const) {
      const w = mage({ 'mage.b2.n05': rank });
      w.grantTestSkill('fireball', 1);
      const state = w.skills['autos'].get('fireball')!;
      state.readyAt = w.time + 5;
      w.skills.talentCombat.onSkillCrit('fireball', FIRE);
      expect(state.readyAt - w.time).toBeCloseTo(5 - reduce, 10);
      w.skills.talentCombat.onSkillCrit('fireball', FIRE); // internal cooldown
      expect(state.readyAt - w.time).toBeCloseTo(5 - reduce, 10);
      w.skills.talentCombat.onSkillCrit('fireball', BASIC); // not a magical skill
      w.update(icd + 0.001);
      state.readyAt = w.time + 0.05;
      w.skills.talentCombat.onSkillCrit('fireball', FIRE);
      expect(state.readyAt).toBe(w.time); // never below «ready now»
    }
  });
  it('2.5 wiring: only a critical direct hit inside the skill’s own code reports the crit', () => {
    const w = mage({ 'mage.b2.n05': 1 });
    const e = durable(w, 900);
    const crit = vi.spyOn(w.skills.talentCombat, 'onSkillCrit');
    const a = w.skills.attack(FIRE, 0.01, 'magical');
    inSource(w, 'skill:fireball', () => w.skills.hit(e, { ...a, critical: true }, FIRE));
    expect(crit).toHaveBeenCalledWith('fireball', FIRE);
    inSource(w, 'skill:fireball', () => w.skills.hit(e, { ...a, critical: false }, FIRE));
    inSource(w, 'synergy:thermal_shock', () => w.skills.hit(e, { ...a, critical: true }, FIRE));
    inSource(w, 'skill:fireball', () =>
      w.skills.hit(e, { ...a, critical: true }, FIRE, { procs: false }),
    );
    expect(crit).toHaveBeenCalledTimes(1);
  });
});
