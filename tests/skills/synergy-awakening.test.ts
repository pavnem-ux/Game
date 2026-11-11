import { describe, expect, it } from 'vitest';
import type { CharacterClass } from '../../src/character-stats';
import { COMBAT_ATTRIBUTE_CAPS } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import type { WorldEvent } from '../../src/gameplay';
import { CONTROL_RULES as SKILL_CONTROL, SYNERGY_AWAKENING } from '../../src/skills';
import type { CombatTag, SynergyId, SynergyLevel } from '../../src/skills';
import type { EffectType } from '../../src/status-effects';
import { TALENT_CONFIG } from '../../src/talents';
import { arena, skillEvents, stationaryMelee } from './helpers';

const A = SYNERGY_AWAKENING;

/** Durable stationary enemies at the given distances along one line (angle 0) from the player. */
function setup(
  c: CharacterClass,
  distances: number[],
  seed = 7,
  w = arena(c, { level: 10, onHit: [], seed }),
) {
  w.weapons.setAttackSpeed('player', 1);
  const ids = distances.map((d) => w.spawnEnemy('melee', d, 0, stationaryMelee));
  for (const id of ids) w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  return { w, ids };
}
const level = (w: GameplayWorld, id: SynergyId, l: SynergyLevel) => w.setTestSynergyLevel(id, l);
const tags = (...t: CombatTag[]) => new Set<CombatTag>(t);
const strike = (
  w: GameplayWorld,
  target: string,
  t: ReadonlySet<CombatTag>,
  options: { critical?: boolean; projectileKey?: string } = {},
) => {
  const attack = w.skills.attack(t, 0.01, t.has('magical') ? 'magical' : 'physical');
  const snapshot =
    options.critical === undefined ? attack : { ...attack, critical: options.critical };
  return w.skills.hit(
    target,
    snapshot,
    t,
    options.projectileKey ? { projectileKey: options.projectileKey } : {},
  );
};
const dot = (w: GameplayWorld, id: string, type: EffectType, stacks = 1, damage = 0) => {
  for (let i = 0; i < stacks; i++)
    w.skills.applyStatus(
      id,
      { effectType: type, rawDamagePerTick: damage, duration: 30, probabilityPercent: 100 },
      1,
    );
};
const hp = (w: GameplayWorld, id: string) => w.core.getEntity(id).currentHp;
let operation = 0;
/** Max HP and current HP through Core only (resistance 0 + one periodic loss; nothing forwarded). */
function setHp(w: GameplayWorld, id: string, max: number, current: number) {
  const e = w.core.getEntity(id);
  if (e.currentHp < e.maxHp) w.core.heal(id, e.maxHp - e.currentHp);
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: max, resistance: 0 });
  if (current < max)
    w.core.applyPeriodicDamage({
      operationId: `test-hp-${++operation}`,
      targetId: id,
      rawDamage: max - current,
      effectId: 'test',
      sources: [{ applicationId: 'test', sourceId: id, rawDamage: max - current }],
    });
  expect(hp(w, id)).toBeCloseTo(current, 0);
}
const lowHp = (w: GameplayWorld, id: string, max = 1) =>
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: max });
const fired = (w: GameplayWorld, id: string) =>
  skillEvents(w, 'synergy-triggered').filter(
    (e) => (e.event as { synergyId: string }).synergyId === id,
  );
const synergyStacks = (w: GameplayWorld, id: string, type: EffectType, origin: string) =>
  w.statuses.getGroup(id, type)?.stacks.filter((s) => s.originId === origin) ?? [];
const control = (w: GameplayWorld, id: string) =>
  (
    w.skills as unknown as {
      controls: Map<
        string,
        { slow: number; slowUntil: number; stunUntil: number; stunImmuneUntil: number }
      >;
    }
  ).controls.get(id);
function withPrerequisites(ranks: Record<string, number>) {
  const full: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks)) {
    for (let n = TALENT_CONFIG.nodes.get(id)!; n.requires; n = TALENT_CONFIG.nodes.get(n.requires)!)
      full[n.requires] = Math.max(full[n.requires] ?? 0, 2);
    full[id] = rank;
  }
  return full;
}
const talentWorld = (c: CharacterClass, ranks: Record<string, number>) => {
  const w = new GameplayWorld({
    characterClass: c,
    level: 50,
    seed: 7,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    talents: { ranks: withPrerequisites(ranks) },
  });
  w.setTestProtection(true);
  return w;
};

describe('Task 15 Phase 2.1 — Mage awakenings', () => {
  it('Thermal Shock III «Паровой взрыв»: every enemy within 80 of the target, once each; II hits only the target', () => {
    const probe = arena('mage', { level: 10 });
    const r = probe.skills.area(A.thermalShock.radius);
    const run = (l: SynergyLevel) => {
      const { w, ids } = setup('mage', [900, 900 + r - 10, 900 + r + 15]);
      level(w, 'thermal_shock', l);
      for (const id of ids) dot(w, id, 'burn');
      const before = ids.map((id) => hp(w, id));
      strike(w, ids[0], tags('ice', 'magical'));
      return { w, ids, lost: ids.map((id, i) => before[i] - hp(w, id)) };
    };
    const two = run(2);
    expect(two.lost[1]).toBe(0);
    const three = run(3);
    expect(three.lost[1]).toBeGreaterThan(0); // inside the radius
    expect(three.lost[2]).toBe(0); // outside
    // One hit per enemy per explosion; the explosion (secondary) never triggers synergies again.
    const hits = three.w
      .getEvents()
      .filter(
        (e) =>
          e.event.type === 'damage' && (e.event as { targetId: string }).targetId === three.ids[1],
      );
    expect(hits).toHaveLength(1);
    expect(fired(three.w, 'thermal_shock')).toHaveLength(1);
    expect(fired(three.w, 'thermal_shock')[0].event).toMatchObject({ level: 3, awakened: true });
    // Separate attribution for run stats / DPS.
    expect(
      three.w.getSnapshot().runStats.bySource.some((s) => s.source === 'synergy:thermal_shock'),
    ).toBe(true);
  });
  it('Wildfire III «Огненная буря»: 5 neighbours × 2 Burn stacks (4.5); talent neighbours on top, total cap 7', () => {
    const neighbours = (ranks: Record<string, number> | null) => {
      const base = ranks ? talentWorld('mage', ranks) : arena('mage', { level: 10, onHit: [] });
      const { w, ids } = setup(
        'mage',
        [900, 920, 930, 940, 950, 960, 970, 980, 990, 1000],
        7,
        base,
      );
      level(w, 'wildfire', 3);
      dot(w, ids[0], 'burn');
      lowHp(w, ids[0]);
      strike(w, ids[0], tags('magical'));
      expect(w.core.getEntity(ids[0]).alive).toBe(false);
      const spread = ids.slice(1).map((id) => synergyStacks(w, id, 'burn', 'synergy:wildfire'));
      const touched = spread.filter((s) => s.length > 0);
      for (const s of touched) {
        expect(s).toHaveLength(A.wildfire.stacks);
        expect(s.every((x) => x.rawDamagePerTick === 4.5)).toBe(true);
      }
      return touched.length;
    };
    expect(neighbours(null)).toBe(5);
    expect(neighbours({ 'mage.b1.n05': 1 })).toBe(5); // radius only
    expect(neighbours({ 'mage.b1.n05': 2 })).toBe(6);
    expect(neighbours({ 'mage.b1.n05': 3 })).toBe(7); // total cap 7 replaces the talent's own 5
  });
  it('Shattered Ice III «Ледяная шрапнель»: 3 shards into the nearest other enemies within 150 (×0.25 ice + default Slow)', () => {
    const probe = arena('mage', { level: 10 });
    const r = probe.skills.area(A.shatteredIce.radius);
    const { w, ids } = setup('mage', [900, 930, 960, 990, 1020, 900 + r + 20]);
    level(w, 'shattered_ice', 3);
    w.skills.slow(ids[0], 0.2, 10);
    const before = ids.map((id) => hp(w, id));
    strike(w, ids[0], tags('ice', 'magical'));
    const lost = ids.map((id, i) => before[i] - hp(w, id));
    expect(lost[0]).toBeGreaterThan(0);
    expect(lost.slice(1, 4).every((x) => x > 0)).toBe(true); // 3 nearest
    expect(lost[4]).toBe(0);
    expect(lost[5]).toBe(0);
    for (const id of ids.slice(1, 4)) {
      expect(control(w, id)!.slow).toBe(A.defaultSlow.strength);
      expect(control(w, id)!.slowUntil).toBeCloseTo(w.time + A.defaultSlow.duration, 9);
    }
    expect(control(w, ids[4])).toBeUndefined();
    expect(fired(w, 'shattered_ice')).toHaveLength(1); // shards on slowed enemies do not re-trigger
    expect(A.defaultSlow).toEqual({ strength: 0.3, duration: 2 });
    expect(A.shatteredIce).toEqual({ shards: 3, radius: 150, coefficient: 0.25 });
  });
});

describe('Task 15 Phase 2.2 — Warrior awakenings', () => {
  it('Skull Crusher III «Сотрясение»: +0.3 s to the current Stun, once per Stun, within the Stun limit', () => {
    const { w, ids } = setup('warrior', [900]);
    level(w, 'skull_crusher', 3);
    expect(w.skills.stun(ids[0], 1)).toBe(true);
    const until = control(w, ids[0])!.stunUntil;
    const immune = control(w, ids[0])!.stunImmuneUntil;
    strike(w, ids[0], tags('physical', 'melee'));
    expect(control(w, ids[0])!.stunUntil).toBeCloseTo(until + 0.3, 9);
    expect(control(w, ids[0])!.stunImmuneUntil).toBeCloseTo(immune + 0.3, 9);
    // Same Stun, after the per-target cooldown: no second extension.
    w.update(1.01);
    strike(w, ids[0], tags('physical', 'melee'));
    expect(fired(w, 'skull_crusher')).toHaveLength(2);
    expect(control(w, ids[0])!.stunUntil).toBeCloseTo(until + 0.3, 9);
    // A long Stun is only extended up to the limit.
    const { w: v, ids: vi } = setup('warrior', [900]);
    level(v, 'skull_crusher', 3);
    v.skills.stun(vi[0], 1.4);
    strike(v, vi[0], tags('physical', 'melee'));
    expect(control(v, vi[0])!.stunUntil).toBeCloseTo(v.time + SKILL_CONTROL.maxStunDuration, 9);
    // Level II: no extension.
    const { w: u, ids: ui } = setup('warrior', [900]);
    level(u, 'skull_crusher', 2);
    u.skills.stun(ui[0], 1);
    const plain = control(u, ui[0])!.stunUntil;
    strike(u, ui[0], tags('physical', 'melee'));
    expect(control(u, ui[0])!.stunUntil).toBe(plain);
  });
  it('Battle Momentum III «Неудержимый»: up to 3 stacks (+22.5 each), +10% move speed while active', () => {
    const { w, ids } = setup('warrior', [900, 910, 920, 930]);
    level(w, 'battle_momentum', 3);
    const base = w.getSnapshot().stats;
    for (let i = 0; i < 4; i++) {
      lowHp(w, ids[i]);
      strike(w, ids[i], tags('physical', 'melee'));
      expect(w.skills.buff('battle_momentum')!.stacks).toBe(Math.min(3, i + 1));
    }
    const s = w.getSnapshot().stats;
    expect(s.attackSpeed).toBe(
      Math.min(COMBAT_ATTRIBUTE_CAPS.attackSpeed, base.attackSpeed + 3 * 22.5),
    );
    expect(s.movementSpeed).toBeCloseTo(
      Math.min(COMBAT_ATTRIBUTE_CAPS.movementSpeed, base.movementSpeed * 1.1),
      6,
    );
    // Pause freezes the buff (engine time stops with the world).
    w.setPaused(true);
    w.update(10);
    expect(w.skills.buff('battle_momentum')!.stacks).toBe(3);
    w.setPaused(false);
    w.update(3.01);
    expect(w.skills.buff('battle_momentum')).toBeNull();
    expect(w.getSnapshot().stats).toMatchObject({
      attackSpeed: base.attackSpeed,
      movementSpeed: base.movementSpeed,
    });
  });
  it('Seismic Impact III «Разлом»: a 2 s rift (radius 90) ticks ×0.15 + default Slow every 0.5 s; pause freezes it', () => {
    const { w, ids } = setup('warrior', [900, 950]);
    level(w, 'seismic_impact', 3);
    w.skills.stun(ids[0], 1);
    strike(w, ids[0], tags('physical', 'melee', 'heavy_melee'));
    expect(fired(w, 'seismic_impact')).toHaveLength(1);
    const seq = w.getEvents().at(-1)!.sequence;
    const areaEvents = () =>
      w
        .getEvents(seq)
        .filter(
          (e) =>
            e.event.type === 'skill-area' &&
            (e.event as { sourceKey: string }).sourceKey === 'seismic_impact',
        );
    w.setPaused(true);
    w.update(5);
    expect(areaEvents()).toHaveLength(0); // frozen while paused
    w.setPaused(false);
    w.update(1.01);
    expect(areaEvents()).toHaveLength(2); // 0.5 and 1.0 s after the wave
    w.update(1.5);
    expect(areaEvents()).toHaveLength(4); // 0.5, 1.0, 1.5, 2.0 s
    expect(control(w, ids[1])!.slow).toBe(0.3);
    expect(A.seismicImpact).toEqual({
      duration: 2,
      radius: 90,
      tickInterval: 0.5,
      coefficient: 0.15,
    });
    expect(fired(w, 'seismic_impact')).toHaveLength(1); // rift ticks on stunned enemies never re-trigger
  });
});

describe('Task 15 Phase 2.3 — Archer awakenings', () => {
  const barrage = (w: GameplayWorld, target: string) => {
    for (const key of ['p1', 'p2', 'p3'])
      strike(w, target, tags('physical', 'projectile'), { projectileKey: key });
  };
  it('Toxic Barrage III «Чумной ливень»: explosion within 80 of the target; 2 Poison stacks (3/tick, 4 s) on each', () => {
    const probe = arena('archer', { level: 10 });
    const r = probe.skills.area(A.toxicBarrage.radius);
    const { w, ids } = setup('archer', [900, 900 + r - 10, 900 + r + 15]);
    level(w, 'toxic_barrage', 3);
    dot(w, ids[0], 'poison');
    barrage(w, ids[0]);
    expect(fired(w, 'toxic_barrage')).toHaveLength(1);
    for (const id of ids.slice(0, 2)) {
      const s = synergyStacks(w, id, 'poison', 'synergy:toxic_barrage');
      expect(s).toHaveLength(2);
      expect(s.every((x) => x.rawDamagePerTick === 3)).toBe(true);
    }
    expect(synergyStacks(w, ids[2], 'poison', 'synergy:toxic_barrage')).toHaveLength(0);
  });
  it('Plague Chain III «Мор»: 5 neighbours, each half the dead target’s Poison stacks (ceil, min 1, max 5) at 4.5', () => {
    for (const [dead, each] of [
      [1, 1],
      [3, 2],
      [4, 2],
      [10, 5],
    ] as const) {
      const { w, ids } = setup('archer', [900, 920, 930, 940, 950, 960, 970, 980]);
      level(w, 'plague_chain', 3);
      dot(w, ids[0], 'poison', dead);
      lowHp(w, ids[0]);
      strike(w, ids[0], tags('physical'));
      const touched = ids
        .slice(1)
        .map((id) => synergyStacks(w, id, 'poison', 'synergy:plague_chain'))
        .filter((s) => s.length);
      expect(touched).toHaveLength(5);
      for (const s of touched) {
        expect(s).toHaveLength(each);
        expect(s.every((x) => x.rawDamagePerTick === 4.5)).toBe(true);
      }
    }
  });
  it('Plague Chain III also reads the stacks of a Poison-tick kill', () => {
    const { w, ids } = setup('archer', [900, 920, 930]);
    level(w, 'plague_chain', 3);
    dot(w, ids[0], 'poison', 6, 5);
    lowHp(w, ids[0], 10);
    w.update(1.01);
    expect(w.core.getEntity(ids[0]).alive).toBe(false);
    expect(synergyStacks(w, ids[1], 'poison', 'synergy:plague_chain')).toHaveLength(3);
  });
  it('Deadly Precision III «Инстинкт охотника»: the bonus moves to the nearest poisoned enemy (≤ 300), max 3 transfers', () => {
    const { w, ids } = setup('archer', [900, 950, 1000, 1050, 1100, 1150, 1500]);
    level(w, 'deadly_precision', 3);
    for (const id of ids) dot(w, id, 'poison');
    for (let i = 0; i < 3; i++) strike(w, ids[0], tags('physical', 'projectile'));
    expect(w.skills.synergies.focusMultiplier(ids[0])).toBeCloseTo(1.225, 10);
    const killFocus = (id: string) => {
      setHp(w, id, 1000, 10);
      w.skills.hit(
        id,
        w.skills.attack(tags('physical'), 5, 'physical'),
        tags('physical', 'secondary'),
        { procs: false },
      );
      expect(w.core.getEntity(id).alive).toBe(false);
    };
    w.update(1); // a transfer gives full duration again
    killFocus(ids[0]);
    expect(w.skills.synergies.focusMultiplier(ids[1])).toBeCloseTo(1.225, 10);
    w.update(2.9);
    expect(w.skills.synergies.focusMultiplier(ids[1])).toBeCloseTo(1.225, 10);
    killFocus(ids[1]);
    killFocus(ids[2]);
    expect(w.skills.synergies.focusMultiplier(ids[3])).toBeCloseTo(1.225, 10);
    killFocus(ids[3]); // 4th death: no more transfers
    expect(ids.slice(4).every((id) => w.skills.synergies.focusMultiplier(id) === 1)).toBe(true);
    expect(
      fired(w, 'deadly_precision').filter((e) => (e.event as { awakened?: boolean }).awakened),
    ).toHaveLength(3);
  });
});

describe('Task 15 Phase 2.4 — Rogue awakenings', () => {
  it('Blood Frenzy III «Кровавый пир»: dagger hits on bleeding targets heal 0.5% Max HP at most once per 0.5 s; never revives', () => {
    const { w, ids } = setup('rogue', [900]);
    level(w, 'blood_frenzy', 3);
    dot(w, ids[0], 'bleed');
    const max = w.core.getEntity('player').maxHp;
    w.setPlayerHp(max / 2);
    const h0 = hp(w, 'player');
    strike(w, ids[0], tags('physical', 'dagger'));
    expect(hp(w, 'player') - h0).toBeCloseTo(max * 0.005, 6);
    strike(w, ids[0], tags('physical', 'dagger'));
    expect(hp(w, 'player') - h0).toBeCloseTo(max * 0.005, 6);
    w.update(0.5);
    strike(w, ids[0], tags('physical', 'dagger'));
    expect(hp(w, 'player') - h0).toBeCloseTo(max * 0.01, 6);
    // Dead player: no heal.
    const { w: d, ids: di } = setup('rogue', [900]);
    level(d, 'blood_frenzy', 3);
    dot(d, di[0], 'bleed');
    d.setTestProtection(false);
    d.setPlayerHp(0);
    expect(d.core.getEntity('player').alive).toBe(false);
    d.skills.healPlayer(100);
    expect(d.core.getEntity('player').alive).toBe(false);
  });
  it('Deep Wounds III «Рваные раны»: a crit adds 2 Bleed stacks (4.5) and refreshes the group duration', () => {
    const { w, ids } = setup('rogue', [900]);
    level(w, 'deep_wounds', 3);
    dot(w, ids[0], 'bleed');
    w.skills.applyStatus(
      ids[0],
      { effectType: 'bleed', rawDamagePerTick: 0, duration: 1, probabilityPercent: 100 },
      1,
    );
    w.update(0.5);
    strike(w, ids[0], tags('physical'), { critical: true });
    const s = synergyStacks(w, ids[0], 'bleed', 'synergy:deep_wounds');
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.rawDamagePerTick === 4.5)).toBe(true);
    expect(w.statuses.getGroup(ids[0], 'bleed')!.expiresAt).toBeGreaterThanOrEqual(
      w.time + 4 - 1e-9,
    );
  });
  it('Final Cut III «Казнь»: threshold 40%; a lethal execution explodes (×0.4 + 1 Bleed stack) within 80', () => {
    const at = (l: SynergyLevel, percent: number) => {
      const { w, ids } = setup('rogue', [900, 950]);
      level(w, 'final_cut', l);
      dot(w, ids[0], 'bleed');
      setHp(w, ids[0], 1e6, 1e4 * percent);
      strike(w, ids[0], tags('physical'));
      return { w, ids };
    };
    expect(fired(at(2, 35).w, 'final_cut')).toHaveLength(0);
    expect(fired(at(3, 35).w, 'final_cut')).toHaveLength(1);
    // Lethal execution: a small target dies from the ×1.8 proc → explosion on the neighbour.
    const { w, ids } = setup('rogue', [900, 950]);
    level(w, 'final_cut', 3);
    dot(w, ids[0], 'bleed');
    setHp(w, ids[0], 1000, 20);
    const before = hp(w, ids[1]);
    w.skills.hit(ids[0], w.skills.attack(tags('physical'), 0.0001, 'physical'), tags('physical'));
    expect(w.core.getEntity(ids[0]).alive).toBe(false);
    expect(before - hp(w, ids[1])).toBeGreaterThan(0);
    const bleed = synergyStacks(w, ids[1], 'bleed', 'synergy:final_cut');
    expect(bleed).toHaveLength(1);
    expect(bleed[0].rawDamagePerTick).toBe(3);
    expect(fired(w, 'final_cut')).toHaveLength(1);
  });
});

describe('Task 15 Phase 2 — determinism', () => {
  it('same seed + same actions ⇒ identical results with awakened synergies', () => {
    const script = () => {
      const { w, ids } = setup('mage', [900, 930, 960, 990, 1020, 1050], 11);
      for (const id of ['thermal_shock', 'wildfire', 'shattered_ice'] as const) level(w, id, 3);
      for (const id of ids) dot(w, id, 'burn', 2, 4);
      w.skills.slow(ids[0], 0.2, 10);
      for (let i = 0; i < 6; i++) {
        strike(w, ids[i % 3], tags('ice', 'magical'));
        w.update(0.7);
      }
      return JSON.stringify({
        s: w.getSnapshot(),
        e: w.getEvents().map((e: WorldEvent) => [e.time, e.event.type]),
      });
    };
    expect(script()).toBe(script());
  });
});
