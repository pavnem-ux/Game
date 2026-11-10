import { describe, expect, it, vi } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { AttackSnapshot } from '../../src/combat-core';
import type { CombatTag } from '../../src/skills';
import { TALENT_CONFIG } from '../../src/talents';
import type { TalentRanks } from '../../src/talents';
import { stationaryMelee } from '../skills/helpers';

function archer(ranks: TalentRanks) {
  const full: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const node = TALENT_CONFIG.nodes.get(id)!;
    for (let n = node; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!)
      full[n.requires] = Math.max(full[n.requires] ?? 0, 2);
    full[id] = Math.max(full[id] ?? 0, rank);
  }
  const w = new GameplayWorld({
    characterClass: 'archer',
    level: 50,
    seed: 11,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    talents: { ranks: full },
  });
  w.setTestProtection(true);
  return w;
}
function durable(w: GameplayWorld, distance: number, angle = 0) {
  const id = w.spawnEnemy('melee', distance, angle, stationaryMelee);
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  w.core.heal(id, 1e9);
  return id;
}
const tags = (...t: CombatTag[]) => new Set<CombatTag>(t);
const BOW = tags('basic', 'physical', 'projectile');
const SKILL = tags('skill', 'physical', 'projectile');
const TRAP = tags('skill', 'physical', 'poison', 'trap', 'zone');
const snapshot = (critical = false): AttackSnapshot =>
  ({
    id: 'attack-x',
    attackerId: 'player',
    damageType: 'physical',
    coefficient: 1,
    baseDamage: 10,
    critical,
    rawDamage: critical ? 20 : 10,
  }) as AttackSnapshot;
const m = (w: GameplayWorld, target: string, t: ReadonlySet<CombatTag>, crit = false) =>
  w.skills.talentCombat.hitMultiplier(snapshot(crit), target, t);
const setHpPercent = (w: GameplayWorld, id: string, percent: number) => {
  const e = w.core.getEntity(id);
  const raw = ((e.currentHp - (e.maxHp * percent) / 100) * (100 + e.resistance)) / 100;
  w.core.applyPeriodicDamage({
    operationId: `test-${id}-${percent}`,
    targetId: id,
    effectId: 'test',
    rawDamage: raw,
    sources: [{ applicationId: 'test', sourceId: 'player', rawDamage: raw }],
  });
};
const inSource = <T>(w: GameplayWorld, source: string | null, run: () => T): T => {
  const previous = w.skills.currentSource();
  w.skills.setSource(source);
  try {
    return run();
  } finally {
    w.skills.setSource(previous);
  }
};
const mark = (w: GameplayWorld, id: string) =>
  w.skills['marks'].set(id, { kind: 'hunter', rank: 1, expiresAt: w.time + 30, jumped: false });

describe('Task 09.1 Phase 8 — Archer · Снайпер (b1)', () => {
  it('1.1 Меткий глаз: arrow crit chance +3/5/8 p.p.; II/III arrow crit damage +8/+16 p.p.', () => {
    for (const [rank, chance, critDamage] of [
      [1, 3, 0],
      [2, 5, 8],
      [3, 8, 16],
    ] as const) {
      const w = archer({ 'archer.b1.n01': rank });
      expect(w.skills.talentCombat.critChance(BOW)).toBe(chance);
      expect(w.skills.talentCombat.critChance(SKILL)).toBe(chance);
      expect(w.skills.talentCombat.critChance(TRAP)).toBe(0); // a trap is not an arrow
      expect(w.skills.weaponAttackBonus()).toEqual({ criticalChanceBonus: chance });
      const e = durable(w, 900);
      expect(m(w, e, BOW)).toBe(1);
      expect(m(w, e, BOW, true)).toBeCloseTo((2 + critDamage / 100) / 2, 10);
      expect(m(w, e, tags('skill', 'mark'), true)).toBe(1);
    }
  });
  it('1.2 Слабая точка: arrows on marked targets +7/12/18%; II/III +4/+8% more when also poisoned', () => {
    for (const [rank, marked, poisoned] of [
      [1, 7, 0],
      [2, 12, 4],
      [3, 18, 8],
    ] as const) {
      const w = archer({ 'archer.b1.n02': rank });
      const e = durable(w, 900);
      expect(m(w, e, BOW)).toBe(1);
      mark(w, e);
      expect(m(w, e, BOW)).toBeCloseTo(1 + marked / 100, 10);
      w.skills.applyStatus(e, {
        effectType: 'poison',
        rawDamagePerTick: 1,
        duration: 30,
        probabilityPercent: 100,
      });
      expect(m(w, e, BOW)).toBeCloseTo(1 + (marked + poisoned) / 100, 10);
      expect(m(w, e, tags('skill', 'mark'))).toBe(1);
    }
  });
  it('1.3 Сквозной выстрел (G11): Piercing Arrow +1/2/3 targets, ×(1 − 20/15/10%) per later target', () => {
    for (const [rank, extra, falloff] of [
      [1, 1, 0.2],
      [2, 2, 0.15],
      [3, 3, 0.1],
    ] as const) {
      const w = archer({ 'archer.b1.n03': rank });
      expect(w.skills.talentCombat.skillParamBonus('piercing_arrow', 'pierce')).toBe(extra);
      expect(w.skills.talentCombat.pierceFalloff('piercing_arrow')).toBeCloseTo(falloff, 10);
      expect(w.skills.talentCombat.skillParamBonus('split_shot', 'pierce')).toBe(0);
      w.grantTestSkill('piercing_arrow', 1);
      for (let i = 0; i < 8; i++) durable(w, 120 + i * 40, 0);
      const modifier = vi.spyOn(w.skills, 'damageModifier');
      for (let i = 0; i < 40; i++) w.update(0.05);
      const values = modifier.mock.calls
        .map((c, i) => ({ c: c[0], v: modifier.mock.results[i].value as number }))
        .filter(({ c }) => c.projectileId && c.weaponId.startsWith('skill:piercing_arrow'));
      const base = w.skills['params']('piercing_arrow').pierce;
      const first = values.filter((x) => x.c.attack.id === values[0].c.attack.id);
      expect(first.length).toBe(1 + base + extra);
      first.forEach((x, i) => expect(x.v / first[0].v).toBeCloseTo((1 - falloff) ** i, 10));
    }
  });
  it('G11: without the talent Piercing Arrow keeps its old behaviour (no falloff, base pierce)', () => {
    const w = archer({});
    w.grantTestSkill('piercing_arrow', 1);
    for (let i = 0; i < 8; i++) durable(w, 120 + i * 40, 0);
    const modifier = vi.spyOn(w.skills, 'damageModifier');
    for (let i = 0; i < 40; i++) w.update(0.05);
    const values = modifier.mock.calls
      .map((c, i) => ({ c: c[0], v: modifier.mock.results[i].value as number }))
      .filter(({ c }) => c.weaponId.startsWith('skill:piercing_arrow'));
    const first = values.filter((x) => x.c.attack.id === values[0].c.attack.id);
    expect(first.length).toBe(1 + w.skills['params']('piercing_arrow').pierce);
    expect(new Set(first.map((x) => x.v)).size).toBe(1);
  });
  it('1.4 Хладнокровие: 3 direct shots on one target within 3/3.5/4 s → next shot +8/14/22%; CD 3 s', () => {
    for (const [rank, bonus, window] of [
      [1, 8, 3],
      [2, 14, 3.5],
      [3, 22, 4],
    ] as const) {
      const w = archer({ 'archer.b1.n04': rank });
      const e = durable(w, 900);
      const shot = () =>
        w.skills.talentCombat.onDirectHit({ targetId: e, tags: BOW, killed: false });
      shot();
      w.update(window / 2);
      shot();
      expect(m(w, e, BOW)).toBe(1);
      w.update(window / 2 - 0.01);
      shot(); // third shot inside the window → the next shot is primed
      expect(m(w, e, BOW)).toBeCloseTo(1 + bonus / 100, 10);
      expect(m(w, e, tags('skill', 'mark'))).toBe(1);
      shot(); // the primed shot consumes it
      expect(m(w, e, BOW)).toBe(1);
      shot();
      shot();
      shot(); // three more shots, but the 3 s cooldown is still running
      expect(m(w, e, BOW)).toBe(1);
      // Shots spread wider than the window never prime.
      const w2 = archer({ 'archer.b1.n04': rank });
      const e2 = durable(w2, 900);
      for (let i = 0; i < 3; i++) {
        w2.skills.talentCombat.onDirectHit({ targetId: e2, tags: BOW, killed: false });
        w2.update(window / 2 + 0.01);
      }
      expect(m(w2, e2, BOW)).toBe(1);
    }
  });
  it('1.5 Идеальный выстрел rank I: crit damage +15 p.p. vs targets below 30% HP; II/III blocked (E3)', () => {
    const n = TALENT_CONFIG.nodes.get('archer.b1.n05')!;
    expect(n.ranks.map((r) => r.status)).toEqual(['ready', 'blocked', 'blocked']);
    const w = archer({ 'archer.b1.n05': 1 });
    const e = durable(w, 900);
    // Prerequisite 1.1 at rank II adds +8 p.p. arrow crit damage.
    expect(m(w, e, BOW, true)).toBeCloseTo(2.08 / 2, 10);
    setHpPercent(w, e, 29);
    expect(m(w, e, BOW, true)).toBeCloseTo((2.08 + 0.15) / 2, 10);
    expect(m(w, e, BOW)).toBe(1); // crits only
    const blocked = archer({ 'archer.b1.n05': 2 });
    const e2 = durable(blocked, 900);
    setHpPercent(blocked, e2, 29);
    expect(m(blocked, e2, BOW, true)).toBeCloseTo(2.08 / 2, 10); // only the prerequisite
  });
});

describe('Task 09.1 Phase 8 — Archer · Следопыт (b2)', () => {
  it('2.1 Лёгкие ноги: movement +5/8/12%; II/III basic bow range +4/+7%', () => {
    const base = archer({});
    for (const [rank, move, range] of [
      [1, 5, 0],
      [2, 8, 4],
      [3, 12, 7],
    ] as const) {
      const w = archer({ 'archer.b2.n01': rank });
      expect(
        w.skills.effectiveStats.movementSpeed / base.skills.effectiveStats.movementSpeed,
      ).toBeCloseTo(1 + move / 100, 10);
      expect(w.getSnapshot().weapon.weapon.attackRange).toBeCloseTo(580 * (1 + range / 100), 10);
    }
  });
  it('2.2 Вторая траектория: Multishot arrows +5/10/15 p.p. of the base arrow (only with Multishot)', () => {
    for (const [rank, extra] of [
      [1, 0.05],
      [2, 0.1],
      [3, 0.15],
    ] as const) {
      const w = archer({ 'archer.b2.n02': rank });
      expect(w.skills.talentCombat.skillParamBonus('multishot', 'coefficientFactor')).toBeCloseTo(
        extra,
        10,
      );
      w.grantTestSkill('multishot', 1);
      durable(w, 200);
      const create = vi.spyOn(w.core, 'createAttack');
      for (let i = 0; i < 20; i++) w.update(0.05);
      const coefficients = create.mock.calls.map((c) => c[0].coefficient);
      expect(coefficients).toContain(1); // the base arrow
      expect(coefficients.some((c) => Math.abs(c - (0.5 + extra)) < 1e-9)).toBe(true);
    }
  });
  it('2.3 Широкая зона: Archer active-skill AoE radius +6/10/16%; II/III zone duration +5/+10%', () => {
    for (const [rank, area, zone] of [
      [1, 6, 0],
      [2, 10, 5],
      [3, 16, 10],
    ] as const) {
      const w = archer({ 'archer.b2.n03': rank });
      const base = inSource(w, null, () => w.skills.area(100));
      expect(inSource(w, 'skill:arrow_rain', () => w.skills.area(100))).toBeCloseTo(
        base * (1 + area / 100),
        10,
      );
      expect(inSource(w, 'synergy:toxic_barrage', () => w.skills.area(100))).toBe(base);
      const z = inSource(w, 'skill:arrow_rain', () =>
        w.skills.zone({
          key: 'test',
          center: { x: 0, y: 0 },
          radius: 50,
          duration: 4,
          tickInterval: 1,
          onTick: () => {},
        }),
      );
      expect(z.expiresAt - w.time).toBeCloseTo(4 * (1 + zone / 100), 10);
    }
  });
  it('2.4 Манёвренная стрельба: physical arrows +4/7/11% while moving; II/III movement +3/+5%', () => {
    const base = archer({}).skills.effectiveStats.movementSpeed;
    for (const [rank, bonus, move] of [
      [1, 4, 0],
      [2, 7, 3],
      [3, 11, 5],
    ] as const) {
      const w = archer({ 'archer.b2.n04': rank });
      const e = durable(w, 900);
      expect(m(w, e, BOW)).toBe(1);
      w.setMovement(1, 0);
      expect(m(w, e, BOW)).toBeCloseTo(1 + bonus / 100, 10);
      expect(m(w, e, tags('skill', 'mark'))).toBe(1);
      w.setMovement(0, 0);
      expect(m(w, e, BOW)).toBe(1);
      // b2.n01 at rank II via prerequisite: +8% movement; percents add.
      expect(w.skills.effectiveStats.movementSpeed / base).toBeCloseTo(1 + (8 + move) / 100, 10);
    }
  });
  it('2.5 Перекрёстный огонь: an arrow kill → next arrow +8/13/20% for 3/4/5 s; no stacking, no re-arm by the boosted arrow', () => {
    for (const [rank, bonus, duration] of [
      [1, 8, 3],
      [2, 13, 4],
      [3, 20, 5],
    ] as const) {
      const w = archer({ 'archer.b2.n05': rank });
      const e = durable(w, 900);
      const hit = (killed: boolean, t: ReadonlySet<CombatTag> = BOW) =>
        w.skills.talentCombat.onDirectHit({ targetId: e, tags: t, killed });
      hit(true, tags('skill', 'mark')); // not an arrow
      expect(m(w, e, BOW)).toBe(1);
      hit(true);
      expect(m(w, e, BOW)).toBeCloseTo(1 + bonus / 100, 10);
      hit(true); // the boosted arrow kills: consumed, not re-armed
      expect(m(w, e, BOW)).toBe(1);
      hit(true);
      w.update(duration + 0.01); // expires unused
      expect(m(w, e, BOW)).toBe(1);
    }
  });
});
