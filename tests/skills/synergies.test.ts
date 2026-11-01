import { describe, expect, it } from 'vitest';
import type { CharacterClass } from '../../src/character-stats';
import { COMBAT_ATTRIBUTE_CAPS } from '../../src/character-stats';
import type { GameplayWorld } from '../../src/gameplay';
import { SYNERGY_RULES, SYNERGY_TUNING } from '../../src/skills';
import type { CombatTag } from '../../src/skills';
import type { EffectType } from '../../src/status-effects';
import { arena, skillEvents, stationaryMelee } from './helpers';

/** Far-away enemies (beyond every basic weapon range), basic on-hit disabled, huge HP. */
function setup(c: CharacterClass, count = 1) {
  const w = arena(c, { level: 10, onHit: [] });
  const prerequisites: Record<CharacterClass, string[]> = {
    mage: ['frost_nova', 'fireball'],
    warrior: ['ground_slam'],
    archer: ['toxic_volley'],
    rogue: ['blade_flurry'],
  };
  for (const skill of prerequisites[c]) w.grantTestSkill(skill, 1);
  w.weapons.setAttackSpeed('player', 1);
  const ids = Array.from({ length: count }, (_, i) =>
    w.spawnEnemy('melee', 900 + i * 30, 0, stationaryMelee),
  );
  for (const id of ids) w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  return { w, ids };
}
const tags = (...t: CombatTag[]) => new Set<CombatTag>(t);
function strike(
  w: GameplayWorld,
  target: string,
  t: ReadonlySet<CombatTag>,
  options: { critical?: boolean; projectileKey?: string; procs?: boolean } = {},
) {
  const attack = w.skills.attack(t, 0.01, t.has('magical') ? 'magical' : 'physical');
  const snapshot =
    options.critical === undefined ? attack : { ...attack, critical: options.critical };
  return w.skills.hit(target, snapshot, t, {
    ...(options.projectileKey ? { projectileKey: options.projectileKey } : {}),
    ...(options.procs === false ? { procs: false } : {}),
  });
}
const dot = (w: GameplayWorld, id: string, type: EffectType, origin?: string, damage = 0) =>
  w.skills.applyStatus(
    id,
    { effectType: type, rawDamagePerTick: damage, duration: 30, probabilityPercent: 100 },
    1,
    origin,
  );
const fired = (w: GameplayWorld, id: string) =>
  skillEvents(w, 'synergy-triggered').filter(
    (e) => (e.event as { synergyId: string }).synergyId === id,
  );
const lowHp = (w: GameplayWorld, id: string, hp = 1) =>
  w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: hp });

describe('synergy catalogue', () => {
  it('has 12 class-specific rules, three per class', () => {
    expect(SYNERGY_RULES).toHaveLength(12);
    for (const c of ['mage', 'warrior', 'archer', 'rogue'])
      expect(SYNERGY_RULES.filter((r) => r.characterClass === c)).toHaveLength(3);
  });
});

describe('Mage', () => {
  it('Thermal Shock: direct ice hit on a burning target; not without Burn, not for fire hits, cooldown per target', () => {
    const { w, ids } = setup('mage', 2);
    strike(w, ids[0], tags('ice', 'magical'));
    expect(fired(w, 'thermal_shock')).toHaveLength(0);
    dot(w, ids[0], 'burn');
    strike(w, ids[0], tags('fire', 'magical'));
    expect(fired(w, 'thermal_shock')).toHaveLength(0);
    strike(w, ids[0], tags('ice', 'magical'));
    expect(fired(w, 'thermal_shock')).toHaveLength(1);
    strike(w, ids[0], tags('ice', 'magical'));
    expect(fired(w, 'thermal_shock')).toHaveLength(1);
    dot(w, ids[1], 'burn');
    strike(w, ids[1], tags('ice', 'magical'));
    expect(fired(w, 'thermal_shock')).toHaveLength(2);
    w.update(SYNERGY_TUNING.thermalShock.cooldown);
    strike(w, ids[0], tags('ice', 'magical'));
    expect(fired(w, 'thermal_shock')).toHaveLength(3);
  });
  it('Shattered Ice: ice hit on a slowed target only', () => {
    const { w, ids } = setup('mage');
    strike(w, ids[0], tags('ice', 'magical'));
    expect(fired(w, 'shattered_ice')).toHaveLength(0);
    w.skills.slow(ids[0], 0.3, 5);
    strike(w, ids[0], tags('fire', 'magical'));
    expect(fired(w, 'shattered_ice')).toHaveLength(0);
    strike(w, ids[0], tags('ice', 'magical'));
    expect(fired(w, 'shattered_ice')).toHaveLength(1);
  });
  it('both mage hit synergies fire from one ice hit; their procs never trigger another synergy', () => {
    const { w, ids } = setup('mage');
    dot(w, ids[0], 'burn');
    w.skills.slow(ids[0], 0.3, 5);
    strike(w, ids[0], tags('ice', 'magical', 'projectile'));
    expect(fired(w, 'thermal_shock')).toHaveLength(1);
    expect(fired(w, 'shattered_ice')).toHaveLength(1);
    // The Thermal Shock proc is tagged fire+ice; if procs recursed, it would trigger Shattered Ice again.
    expect(skillEvents(w, 'synergy-triggered')).toHaveLength(2);
    strike(w, ids[0], tags('ice', 'magical'), { procs: false });
    expect(skillEvents(w, 'synergy-triggered')).toHaveLength(2);
  });
  it('Wildfire: a burning kill spreads bounded Burn; no Burn → nothing; synergy Burn kills do not chain', () => {
    const { w, ids } = setup('mage', 6);
    lowHp(w, ids[0]);
    strike(w, ids[0], tags('magical'));
    expect(fired(w, 'wildfire')).toHaveLength(0);
    dot(w, ids[1], 'burn');
    lowHp(w, ids[1]);
    strike(w, ids[1], tags('magical'));
    expect(fired(w, 'wildfire')).toHaveLength(1);
    const spread = w.getSnapshot().statuses.filter((g) => g.effectType === 'burn');
    expect(spread.length).toBeGreaterThan(0);
    expect(spread.length).toBeLessThanOrEqual(SYNERGY_TUNING.wildfire.maxTargets);
    expect(spread.every((g) => g.stacks.every((s) => s.originId === 'synergy:wildfire'))).toBe(
      true,
    );
    // A target killed only by synergy-applied Burn ticks does not spread again (no cascade).
    const victim = spread[0].targetId;
    lowHp(w, victim, 1);
    w.skills.applyStatus(
      victim,
      { effectType: 'burn', rawDamagePerTick: 5, duration: 5, probabilityPercent: 100 },
      1,
      'synergy:wildfire',
    );
    w.update(1.01);
    expect(w.core.getEntity(victim).alive).toBe(false);
    expect(fired(w, 'wildfire')).toHaveLength(1);
  });
  it('Wildfire also triggers from a player Burn tick kill (status snapshot taken at death)', () => {
    const { w, ids } = setup('mage', 3);
    lowHp(w, ids[0], 1);
    dot(w, ids[0], 'burn', undefined, 5);
    w.update(1.01);
    expect(w.core.getEntity(ids[0]).alive).toBe(false);
    expect(fired(w, 'wildfire')).toHaveLength(1);
  });
});

describe('Warrior', () => {
  it('Skull Crusher: physical melee hit on a stunned target only', () => {
    const { w, ids } = setup('warrior');
    strike(w, ids[0], tags('physical', 'melee'));
    expect(fired(w, 'skull_crusher')).toHaveLength(0);
    w.skills.stun(ids[0], 1);
    strike(w, ids[0], tags('physical', 'projectile'));
    expect(fired(w, 'skull_crusher')).toHaveLength(0);
    strike(w, ids[0], tags('physical', 'melee'));
    expect(fired(w, 'skull_crusher')).toHaveLength(1);
  });
  it('Seismic Impact needs the heavy_melee tag; a heavy hit on a stunned target fires both warrior hit rules', () => {
    const { w, ids } = setup('warrior', 3);
    w.skills.stun(ids[0], 1);
    strike(w, ids[0], tags('physical', 'melee'));
    expect(fired(w, 'seismic_impact')).toHaveLength(0);
    w.update(SYNERGY_TUNING.skullCrusher.cooldown);
    w.skills.stun(ids[1], 1);
    strike(w, ids[1], tags('physical', 'melee', 'heavy_melee'));
    expect(fired(w, 'seismic_impact')).toHaveLength(1);
    expect(
      fired(w, 'skull_crusher').filter(
        (e) => (e.event as { targetId: string }).targetId === ids[1],
      ),
    ).toHaveLength(1);
    expect(
      skillEvents(w, 'skill-area').some(
        (e) => (e.event as { sourceKey: string }).sourceKey === 'seismic_impact',
      ),
    ).toBe(true);
  });
  it('Battle Momentum: melee kills refresh (not stack) a capped attack-speed buff; ranged kills do nothing', () => {
    const { w, ids } = setup('warrior', 3);
    const base = w.getSnapshot().stats.attackSpeed;
    lowHp(w, ids[0]);
    strike(w, ids[0], tags('physical', 'projectile'));
    expect(w.skills.buff('battle_momentum')).toBeNull();
    lowHp(w, ids[1]);
    strike(w, ids[1], tags('physical', 'melee'));
    lowHp(w, ids[2]);
    strike(w, ids[2], tags('physical', 'melee'));
    expect(w.skills.buff('battle_momentum')!.stacks).toBe(1);
    const s = w.getSnapshot().stats.attackSpeed;
    expect(s).toBe(
      Math.min(COMBAT_ATTRIBUTE_CAPS.attackSpeed, base + SYNERGY_TUNING.battleMomentum.attackSpeed),
    );
    expect(w.weapons.getWeaponState('player').attackSpeedPercent).toBe(s);
    w.update(SYNERGY_TUNING.battleMomentum.duration + 0.01);
    expect(w.getSnapshot().stats.attackSpeed).toBe(base);
  });
});

describe('Archer', () => {
  it('Toxic Barrage: three distinct projectiles on a poisoned target inside the window', () => {
    const { w, ids } = setup('archer', 2);
    dot(w, ids[0], 'poison');
    for (let i = 0; i < 3; i++)
      strike(w, ids[0], tags('physical', 'projectile'), { projectileKey: 'same' });
    expect(fired(w, 'toxic_barrage')).toHaveLength(0);
    strike(w, ids[0], tags('physical', 'projectile'), { projectileKey: 'b' });
    strike(w, ids[0], tags('physical', 'projectile'), { projectileKey: 'c' });
    expect(fired(w, 'toxic_barrage')).toHaveLength(1);
    for (const k of ['x', 'y', 'z'])
      strike(w, ids[1], tags('physical', 'projectile'), { projectileKey: k });
    expect(fired(w, 'toxic_barrage')).toHaveLength(1);
  });
  it('Plague Chain: poisoned kill spreads bounded Poison; synergy Poison kills do not chain', () => {
    const { w, ids } = setup('archer', 6);
    lowHp(w, ids[0]);
    strike(w, ids[0], tags('physical'));
    expect(fired(w, 'plague_chain')).toHaveLength(0);
    dot(w, ids[1], 'poison');
    lowHp(w, ids[1]);
    strike(w, ids[1], tags('physical'));
    expect(fired(w, 'plague_chain')).toHaveLength(1);
    const spread = w.getSnapshot().statuses.filter((g) => g.effectType === 'poison');
    expect(spread.length).toBeLessThanOrEqual(SYNERGY_TUNING.plagueChain.maxTargets);
    const victim = spread[0].targetId;
    lowHp(w, victim, 1);
    w.skills.applyStatus(
      victim,
      { effectType: 'poison', rawDamagePerTick: 5, duration: 5, probabilityPercent: 100 },
      1,
      'synergy:plague_chain',
    );
    w.update(1.01);
    expect(w.core.getEntity(victim).alive).toBe(false);
    expect(fired(w, 'plague_chain')).toHaveLength(1);
  });
  it('Deadly Precision: repeated hits on one poisoned target grant a focus bonus; target change resets', () => {
    const { w, ids } = setup('archer', 2);
    dot(w, ids[0], 'poison');
    dot(w, ids[1], 'poison');
    strike(w, ids[0], tags('physical'));
    strike(w, ids[0], tags('physical'));
    strike(w, ids[1], tags('physical'));
    strike(w, ids[0], tags('physical'));
    expect(fired(w, 'deadly_precision')).toHaveLength(0);
    strike(w, ids[0], tags('physical'));
    strike(w, ids[0], tags('physical'));
    expect(fired(w, 'deadly_precision')).toHaveLength(1);
    const attack = w.skills.attack(tags('physical'), 1, 'physical');
    expect(w.skills.targetMultiplier(attack, ids[0])).toBeCloseTo(
      1 + SYNERGY_TUNING.deadlyPrecision.bonusPercent / 100,
      9,
    );
    expect(w.skills.targetMultiplier(attack, ids[1])).toBe(1);
    w.update(SYNERGY_TUNING.deadlyPrecision.duration + 0.01);
    expect(w.skills.targetMultiplier(attack, ids[0])).toBe(1);
  });
});

describe('Rogue', () => {
  it('Blood Frenzy: dagger hit on a bleeding target refreshes a capped attack-speed buff', () => {
    const { w, ids } = setup('rogue');
    strike(w, ids[0], tags('physical', 'dagger'));
    expect(w.skills.buff('blood_frenzy')).toBeNull();
    dot(w, ids[0], 'bleed');
    strike(w, ids[0], tags('physical', 'melee'));
    expect(w.skills.buff('blood_frenzy')).toBeNull();
    strike(w, ids[0], tags('physical', 'dagger'));
    strike(w, ids[0], tags('physical', 'dagger'));
    expect(w.skills.buff('blood_frenzy')!.stacks).toBe(1);
    expect(fired(w, 'blood_frenzy')).toHaveLength(1);
    expect(w.getSnapshot().stats.attackSpeed).toBeLessThanOrEqual(
      COMBAT_ATTRIBUTE_CAPS.attackSpeed,
    );
  });
  it('Deep Wounds: critical hit on a bleeding target adds one Bleed stack within the cap', () => {
    const { w, ids } = setup('rogue');
    dot(w, ids[0], 'bleed');
    strike(w, ids[0], tags('physical'), { critical: false });
    expect(fired(w, 'deep_wounds')).toHaveLength(0);
    strike(w, ids[0], tags('physical'), { critical: true });
    expect(fired(w, 'deep_wounds')).toHaveLength(1);
    expect(w.statuses.getGroup(ids[0], 'bleed')!.stacks).toHaveLength(2);
    for (let i = 0; i < 12; i++) dot(w, ids[0], 'bleed');
    w.update(SYNERGY_TUNING.deepWounds.cooldown + 0.01);
    strike(w, ids[0], tags('physical'), { critical: true });
    expect(w.statuses.getGroup(ids[0], 'bleed')!.stacks).toHaveLength(10);
  });
  it('Final Cut: hit on a bleeding target below the HP threshold executes once per cooldown', () => {
    const { w, ids } = setup('rogue');
    dot(w, ids[0], 'bleed');
    strike(w, ids[0], tags('physical'));
    expect(fired(w, 'final_cut')).toHaveLength(0);
    w.core.updateEntityStats(ids[0], { ...w.core.getEntity(ids[0]), maxHp: 1e9 });
    w.setPaused(false);
    const e = w.core.getEntity(ids[0]);
    w.core.applyPeriodicDamage({
      operationId: 'test-lower',
      targetId: ids[0],
      effectId: 'test',
      rawDamage: e.maxHp * 0.8,
      sources: [{ applicationId: 'x', sourceId: 'player', rawDamage: e.maxHp * 0.8 }],
    });
    strike(w, ids[0], tags('physical'));
    expect(fired(w, 'final_cut')).toHaveLength(1);
    strike(w, ids[0], tags('physical'));
    expect(fired(w, 'final_cut')).toHaveLength(1);
  });
});

describe('rules are class-specific and tag-driven', () => {
  it('another class never fires a foreign synergy even when its tag condition is met', () => {
    const { w, ids } = setup('warrior');
    dot(w, ids[0], 'burn');
    w.skills.slow(ids[0], 0.3, 5);
    strike(w, ids[0], tags('ice', 'magical'));
    expect(skillEvents(w, 'synergy-triggered')).toHaveLength(0);
  });
  it('triggers depend on tags, not skill IDs: an unnamed ice projectile works like Ice Shards', () => {
    const { w, ids } = setup('mage');
    dot(w, ids[0], 'burn');
    expect(w.run.rank('frost_nova')).toBe(1);
    strike(w, ids[0], tags('ice'));
    expect(fired(w, 'thermal_shock')).toHaveLength(1);
  });
});
