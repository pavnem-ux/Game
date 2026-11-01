import { describe, expect, it } from 'vitest';
import type { CharacterClass } from '../../src/character-stats';
import type { GameplayWorld } from '../../src/gameplay';
import type { CombatTag, SynergyId } from '../../src/skills';
import {
  SYNERGY_RULES,
  getSkill,
  skillsForClass,
  synergyUnlocked,
  validateSynergyRules,
} from '../../src/skills';
import pairsFixture from './fixtures/synergy-pairs-v2.json';
import { ALL_SYNERGY_SKILLS, arena, skillEvents, stationaryMelee } from './helpers';

const CLASS_BY_LABEL: Record<string, CharacterClass> = {
  Маг: 'mage',
  Воин: 'warrior',
  Лучник: 'archer',
  Разбойник: 'rogue',
};
interface PairRow {
  readonly class: string;
  readonly synergyId: SynergyId;
  readonly variant: number;
  readonly skill1: string;
  readonly skill2: string;
  readonly kind1: string;
  readonly kind2: string;
}
const ROWS = pairsFixture.rows as readonly PairRow[];

function setup(cls: CharacterClass) {
  const w = arena(cls, { level: 10, onHit: [] });
  const ids = [900, 930, 960].map((distance) =>
    w.spawnEnemy('melee', distance, 0, stationaryMelee),
  );
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

const unlockedNow = (w: GameplayWorld) =>
  SYNERGY_RULES.filter((r) => w.skills.synergies.isEligible(r.id)).map((r) => r.id);
const unlockEvents = (w: GameplayWorld) =>
  skillEvents(w, 'synergy-unlocked').map(
    (e) => e.event as { synergyId: string; pair: readonly string[]; skillId: string },
  );
/** Rules of the class whose pairs are completed by exactly these acquired skills. */
const expectedUnlocks = (cls: CharacterClass, owned: readonly string[]) =>
  SYNERGY_RULES.filter((r) => r.characterClass === cls && synergyUnlocked(r, owned)).map(
    (r) => r.id,
  );

describe('Task 07.2 v2 pair configuration matches the approved workbook', () => {
  it('has exactly the 40 workbook rows, in order, per synergy and class', () => {
    expect(ROWS).toHaveLength(40);
    for (const rule of SYNERGY_RULES) {
      const rows = ROWS.filter((r) => r.synergyId === rule.id);
      expect(rows.map((r) => r.variant)).toEqual(rows.map((_, i) => i + 1));
      expect(rule.unlockPairs).toEqual(rows.map((r) => [r.skill1, r.skill2]));
      for (const r of rows) expect(CLASS_BY_LABEL[r.class]).toBe(rule.characterClass);
    }
    expect(SYNERGY_RULES.reduce((n, r) => n + r.unlockPairs.length, 0)).toBe(40);
  });
  it('workbook types agree with the catalogue; every pair has an active skill, none is passive+passive', () => {
    for (const r of ROWS) {
      const kinds = [r.skill1, r.skill2].map((id) => getSkill(id).kind);
      expect(kinds.map((k) => (k === 'auto' ? 'Активный' : 'Пассивный'))).toEqual([
        r.kind1,
        r.kind2,
      ]);
      expect(kinds).toContain('auto');
    }
  });
  it('startup validation accepts the shipped rules and rejects every invalid configuration', () => {
    expect(() => validateSynergyRules(SYNERGY_RULES, getSkill)).not.toThrow();
    const swap = (id: SynergyId, unlockPairs: readonly (readonly [string, string])[]) =>
      SYNERGY_RULES.map((r) => (r.id === id ? { ...r, unlockPairs } : r));
    const bad: [string, Parameters<typeof validateSynergyRules>[0]][] = [
      ['11 rules', SYNERGY_RULES.slice(1)],
      ['no pair', swap('wildfire', [])],
      ['same skill twice', swap('wildfire', [['fireball', 'fireball']])],
      ['passive + passive', swap('wildfire', [['elemental_mastery', 'power']])],
      ['other class', swap('wildfire', [['fireball', 'cleave']])],
      ['unknown skill', swap('wildfire', [['fireball', 'nope']])],
      [
        'duplicate (order-insensitive)',
        swap('wildfire', [
          ['fireball', 'inferno'],
          ['inferno', 'fireball'],
        ]),
      ],
      [
        'four rules for one class',
        SYNERGY_RULES.map((r) => (r.id === 'final_cut' ? { ...r, characterClass: 'mage' } : r)),
      ],
    ];
    for (const [label, rules] of bad)
      expect(() => validateSynergyRules(rules, getSkill), label).toThrow();
  });
  it('no single acquired skill can unlock any synergy (no tag bypass)', () => {
    for (const rule of SYNERGY_RULES)
      for (const skill of skillsForClass(rule.characterClass))
        expect(synergyUnlocked(rule, [skill.id])).toBe(false);
  });
});

describe('pair unlock (acceptance 1–4)', () => {
  it.each(ROWS.map((r) => [r.synergyId, r.variant, r.skill1, r.skill2, r.class] as const))(
    '%s pair %i (%s + %s) unlocks in both orders at rank I, immediately and once',
    (id, _variant, a, b, label) => {
      const cls = CLASS_BY_LABEL[label];
      for (const [first, second] of [
        [a, b],
        [b, a],
      ]) {
        const { w, ids } = setup(cls);
        w.grantTestSkill(first, 1);
        expect(w.skills.synergies.isEligible(id)).toBe(false);
        expect(unlockedNow(w)).toEqual([]);
        exercise(w, ids[0], id);
        expect(fired(w, id)).toHaveLength(0); // trigger before the pair is complete → nothing
        w.grantTestSkill(second, 1);
        expect(w.skills.synergies.isEligible(id)).toBe(true);
        // A pair shared by two rules (e.g. Toxic Volley + Split Shot) unlocks both, each once.
        expect(unlockedNow(w)).toEqual(expectedUnlocks(cls, [a, b]));
        const events = unlockEvents(w);
        expect(events.map((e) => e.synergyId)).toEqual(expectedUnlocks(cls, [a, b]));
        const mine = events.find((e) => e.synergyId === id)!;
        expect(mine.pair).toEqual([a, b]);
        expect(mine.skillId).toBe(second);
        // Effective immediately: the original combat trigger now fires once.
        exercise(w, ids[1], id);
        expect(fired(w, id)).toHaveLength(1);
        // Rank upgrades keep ownership and never re-announce.
        w.grantTestSkill(second, 2);
        expect(w.skills.synergies.isEligible(id)).toBe(true);
        expect(unlockEvents(w)).toHaveLength(events.length);
      }
    },
  );
  it.each(SYNERGY_RULES.map((r) => [r.id, r.characterClass] as const))(
    '%s stays locked for neither skill, unrelated skills and every non-pair combination',
    (id, cls) => {
      const rule = SYNERGY_RULES.find((r) => r.id === id)!;
      const { w, ids } = setup(cls);
      exercise(w, ids[0], id);
      expect(fired(w, id)).toHaveLength(0);
      w.grantTestSkill('power', 1);
      w.grantTestSkill('toxic_mastery', 1);
      exercise(w, ids[1], id);
      expect(fired(w, id)).toHaveLength(0);
      // Pure check over every two-skill class combination that is not one of this rule's pairs.
      const pool = skillsForClass(cls).map((s) => s.id);
      const paired = new Set(rule.unlockPairs.map((p) => [...p].sort().join('+')));
      for (let i = 0; i < pool.length; i++)
        for (let j = i + 1; j < pool.length; j++) {
          const owned = [pool[i], pool[j]];
          expect(synergyUnlocked(rule, owned)).toBe(paired.has([...owned].sort().join('+')));
        }
    },
  );
  it('a matching card that is offered but not chosen does not count as acquired', () => {
    const w = arena('mage', { level: 10, onHit: [] });
    w.grantTestSkill('frost_nova', 1);
    w.grantTestXp(400);
    let sawPartner = false;
    for (let i = 0; i < 6 && w.run.currentOffer; i++) {
      sawPartner ||= w.run.currentOffer.cards.some(
        (c) =>
          c.kind === 'skill' &&
          ['fireball', 'inferno', 'ice_shards', 'blizzard'].includes(c.skillId),
      );
      if (w.run.currentOffer.rerollAvailable) w.rerollSkillOffer();
      else break;
    }
    expect(sawPartner).toBe(true);
    expect(unlockedNow(w)).toEqual([]);
    expect(unlockEvents(w)).toEqual([]);
  });
  it('two or more alternate pairs still unlock once; effects never duplicate', () => {
    const { w, ids } = setup('mage');
    for (const skill of ['fireball', 'frost_nova', 'ice_shards', 'inferno'])
      w.grantTestSkill(skill, 1);
    // thermal_shock now has three completed pairs; wildfire and shattered_ice one each.
    const rule = SYNERGY_RULES.find((r) => r.id === 'thermal_shock')!;
    expect(rule.unlockPairs.filter((p) => p.every((s) => w.run.rank(s) > 0))).toHaveLength(3);
    expect(unlockEvents(w).filter((e) => e.synergyId === 'thermal_shock')).toHaveLength(1);
    exercise(w, ids[0], 'thermal_shock');
    expect(fired(w, 'thermal_shock')).toHaveLength(1);
  });
  it('acquiring a skill of another class is impossible, so class boundaries hold', () => {
    const w = arena('mage');
    expect(() => w.grantTestSkill('cleave', 1)).toThrow();
    expect(unlockedNow(w)).toEqual([]);
  });
});

describe('trigger separation and concurrency (acceptance 5–6)', () => {
  it.each(SYNERGY_RULES.map((r) => [r.id, r.characterClass] as const))(
    '%s: unlocked but no matching hit/status/kill → no proc',
    (id, cls) => {
      const { w, ids } = setup(cls);
      for (const skill of ALL_SYNERGY_SKILLS[cls]) w.grantTestSkill(skill, 1);
      expect(w.skills.synergies.isEligible(id)).toBe(true);
      // Plain hit without statuses, control or low HP; target survives.
      const t = new Set<CombatTag>([
        'physical',
        'melee',
        'heavy_melee',
        'dagger',
        'ice',
        'projectile',
      ]);
      for (const key of ['a', 'b', 'c']) {
        const attack = w.skills.attack(t, 0.01, 'physical');
        w.skills.hit(ids[0], { ...attack, critical: false }, t, { projectileKey: key });
      }
      expect(fired(w, id)).toHaveLength(0);
    },
  );
  it('all three rogue hit synergies fire from one eligible hit, each exactly once', () => {
    const { w, ids } = setup('rogue');
    for (const skill of ALL_SYNERGY_SKILLS.rogue) w.grantTestSkill(skill, 1);
    exercise(w, ids[0], 'final_cut');
    expect(fired(w, 'blood_frenzy')).toHaveLength(1);
    expect(fired(w, 'deep_wounds')).toHaveLength(1);
    expect(fired(w, 'final_cut')).toHaveLength(1);
  });
});

describe('starting weapons retain their effects without unlocking synergies', () => {
  it('Warrior starting sword has no Bleed and unlocks no synergies', () => {
    const w = arena('warrior', { level: 10 });
    const victim = w.spawnEnemy('melee', 35, 0, stationaryMelee);
    w.core.updateEntityStats(victim, { ...w.core.getEntity(victim), maxHp: 1e9 });
    w.update(3);
    expect(w.statuses.getGroup(victim, 'bleed')).toBeNull();
    expect(w.core.getEntity(victim).currentHp).toBeLessThan(1e9);
    expect(skillEvents(w, 'synergy-triggered')).toHaveLength(0);
  });
  it.each([
    ['mage', 'burn'],
    ['archer', 'poison'],
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
