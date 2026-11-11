import { describe, expect, it } from 'vitest';
import { RunSkills, SKILL_RULES, cardKey, skillsForClass } from '../../src/skills';
import type { LevelUpOffer } from '../../src/skills';
import { GameplayWorld, createRunRandom } from '../../src/gameplay';
import { skipCoins, runGold, COIN_RULES } from '../../src/equipment';
import { getCampaignMap } from '../../src/campaign';

const run = (seed = 7) => new RunSkills('mage', createRunRandom(seed).skills);
const keys = (o: LevelUpOffer | null) => (o ? o.cards.map(cardKey) : []);

describe('Task 14 Phase 1 — banish and skip in RunSkills', () => {
  it('counters per run: 3 rerolls, 2 banishes, unlimited skips', () => {
    const r = run();
    r.queueLevelUps(20);
    expect(r.getState()).toMatchObject({ rerolls: 3, banishes: 2, skips: 0, banished: [] });
    expect(SKILL_RULES.banishesPerRun).toBe(2);
    r.banish(keys(r.currentOffer)[0]);
    r.banish(keys(r.currentOffer)[1]);
    expect(r.getState().banishes).toBe(0);
    const k = keys(r.currentOffer)[2];
    expect(r.banishBlockReason(k)).toBe('none-left');
    expect(() => r.banish(k)).toThrow();
    for (let i = 0; i < 10; i++) r.skip();
    expect(r.getState()).toMatchObject({ skips: 10, pendingChoices: 10 });
    expect(r.getState().banished).toHaveLength(2);
  });
  it('a banished skill is never offered again (rerolls, later offers, after skips)', () => {
    const r = run(11);
    r.queueLevelUps(60);
    const gone = keys(r.currentOffer)[0];
    const before = r.currentOffer!;
    r.banish(gone);
    const after = r.currentOffer!;
    // Only the banished card changed; the offer id stays.
    expect(after.id).toBe(before.id);
    expect(keys(after)).not.toContain(gone);
    expect(keys(after).filter((k) => keys(before).includes(k))).toHaveLength(2);
    for (let i = 0; i < 58 && r.currentOffer; i++) {
      expect(keys(r.currentOffer)).not.toContain(gone);
      if (r.currentOffer.rerollAvailable && i % 7 === 0) {
        r.reroll();
        expect(keys(r.currentOffer)).not.toContain(gone);
      }
      if (i % 5 === 0) r.skip();
      else r.choose(keys(r.currentOffer)[0]);
    }
    expect(r.rank(gone)).toBe(0);
  });
  it('an owned skill’s upgrade cannot be banished when it is the last eligible card', () => {
    const r = run(3);
    const pool = skillsForClass('mage');
    const autos = pool.filter((d) => d.kind === 'auto');
    const passives = pool.filter((d) => d.kind === 'passive');
    // Fill every slot; max all but one skill → the only eligible card is that skill's upgrade.
    for (const d of autos.slice(0, SKILL_RULES.autoSlots))
      r.grantForTesting(d.id, SKILL_RULES.maxRank);
    for (const d of passives.slice(0, SKILL_RULES.passiveSlots - 1))
      r.grantForTesting(d.id, SKILL_RULES.maxRank);
    const last = passives[SKILL_RULES.passiveSlots - 1];
    r.grantForTesting(last.id, 1);
    r.queueLevelUps(1);
    expect(keys(r.currentOffer)).toEqual([last.id]);
    expect(r.banishBlockReason(last.id)).toBe('last-upgrade');
    expect(() => r.banish(last.id)).toThrow();
    // A bonus card is never banishable.
    const full = run(4);
    for (const d of autos.slice(0, SKILL_RULES.autoSlots))
      full.grantForTesting(d.id, SKILL_RULES.maxRank);
    for (const d of passives.slice(0, SKILL_RULES.passiveSlots))
      full.grantForTesting(d.id, SKILL_RULES.maxRank);
    full.queueLevelUps(1);
    expect(full.currentOffer!.mode).toBe('bonus');
    expect(full.banishBlockReason(keys(full.currentOffer)[0])).toBe('no-offer');
  });
  it('skip closes the offer without a card; the next queued offer follows', () => {
    const r = run();
    r.queueLevelUps(2);
    const first = r.currentOffer!.id;
    const events = r.skip();
    expect(events[0]).toEqual({ type: 'skill-offer-skipped', offerId: first });
    expect(r.currentOffer!.id).toBe(first + 1);
    expect(r.getState().owned).toEqual([]);
    r.skip();
    expect(r.currentOffer).toBeNull();
    expect(() => r.skip()).toThrow();
  });
  it('same seed + same actions ⇒ same offers', () => {
    const script = (r: RunSkills) => {
      const log: string[][] = [];
      r.queueLevelUps(12);
      const step = (i: number) => {
        log.push(keys(r.currentOffer));
        if (i === 1) r.reroll();
        else if (i === 2 || i === 6) r.banish(keys(r.currentOffer)[1]);
        else if (i === 4) r.skip();
        else r.choose(keys(r.currentOffer)[0]);
      };
      for (let i = 0; i < 12 && r.currentOffer; i++) step(i);
      return { log, state: r.getState() };
    };
    const a = script(run(21));
    expect(script(run(21))).toEqual(a);
    expect(script(run(22)).log).not.toEqual(a.log);
  });
});

describe('Task 14 Phase 1 — world: skip coins and run stats', () => {
  const world = (mapId: number | null) => {
    const w = new GameplayWorld({
      characterClass: 'mage',
      seed: 5,
      initialEnemies: false,
      spawning: { enabled: false },
      onHit: [],
      ...(mapId ? { campaign: { mapId } } : {}),
    });
    w.setTestProtection(true);
    return w;
  };
  it('skip pays 2% of the map’s victory Gold (min 3) as coins, paid by the normal rules', () => {
    expect(COIN_RULES.skipShare).toBe(0.02);
    expect(skipCoins(1)).toBe(3); // 2% of 75 = 1.5 → min 3
    expect(skipCoins(40)).toBe(Math.round(getCampaignMap(40).victoryGold * 0.02));
    const w = world(40);
    w.grantTestXp(20 + 30);
    w.skipSkillOffer();
    w.skipSkillOffer();
    expect(w.getSnapshot().coins.collected).toBe(2 * skipCoins(40));
    // Normal coin rules: victory pays all coins, defeat 50%.
    const coins = w.getSnapshot().coins.collected;
    expect(runGold('victory', 40, coins).coins).toBe(coins);
    expect(runGold('defeat', 40, coins).total).toBe(Math.floor(coins * 0.5));
    // Sandbox runs have no coins: skipping pays nothing.
    const s = world(null);
    s.grantTestXp(20);
    s.skipSkillOffer();
    expect(s.getSnapshot().coins.collected).toBe(0);
  });
  it('run stats count rerolls, banishes, skips and the banished list', () => {
    const w = world(5);
    w.grantTestXp(20 + 30 + 42);
    w.rerollSkillOffer();
    const gone = keys(w.run.currentOffer)[0];
    w.banishSkillCard(gone);
    w.skipSkillOffer();
    expect(w.getSnapshot().runStats.choices).toEqual({
      rerolls: 1,
      banishes: 1,
      skips: 1,
      banished: [gone],
    });
    expect(w.getSnapshot().skills).toMatchObject({ rerolls: 2, banishes: 1, skips: 1 });
    w.debugGrantChoiceControls(2, 3);
    expect(w.getSnapshot().skills).toMatchObject({ rerolls: 4, banishes: 4 });
  });
});
