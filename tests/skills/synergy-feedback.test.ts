import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '../../src/gameplay';
import {
  LEVEL_ROMAN,
  SYNERGY_LEVEL_TEXT,
  SYNERGY_RULES,
  cardLevelRaises,
  synergyOverview,
} from '../../src/skills';
import type { SynergyId, SynergyRule } from '../../src/skills';
import { cuesForEvent } from '../../src/audio';
import { arena, skillEvents } from './helpers';

const rule = (id: SynergyId) => SYNERGY_RULES.find((r) => r.id === id) as SynergyRule;
const levelUps = (w: ReturnType<typeof arena>) =>
  skillEvents(w, 'synergy-level-up').map((e) => e.event as { synergyId: string; level: number });

describe('Task 15 Phase 3 — level-up events', () => {
  it('unlock (I) uses synergy-unlocked; II and III each emit synergy-level-up once, with the pair', () => {
    const w = arena('mage');
    const [a, b] = rule('thermal_shock').unlockPairs[0];
    w.grantTestSkill(a, 1);
    w.grantTestSkill(b, 1);
    expect(
      skillEvents(w, 'synergy-unlocked').map((e) => (e.event as { synergyId: string }).synergyId),
    ).toContain('thermal_shock');
    expect(levelUps(w).filter((e) => e.synergyId === 'thermal_shock')).toEqual([]);
    w.grantTestSkill(a, 3);
    expect(levelUps(w).filter((e) => e.synergyId === 'thermal_shock')).toEqual([]);
    w.grantTestSkill(b, 3);
    expect(levelUps(w).filter((e) => e.synergyId === 'thermal_shock')).toMatchObject([
      { level: 2 },
    ]);
    w.grantTestSkill(a, 5);
    w.grantTestSkill(b, 4);
    expect(levelUps(w).filter((e) => e.synergyId === 'thermal_shock')).toHaveLength(1);
    w.grantTestSkill(b, 5);
    const ups = skillEvents(w, 'synergy-level-up').filter(
      (e) => (e.event as { synergyId: string }).synergyId === 'thermal_shock',
    );
    expect(ups.map((e) => e.event)).toMatchObject([
      { level: 2, pair: [a, b] },
      { level: 3, pair: [a, b], skillId: b },
    ]);
    // QA overrides never emit level-up events (they are not acquisitions).
    w.setTestSynergyLevel('wildfire', 3);
    expect(levelUps(w).filter((e) => e.synergyId === 'wildfire')).toEqual([]);
    expect(w.getSnapshot().synergyLevels.find((l) => l.id === 'wildfire')).toMatchObject({
      level: 3,
      forced: true,
    });
    expect(w.getSnapshot().synergyLevels.find((l) => l.id === 'thermal_shock')).toMatchObject({
      level: 3,
      forced: false,
      pair: [a, b],
    });
  });
  it('a level-up pick through an offer emits the event like a DEV grant', () => {
    const [a, b] = rule('thermal_shock').unlockPairs[0];
    // Find a seed whose first offer contains the upgrade of b (fixed seeds: deterministic).
    for (let seed = 1; seed < 200; seed++) {
      const w = arena('mage', { seed });
      w.grantTestSkill(a, 3);
      w.grantTestSkill(b, 2);
      w.grantTestXp(20);
      if (!w.run.currentOffer!.cards.some((c) => c.kind === 'skill' && c.skillId === b)) continue;
      w.chooseSkill(b);
      expect(levelUps(w)).toEqual([
        expect.objectContaining({ synergyId: 'thermal_shock', level: 2 }),
      ]);
      return;
    }
    throw new Error('No seed offered the upgrade.');
  });
});

describe('Task 15 Phase 3 — card hint «▲ <Синергия> II/III» only when the pick raises the level', () => {
  it('upgrade to the weakest rank raises; other picks do not', () => {
    const [a, b] = rule('thermal_shock').unlockPairs[0];
    const ranks = new Map([
      [a, 3],
      [b, 2],
    ]);
    expect(cardLevelRaises('mage', ranks, b).map((r) => [r.synergy.id, r.level])).toContainEqual([
      'thermal_shock',
      2,
    ]);
    // Upgrading the stronger skill does not raise the pair's weakest rank.
    expect(
      cardLevelRaises('mage', ranks, a).filter((r) => r.synergy.id === 'thermal_shock'),
    ).toEqual([]);
    // III when both reach 5.
    const four = new Map([
      [a, 5],
      [b, 4],
    ]);
    expect(
      cardLevelRaises('mage', four, b).find((r) => r.synergy.id === 'thermal_shock')?.level,
    ).toBe(3);
    // A new skill enters at rank I: never II/III (the unlock hint covers level I).
    expect(cardLevelRaises('mage', new Map([[a, 5]]), b)).toEqual([]);
    // Unrelated skill: nothing.
    expect(cardLevelRaises('mage', ranks, 'vitality')).toEqual([]);
  });
});

describe('Task 15 Phase 3 — overview levels, texts and audio mapping', () => {
  it('overview carries level and best pair; every synergy has II/III texts', () => {
    const [a, b] = rule('wildfire').unlockPairs[0];
    const info = synergyOverview(
      'mage',
      [a, b],
      new Map([
        [a, 5],
        [b, 3],
      ]),
    ).find((s) => s.id === 'wildfire')!;
    expect(info.level).toBe(2);
    expect(info.bestPair).toContain('+');
    expect(synergyOverview('mage', [a, b]).find((s) => s.id === 'wildfire')!.level).toBe(1);
    for (const r of SYNERGY_RULES) {
      const t = SYNERGY_LEVEL_TEXT[r.id];
      expect(t.levelTwo.length).toBeGreaterThan(3);
      expect(t.awakened.length).toBeGreaterThan(1);
      expect(t.awakenedEffect.length).toBeGreaterThan(10);
    }
    expect(LEVEL_ROMAN).toEqual(['', 'I', 'II', 'III']);
  });
  it('sounds: level II / III jingles; each synergy trigger has its family sound, awakened adds a layer', () => {
    const ctx = { playerId: 'player', eliteIds: new Set<string>(), bossId: null };
    const ev = (event: object): WorldEvent =>
      ({ sequence: 1, time: 0, channel: 'skill', event }) as unknown as WorldEvent;
    expect(cuesForEvent(ev({ type: 'synergy-level-up', level: 2 }), ctx)).toEqual([
      'synergy-level',
    ]);
    expect(cuesForEvent(ev({ type: 'synergy-level-up', level: 3 }), ctx)).toEqual([
      'synergy-awakening',
    ]);
    for (const r of SYNERGY_RULES) {
      const plain = cuesForEvent(ev({ type: 'synergy-triggered', synergyId: r.id }), ctx);
      expect(plain).toHaveLength(1);
      expect(
        cuesForEvent(ev({ type: 'synergy-triggered', synergyId: r.id, awakened: true }), ctx),
      ).toEqual([plain[0], 'synergy-awaken']);
    }
  });
});
