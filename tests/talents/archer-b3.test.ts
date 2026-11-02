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
/** Beyond the bow's range (580) from the player, inside the ballista's (420 from 60 behind). */
function durable(w: GameplayWorld, distance: number, angle = 0) {
  const id = w.spawnEnemy('melee', distance, angle, stationaryMelee);
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  w.core.heal(id, 1e9);
  return id;
}
const SUMMON = 'archer.b3.n01:summon';
const ballistae = (w: GameplayWorld) => w.skills.talents.list('ballista');
const run = (w: GameplayWorld, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) w.update(0.05);
};
const BOLT = new Set<CombatTag>(['talent', 'secondary', 'physical', 'projectile', 'ballista']);
const snapshot = {
  id: 'a',
  attackerId: 'player',
  damageType: 'physical',
  coefficient: 1,
  baseDamage: 10,
  critical: false,
  rawDamage: 10,
} as AttackSnapshot;

describe('Task 09.1 Phase 9 — Archer · Осадный инженер (b3; G8, G9, G10, C7)', () => {
  it('C7: no ballista without the superpower; with it the first summon happens at run start when a target is in range', () => {
    const plain = archer({});
    durable(plain, 300, Math.PI);
    run(plain, 2);
    expect(ballistae(plain)).toEqual([]);
    const w = archer({ 'archer.b3.n01': 1 });
    durable(w, 300, Math.PI); // 240 from the ballista spot (60 behind = left of the player)
    w.update(0.05);
    const [b] = ballistae(w);
    expect(b).toBeDefined();
    const p = w.getSnapshot().playerBody;
    expect([b.x, b.y]).toEqual([p.x - 60, p.y]); // default facing right → 60 to the left
    expect(b.spawnedAt).toBe(0);
    expect(b.expiresAt).toBe(20);
    expect(w.getSnapshot().talentEntities?.map((e) => e.kind)).toEqual(['ballista']);
  });
  it('C7: no target → no summon and no cooldown spent; summon CD 30 s; lifetime 20/20/24 s', () => {
    for (const [rank, lifetime] of [
      [1, 20],
      [2, 20],
      [3, 24],
    ] as const) {
      const w = archer({ 'archer.b3.n01': rank });
      run(w, 1);
      expect(ballistae(w)).toEqual([]);
      expect(w.skills.talents.ready(SUMMON)).toBe(true);
      durable(w, 300, Math.PI);
      run(w, 0.05);
      expect(ballistae(w)).toHaveLength(1);
      const start = ballistae(w)[0].spawnedAt;
      expect(ballistae(w)[0].expiresAt - start).toBeCloseTo(lifetime, 10);
      run(w, lifetime + 0.1);
      expect(ballistae(w)).toEqual([]); // expired; the cooldown (30 s) is still running
      run(w, 30 - lifetime - 0.3);
      expect(ballistae(w)).toEqual([]);
      run(w, 0.3);
      expect(ballistae(w)).toHaveLength(1);
      expect(ballistae(w)[0].spawnedAt - start).toBeCloseTo(30, 1);
    }
  });
  it('G8: bolts every 1.6 s at the nearest enemy within 420, exactly 20 + 15/25/35% physical damage, no crit, own source', () => {
    for (const [rank, scale] of [
      [1, 15],
      [2, 25],
      [3, 35],
    ] as const) {
      const w = archer({ 'archer.b3.n01': rank });
      const far = durable(w, 480, Math.PI); // 420 from the ballista: in range
      durable(w, 700, Math.PI); // 640: out of range
      const shots = vi.spyOn(w.skills, 'talentProjectile');
      run(w, 5);
      expect(shots.mock.calls.length).toBe(3); // at 1.6, 3.2, 4.8
      const phys = w.core.getEntity('player').physicalDamage;
      for (const c of shots.mock.calls) {
        expect(c[0]).toBe('archer.b3.n01');
        expect(c[2]).toBe(far);
        expect(c[3]).toMatchObject({ speed: 600, radius: 5, range: 420 });
        expect(c[3].baseDamage).toBeCloseTo(20 + (scale / 100) * phys, 10);
      }
      const create = vi.spyOn(w.core, 'createAttack');
      run(w, 1.7);
      expect(create.mock.calls.some((c) => c[0].noCritical === true)).toBe(true);
      expect(w.getSnapshot().runStats.bySource.map((s) => s.source)).toContain(
        'talent:archer.b3.n01',
      );
    }
  });
  it('3.2 Инженерный расчёт (G9): fire interval 1.6/(1 + 10/18/28%); range 420 / 462 / 495.6', () => {
    for (const [rank, speed, range] of [
      [1, 10, 420],
      [2, 18, 462],
      [3, 28, 495.6],
    ] as const) {
      const w = archer({ 'archer.b3.n02': rank });
      durable(w, 300, Math.PI);
      const at: number[] = [];
      const shots = vi.spyOn(w.skills, 'talentProjectile').mockImplementation(() => {
        at.push(w.time);
      });
      run(w, 6);
      expect(shots).toHaveBeenCalled();
      expect(shots.mock.calls[0][3].range).toBeCloseTo(range, 10);
      expect(at[1] - at[0]).toBeCloseTo(1.6 / (1 + speed / 100), 10);
    }
  });
  it('3.3 Две позиции (C7): limit 2 with one shared 30 s summon CD; II/III lifetime +3/+6 s; a full limit spends no CD', () => {
    for (const [rank, extra] of [
      [1, 0],
      [2, 3],
      [3, 6],
    ] as const) {
      const w = archer({ 'archer.b3.n03': rank }); // n01 at rank II via prerequisite (20 s)
      durable(w, 300, Math.PI);
      run(w, 0.05);
      expect(ballistae(w)).toHaveLength(1);
      expect(ballistae(w)[0].expiresAt - ballistae(w)[0].spawnedAt).toBeCloseTo(20 + extra, 10);
      w.skills.talents.startCooldown(SUMMON, 0); // the shared cooldown ends early (test hook)
      run(w, 0.05);
      expect(ballistae(w)).toHaveLength(2); // second ballista, created sequentially
      const readyAt = w.skills.talents.readyAt(SUMMON);
      w.skills.talents.startCooldown(SUMMON, 0);
      run(w, 0.05);
      expect(ballistae(w)).toHaveLength(2); // full: skipped
      expect(w.skills.talents.ready(SUMMON)).toBe(true); // …without spending the cooldown
      expect(readyAt).toBeGreaterThan(w.time);
    }
    const one = archer({ 'archer.b3.n01': 3 });
    durable(one, 300, Math.PI);
    run(one, 0.05);
    one.skills.talents.startCooldown(SUMMON, 0);
    run(one, 0.05);
    expect(ballistae(one)).toHaveLength(1); // limit 1 without 3.3
  });
  it('3.4 Осадный огонь: ballista hits +10/20/30%; II/III Poison = Toxic Volley’s ×0.25/×0.40 (only if acquired)', () => {
    for (const [rank, bonus, poison] of [
      [1, 10, 0],
      [2, 20, 25],
      [3, 30, 40],
    ] as const) {
      const w = archer({ 'archer.b3.n04': rank });
      const e = durable(w, 300, Math.PI);
      expect(w.skills.talentCombat.hitMultiplier(snapshot, e, BOLT)).toBeCloseTo(
        1 + bonus / 100,
        10,
      );
      // Without Toxic Volley: no Poison.
      run(w, 3);
      expect(w.statuses.getGroup(e, 'poison')).toBeNull();
      if (!poison) continue;
      const v = archer({ 'archer.b3.n04': rank });
      v.grantTestSkill('toxic_volley', 1);
      const target = durable(v, 300, Math.PI); // inside the ballista's range
      v.skills['autos'].get('toxic_volley')!.readyAt = 1e9; // keep the Volley itself silent
      run(v, 3);
      const g = v.statuses.getGroup(target, 'poison')!;
      const p = v.skills['params']('toxic_volley');
      expect(g.stacks[0].rawDamagePerTick).toBeCloseTo(p.poisonDamage * (poison / 100), 10);
      expect(g.stacks[0].originId).toBe('talent:archer.b3.n04');
      expect(g.expiresAt - g.createdAt).toBeCloseTo(p.poisonDuration, 10);
      // procs=false: no synergy ever triggers from ballista hits.
      expect(v.getEvents().filter((x) => x.event.type === 'synergy-triggered')).toEqual([]);
    }
  });
  it('ballistae are removed on run end and on player death (cleanup)', () => {
    const w = archer({ 'archer.b3.n01': 1 });
    durable(w, 300, Math.PI);
    run(w, 0.05);
    expect(ballistae(w)).toHaveLength(1);
    w.setTestProtection(false);
    w.core.applyPeriodicDamage({
      operationId: 'kill-player',
      targetId: 'player',
      effectId: 'test',
      rawDamage: 1e9,
      sources: [{ applicationId: 'x', sourceId: 'player', rawDamage: 1e9 }],
    });
    w.update(0.05);
    expect(ballistae(w)).toEqual([]);
  });
});
