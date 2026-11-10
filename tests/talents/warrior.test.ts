import { describe, expect, it, vi } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { AttackSnapshot } from '../../src/combat-core';
import { CombatCore } from '../../src/combat-core';
import { BASE_COMBAT_ATTRIBUTES } from '../../src/character-stats';
import { EnemyAI } from '../../src/enemy-ai';
import type { CombatTag } from '../../src/skills';
import { TALENT_CONFIG } from '../../src/talents';
import type { TalentRanks } from '../../src/talents';
import { stationaryMelee } from '../skills/helpers';

function warrior(ranks: TalentRanks, protect = true) {
  const full: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const node = TALENT_CONFIG.nodes.get(id)!;
    for (let n = node; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!)
      full[n.requires] = Math.max(full[n.requires] ?? 0, 2);
    full[id] = Math.max(full[id] ?? 0, rank);
  }
  const w = new GameplayWorld({
    characterClass: 'warrior',
    level: 50,
    seed: 3,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    talents: { ranks: full },
  });
  if (protect) w.setTestProtection(true);
  return w;
}
function durable(w: GameplayWorld, distance: number, angle = 0) {
  const id = w.spawnEnemy('melee', distance, angle, stationaryMelee);
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  w.core.heal(id, 1e9);
  return id;
}
const tags = (...t: CombatTag[]) => new Set<CombatTag>(t);
const SWORD = tags('basic', 'physical', 'melee');
const SKILL = tags('skill', 'physical', 'melee', 'area');
const attack = (damageType: 'physical' | 'magical' = 'physical'): AttackSnapshot =>
  ({
    id: 'attack-x',
    attackerId: 'player',
    damageType,
    coefficient: 1,
    baseDamage: 10,
    critical: false,
    rawDamage: 10,
  }) as AttackSnapshot;
const m = (
  w: GameplayWorld,
  target: string,
  t: ReadonlySet<CombatTag>,
  targets = 1,
  type: 'physical' | 'magical' = 'physical',
) => w.skills.talentCombat.hitMultiplier(attack(type), target, t, targets);
let hpOps = 0;
/** Set the player's HP to an exact percentage and report it like the world does. */
function setHp(w: GameplayWorld, percent: number) {
  const p = w.core.getEntity('player');
  w.core.heal('player', p.maxHp);
  const raw = p.maxHp * (1 - percent / 100) * ((100 + p.resistance) / 100);
  if (raw > 0) {
    w.core.applyPeriodicDamage({
      operationId: `test-hp-${++hpOps}`,
      targetId: 'player',
      effectId: 'test',
      rawDamage: raw,
      sources: [{ applicationId: 'test', sourceId: 'player', rawDamage: raw }],
    });
  }
  w.skills.onPlayerHpChanged(true);
}
const physicalPercent = (w: GameplayWorld) => w.skills['modifiers']().physicalDamagePercent;

describe('Task 09.1 Phase 6 — Warrior · Берсерк (b1)', () => {
  it('1.1 Стальная хватка: sword direct +6/10/16%; II/III melee attacks on 2+ targets +4/+8%', () => {
    for (const [rank, sword, multi] of [
      [1, 6, 0],
      [2, 10, 4],
      [3, 16, 8],
    ] as const) {
      const w = warrior({ 'warrior.b1.n01': rank });
      const e = durable(w, 900);
      expect(m(w, e, SWORD)).toBeCloseTo(1 + sword / 100, 10);
      expect(m(w, e, SWORD, 2)).toBeCloseTo(1 + (sword + multi) / 100, 10);
      expect(m(w, e, SKILL)).toBe(1);
      expect(m(w, e, SKILL, 3)).toBeCloseTo(1 + multi / 100, 10);
      expect(m(w, e, tags('talent', 'secondary', 'physical', 'melee'), 3)).toBe(1);
    }
  });
  it('1.1 wiring: a real sword strike reports its target count to every hit (selected before resolution)', () => {
    const w = warrior({ 'warrior.b1.n01': 2 });
    durable(w, 40, -0.2);
    durable(w, 40, 0.2);
    const spy = vi.spyOn(w.skills, 'damageModifier');
    for (let i = 0; i < 60 && !spy.mock.calls.length; i++) w.update(0.05);
    const counts = spy.mock.calls.map((c) => c[0].targetCount);
    expect(counts.length).toBeGreaterThanOrEqual(2);
    expect(counts.every((c) => c === 2)).toBe(true);
  });
  it('1.2 Кровь и сталь: physical +5/9/14% below 60% HP; II/III +4/+8% more below 40% (strict)', () => {
    for (const [rank, below60, extra] of [
      [1, 5, 0],
      [2, 9, 4],
      [3, 14, 8],
    ] as const) {
      const w = warrior({ 'warrior.b1.n02': rank });
      const e = durable(w, 900);
      expect(m(w, e, SKILL)).toBe(1);
      setHp(w, 60);
      expect(m(w, e, SKILL)).toBe(1);
      setHp(w, 59);
      expect(m(w, e, SKILL)).toBeCloseTo(1 + below60 / 100, 10);
      expect(m(w, e, tags('skill', 'magical'), 1, 'magical')).toBe(1);
      setHp(w, 39);
      expect(m(w, e, SKILL)).toBeCloseTo(1 + (below60 + extra) / 100, 10);
    }
  });
  it('1.3 Жажда боя: a melee kill gives +3/5/8% physical damage for 3/4/5 s; refreshes, never stacks', () => {
    for (const [rank, bonus, duration] of [
      [1, 3, 3],
      [2, 5, 4],
      [3, 8, 5],
    ] as const) {
      const w = warrior({ 'warrior.b1.n03': rank });
      const base = physicalPercent(w);
      w.skills.talentCombat.onKill({ targetId: 'x', direct: true, tags: tags('skill', 'magical') });
      expect(physicalPercent(w)).toBe(base); // not a melee kill
      w.skills.talentCombat.onKill({ targetId: 'x', direct: true, tags: SWORD });
      expect(physicalPercent(w) - base).toBeCloseTo(bonus, 10);
      w.update(duration - 0.5);
      w.skills.talentCombat.onKill({ targetId: 'y', direct: true, tags: SWORD });
      expect(physicalPercent(w) - base).toBeCloseTo(bonus, 10); // refreshed, not stacked
      w.update(duration - 0.1);
      expect(physicalPercent(w) - base).toBeCloseTo(bonus, 10);
      w.update(0.2);
      expect(physicalPercent(w)).toBe(base);
    }
  });
  it('1.3 end to end: a real sword kill applies the buff', () => {
    const w = warrior({ 'warrior.b1.n03': 1 });
    const base = physicalPercent(w);
    w.spawnEnemy('melee', 40, 0, stationaryMelee);
    for (let i = 0; i < 100 && w.getSnapshot().enemies.some((e) => e.alive); i++) w.update(0.05);
    expect(physicalPercent(w) - base).toBeCloseTo(3, 10);
  });
  it('1.4 Безжалостный натиск: attack speed +5/9/15; II/III +5/+10% on stunned targets', () => {
    const base = warrior({}).skills.effectiveStats.attackSpeed;
    for (const [rank, speed, stunned] of [
      [1, 5, 0],
      [2, 9, 5],
      [3, 15, 10],
    ] as const) {
      const w = warrior({ 'warrior.b1.n04': rank });
      expect(w.skills.effectiveStats.attackSpeed - base).toBeCloseTo(speed, 10);
      const e = durable(w, 900);
      expect(m(w, e, SKILL)).toBe(1);
      w.skills.stun(e, 1);
      expect(m(w, e, SKILL)).toBeCloseTo(1 + stunned / 100, 10);
    }
  });
  it('1.5 Сила ярости (C6): Battle Fury +1/2/3 p.p. per stack; caps maxStacks×1 / 16 / 24; 0 without BF', () => {
    const fury = (w: GameplayWorld, stacks: number) =>
      w.skills.setBuff('battle_fury', stacks, 0, w.time + 10);
    for (const [rank, stacks, expected] of [
      [1, 3, 3],
      [1, 5, 5],
      [2, 5, 10],
      [2, 8, 16],
      [2, 9, 16],
      [3, 5, 15],
      [3, 8, 24],
      [3, 9, 24],
    ] as const) {
      const w = warrior({ 'warrior.b1.n05': rank });
      expect(physicalPercent(w)).toBe(0); // no Battle Fury → no effect
      w.grantTestSkill('battle_fury', 1);
      fury(w, stacks);
      const own = stacks * w.skills['params']('battle_fury').damagePerStack;
      expect(physicalPercent(w) - own, `rank ${rank}, ${stacks} stacks`).toBeCloseTo(expected, 10);
    }
    // Rank I cap follows Battle Fury's own maxStacks (8 at Battle Fury rank IV).
    const w = warrior({ 'warrior.b1.n05': 1 });
    w.grantTestSkill('battle_fury', 4);
    w.skills.setBuff('battle_fury', 9, 0, w.time + 10);
    expect(physicalPercent(w) - 9 * w.skills['params']('battle_fury').damagePerStack).toBe(8);
  });
});

describe('Task 09.1 Phase 6 — Warrior · Страж (b2)', () => {
  it('2.1 Крепкое тело / 2.2 Непробиваемость: Max HP +8/14/22%, Resistance +2/4 and +4/7/11 (composed once)', () => {
    const base = warrior({}).skills.effectiveStats;
    for (const [rank, hp, res] of [
      [1, 8, 0],
      [2, 14, 2],
      [3, 22, 4],
    ] as const) {
      const s = warrior({ 'warrior.b2.n01': rank }).skills.effectiveStats;
      expect(s.maxHp / base.maxHp).toBeCloseTo(1 + hp / 100, 2);
      expect(s.resistance - base.resistance).toBeCloseTo(res, 10);
    }
    for (const [rank, res] of [
      [1, 4],
      [2, 7],
      [3, 11],
    ] as const) {
      const s = warrior({ 'warrior.b2.n02': rank }).skills.effectiveStats;
      // b2.n01 at rank II via prerequisite adds +2.
      expect(s.resistance - base.resistance).toBeCloseTo(res + 2, 10);
    }
  });
  it('2.2 G12: enemy direct hits ×0.98/0.96 before resistance and one rounding; DoT unaffected', () => {
    expect(warrior({ 'warrior.b2.n02': 1 }).skills.talentCombat.playerDamageTakenMultiplier()).toBe(
      1,
    );
    for (const [rank, mult] of [
      [2, 0.98],
      [3, 0.96],
    ] as const) {
      const w = warrior({ 'warrior.b2.n02': rank }, false);
      w.core.updateEntityStats('player', { ...w.core.getEntity('player'), maxHp: 1e6 });
      w.core.heal('player', 1e6);
      expect(w.skills.talentCombat.playerDamageTakenMultiplier()).toBeCloseTo(mult, 10);
      const resolve = vi.spyOn(w.core, 'resolveAttack');
      durable(w, 20);
      for (let i = 0; i < 100 && !resolve.mock.calls.some((c) => c[1] === 'player'); i++)
        w.update(0.05);
      const onPlayer = resolve.mock.calls.filter((c) => c[1] === 'player');
      expect(onPlayer.length).toBeGreaterThan(0);
      for (const c of onPlayer) expect(c[2]?.damageMultiplier).toBeCloseTo(mult, 10);
    }
  });
  it('2.2 G12: EnemyAI option is additive and validated (Core rounds once after resistance)', () => {
    const core = new CombatCore(() => 0.99);
    core.addEntity({
      id: 'p',
      affiliation: 'player',
      stats: { ...BASE_COMBAT_ATTRIBUTES, dodgeChance: 0, resistance: 0 },
    });
    expect(
      () =>
        new EnemyAI(core, {
          playerId: 'p',
          movementStep: 1 / 30,
          separation: { cellSize: 64, padding: 8, strength: 0.8 },
          playerDamageMultiplier: 1 as never,
        }),
    ).toThrow(TypeError);
    const a = core.createAttack({ attackerId: 'p', damageType: 'physical', coefficient: 1 });
    // 10 raw × 0.96 = 9.6 → one rounding → 10; ×0.94 would round to 9.
    expect(core.resolveAttack(a, 'p', { damageMultiplier: 0.96 }).damage).toBe(10);
  });
  it('2.3 Ответный щит: real direct damage → nearest enemy ×0.3/0.45/0.6, CD 4/3.5/3 s, procs=false', () => {
    for (const [rank, coefficient, cooldown] of [
      [1, 0.3, 4],
      [2, 0.45, 3.5],
      [3, 0.6, 3],
    ] as const) {
      const w = warrior({ 'warrior.b2.n03': rank });
      const near = durable(w, 300);
      durable(w, 500);
      const strike = vi.spyOn(w.skills, 'talentStrike');
      w.skills.onPlayerDirectDamage('someone');
      expect(strike.mock.calls[0].slice(0, 4)).toEqual([
        'warrior.b2.n03',
        near,
        coefficient,
        'physical',
      ]);
      expect((strike.mock.results[0].value as { procs: boolean }).procs).toBe(false);
      w.skills.onPlayerDirectDamage('someone');
      expect(strike).toHaveBeenCalledTimes(1);
      w.update(cooldown + 0.01);
      w.skills.talents.proc(() => w.skills.onPlayerDirectDamage('someone'));
      expect(strike).toHaveBeenCalledTimes(1); // a retaliation never starts a retaliation
      w.skills.onPlayerDirectDamage('someone');
      expect(strike).toHaveBeenCalledTimes(2);
      expect(w.getSnapshot().runStats.bySource.map((s) => s.source)).toContain(
        'talent:warrior.b2.n03',
      );
    }
  });
  it('2.4 Тяжёлый шаг: own-skill Stun +0.1/0.2/0.3 s within the 1.5 s limit; II/III +4/+8% on stunned', () => {
    for (const [rank, extra, stunned] of [
      [1, 0.1, 0],
      [2, 0.2, 4],
      [3, 0.3, 8],
    ] as const) {
      const w = warrior({ 'warrior.b2.n04': rank });
      const e = durable(w, 900);
      w.skills.setSource('skill:shield_bash');
      w.skills.stun(e, 1);
      const capped = durable(w, 900, 1);
      w.skills.stun(capped, 1.5);
      w.skills.setSource('synergy:seismic_impact');
      const other = durable(w, 900, 2);
      w.skills.stun(other, 1);
      w.skills.setSource(null);
      const control = (id: string) => w.skills['controls'].get(id)!.stunUntil - w.time;
      expect(control(e)).toBeCloseTo(1 + extra, 10);
      expect(control(capped)).toBeCloseTo(1.5, 10);
      expect(control(other)).toBeCloseTo(1, 10);
      expect(m(w, e, SKILL)).toBeCloseTo(1 + stunned / 100, 10);
    }
  });
  it('2.5 Несокрушимый (C3): Resistance +5/9/14 while HP < 30% (strict), recomposed when it flips', () => {
    for (const [rank, res] of [
      [1, 5],
      [2, 9],
      [3, 14],
    ] as const) {
      const w = warrior({ 'warrior.b2.n05': rank });
      const base = w.skills.effectiveStats.resistance;
      // Core rounds damage to whole HP, so test just above / below the strict threshold.
      setHp(w, 20); // first crossing: ranks II/III also heal (C3), consuming the 30 s cooldown
      setHp(w, 30.5);
      expect(w.skills.effectiveStats.resistance).toBe(base);
      setHp(w, 29.5);
      expect(w.skills.effectiveStats.resistance - base).toBeCloseTo(res, 10);
      expect(w.core.getEntity('player').resistance - base).toBeCloseTo(res, 10);
      setHp(w, 80);
      expect(w.skills.effectiveStats.resistance).toBe(base);
    }
  });
  it('C3 II/III: heal 3/6% Max HP on a damage crossing from ≥30% to <30%; once per 30 s; not at start below', () => {
    for (const [rank, heal] of [
      [1, 0],
      [2, 3],
      [3, 6],
    ] as const) {
      const w = warrior({ 'warrior.b2.n05': rank });
      const maxHp = w.core.getEntity('player').maxHp;
      const hp = () => (w.core.getEntity('player').currentHp / maxHp) * 100;
      setHp(w, 25); // crossing from 100% (start) by damage
      expect(hp()).toBeCloseTo(25 + heal, 1);
      setHp(w, 50);
      setHp(w, 25); // second crossing inside the 30 s cooldown: no heal
      expect(hp()).toBeCloseTo(25, 1);
      w.update(30.01);
      setHp(w, 50);
      setHp(w, 20);
      expect(hp()).toBeCloseTo(20 + heal, 1);
      // A heal that keeps HP below 30% is not a crossing: nothing else happens.
      w.skills.onPlayerHpChanged(false);
      expect(hp()).toBeCloseTo(20 + heal, 1);
    }
  });
});
