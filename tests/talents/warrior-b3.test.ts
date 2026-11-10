import { describe, expect, it, vi } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { AttackSnapshot } from '../../src/combat-core';
import type { CombatTag } from '../../src/skills';
import { OFFHAND_TAGS, OFFHAND_WEAPON, TALENT_CONFIG } from '../../src/talents';
import type { TalentRanks } from '../../src/talents';
import { stationaryMelee } from '../skills/helpers';

function warrior(ranks: TalentRanks) {
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
  w.setTestProtection(true);
  return w;
}
function durable(w: GameplayWorld, distance: number, angle = 0) {
  const id = w.spawnEnemy('melee', distance, angle, stationaryMelee);
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  w.core.heal(id, 1e9);
  return id;
}
const OFFHAND = new Set<CombatTag>(OFFHAND_TAGS);
const SWORD = new Set<CombatTag>(['basic', 'physical', 'melee']);
const attack = { ...({} as AttackSnapshot), id: 'a', attackerId: 'player' } as AttackSnapshot;
const snap = (): AttackSnapshot =>
  ({
    ...attack,
    damageType: 'physical',
    coefficient: 1,
    baseDamage: 10,
    critical: false,
    rawDamage: 10,
  }) as AttackSnapshot;
const m = (w: GameplayWorld, target: string, tags: ReadonlySet<CombatTag>) =>
  w.skills.talentCombat.hitMultiplier(snap(), target, tags);
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
const starts = (w: GameplayWorld, weaponId: string) =>
  w
    .getEvents()
    .filter(
      (e) =>
        e.channel === 'weapon' &&
        e.event.type === 'attack-started' &&
        (e.event as { weaponId: string }).weaponId === weaponId,
    )
    .map((e) => e.time);

describe('Task 09.1 Phase 7 — Warrior · Мастер двух клинков (b3; G6, G7, C4)', () => {
  it('3.1 G6: the superpower equips an off-hand sword ×0.45/0.60/0.75, period 1.4 s, range 100, arc 100°', () => {
    expect(warrior({}).weapons.getSecondaryWeaponState(OFFHAND_WEAPON.id)).toBeNull();
    for (const [rank, coefficient] of [
      [1, 0.45],
      [2, 0.6],
      [3, 0.75],
    ] as const) {
      const state = warrior({ 'warrior.b3.n01': rank }).weapons.getSecondaryWeaponState(
        OFFHAND_WEAPON.id,
      )!;
      expect(state.weapon).toMatchObject({
        damageCoefficient: coefficient,
        baseAttackInterval: 1.4,
        attackRange: 100,
        arcDegrees: 100,
        pattern: 'melee_arc',
        damageType: 'physical',
      });
      expect(state.nextCycleAt).toBe(0); // its timer starts with the run
    }
    // Additive API validation: one weapon ID once, melee arcs only, primary weapon required.
    const w = warrior({ 'warrior.b3.n01': 1 });
    const config = w.weapons.getSecondaryWeaponState(OFFHAND_WEAPON.id)!.weapon;
    const input = {
      entityId: 'player',
      characterClass: 'warrior' as const,
      weapon: config,
      attackSpeedPercent: 100,
      fallbackDirection: { x: 1, y: 0 },
    };
    expect(() => w.weapons.equipSecondaryWeapon(input)).toThrow(/already equipped/);
    expect(() =>
      w.weapons.equipSecondaryWeapon({
        ...input,
        weapon: { ...config, id: 'x2', pattern: 'projectile' } as never,
      }),
    ).toThrow();
    expect(() =>
      w.weapons.equipSecondaryWeapon({
        ...input,
        entityId: 'nobody',
        weapon: { ...config, id: 'x3' },
      }),
    ).toThrow();
  });
  it('G6/G7: own timer; interval = 1.4/(1+bonus), the hero’s attack speed applied once through the weapon formula', () => {
    for (const [rank, bonus] of [
      [0, 0],
      [1, 8],
      [2, 15],
      [3, 22],
    ] as const) {
      const w = warrior(
        rank ? { 'warrior.b3.n01': 1, 'warrior.b3.n02': rank } : { 'warrior.b3.n01': 1 },
      );
      durable(w, 60);
      for (let i = 0; i < 160; i++) w.update(0.05);
      const off = starts(w, OFFHAND_WEAPON.id);
      const main = starts(w, w.getSnapshot().weapon.weapon.id);
      expect(off.length).toBeGreaterThan(3);
      const offInterval = off[2] - off[1];
      const mainInterval = main[2] - main[1];
      // Same attack-speed factor on both weapons ⇒ ratio of the base intervals.
      expect(offInterval / mainInterval).toBeCloseTo(1.4 / (1 + bonus / 100) / 0.8, 6);
    }
  });
  it('G6: off-hand hits are their own talent source; they never trigger passives, synergies or general direct bonuses', () => {
    const w = warrior({ 'warrior.b3.n01': 1, 'warrior.b1.n01': 3 });
    w.grantTestSkill('battle_fury', 1);
    const e = durable(w, 60);
    expect(m(w, e, OFFHAND)).toBe(1); // 1.1 (+16% sword) does not apply to the off-hand
    expect(m(w, e, SWORD)).toBeCloseTo(1.16, 10);
    const hits = vi.spyOn(w.skills.talentCombat, 'onSwordHit');
    for (let i = 0; i < 60; i++) w.update(0.05);
    expect(hits.mock.calls.some((c) => c[0] === 'offhand')).toBe(true);
    const sources = w.getSnapshot().runStats.bySource.map((s) => s.source);
    expect(sources).toContain('talent:warrior.b3.n01');
    expect(sources).toContain(`weapon:${w.getSnapshot().weapon.weapon.id}`);
  });
  it('3.2 Ритм двух клинков II/III: off-hand crit chance +3/+6 p.p. (primary sword unchanged)', () => {
    for (const [rank, crit] of [
      [1, 0],
      [2, 3],
      [3, 6],
    ] as const) {
      const w = warrior({ 'warrior.b3.n02': rank });
      expect(w.skills.weaponAttackBonus(OFFHAND_WEAPON.id)).toEqual(
        crit ? { criticalChanceBonus: crit } : {},
      );
      expect(w.skills.weaponAttackBonus(w.getSnapshot().weapon.weapon.id)).toEqual({});
    }
  });
  it('3.3 Перекрёстный удар (C4): main + off-hand on one target within 2 s → ×0.5/0.75/1.0, per-target CD 4/3.5/3 s', () => {
    for (const [rank, coefficient, cooldown] of [
      [1, 0.5, 4],
      [2, 0.75, 3.5],
      [3, 1, 3],
    ] as const) {
      const w = warrior({ 'warrior.b3.n03': rank });
      const e = durable(w, 900);
      const e2 = durable(w, 900, 1);
      const strike = vi.spyOn(w.skills, 'talentStrike');
      const tc = w.skills.talentCombat;
      tc.onSwordHit('offhand', e); // order does not matter
      expect(strike).not.toHaveBeenCalled();
      w.update(1.9);
      tc.onSwordHit('main', e);
      expect(strike).toHaveBeenCalledTimes(1);
      expect(strike.mock.calls[0].slice(0, 4)).toEqual([
        'warrior.b3.n03',
        e,
        coefficient,
        'physical',
      ]);
      expect((strike.mock.results[0].value as { procs: boolean }).procs).toBe(false);
      tc.onSwordHit('offhand', e); // cooldown on this target
      expect(strike).toHaveBeenCalledTimes(1);
      // Another target has its own cooldown; hits more than 2 s apart do not count.
      tc.onSwordHit('main', e2);
      w.update(2.01);
      tc.onSwordHit('offhand', e2);
      expect(strike).toHaveBeenCalledTimes(1);
      w.update(cooldown);
      w.skills.talents.proc(() => {
        tc.onSwordHit('main', e);
        tc.onSwordHit('offhand', e);
      });
      expect(strike).toHaveBeenCalledTimes(1); // never from inside a talent hit
      tc.onSwordHit('main', e);
      tc.onSwordHit('offhand', e);
      expect(strike).toHaveBeenCalledTimes(2);
    }
  });
  it('3.3 end to end: real main and off-hand hits produce cross strikes on a shared target', () => {
    const w = warrior({ 'warrior.b3.n03': 1 });
    durable(w, 60);
    for (let i = 0; i < 120; i++) w.update(0.05);
    expect(w.getSnapshot().runStats.bySource.map((s) => s.source)).toContain(
      'talent:warrior.b3.n03',
    );
  });
  it('3.4 Безупречная пара: off-hand +8/15/25%; II/III both swords +5/+10% vs targets below 30% HP', () => {
    for (const [rank, offhand, low] of [
      [1, 8, 0],
      [2, 15, 5],
      [3, 25, 10],
    ] as const) {
      const w = warrior({ 'warrior.b3.n04': rank });
      const e = durable(w, 900);
      expect(m(w, e, OFFHAND)).toBeCloseTo(1 + offhand / 100, 10);
      expect(m(w, e, SWORD)).toBe(1);
      setHpPercent(w, e, 29);
      expect(m(w, e, OFFHAND)).toBeCloseTo(1 + (offhand + low) / 100, 10);
      expect(m(w, e, SWORD)).toBeCloseTo(1 + low / 100, 10);
      expect(m(w, e, new Set<CombatTag>(['skill', 'physical', 'melee']))).toBe(1);
    }
  });
});
