import { describe, expect, it, vi } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { AttackSnapshot } from '../../src/combat-core';
import type { CombatTag } from '../../src/skills';
import { TALENT_CONFIG } from '../../src/talents';
import type { TalentRanks } from '../../src/talents';
import { stationaryMelee } from '../skills/helpers';

/** Rogue level 50 with the given ranks (prerequisites filled to rank II automatically). */
function rogue(ranks: TalentRanks, level = 50) {
  const full: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const node = TALENT_CONFIG.nodes.get(id)!;
    for (let n = node; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!)
      full[n.requires] = Math.max(full[n.requires] ?? 0, 2);
    full[id] = rank;
  }
  const w = new GameplayWorld({
    characterClass: 'rogue',
    level,
    seed: 9,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    talents: { ranks: full },
  });
  w.setTestProtection(true);
  return w;
}
const DAGGER = new Set<CombatTag>(['basic', 'physical', 'melee', 'dagger']);
/** A stationary test enemy with a large HP pool (talent strikes must not kill it). */
function durable(w: GameplayWorld, distance: number, angle: number) {
  const id = w.spawnEnemy('melee', distance, angle, stationaryMelee);
  const e = w.core.getEntity(id);
  w.core.updateEntityStats(id, {
    maxHp: 1e6,
    physicalDamage: e.physicalDamage,
    magicalDamage: e.magicalDamage,
    resistance: e.resistance,
    criticalChance: e.criticalChance,
    criticalDamage: e.criticalDamage,
    dodgeChance: e.dodgeChance,
  });
  w.core.heal(id, 1e6);
  return id;
}
const attack = (critical = false): AttackSnapshot =>
  ({
    id: 'attack-x',
    attackerId: 'player',
    damageType: 'physical',
    coefficient: 1,
    baseDamage: 10,
    critical,
    rawDamage: critical ? 15 : 10,
  }) as AttackSnapshot;
const bleed = (w: GameplayWorld, target: string, stacks: number) =>
  w.skills.applyStatus(
    target,
    { effectType: 'bleed', rawDamagePerTick: 1, duration: 30, probabilityPercent: 100 },
    stacks,
  );
const m = (w: GameplayWorld, target: string, tags: ReadonlySet<CombatTag> = DAGGER, crit = false) =>
  w.skills.talentCombat.hitMultiplier(attack(crit), target, tags);
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

describe('Task 09.1 Phase 2 — Rogue · Ассасин (b1)', () => {
  it('1.1 Кровавый клинок: dagger hits on bleeding targets; rank totals (I 6 / II 10+5 at 5+ / III 15+10 at 10)', () => {
    for (const [rank, stacks, expected] of [
      [1, 1, 1.06],
      [1, 0, 1],
      [2, 4, 1.1],
      [2, 5, 1.15],
      [3, 9, 1.15],
      [3, 10, 1.25],
    ] as const) {
      const w = rogue({ 'rogue.b1.n01': rank });
      const [e] = [w.spawnEnemy('melee', 60, 0, stationaryMelee)];
      if (stacks) bleed(w, e, stacks);
      expect(m(w, e), `rank ${rank}, ${stacks} stacks`).toBeCloseTo(expected, 10);
      // Non-dagger, talent and synergy/secondary hits never get the direct bonus.
      expect(m(w, e, new Set<CombatTag>(['skill', 'magical']))).toBe(1);
      expect(m(w, e, new Set<CombatTag>(['talent', 'secondary', 'dagger']))).toBe(1);
    }
  });
  it('1.2 Скрытая точность: rank I adds 3 crit points to dagger attacks; II/III are blocked (inert)', () => {
    expect(rogue({ 'rogue.b1.n02': 1 }).skills.weaponAttackBonus()).toEqual({
      criticalChanceBonus: 3,
    });
    const n02 = TALENT_CONFIG.nodes.get('rogue.b1.n02')!;
    expect(n02.ranks.map((r) => r.status)).toEqual(['ready', 'blocked', 'blocked']);
    expect(rogue({ 'rogue.b1.n02': 2 }).skills.weaponAttackBonus()).toEqual({});
    const w = rogue({ 'rogue.b1.n02': 1 });
    expect(w.skills.talentCombat.critChance(DAGGER)).toBe(3);
    expect(w.skills.talentCombat.critChance(new Set<CombatTag>(['skill', 'physical']))).toBe(0);
  });
  it('1.3 Жестокий порез: dagger Bleed per tick ×1.08/1.13/1.20; direct +4%/+8% at 5+/10 stacks', () => {
    const def = {
      effectType: 'bleed',
      rawDamagePerTick: 10,
      duration: 4,
      probabilityPercent: 100,
    } as const;
    for (const [rank, factor] of [
      [1, 1.08],
      [2, 1.13],
      [3, 1.2],
    ] as const) {
      const w = rogue({ 'rogue.b1.n03': rank });
      expect(w.skills.playerEffect(def, { basic: true }).rawDamagePerTick).toBeCloseTo(
        10 * factor,
        10,
      );
      // A Poison application or a non-dagger origin is not affected.
      expect(
        w.skills.playerEffect({ ...def, effectType: 'poison' }, { basic: true }).rawDamagePerTick,
      ).toBe(10);
      expect(w.skills.playerEffect(def).rawDamagePerTick).toBe(10);
    }
    const w2 = rogue({ 'rogue.b1.n03': 2 });
    const e2 = w2.spawnEnemy('melee', 60, 0, stationaryMelee);
    bleed(w2, e2, 5);
    expect(m(w2, e2, new Set<CombatTag>(['skill', 'physical']))).toBeCloseTo(1.04, 10);
    const w3 = rogue({ 'rogue.b1.n03': 3 });
    const e3 = w3.spawnEnemy('melee', 60, 0, stationaryMelee);
    bleed(w3, e3, 9);
    expect(m(w3, e3, new Set<CombatTag>(['skill', 'physical']))).toBe(1);
    bleed(w3, e3, 1);
    expect(m(w3, e3, new Set<CombatTag>(['skill', 'physical']))).toBeCloseTo(1.08, 10);
  });
  it('1.4 Охота на слабых: below 30% HP (+Bleed at II); rank III raises Final Cut damage ×1.15', () => {
    const w = rogue({ 'rogue.b1.n04': 2 });
    const e = w.spawnEnemy('melee', 60, 0, stationaryMelee);
    const other = new Set<CombatTag>(['skill', 'physical']);
    expect(m(w, e, other)).toBe(1);
    setHpPercent(w, e, 25);
    expect(m(w, e, other)).toBeCloseTo(1.12, 10);
    bleed(w, e, 1);
    expect(m(w, e, other)).toBeCloseTo(1.17, 10);
    const w3 = rogue({ 'rogue.b1.n04': 3 });
    const e3 = w3.spawnEnemy('melee', 60, 0, stationaryMelee);
    w3.skills.setSource('synergy:final_cut');
    expect(m(w3, e3, new Set<CombatTag>(['synergy', 'secondary']))).toBeCloseTo(1.15, 10);
    w3.skills.setSource('synergy:deep_wounds');
    expect(m(w3, e3, new Set<CombatTag>(['synergy', 'secondary']))).toBe(1);
    w3.skills.setSource(null);
  });
  it('1.5 Последний удар: dagger crit damage, exact on the snapshot crit multiplier; non-crits unchanged', () => {
    const w = rogue({ 'rogue.b1.n05': 3 });
    const e = w.spawnEnemy('melee', 60, 0, stationaryMelee);
    expect(m(w, e, DAGGER, false)).toBe(1);
    expect(m(w, e, DAGGER, true)).toBeCloseTo((1.5 + 0.28) / 1.5, 10);
    setHpPercent(w, e, 20);
    // Prerequisite n04 rank II also applies below 30% HP (+12%).
    expect(m(w, e, DAGGER, true)).toBeCloseTo(1.12 * ((1.5 + 0.28 + 0.12) / 1.5), 10);
    const w2 = rogue({ 'rogue.b1.n05': 2 });
    const e2 = w2.spawnEnemy('melee', 60, 0, stationaryMelee);
    bleed(w2, e2, 1);
    // Prerequisite n01 rank II also applies on a bleeding target (+10%).
    expect(m(w2, e2, DAGGER, true)).toBeCloseTo(1.1 * ((1.5 + 0.25) / 1.5), 10);
  });
});

describe('Task 09.1 Phase 2 — Rogue · Теневой охотник (b2; G3, G4, C8)', () => {
  it('2.1 Лёгкий шаг: dodge +2/+4/+6 p.p., movement +3%/+5% (composed once)', () => {
    const base = rogue({});
    for (const [rank, dodge, move] of [
      [1, 2, 0],
      [2, 4, 3],
      [3, 6, 5],
    ] as const) {
      const w = rogue({ 'rogue.b2.n01': rank });
      expect(w.getSnapshot().player.dodgeChance).toBe(
        base.getSnapshot().player.dodgeChance + dodge,
      );
      expect(w.skills.effectiveStats.movementSpeed).toBeCloseTo(
        base.skills.effectiveStats.movementSpeed * (1 + move / 100),
        10,
      );
    }
  });
  it('2.2 Ответный выпад: counter ×0.45 on the attacker, CD 3 s, never from inside a talent proc', () => {
    const w = rogue({ 'rogue.b2.n02': 1 }, 20);
    const e = durable(w, 200, 0); // outside the player's dagger reach
    const strike = vi.spyOn(w.skills, 'talentStrike');
    w.skills.onPlayerDodged(e);
    expect(strike).toHaveBeenCalledTimes(1);
    expect(strike.mock.calls[0].slice(0, 4)).toEqual(['rogue.b2.n02', e, 0.45, 'physical']);
    const hit = strike.mock.results[0].value as { procs: boolean };
    expect(hit.procs).toBe(false);
    w.skills.onPlayerDodged(e); // cooldown
    expect(strike).toHaveBeenCalledTimes(1);
    w.update(3.01);
    w.skills.talents.proc(() => w.skills.onPlayerDodged(e)); // a counter never starts a counter
    expect(strike).toHaveBeenCalledTimes(1);
    w.skills.onPlayerDodged(e);
    expect(strike).toHaveBeenCalledTimes(2);
    expect(w.getSnapshot().runStats.bySource.map((s) => s.source)).toContain('talent:rogue.b2.n02');
  });
  it('end to end: real enemy attacks that the player dodges trigger counters (world wiring)', () => {
    const w = new GameplayWorld({
      characterClass: 'rogue',
      level: 50,
      seed: 4,
      initialEnemies: false,
      spawning: { enabled: false },
      onHit: [],
      talents: { ranks: { 'rogue.b2.n01': 3, 'rogue.b2.n02': 3 } },
    });
    for (let i = 0; i < 4; i++) durable(w, 20, i * 1.5); // already in contact range
    let dodges = 0;
    let seq = 0;
    for (let t = 0; t < 400 && dodges < 3; t++) {
      w.update(0.05);
      for (const e of w.getEvents(seq)) {
        seq = e.sequence;
        if (e.event.type === 'dodge' && e.event.targetId === 'player') dodges++;
      }
    }
    expect(dodges).toBeGreaterThan(0);
    expect(w.getSnapshot().runStats.bySource.map((s) => s.source)).toContain('talent:rogue.b2.n02');
  });
  it('C8: Неуловимый rank III multiplies only the counterattack (×1.15)', () => {
    const w = rogue({ 'rogue.b2.n02': 3, 'rogue.b2.n05': 3 });
    const e = w.spawnEnemy('melee', 60, 0, stationaryMelee);
    const strike = vi.spyOn(w.skills, 'talentStrike');
    w.skills.onPlayerDodged(e);
    expect(strike.mock.calls[0][2]).toBeCloseTo(0.85 * 1.15, 10);
  });
  it('2.3/2.4 shadow copy: 45 behind, max 1, nearest within 180, every 1.2/speed s, no crit/DoT/procs', () => {
    const w = rogue({ 'rogue.b2.n04': 2 }, 20); // n03 at rank II via prerequisite
    const behind = durable(w, 130, Math.PI); // 85 from the copy
    const attacker = w.spawnEnemy('melee', 400, 0, stationaryMelee); // takes the n02 counter
    vi.spyOn(w.skills.talents, 'roll').mockReturnValue(true);
    const strike = vi.spyOn(w.skills, 'talentStrike');
    const start = w.time;
    w.skills.onPlayerDodged(attacker);
    const copies = w.skills.talents.list('shadow-copy');
    expect(copies).toHaveLength(1);
    const p = w.getSnapshot().playerBody;
    expect([copies[0].x, copies[0].y]).toEqual([p.x - 45, p.y]);
    expect(copies[0].expiresAt - start).toBeCloseTo(4, 10); // n03 rank II lifetime
    w.skills.onPlayerDodged(attacker); // max 1 copy (and the 12 s cooldown)
    expect(w.skills.talents.list('shadow-copy')).toHaveLength(1);
    w.update(3.9);
    const copyCalls = strike.mock.calls.filter((c) => c[0] === 'rogue.b2.n03');
    const interval = 1.2 / 1.1; // n04 rank II speed ×1.10
    expect(copyCalls.length).toBe(Math.floor(3.9 / interval));
    for (const c of copyCalls) {
      expect(c.slice(1, 4)).toEqual([behind, 0.5, 'physical']); // n04 replaces ×0.20
      expect(c[5]).toEqual({ noCritical: true });
    }
    for (const r of strike.mock.results.filter(
      (_, i) => strike.mock.calls[i][0] === 'rogue.b2.n03',
    )) {
      const hit = r.value as { procs: boolean; attack: AttackSnapshot };
      expect(hit.procs).toBe(false);
      expect(hit.attack.critical).toBe(false);
    }
    expect(w.getSnapshot().statuses.filter((g) => g.targetId === behind)).toEqual([]); // no DoT
    w.update(0.2);
    expect(w.skills.talents.list('shadow-copy')).toEqual([]); // expired at 4 s
  });
  it('2.3 copy chance uses the seeded talent stream and the 12 s cooldown', () => {
    const w = rogue({ 'rogue.b2.n03': 1 });
    const e = w.spawnEnemy('melee', 60, 0, stationaryMelee);
    const roll = vi.spyOn(w.skills.talents, 'roll').mockReturnValue(false);
    w.skills.onPlayerDodged(e);
    expect(roll).toHaveBeenCalledWith(15);
    expect(w.skills.talents.list('shadow-copy')).toEqual([]);
    roll.mockReturnValue(true);
    w.skills.onPlayerDodged(e);
    w.update(3.05);
    w.skills.onPlayerDodged(e); // copy gone, but the 12 s cooldown is running
    expect(w.skills.talents.list('shadow-copy')).toEqual([]);
    w.update(9);
    w.skills.onPlayerDodged(e);
    expect(w.skills.talents.list('shadow-copy')).toHaveLength(1);
  });
  it('2.5 Неуловимый: +8% movement for 2 s after a dodge; refreshes, never stacks', () => {
    const w = rogue({ 'rogue.b2.n05': 1 });
    const e = w.spawnEnemy('melee', 400, 0, stationaryMelee);
    const base = w.skills.effectiveStats.movementSpeed; // includes n01 rank II (+3%)
    const buffed = (base / 1.03) * (1.03 + 0.08); // movement percents add, composed once
    w.skills.onPlayerDodged(e);
    expect(w.skills.effectiveStats.movementSpeed).toBeCloseTo(buffed, 10);
    w.update(1);
    w.skills.onPlayerDodged(e);
    expect(w.skills.effectiveStats.movementSpeed).toBeCloseTo(buffed, 10);
    w.update(1.9);
    expect(w.skills.effectiveStats.movementSpeed).toBeCloseTo(buffed, 10);
    w.update(0.2);
    expect(w.skills.effectiveStats.movementSpeed).toBe(base);
  });
});
