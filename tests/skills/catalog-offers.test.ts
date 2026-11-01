import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import {
  RunSkills,
  SKILL_CATALOG,
  SKILL_RULES,
  cumulativeRanks,
  eligiblePools,
  pickSkills,
  rerollSkills,
  skillsForClass,
  validateCatalog,
} from '../../src/skills';
import type { SkillDefinition } from '../../src/skills';

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const key = (c: { kind: string; skillId?: string; bonusId?: string }) =>
  c.kind === 'skill' ? c.skillId! : `bonus:${c.bonusId}`;
function chooseFirst(run: RunSkills) {
  const card = run.currentOffer!.cards[0];
  return run.choose(key(card));
}
/** Fill every slot and push every owned skill to rank V by always choosing the first card. */
function exhaust(run: RunSkills) {
  run.queueLevelUps(1000);
  let guard = 0;
  while (run.currentOffer?.mode === 'skills' && guard++ < 1000) chooseFirst(run);
}

describe('catalogue: 37 data-driven definitions', () => {
  it('has exactly 37 unique IDs: 4 × (6 auto + 1 class passive) + 9 universal passives', () => {
    expect(SKILL_CATALOG).toHaveLength(37);
    expect(new Set(SKILL_CATALOG.map((d) => d.id)).size).toBe(37);
    for (const c of CHARACTER_CLASSES) {
      const own = SKILL_CATALOG.filter((d) => d.owner === c);
      expect(own.filter((d) => d.kind === 'auto')).toHaveLength(6);
      expect(own.filter((d) => d.kind === 'passive')).toHaveLength(1);
    }
    const universal = SKILL_CATALOG.filter((d) => d.owner === 'universal');
    expect(universal).toHaveLength(9);
    expect(universal.every((d) => d.kind === 'passive')).toBe(true);
  });
  it('each class sees its own 7 plus the 9 universal passives and nothing from other classes', () => {
    for (const c of CHARACTER_CLASSES) {
      const pool = skillsForClass(c);
      expect(pool).toHaveLength(16);
      expect(pool.every((d) => d.owner === c || d.owner === 'universal')).toBe(true);
    }
  });
  it('every skill has five fixed ranks, summaries and consistent numeric parameters', () => {
    for (const d of SKILL_CATALOG) {
      expect(d.maxRank).toBe(5);
      expect(d.ranks).toHaveLength(5);
      expect(d.rankSummaries).toHaveLength(5);
      for (const r of d.ranks)
        expect(Object.keys(r).sort()).toEqual(Object.keys(d.ranks[0]).sort());
    }
  });
  it('builds cumulative rank tables and rejects malformed tuning before use', () => {
    const r = cumulativeRanks({ a: 1, b: 2 }, { a: 3 }, {}, { b: 5 }, {});
    expect(r.map((x) => [x.a, x.b])).toEqual([
      [1, 2],
      [3, 2],
      [3, 2],
      [3, 5],
      [3, 5],
    ]);
    const base = SKILL_CATALOG[0];
    const bad = (patch: Partial<SkillDefinition>) => () => validateCatalog([{ ...base, ...patch }]);
    expect(bad({ id: 'Bad Id' })).toThrow();
    expect(() => validateCatalog([base, base])).toThrow(/Duplicate/);
    expect(bad({ ranks: cumulativeRanks({ cooldown: 0 }, {}, {}, {}, {}) })).toThrow(/cooldown/);
    expect(bad({ ranks: cumulativeRanks({ cooldown: 1, x: -1 }, {}, {}, {}, {}) })).toThrow();
    expect(
      bad({ ranks: [{ cooldown: 1 }, { cooldown: 1, y: 1 }, ...base.ranks.slice(2)] as never }),
    ).toThrow(/same parameters/);
  });
});

describe('level-up offers: managed random, slots, ranks', () => {
  it('a fresh run offers only new skills: three unique cards at rank I', () => {
    const run = new RunSkills('mage', seeded(3));
    run.queueLevelUps(1);
    const offer = run.currentOffer!;
    expect(offer.mode).toBe('skills');
    expect(offer.cards).toHaveLength(3);
    expect(new Set(offer.cards.map(key)).size).toBe(3);
    for (const c of offer.cards)
      expect(c).toMatchObject({ kind: 'skill', isNew: true, currentRank: 0, nextRank: 1 });
  });
  it('mixed pools always contain at least one new skill and one upgrade, re-evaluated on every level', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const run = new RunSkills('archer', seeded(seed));
      run.queueLevelUps(6);
      chooseFirst(run);
      for (let i = 0; i < 4; i++) {
        const cards = run.currentOffer!.cards;
        expect(cards.some((c) => c.kind === 'skill' && c.isNew)).toBe(true);
        expect(cards.some((c) => c.kind === 'skill' && !c.isNew)).toBe(true);
        expect(new Set(cards.map(key)).size).toBe(cards.length);
        chooseFirst(run);
      }
    }
  });
  it('ranks advance exactly one step per pick, never above V, with no removal or replacement', () => {
    const run = new RunSkills('rogue', seeded(9));
    run.grantForTesting('lacerate', 1);
    // Fill all other slots so the only possible card is the next rank of Lacerate.
    for (const id of ['blade_flurry', 'fan_of_knives', 'shadow_strike']) run.grantForTesting(id, 5);
    for (const id of ['serrated_blades', 'power', 'haste', 'vitality', 'fortitude', 'precision'])
      run.grantForTesting(id, 5);
    for (let rank = 2; rank <= 5; rank++) {
      run.queueLevelUps(1);
      const cards = run.currentOffer!.cards;
      expect(cards).toEqual([
        expect.objectContaining({
          skillId: 'lacerate',
          currentRank: rank - 1,
          nextRank: rank,
          isNew: false,
        }),
      ]);
      run.choose('lacerate');
      expect(run.rank('lacerate')).toBe(rank);
    }
    run.queueLevelUps(1);
    expect(run.currentOffer!.mode).toBe('bonus');
    expect(() => run.grantForTesting('lacerate', 4)).toThrow(/never decrease/);
    expect(() => run.grantForTesting('lacerate', 6)).toThrow();
    for (const method of ['remove', 'replace', 'respec', 'unequip'])
      expect(method in run).toBe(false);
  });
  it('enforces 4 automatic and 6 passive slots; the class passive counts toward the six', () => {
    const run = new RunSkills('warrior', seeded(4));
    for (const id of ['ground_slam', 'whirlwind', 'shield_bash', 'earthquake'])
      run.grantForTesting(id, 1);
    expect(() => run.grantForTesting('cleave', 1)).toThrow(/slot/);
    for (const id of ['battle_fury', 'power', 'haste', 'vitality', 'fortitude', 'precision'])
      run.grantForTesting(id, 1);
    expect(() => run.grantForTesting('swiftness', 1)).toThrow(/slot/);
    expect(run.getState().slots).toEqual({
      auto: { used: 4, max: 4 },
      passive: { used: 6, max: 6 },
    });
    for (let i = 0; i < 30; i++) {
      run.queueLevelUps(1);
      for (const c of run.currentOffer!.cards) {
        expect(c.kind).toBe('skill');
        if (c.kind === 'skill') {
          expect(c.isNew).toBe(false);
          expect(['cleave', 'war_cry', 'swiftness', 'deadly_strikes'].includes(c.skillId)).toBe(
            false,
          );
        }
      }
      chooseFirst(run);
    }
    expect(() => new RunSkills('warrior', seeded(1)).grantForTesting('fireball', 1)).toThrow(
      /not available/,
    );
  });
  it('shows fewer than three cards when fewer candidates exist', () => {
    const one = pickSkills({ fresh: [SKILL_CATALOG[0]], upgrades: [] }, seeded(1));
    expect(one).toHaveLength(1);
    const two = pickSkills({ fresh: [SKILL_CATALOG[0]], upgrades: [SKILL_CATALOG[1]] }, seeded(1));
    expect(two.map((d) => d.id).sort()).toEqual([SKILL_CATALOG[0].id, SKILL_CATALOG[1].id].sort());
    expect(pickSkills({ fresh: [], upgrades: [] }, seeded(1))).toEqual([]);
  });
});

describe('rerolls', () => {
  it('exactly three per run, cost one each, never consume the level choice and preserve guarantees', () => {
    const run = new RunSkills('mage', seeded(11));
    run.queueLevelUps(3);
    chooseFirst(run);
    for (let i = 0; i < 3; i++) {
      const before = run.currentOffer!;
      run.reroll();
      const after = run.currentOffer!;
      expect(after.id).toBeGreaterThan(before.id);
      expect(run.pendingChoices).toBe(2);
      const cards = after.cards;
      expect(cards.some((c) => c.kind === 'skill' && c.isNew)).toBe(true);
      expect(cards.some((c) => c.kind === 'skill' && !c.isNew)).toBe(true);
    }
    expect(run.getState().rerolls).toBe(0);
    expect(run.currentOffer!.rerollAvailable).toBe(false);
    expect(() => run.reroll()).toThrow();
    chooseFirst(run);
    expect(run.pendingChoices).toBe(1);
    expect(new RunSkills('mage', seeded(11)).getState().rerolls).toBe(3);
  });
  it('excludes rejected cards when the pool allows it, otherwise allows repeats instead of shrinking', () => {
    const pool = skillsForClass('archer');
    const pools = { fresh: pool.slice(0, 6), upgrades: [] as SkillDefinition[] };
    const rejected = new Set(pool.slice(0, 3).map((d) => d.id));
    for (let s = 1; s < 50; s++)
      for (const d of rerollSkills(pools, rejected, seeded(s)))
        expect(rejected.has(d.id)).toBe(false);
    const small = { fresh: pool.slice(0, 4), upgrades: [] as SkillDefinition[] };
    const repeats = rerollSkills(small, new Set(pool.slice(0, 3).map((d) => d.id)), seeded(2));
    expect(repeats).toHaveLength(3);
  });
  it('is disabled when no meaningful alternative exists', () => {
    const run = new RunSkills('rogue', seeded(5));
    for (const id of ['blade_flurry', 'fan_of_knives', 'lacerate', 'shadow_strike'])
      run.grantForTesting(id, 5);
    for (const id of ['serrated_blades', 'power', 'haste', 'vitality', 'fortitude'])
      run.grantForTesting(id, 5);
    run.grantForTesting('precision', 3);
    run.queueLevelUps(1);
    expect(run.currentOffer!.cards).toHaveLength(1);
    expect(run.currentOffer!.rerollAvailable).toBe(false);
  });
});

describe('queued level-ups, exhaustion and fallback rewards', () => {
  it('queues several levels from one XP award without losing choices', () => {
    const run = new RunSkills('warrior', seeded(2));
    run.queueLevelUps(3);
    expect(run.pendingChoices).toBe(3);
    const offers = new Set<number>();
    while (run.currentOffer) {
      offers.add(run.currentOffer.id);
      chooseFirst(run);
    }
    expect(offers.size).toBe(3);
    // Every choice granted exactly one rank (new skill at I or one upgrade step).
    expect(run.getState().owned.reduce((sum, o) => sum + o.rank, 0)).toBe(3);
    expect(() => chooseFirst(run)).toThrow();
  });
  it('offers three repeatable bonus rewards only after all 10 slots are filled at rank V', () => {
    for (const c of CHARACTER_CLASSES) {
      const run = new RunSkills(c, seeded(7));
      exhaust(run);
      const s = run.getState();
      expect(s.slots.auto.used).toBe(SKILL_RULES.autoSlots);
      expect(s.slots.passive.used).toBe(SKILL_RULES.passiveSlots);
      expect(s.owned.every((o) => o.rank === 5)).toBe(true);
      const offer = run.currentOffer!;
      expect(offer.mode).toBe('bonus');
      expect(offer.cards.map(key)).toEqual(['bonus:recovery', 'bonus:barrier', 'bonus:gold']);
      expect(offer.rerollAvailable).toBe(false);
      const { result } = run.choose('bonus:gold');
      expect(result).toEqual({ type: 'bonus', bonusId: 'gold' });
      expect(run.currentOffer!.mode).toBe('bonus');
      run.choose('bonus:gold');
      expect(run.getState().bonusesClaimed.gold).toBe(2);
      expect(run.getState().owned).toHaveLength(10);
    }
  });
  it('shows fallback rewards with a warning instead of an empty dialog when the pool is empty early', () => {
    const run = new RunSkills(
      'mage',
      seeded(1),
      SKILL_CATALOG.filter((d) => d.owner === 'warrior'),
    );
    const events = run.queueLevelUps(1);
    expect(run.currentOffer!.mode).toBe('bonus');
    expect(events.some((e) => e.type === 'skill-pool-warning')).toBe(true);
  });
  it('rejects stale or foreign cards and clears pending choices at run end', () => {
    const run = new RunSkills('archer', seeded(8));
    run.queueLevelUps(2);
    expect(() => run.choose('fireball')).toThrow(/not part/);
    run.clearPending();
    expect(run.pendingChoices).toBe(0);
    expect(run.currentOffer).toBeNull();
  });
  it('is deterministic for the same seed and choices', () => {
    const a = new RunSkills('rogue', seeded(42)),
      b = new RunSkills('rogue', seeded(42));
    a.queueLevelUps(5);
    b.queueLevelUps(5);
    while (a.currentOffer) {
      expect(a.currentOffer.cards.map(key)).toEqual(b.currentOffer!.cards.map(key));
      chooseFirst(a);
      chooseFirst(b);
    }
  });
});
