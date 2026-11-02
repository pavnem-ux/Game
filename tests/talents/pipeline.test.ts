import { describe, expect, it } from 'vitest';
import { COMBAT_ATTRIBUTE_CAPS, calculateCharacterStats } from '../../src/character-stats';
import type { CharacterClass } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import type { GameplayOptions } from '../../src/gameplay';
import { NO_MODIFIERS, SYNERGY_RULES, composeRunStats, synergyUnlocked } from '../../src/skills';
import {
  TALENT_CATALOG_DATA,
  TALENT_CONFIG,
  loadTalentConfig,
  talentLoadout,
} from '../../src/talents';
import type { TalentCatalogData, TalentEffect, TalentRanks } from '../../src/talents';
import { play, resolveOffers, ring, unlockClassSynergies } from '../skills/helpers';

/**
 * Test-only approved config: stat descriptors on a few `ready` ranks so the pipeline can be
 * exercised. The shipped catalog stays unapproved (G0) and carries no effects.
 */
function fixture(effects: Record<string, Partial<Record<1 | 2 | 3, TalentEffect[]>>>) {
  const data: TalentCatalogData = {
    ...TALENT_CATALOG_DATA,
    nodes: TALENT_CATALOG_DATA.nodes.map((n) =>
      effects[n.id]
        ? {
            ...n,
            ranks: n.ranks.map((r, i) => {
              const e = effects[n.id][(i + 1) as 1 | 2 | 3];
              return e ? { ...r, status: 'ready' as const, effects: e } : r;
            }),
          }
        : n,
    ),
  };
  return loadTalentConfig(data, true);
}
const stat = (s: TalentEffect['stat'], value: number): TalentEffect => ({
  kind: 'stat',
  stat: s,
  value,
});
const CONFIG = fixture({
  'warrior.b2.n01': {
    1: [stat('maxHpPercent', 8)],
    2: [stat('maxHpPercent', 14), stat('resistance', 2)],
    3: [stat('maxHpPercent', 22), stat('resistance', 4)],
  },
  'mage.b2.n01': { 1: [stat('cooldownReduction', 3)] },
  'rogue.b2.n01': { 1: [stat('dodgeChance', 2)] },
  'archer.b1.n01': { 1: [stat('criticalChance', 500)] }, // absurd on purpose: cap check
});
function world(cls: CharacterClass, level: number, ranks: TalentRanks, config = CONFIG) {
  const options: GameplayOptions = {
    characterClass: cls,
    level,
    seed: 3,
    initialEnemies: false,
    spawning: { enabled: false },
    talents: { ranks, config },
  };
  const w = new GameplayWorld(options);
  w.setTestProtection(true);
  return w;
}
const base = (cls: CharacterClass, level: number) => calculateCharacterStats(cls, level);

describe('Task 09 §1.2 modifier pipeline', () => {
  it('pending ranks are inert (09.1 rule 7): they change nothing until implemented', () => {
    const pending = loadTalentConfig(
      {
        ...TALENT_CATALOG_DATA,
        nodes: TALENT_CATALOG_DATA.nodes.map((n) => ({
          ...n,
          ranks: n.ranks.map((r) => ({ ...r, status: 'pending' as const, effects: undefined })),
        })),
      },
      true,
    );
    const ranks = { 'warrior.b2.n01': 3, 'warrior.b1.n01': 2 };
    const w = world('warrior', 20, ranks, pending);
    const plain = world('warrior', 20, {}, pending);
    expect(w.getSnapshot().player).toEqual(plain.getSnapshot().player);
    expect(w.skills.effectiveStats).toEqual(plain.skills.effectiveStats);
    expect(w.getSnapshot().talents).toEqual({
      ranks,
      pointsSpent: 5,
      activeRanks: 0,
      superpower: false,
    });
  });
  it('only the current rank applies (ranks are totals) and each effect is applied exactly once', () => {
    const primary = base('warrior', 20).primaryAttributes;
    for (const [rank, maxHpPercent, resistance] of [
      [1, 8, 0],
      [2, 14, 2],
      [3, 22, 4],
    ] as const) {
      const w = world('warrior', 20, { 'warrior.b2.n01': rank });
      const expected = composeRunStats(primary, { ...NO_MODIFIERS, maxHpPercent, resistance });
      expect(w.skills.effectiveStats).toEqual(expected);
      const player = w.getSnapshot().player;
      expect(player.maxHp).toBe(expected.maxHp);
      expect(player.currentHp).toBe(expected.maxHp); // the run starts at full HP
      expect(player.resistance).toBe(expected.resistance);
      // Repeated recomposition (level-ups, buffs) never stacks the talent again.
      for (let i = 0; i < 5; i++) w.skills.refreshStats();
      expect(w.skills.effectiveStats).toEqual(expected);
    }
  });
  it('talents combine with run passives in the same composition (caps once)', () => {
    const w = world('warrior', 20, { 'warrior.b2.n01': 1 });
    w.grantTestSkill('vitality', 1);
    const vitality = w.skills.params('vitality').maxHpPercent;
    const expected = composeRunStats(base('warrior', 20).primaryAttributes, {
      ...NO_MODIFIERS,
      maxHpPercent: 8 + vitality,
    });
    expect(w.skills.effectiveStats.maxHp).toBe(expected.maxHp);
  });
  it('dodge and cooldown reduction reach Combat Core / Skill Engine; caps are respected', () => {
    const rogue = world('rogue', 10, { 'rogue.b2.n01': 1 });
    expect(rogue.getSnapshot().player.dodgeChance).toBe(
      base('rogue', 10).combatAttributes.dodgeChance + 2,
    );
    const mage = world('mage', 10, { 'mage.b2.n01': 1 });
    expect(mage.skills.effectiveStats.cooldownReduction).toBe(
      base('mage', 10).combatAttributes.cooldownReduction + 3,
    );
    const archer = world('archer', 10, { 'archer.b1.n01': 1 });
    expect(archer.skills.effectiveStats.criticalChance).toBe(COMBAT_ATTRIBUTE_CAPS.criticalChance);
    expect(archer.getSnapshot().player.criticalChance).toBe(COMBAT_ATTRIBUTE_CAPS.criticalChance);
  });
  it('talents never unlock synergies or count as acquired run skills', () => {
    for (const cls of ['mage', 'warrior', 'archer', 'rogue'] as const) {
      const ranks: Record<string, number> = {};
      for (const b of TALENT_CONFIG.branchesOf(cls).slice(0, 2)) {
        ranks[b.nodes[0].id] = 2;
        ranks[b.nodes[1].id] = 2;
      }
      ranks[`${cls}.b3.n01`] = 1;
      const w = world(cls, 50, ranks);
      expect(w.getSnapshot().talents.superpower).toBe(true);
      expect(w.run.ownedIds()).toEqual([]);
      for (const rule of SYNERGY_RULES.filter((r) => r.characterClass === cls))
        expect(synergyUnlocked(rule, new Set(w.run.ownedIds()))).toBe(false);
    }
  });
  it('a talent strike is its own source, never procs synergies/passives and never recurses', () => {
    const w = world('warrior', 50, {});
    unlockClassSynergies(w, 'warrior', 5);
    const [target] = ring(w, 1, 60);
    const seq = w.getEvents().at(-1)?.sequence ?? 0;
    const hit = w.skills.talentStrike('warrior.b2.n03', target, 0.6, 'physical');
    expect(hit?.result.status).toBe('hit');
    expect(hit?.procs).toBe(false);
    expect(hit?.tags.has('talent')).toBe(true);
    const after = w.getEvents(seq);
    expect(after.some((e) => e.event.type === 'damage')).toBe(true);
    expect(after.some((e) => e.event.type === 'synergy-triggered')).toBe(false);
    const sources = w.getSnapshot().runStats.bySource.map((s) => s.source);
    expect(sources).toContain('talent:warrior.b2.n03');
    expect(() => w.skills.talentStrike('nope', target, 1, 'physical')).toThrow(RangeError);
    expect(() => w.skills.talentStrike('warrior.b2.n03', target, -1, 'physical')).toThrow();
  });
  it('a run reset keeps talents; invalid trees are rejected at run start', () => {
    const ranks = { 'warrior.b2.n01': 2 };
    const a = world('warrior', 20, ranks);
    play(a, 5);
    resolveOffers(a);
    const b = world('warrior', 20, ranks); // "restart": same options from the profile
    expect(b.getSnapshot().talents.ranks).toEqual(ranks);
    expect(b.skills.effectiveStats).toEqual(world('warrior', 20, ranks).skills.effectiveStats);
    expect(() => world('warrior', 20, { 'warrior.b2.n02': 1 })).toThrow(/Invalid talents/);
    expect(() => world('warrior', 29, { 'warrior.b3.n01': 1 })).toThrow(/Invalid talents/);
    expect(() => talentLoadout('warrior', 1, { 'warrior.b1.n01': 1 })).toThrow(RangeError);
  });
  it('effects can only sit on ready ranks, and a ready rank needs an effect', () => {
    const withStatus = (status: 'pending' | 'ready', effects?: TalentEffect[]) =>
      loadTalentConfig({
        ...TALENT_CATALOG_DATA,
        nodes: TALENT_CATALOG_DATA.nodes.map((n) =>
          n.id === 'rogue.b1.n01'
            ? { ...n, ranks: [{ ...n.ranks[0], status, effects }, n.ranks[1], n.ranks[2]] }
            : n,
        ),
      });
    expect(() => withStatus('pending', [stat('damagePercent', 1)])).toThrow(
      /effects on a pending rank/,
    );
    expect(() => withStatus('ready')).toThrow(/ready without an effect/);
  });
});
