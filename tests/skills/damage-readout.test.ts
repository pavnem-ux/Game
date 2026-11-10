import { describe, expect, it } from 'vitest';
import {
  calculateCharacterStats,
  COMBAT_ATTRIBUTE_CAPS,
  scaleCooldown,
} from '../../src/character-stats';
import type { CombatAttributes } from '../../src/character-stats';
import { calculateSuccessfulDamage } from '../../src/combat-core';
import { ALPHA_ENEMY_STATS, ALPHA_WEAPONS } from '../../src/gameplay';
import type { GameplayWorld } from '../../src/gameplay';
import { SKILL_CATALOG, compareRanks, getSkill, skillDamageReadout } from '../../src/skills';
import type { DamageContext, HitLine, DotLine } from '../../src/skills';
import { arena, stationaryMelee } from './helpers';

const ACTIVES = SKILL_CATALOG.filter((s) => s.kind === 'auto');
const PASSIVES = SKILL_CATALOG.filter((s) => s.kind === 'passive');
const base = calculateCharacterStats('mage', 1).combatAttributes;
const stats = (over: Partial<CombatAttributes> = {}): CombatAttributes => ({ ...base, ...over });
const ctx = (over: Partial<DamageContext> = {}): DamageContext => ({
  stats: stats({ physicalDamage: 100, magicalDamage: 100, criticalDamage: 200 }),
  rankOf: () => 0,
  targetResistance: 20,
  ...over,
});
const hits = (id: string, rank: number, c = ctx()) =>
  skillDamageReadout(id, rank, c).lines.filter((l): l is HitLine => l.kind === 'hit');
const dots = (id: string, rank: number, c = ctx()) =>
  skillDamageReadout(id, rank, c).lines.filter((l): l is DotLine => l.kind === 'dot');
const line = (id: string, rank: number, key: string, c = ctx()) =>
  hits(id, rank, c).find((l) => l.key === key)!;
/** Context of the live world, exactly as the UI builds it from the snapshot. */
function worldCtx(w: GameplayWorld, resistance: number): DamageContext {
  const s = w.getSnapshot();
  const ranks = new Map(s.skills.owned.map((o) => [o.skillId, o.rank]));
  return {
    stats: s.stats,
    rankOf: (id) => ranks.get(id) ?? 0,
    targetResistance: resistance,
    weaponCoefficient: ALPHA_WEAPONS[s.character.characterClass].damageCoefficient,
  };
}

describe('damage readout — workbook examples and spec formatting', () => {
  it('Fireball I at magicDamage 100 vs Resistance 20: projectile 92, explosion 42, Burn separate', () => {
    const p = line('fireball', 1, 'projectile');
    expect([p.coefficient, p.amount.raw, p.amount.normal, p.amount.critical]).toEqual([
      1.1,
      100 * 1.1,
      92,
      183,
    ]);
    const e = line('fireball', 1, 'explosion');
    expect([e.coefficient, e.amount.normal, e.perTarget, e.secondary]).toEqual([
      0.5,
      42,
      true,
      false,
    ]);
    const burn = dots('fireball', 1)[0];
    expect([burn.effectType, burn.rawPerStack, burn.duration, burn.stacks, burn.stackCap]).toEqual([
      'burn',
      3,
      3,
      1,
      10,
    ]);
    expect(burn.perStackTick).toBe(calculateSuccessfulDamage(3, 20));
  });
  it('Blade Flurry I is 3 hits ×0.45, Inferno ×0.25 per zone tick, not totals', () => {
    const f = line('blade_flurry', 1, 'strike');
    expect([f.count, f.coefficient]).toEqual([3, 0.45]);
    const t = line('inferno', 1, 'tick');
    expect([t.coefficient, t.every, t.ticks, t.perTarget]).toEqual([0.25, 0.5, 6, true]);
  });
  it.each([
    ['hunters_mark', 'bonus-arrow', 0.6],
    ['war_cry', 'counter', 0.8],
    ['death_mark', 'execute', 1],
  ])('%s: rank I has no direct damage; rank V adds conditional %s ×%d', (id, key, coefficient) => {
    expect(skillDamageReadout(id, 1, ctx()).hasDirectDamage).toBe(false);
    expect(hits(id, 1)).toEqual([]);
    const v = skillDamageReadout(id, 5, ctx());
    expect(v.hasDirectDamage).toBe(false);
    const l = line(id, 5, key);
    expect(l.coefficient).toBe(coefficient);
    expect(l.condition).toBeTruthy();
  });
  it('every one of the 24 actives has a readout for ranks I–V; coefficients come from the catalogue', () => {
    expect(ACTIVES).toHaveLength(24);
    for (const s of ACTIVES)
      for (let rank = 1; rank <= 5; rank++) {
        const r = skillDamageReadout(s.id, rank, ctx());
        expect(r.lines.length).toBeGreaterThan(0);
        expect(r.cooldown).toBeCloseTo(
          scaleCooldown(s.ranks[rank - 1].cooldown, ctx().stats.cooldownReduction),
          12,
        );
        const params = Object.values(s.ranks[rank - 1]);
        for (const l of r.lines)
          if (l.kind === 'hit') {
            expect(params).toContain(l.coefficient);
            expect(l.amount.normal).toBe(calculateSuccessfulDamage(l.amount.raw, 20));
          }
      }
  });
  it('all 13 passives have truthful modifier lines', () => {
    expect(PASSIVES).toHaveLength(13);
    for (const s of PASSIVES)
      for (let rank = 1; rank <= 5; rank++)
        expect(skillDamageReadout(s.id, rank, ctx()).lines.length).toBeGreaterThan(0);
    const m = line('multishot', 1, 'copy', ctx({ weaponCoefficient: 1 }));
    expect([m.count, m.coefficient]).toEqual([1, 0.5]);
  });
  it('rank comparison distinguishes new effects from updated coefficients', () => {
    const up = compareRanks('fireball', 1, ctx());
    const change = (key: string) => up.changes.find((c) => c.line.key === key)!.change;
    expect([change('projectile'), change('explosion'), change('burn')]).toEqual([
      'changed',
      'changed',
      'same',
    ]);
    const v = compareRanks('fireball', 4, ctx());
    expect(v.changes.find((c) => c.line.key === 'embers')!.change).toBe('new');
    expect(compareRanks('fireball', 0, ctx()).changes.every((c) => c.change === 'new')).toBe(true);
  });
});

describe('damage readout — dynamic stats (acceptance 8) and edges (acceptance 10)', () => {
  it('stats, Elemental Mastery and DoT passives change computed numbers, never catalogue coefficients', () => {
    const plain = line('fireball', 2, 'projectile');
    const stronger = line(
      'fireball',
      2,
      'projectile',
      ctx({ stats: stats({ magicalDamage: 150, criticalDamage: 200 }) }),
    );
    expect(stronger.coefficient).toBe(plain.coefficient);
    expect(stronger.amount.normal).toBeGreaterThan(plain.amount.normal);
    const em = line(
      'fireball',
      2,
      'projectile',
      ctx({ rankOf: (id) => (id === 'elemental_mastery' ? 4 : 0) }),
    );
    expect(em.coefficient).toBe(1.4);
    expect(em.effectiveCoefficient).toBeCloseTo(1.4 * 1.26, 12);
    const toxic = dots(
      'toxic_volley',
      1,
      ctx({ rankOf: (id) => (id === 'toxic_mastery' ? 2 : id === 'lingering_effects' ? 1 : 0) }),
    )[0];
    expect(toxic.rawPerStack).toBeCloseTo(2 * 1.2, 12);
    expect(toxic.duration).toBeCloseTo(4 * 1.1, 12);
    expect(getSkill('fireball').ranks[1].coefficient).toBe(1.4);
  });
  it('very high Resistance keeps a minimum of 1; zero coefficient components are omitted', () => {
    const l = line('inferno', 1, 'tick', ctx({ targetResistance: 1e9 }));
    expect([l.amount.normal, l.amount.critical]).toEqual([1, 1]);
    expect(hits('fireball', 1).some((h) => h.key === 'embers')).toBe(false);
  });
  it('crit chance respects the central cap, including Blade Flurry V last-hit bonus', () => {
    const high = ctx({
      stats: stats({ physicalDamage: 100, criticalChance: 70, criticalDamage: 200 }),
    });
    expect(line('blade_flurry', 5, 'strike', high).amount.critChance).toBe(70);
    expect(line('blade_flurry', 5, 'last', high).amount.critChance).toBe(
      COMBAT_ATTRIBUTE_CAPS.criticalChance,
    );
  });
  it('DoT full-stack tick sums 10 stacks before Resistance (one Core resolution per tick)', () => {
    const b = dots('lacerate', 1)[0];
    expect(b.fullStackTick).toBe(calculateSuccessfulDamage(3 * 10, 20));
    expect(b.tickInterval).toBe(1);
  });
  it('rejects invalid ranks', () => {
    expect(() => skillDamageReadout('fireball', 0, ctx())).toThrow();
    expect(() => skillDamageReadout('fireball', 6, ctx())).toThrow();
  });
});

describe('damage readout agrees with the authoritative combat pipeline (acceptance 7)', () => {
  it('every hit line of all 24 actives at ranks I–V matches Combat Core resolution on a real enemy', () => {
    for (const cls of ['mage', 'warrior', 'archer', 'rogue'] as const) {
      const w = arena(cls, { level: 12 });
      const enemy = w.spawnEnemy('melee', 900, 0, stationaryMelee);
      w.core.updateEntityStats(enemy, { ...w.core.getEntity(enemy), maxHp: 1e12 });
      const resistance = w.core.getEntity(enemy).resistance;
      expect(resistance).toBe(ALPHA_ENEMY_STATS.resistance);
      const c = worldCtx(w, resistance);
      for (const s of ACTIVES.filter((d) => d.owner === cls))
        for (let rank = 1; rank <= 5; rank++)
          for (const l of hits(s.id, rank, c)) {
            const attack = w.core.createAttack({
              attackerId: 'player',
              damageType: l.damageType,
              coefficient: l.effectiveCoefficient,
            });
            const result = w.core.resolveAttack(attack, enemy);
            expect(result.damage).toBe(attack.critical ? l.amount.critical : l.amount.normal);
          }
    }
  });
  it('a real Fireball activation deals exactly the displayed projectile damage (normal or crit)', () => {
    for (const rank of [1, 2, 5]) {
      const w = arena('mage', { level: 10, onHit: [] });
      w.weapons.setAttackSpeed('player', 0.01);
      const enemy = w.spawnEnemy('melee', 300, 0, stationaryMelee);
      w.core.updateEntityStats(enemy, { ...w.core.getEntity(enemy), maxHp: 1e12 });
      w.grantTestSkill('fireball', rank);
      const expected = line(
        'fireball',
        rank,
        'projectile',
        worldCtx(w, w.core.getEntity(enemy).resistance),
      );
      for (let i = 0; i < 300; i++) w.update(0.02);
      const impacts = w
        .getEvents()
        .filter(
          (e) =>
            e.channel === 'weapon' &&
            e.event.type === 'impact' &&
            e.event.weaponId.startsWith('skill:fireball') &&
            !e.event.weaponId.includes('ember') &&
            e.event.targetId === enemy,
        );
      expect(impacts.length).toBeGreaterThan(0);
      for (const e of impacts)
        if (e.event.type === 'impact')
          expect(e.event.result.damage).toBe(
            e.event.attack.critical ? expected.amount.critical : expected.amount.normal,
          );
    }
  });
  it('a buff refreshes the displayed damage from the live snapshot without touching rank tables', () => {
    const w = arena('warrior', { level: 10 });
    w.grantTestSkill('battle_fury', 1);
    const before = line('cleave', 1, 'slash', worldCtx(w, 5));
    w.skills.setBuff('battle_fury', 3, 0, w.time + 10);
    w.update(0.01);
    const after = line('cleave', 1, 'slash', worldCtx(w, 5));
    expect(after.coefficient).toBe(before.coefficient);
    expect(after.amount.raw).toBeGreaterThan(before.amount.raw);
  });
});
