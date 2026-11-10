import { describe, expect, it, vi } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { CombatTag } from '../../src/skills';
import type { EffectType } from '../../src/status-effects';
import { TALENT_CONFIG } from '../../src/talents';
import type { TalentRanks } from '../../src/talents';
import { stationaryMelee } from '../skills/helpers';

/** Rogue level 50 with the given ranks (prerequisites filled to rank II automatically). */
function rogue(
  ranks: TalentRanks,
  extra: Partial<ConstructorParameters<typeof GameplayWorld>[0]> = {},
) {
  const full: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const node = TALENT_CONFIG.nodes.get(id)!;
    for (let n = node; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!)
      full[n.requires] = Math.max(full[n.requires] ?? 0, 2);
    full[id] = rank;
  }
  const w = new GameplayWorld({
    characterClass: 'rogue',
    level: 50,
    seed: 9,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    talents: { ranks: full },
    ...extra,
  });
  w.setTestProtection(true);
  return w;
}
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
const dot = (w: GameplayWorld, target: string, effectType: EffectType, stacks: number, tick = 1) =>
  w.skills.applyStatus(
    target,
    { effectType, rawDamagePerTick: tick, duration: 30, probabilityPercent: 100 },
    stacks,
  );
const group = (w: GameplayWorld, target: string, type: EffectType) =>
  w.statuses.getGroup(target, type);
const SKILL = new Set<CombatTag>(['skill', 'physical']);
const m = (w: GameplayWorld, target: string, tags: ReadonlySet<CombatTag> = SKILL) =>
  w.skills.talentCombat.hitMultiplier(
    {
      id: 'attack-x',
      attackerId: 'player',
      damageType: 'physical',
      coefficient: 1,
      baseDamage: 10,
      critical: false,
      rawDamage: 10,
    } as never,
    target,
    tags,
  );

describe('Task 09.1 Phase 3 — Rogue · Алхимик ядов (b3)', () => {
  it('3.1 G1/G2: Poison and Burn roll separately (15/25/35%), 1.5/2/3 per tick, 4 s shared group timer', () => {
    for (const [rank, chance, tick] of [
      [1, 15, 1.5],
      [2, 25, 2],
      [3, 35, 3],
    ] as const) {
      const w = rogue({ 'rogue.b3.n01': rank });
      const e = durable(w, 300, 0);
      const roll = vi.spyOn(w.skills.talents, 'roll').mockReturnValue(true);
      const start = w.time;
      w.skills.talentCombat.onBasicHit(e);
      expect(roll.mock.calls).toEqual([[chance], [chance]]); // two independent rolls
      for (const type of ['poison', 'burn'] as const) {
        const g = group(w, e, type)!;
        expect(g.stacks.map((s) => s.rawDamagePerTick)).toEqual([tick]);
        expect(g.stacks[0].originId).toBe('talent:rogue.b3.n01');
        expect(g.expiresAt - start).toBeCloseTo(4, 10);
      }
      // Only one of the two rolls succeeds → only that type is applied.
      roll.mockReset();
      roll.mockReturnValueOnce(false).mockReturnValueOnce(true);
      const e2 = durable(w, 300, 1);
      w.skills.talentCombat.onBasicHit(e2);
      expect(group(w, e2, 'poison')).toBeNull();
      expect(group(w, e2, 'burn')!.stacks).toHaveLength(1);
    }
  });
  it('3.1: max 10 stacks per type, oldest replaced, group timer refreshed (no per-stack durations)', () => {
    const w = rogue({ 'rogue.b3.n01': 1 });
    const e = durable(w, 300, 0);
    vi.spyOn(w.skills.talents, 'roll').mockReturnValue(true);
    w.skills.talentCombat.onBasicHit(e);
    const first = group(w, e, 'poison')!.stacks[0].id;
    w.update(1);
    for (let i = 0; i < 10; i++) w.skills.talentCombat.onBasicHit(e);
    const g = group(w, e, 'poison')!;
    expect(g.stacks).toHaveLength(10);
    expect(g.stacks.map((s) => s.id)).not.toContain(first);
    expect(g.expiresAt - w.time).toBeCloseTo(4, 10);
  });
  it('3.1 end to end: real basic dagger hits add Poison/Burn; the basic Bleed is preserved; a talent-proc never re-procs', () => {
    const w = new GameplayWorld({
      characterClass: 'rogue',
      level: 50,
      seed: 3,
      initialEnemies: false,
      spawning: { enabled: false },
      talents: { ranks: { 'rogue.b3.n01': 3 } },
    });
    w.setTestProtection(true);
    const e = durable(w, 30, 0);
    for (let i = 0; i < 200 && !(group(w, e, 'poison') && group(w, e, 'burn')); i++) w.update(0.05);
    expect(group(w, e, 'poison')?.stacks[0].originId).toBe('talent:rogue.b3.n01');
    expect(group(w, e, 'burn')?.stacks[0].originId).toBe('talent:rogue.b3.n01');
    expect(group(w, e, 'bleed')).not.toBeNull(); // the basic dagger's own Bleed still applies
    const roll = vi.spyOn(w.skills.talents, 'roll');
    w.skills.talents.proc(() => w.skills.talentCombat.onBasicHit(e));
    expect(roll).not.toHaveBeenCalled();
    w.update(1.5);
    const sources = w.getSnapshot().runStats.bySource.map((s) => s.source);
    expect(sources).toContain('talent:rogue.b3.n01');
  });
  it('3.2 Алхимическая реакция: direct hits +8% at 2 DoT types; II 14/20, III 18/28 at 2/3 types', () => {
    for (const [rank, one, two, three] of [
      [1, 1, 1.08, 1.08],
      [2, 1, 1.14, 1.2],
      [3, 1, 1.18, 1.28],
    ] as const) {
      const w = rogue({ 'rogue.b3.n02': rank });
      const e = durable(w, 300, 0);
      dot(w, e, 'poison', 1);
      expect(m(w, e), `rank ${rank}, 1 type`).toBeCloseTo(one, 10);
      dot(w, e, 'burn', 1);
      expect(m(w, e), `rank ${rank}, 2 types`).toBeCloseTo(two, 10);
      dot(w, e, 'bleed', 1);
      expect(m(w, e), `rank ${rank}, 3 types`).toBeCloseTo(three, 10);
      // Talent/secondary hits and DoT ticks never receive the direct bonus.
      expect(m(w, e, new Set<CombatTag>(['talent', 'secondary', 'physical']))).toBe(1);
    }
  });
  it('3.3 Токсическая перегрузка rank I: DoT damage taken +10% only with 3 DoT types; II/III blocked (E2)', () => {
    const n03 = TALENT_CONFIG.nodes.get('rogue.b3.n03')!;
    expect(n03.ranks.map((r) => r.status)).toEqual(['ready', 'blocked', 'blocked']);
    const w = rogue({ 'rogue.b3.n03': 1 });
    const e = durable(w, 300, 0);
    dot(w, e, 'poison', 1, 10);
    dot(w, e, 'burn', 1, 10);
    expect(w.skills.talentCombat.dotTakenMultiplier(e)).toBe(1);
    dot(w, e, 'bleed', 1, 10);
    expect(w.skills.talentCombat.dotTakenMultiplier(e)).toBeCloseTo(1.1, 10);
    expect(w.skills.talentCombat.dotTakenMultiplier('player')).toBe(1);
    const seq = w.getEvents().at(-1)?.sequence ?? 0;
    w.update(1.01);
    const ticks = w
      .getEvents(seq)
      .filter((x) => x.event.type === 'status-tick')
      .map((x) => (x.event as { rawDamage: number }).rawDamage);
    expect(ticks).toHaveLength(3);
    for (const raw of ticks) expect(raw).toBeCloseTo(11, 10);
    // Rank II is inert (blocked): no multiplier at all.
    const w2 = rogue({ 'rogue.b3.n03': 2 });
    const e2 = durable(w2, 300, 0);
    for (const t of ['poison', 'burn', 'bleed'] as const) dot(w2, e2, t, 1, 10);
    expect(w2.skills.talentCombat.dotTakenMultiplier(e2)).toBe(1);
  });
  it('3.4 Смертельный синтез G5: 10/10/10 → ×1.5/2.0/2.6 explosion, radius 80/100/130, one hit per enemy, procs=false', () => {
    for (const [rank, coefficient, radius] of [
      [1, 1.5, 80],
      [2, 2, 100],
      [3, 2.6, 130],
    ] as const) {
      const w = rogue({ 'rogue.b3.n04': rank });
      const center = durable(w, 300, 0);
      // Body overlap like every skill AoE: a melee body (radius 14) counts when d ≤ radius + 14.
      const near = durable(w, 390, 0); // 90 → inside 80 + 14
      const mid = durable(w, 410, 0); // 110 → inside 100 + 14 only
      const far = durable(w, 440, 0); // 140 → inside 130 + 14 only
      const outside = durable(w, 460, 0); // 160 → never
      const strike = vi.spyOn(w.skills, 'talentStrike');
      dot(w, center, 'poison', 10);
      dot(w, center, 'bleed', 10);
      dot(w, center, 'burn', 9);
      w.update(0.05);
      expect(strike).not.toHaveBeenCalled(); // 9 Burn: no explosion
      dot(w, center, 'burn', 1);
      w.update(0.05);
      const calls = strike.mock.calls.filter((c) => c[0] === 'rogue.b3.n04');
      const hitIds = calls.map((c) => c[1]);
      const expected = [center, near, mid, far, outside].filter(
        (_, i) => [0, 90, 110, 140, 160][i] <= radius + 14,
      );
      expect([...hitIds].sort()).toEqual([...expected].sort());
      expect(new Set(hitIds).size).toBe(hitIds.length); // once per enemy
      for (const c of calls) expect(c.slice(2, 4)).toEqual([coefficient, 'physical']);
      for (const r of strike.mock.results)
        expect((r.value as { procs: boolean }).procs).toBe(false);
      // The explosion does not spread DoT.
      for (const id of [near, mid, far, outside]) expect(w.statuses.getGroups(id)).toEqual([]);
      expect(w.getSnapshot().runStats.bySource.map((s) => s.source)).toContain(
        'talent:rogue.b3.n04',
      );
    }
  });
  it('3.4: per-target cooldown 8 s on the initiating target; never triggered from inside a talent proc', () => {
    const w = rogue({ 'rogue.b3.n04': 1 });
    const e = durable(w, 300, 0);
    const strike = vi.spyOn(w.skills, 'talentStrike');
    for (const t of ['poison', 'burn', 'bleed'] as const) dot(w, e, t, 10);
    w.update(0.05);
    expect(strike).toHaveBeenCalledTimes(1);
    dot(w, e, 'poison', 1); // still 10/10/10, but the cooldown is running
    w.update(7.5);
    for (const t of ['poison', 'burn', 'bleed'] as const) dot(w, e, t, 1);
    w.update(0.05);
    expect(strike).toHaveBeenCalledTimes(1);
    w.update(0.5); // past 8 s
    w.skills.talents.proc(() => w.skills.talentCombat.onStatusesApplied([e]));
    expect(strike).toHaveBeenCalledTimes(1); // no chains from inside a proc
    dot(w, e, 'burn', 1);
    w.update(0.05);
    expect(strike).toHaveBeenCalledTimes(2);
  });
});
