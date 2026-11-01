import { describe, expect, it } from 'vitest';
import type { CharacterClass } from '../../src/character-stats';
import type { GameplayWorld } from '../../src/gameplay';
import type { CombatTag, SynergyId } from '../../src/skills';
import { SYNERGY_RULES } from '../../src/skills';
import { arena, skillEvents, stationaryMelee } from './helpers';

const cases: readonly [SynergyId, CharacterClass, string][] = [
  ['thermal_shock', 'mage', 'frost_nova'],
  ['wildfire', 'mage', 'fireball'],
  ['shattered_ice', 'mage', 'ice_shards'],
  ['skull_crusher', 'warrior', 'cleave'],
  ['battle_momentum', 'warrior', 'battle_fury'],
  ['seismic_impact', 'warrior', 'ground_slam'],
  ['toxic_barrage', 'archer', 'multishot'],
  ['plague_chain', 'archer', 'poison_trap'],
  ['deadly_precision', 'archer', 'piercing_arrow'],
  ['blood_frenzy', 'rogue', 'serrated_blades'],
  ['deep_wounds', 'rogue', 'lacerate'],
  ['final_cut', 'rogue', 'death_mark'],
];
const unrelated: Record<CharacterClass, string> = {
  mage: 'fireball',
  warrior: 'war_cry',
  archer: 'hunters_mark',
  rogue: 'death_mark',
};
function setup(cls: CharacterClass) {
  const w = arena(cls, { level: 10, onHit: [] });
  const ids = [900, 930].map((distance) => w.spawnEnemy('melee', distance, 0, stationaryMelee));
  for (const id of ids) w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
  return { w, ids };
}
function hit(w: GameplayWorld, targetId: string, projectileKey = 'a') {
  const tags = new Set<CombatTag>([
    'physical',
    'melee',
    'heavy_melee',
    'dagger',
    'ice',
    'projectile',
  ]);
  const attack = w.skills.attack(tags, 0.01, 'physical');
  w.skills.hit(targetId, { ...attack, critical: true }, tags, { projectileKey });
}
function exercise(w: GameplayWorld, targetId: string, id: SynergyId) {
  for (const effectType of ['burn', 'poison', 'bleed'] as const)
    w.skills.applyStatus(targetId, {
      effectType,
      rawDamagePerTick: 0,
      duration: 30,
      probabilityPercent: 100,
    });
  w.skills.slow(targetId, 0.3, 5);
  w.skills.stun(targetId, 1);
  if (id === 'wildfire' || id === 'plague_chain' || id === 'battle_momentum')
    w.core.updateEntityStats(targetId, { ...w.core.getEntity(targetId), maxHp: 1 });
  if (id === 'final_cut') {
    const amount = w.core.getEntity(targetId).maxHp * 0.8;
    w.core.applyPeriodicDamage({
      operationId: 'prerequisite-lower-hp',
      targetId,
      effectId: 'test',
      rawDamage: amount,
      sources: [{ applicationId: 'test', sourceId: 'player', rawDamage: amount }],
    });
  }
  for (const key of ['a', 'b', 'c']) hit(w, targetId, key);
}
const fired = (w: GameplayWorld, synergyId: SynergyId) =>
  skillEvents(w, 'synergy-triggered').filter(
    (e) => (e.event as { synergyId: string }).synergyId === synergyId,
  );

describe('acquired-skill synergy prerequisites', () => {
  it.each(cases)('%s stays locked without any acquired skills', (id, cls) => {
    const { w, ids } = setup(cls);
    exercise(w, ids[0], id);
    expect(skillEvents(w, 'synergy-triggered')).toHaveLength(0);
    expect(w.skills.buff('blood_frenzy')).toBeNull();
    expect(w.skills.buff('battle_momentum')).toBeNull();
    expect(w.skills.synergies.focusMultiplier(ids[0])).toBe(1);
  });
  it.each(cases)('%s stays locked with unrelated skills', (id, cls) => {
    const { w, ids } = setup(cls);
    w.grantTestSkill('power', 1);
    w.grantTestSkill('toxic_mastery', 1);
    const other = id === 'wildfire' ? 'frost_nova' : id === 'final_cut' ? null : unrelated[cls];
    if (other) w.grantTestSkill(other, 1);
    exercise(w, ids[0], id);
    expect(fired(w, id)).toHaveLength(0);
  });
  it.each(cases)('%s unlocks with an acquired relevant skill (%s, %s)', (id, cls, skill) => {
    const { w, ids } = setup(cls);
    w.grantTestSkill(skill, 1);
    exercise(w, ids[0], id);
    expect(fired(w, id)).toHaveLength(1);
  });
  it('does not count projectile hits from before acquisition toward either archer series', () => {
    const { w, ids } = setup('archer');
    w.skills.applyStatus(ids[0], {
      effectType: 'poison',
      rawDamagePerTick: 0,
      duration: 30,
      probabilityPercent: 100,
    });
    hit(w, ids[0], 'before-a');
    hit(w, ids[0], 'before-b');
    w.grantTestSkill('multishot', 1);
    hit(w, ids[0], 'after-a');
    expect(skillEvents(w, 'synergy-triggered')).toHaveLength(0);
    hit(w, ids[0], 'after-b');
    hit(w, ids[0], 'after-c');
    expect(fired(w, 'toxic_barrage')).toHaveLength(1);
    expect(fired(w, 'deadly_precision')).toHaveLength(1);
  });
  it('uses acquired catalogue tags for eligibility, without requiring a particular event skill ID', () => {
    const { w, ids } = setup('mage');
    w.grantTestSkill('elemental_mastery', 1);
    exercise(w, ids[0], 'thermal_shock');
    expect(fired(w, 'thermal_shock')).toHaveLength(1);
    expect(fired(w, 'shattered_ice')).toHaveLength(1);
    expect(SYNERGY_RULES.every((rule) => rule.requiredSkillTags.length > 0)).toBe(true);
  });
  it.each([
    ['warrior', 'battle_fury', 'seismic_impact'],
    ['archer', 'poison_trap', 'toxic_barrage'],
    ['archer', 'poison_trap', 'deadly_precision'],
    ['archer', 'multishot', 'plague_chain'],
    ['rogue', 'death_mark', 'blood_frenzy'],
    ['rogue', 'death_mark', 'deep_wounds'],
  ] as const)('%s skill %s does not unlock the differently tagged %s', (cls, skill, id) => {
    const { w, ids } = setup(cls);
    w.grantTestSkill(skill, 1);
    exercise(w, ids[0], id);
    expect(fired(w, id)).toHaveLength(0);
  });
  it.each(['toxic_volley', 'poison_trap', 'split_shot'])(
    'the acquired poison-tagged %s unlocks Plague Chain at rank I',
    (skill) => {
      const { w, ids } = setup('archer');
      w.grantTestSkill(skill, 1);
      exercise(w, ids[0], 'plague_chain');
      expect(fired(w, 'plague_chain')).toHaveLength(1);
    },
  );
  it('all three rogue hit synergies can fire from the same eligible hit', () => {
    const { w, ids } = setup('rogue');
    w.grantTestSkill('blade_flurry', 1);
    exercise(w, ids[0], 'final_cut');
    expect(fired(w, 'blood_frenzy')).toHaveLength(1);
    expect(fired(w, 'deep_wounds')).toHaveLength(1);
    expect(fired(w, 'final_cut')).toHaveLength(1);
  });
});

describe('starting weapons retain their effects without unlocking synergies', () => {
  it.each([
    ['mage', 'burn'],
    ['archer', 'poison'],
    ['warrior', 'bleed'],
    ['rogue', 'bleed'],
  ] as const)('%s still applies its built-in %s without acquired skills', (cls, effect) => {
    const w = arena(cls, { level: 10 });
    const victim = w.spawnEnemy('melee', 35, 0, stationaryMelee);
    w.core.updateEntityStats(victim, { ...w.core.getEntity(victim), maxHp: 1e9 });
    w.update(3);
    expect(w.run.getState().owned).toEqual([]);
    expect(w.statuses.getGroup(victim, effect)?.stacks.length).toBeGreaterThan(0);
    expect(
      w.getEvents().some((e) => e.channel === 'combat' && e.event.type === 'periodic-damage'),
    ).toBe(true);
    expect(skillEvents(w, 'synergy-triggered')).toHaveLength(0);
  });
  it.each([
    ['mage', 'burn', 'wildfire'],
    ['archer', 'poison', 'plague_chain'],
  ] as const)('%s starting-weapon %s tick kills cannot unlock %s', (cls, effect, synergy) => {
    const w = arena(cls, { level: 10 });
    // Keep the next basic strike far away after the first hit, so the built-in DoT is lethal.
    w.weapons.setAttackSpeed('player', 1);
    const victim = w.spawnEnemy('melee', 100, 0, stationaryMelee);
    const neighbour = w.spawnEnemy('melee', 140, 0, stationaryMelee);
    for (const target of [victim, neighbour])
      w.core.updateEntityStats(target, { ...w.core.getEntity(target), maxHp: 1e9 });
    for (let step = 0; step < 200 && !w.statuses.getGroup(victim, effect); step++) w.update(0.01);
    expect(w.statuses.getGroup(victim, effect)).not.toBeNull();
    w.core.updateEntityStats(victim, { ...w.core.getEntity(victim), maxHp: 1 });
    w.update(1.01);
    expect(w.core.getEntity(victim).alive).toBe(false);
    expect(
      w
        .getEvents()
        .some(
          (e) =>
            e.channel === 'combat' &&
            e.event.type === 'periodic-damage' &&
            e.event.targetId === victim &&
            e.event.appliedDamage === 1,
        ),
    ).toBe(true);
    expect(fired(w, synergy)).toHaveLength(0);
    expect(w.statuses.getGroup(neighbour, effect)).toBeNull();
  });
});
