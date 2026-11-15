import { describe, expect, it } from 'vitest';
import {
  NO_QUEST_COUNTERS,
  QUESTS,
  QUEST_BY_ID,
  addRunToCounters,
  claimQuest,
  claimableQuests,
  questProgress,
  validateRunQuestSummary,
} from '../../src/quests';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';
import { migrateV7toV8, parseProfile } from '../../src/persistence';

const NOW = '2026-11-15T10:00:00.000Z';
const activities = (shrine = 0, lantern = 0, thief = 0, nest = 0) => ({
  shrine,
  lantern,
  thief,
  nest,
});
const summary = (a = activities()) => ({
  killsByType: { swift: 0, brute: 0, bombard: 0 },
  chestsOpened: 0,
  synergiesOpened: [],
  synergiesAwakened: [],
  activities: a,
});
const run = (runId: string, outcome: 'victory' | 'defeat' | 'abandoned', a = activities()) => ({
  runId,
  mapId: 1,
  characterClass: 'mage' as const,
  outcome,
  elapsed: 600,
  kills: 10,
  eliteKills: 0,
  bossKilled: outcome === 'victory',
  runLevel: 5,
  coins: 0,
  quest: summary(a),
});

describe('Task 24 Phase 4 — activity quests', () => {
  it('8 quests: cleanse 10/50 shrines, defend 10/40 lanterns, catch 10/50 thieves, destroy 10/50 nests', () => {
    const list = QUESTS.filter((q) => q.group === 'activities');
    expect(list.map((q) => [q.id, q.title, q.reward])).toEqual([
      ['activities.shrine.10', 'Cleanse 10 shrines', { gold: 500, ore: 15 }],
      ['activities.shrine.50', 'Cleanse 50 shrines', { gold: 1500, ore: 40 }],
      ['activities.lantern.10', 'Defend 10 lanterns', { gold: 500, ore: 15 }],
      ['activities.lantern.40', 'Defend 40 lanterns', { gold: 1500, ore: 40 }],
      ['activities.thief.10', 'Catch 10 thieves', { gold: 500, ore: 15 }],
      ['activities.thief.50', 'Catch 50 thieves', { gold: 1500, ore: 40 }],
      ['activities.nest.10', 'Destroy 10 nests', { gold: 500, ore: 15 }],
      ['activities.nest.50', 'Destroy 50 nests', { gold: 1500, ore: 40 }],
    ]);
  });
  it('counters grow once per finalized run (victory and defeat; abandoned adds nothing; duplicates ignored)', () => {
    let p: PlayerProfile = createProfile('p', NOW);
    p = applyRunResult(p, run('a', 'victory', activities(4, 0, 2, 0)), NOW).profile;
    p = applyRunResult(p, run('a', 'victory', activities(4, 0, 2, 0)), NOW).profile; // same run id
    p = applyRunResult(p, run('b', 'defeat', activities(3, 0, 1, 0)), NOW).profile;
    p = applyRunResult(p, run('c', 'abandoned', activities(9, 9, 9, 9)), NOW).profile;
    expect(p.questCounters.activities).toEqual(activities(7, 0, 3, 0));
    const q = QUEST_BY_ID.get('activities.shrine.10')!;
    expect(questProgress(p, q)).toMatchObject({ current: 7, target: 10, state: 'in-progress' });
  });
  it('a completed quest is claimable once and pays Gold + Ore', () => {
    let p: PlayerProfile = createProfile('p', NOW);
    p = applyRunResult(p, run('a', 'victory', activities(10, 0, 0, 0)), NOW).profile;
    expect(claimableQuests(p)).toContain('activities.shrine.10');
    expect(claimableQuests(p)).not.toContain('activities.shrine.50');
    const before = { gold: p.gold, ore: p.ore };
    const claimed = claimQuest(p, 'activities.shrine.10');
    expect(claimed.gold - before.gold).toBe(500);
    expect(claimed.ore - before.ore).toBe(15);
    expect(() => claimQuest(claimed, 'activities.shrine.10')).toThrow();
    expect(() => claimQuest(p, 'activities.nest.10')).toThrow();
  });
  it('addRunToCounters without an activities summary (older runs) keeps the counts', () => {
    const c = { ...NO_QUEST_COUNTERS, activities: activities(1, 2, 3, 4) };
    const { activities: _drop, ...old } = summary();
    void _drop;
    const next = addRunToCounters(c, {
      outcome: 'victory',
      mapId: 1,
      eliteKills: 0,
      bossKilled: false,
      quest: validateRunQuestSummary(old),
    });
    expect(next.activities).toEqual(activities(1, 2, 3, 4));
  });
  it('invalid activity counts in a run summary are rejected', () => {
    expect(() => validateRunQuestSummary(summary({ ...activities(), shrine: -1 }))).toThrow(
      RangeError,
    );
    expect(() => validateRunQuestSummary(summary({ ...activities(), thief: 1.5 }))).toThrow(
      RangeError,
    );
  });
});

describe('Task 24 Phase 4 — save v8', () => {
  it('v7 → v8 adds activity counters at 0 (retroactive = 0); nothing else changes', () => {
    const v8 = createProfile('p', NOW);
    const { activities: _a, ...counters7 } = v8.questCounters;
    void _a;
    const v7 = JSON.parse(JSON.stringify({ ...v8, schemaVersion: 7, questCounters: counters7 }));
    const migrated = migrateV7toV8(v7);
    expect((migrated.questCounters as { activities: unknown }).activities).toEqual(activities());
    const r = parseProfile(v7);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.schemaVersion).toBe(8);
      expect(r.profile.questCounters.activities).toEqual(activities());
      expect({ ...r.profile, schemaVersion: 7, questCounters: counters7 }).toEqual(v7);
    }
  });
  it('invalid activity counters make the save invalid (unknown type, negative, fractional)', () => {
    const p = createProfile('p', NOW);
    for (const bad of [
      { ...activities(), dragon: 1 },
      { ...activities(), shrine: -1 },
      { ...activities(), nest: 0.5 },
    ]) {
      const r = parseProfile({ ...p, questCounters: { ...p.questCounters, activities: bad } });
      expect(r.ok).toBe(false);
    }
  });
});
