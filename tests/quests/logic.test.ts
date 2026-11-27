import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  NO_QUEST_COUNTERS,
  QUESTS,
  QUEST_BY_ID,
  QUEST_GROUPS,
  QuestError,
  addRunToCounters,
  allQuestProgress,
  claimQuest,
  claimableQuests,
  questPayout,
  questProgress,
  validateQuestConfig,
  validateRunQuestSummary,
  withLoadoutCounter,
} from '../../src/quests';
import type { QuestCounters } from '../../src/quests';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile, RunResult } from '../../src/profile';
import { createProgressionService, createSaveStore } from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';

const NOW = '2026-11-13T12:00:00.000Z';
const base = (over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createProfile('q', NOW),
  ...over,
});
const counters = (over: Partial<QuestCounters>): QuestCounters => ({
  ...NO_QUEST_COUNTERS,
  ...over,
});
const state = (p: PlayerProfile, id: string) => questProgress(p, QUEST_BY_ID.get(id)!).state;
const run = (over: Partial<RunResult>): RunResult => ({
  runId: 'r1',
  mapId: 1,
  characterClass: 'warrior',
  outcome: 'victory',
  elapsed: 600,
  kills: 300,
  eliteKills: 4,
  bossKilled: true,
  runLevel: 8,
  quest: {
    killsByType: { swift: 20, brute: 10, bombard: 5 },
    chestsOpened: 3,
    synergiesOpened: ['thermal_shock'],
    synergiesAwakened: [],
  },
  ...over,
});

describe('Task 21 §1.2 — catalogue', () => {
  it('58 quests in 9 groups (8/5/4/4/20/3/3/3 + Task 24 activities 8); valid config', () => {
    expect(QUESTS).toHaveLength(58);
    const per = QUEST_GROUPS.map((g) => QUESTS.filter((q) => q.group === g).length);
    expect(per).toEqual([8, 5, 4, 4, 20, 3, 3, 3, 8]);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(58);
    expect(() => validateQuestConfig()).not.toThrow();
    expect(() => validateQuestConfig(QUESTS.slice(1))).toThrow();
  });
  it('rewards match the spec table', () => {
    const r = (id: string) => QUEST_BY_ID.get(id)!.reward;
    expect(
      [5, 10, 15, 20, 25, 30, 35, 40].map((m) => [
        r(`campaign.map${m}`).gold,
        r(`campaign.map${m}`).ore,
      ]),
    ).toEqual([
      // Task 40: quest Gold ×0.8 (300 → 240 …).
      [240, 10],
      [480, 20],
      [720, 30],
      [960, 40],
      [1200, 50],
      [1440, 60],
      [1680, 70],
      [2000, 100],
    ]);
    expect(r('campaign.map10').pet).toBe('firefly');
    // Task 40: the old Rare ring of map 20 no longer exists — Gold and Ore only.
    expect(r('campaign.map20')).toEqual({ gold: 960, ore: 40 });
    expect(r('campaign.map40').pet).toBe('wolf');
    expect(r('hunt.100000')).toEqual({ gold: 3200, ore: 100 });
    expect(r('types.elite')).toEqual({ gold: 320, ore: 15, pet: 'owlet' });
    expect([5, 15, 30, 40].map((n) => r(`bosses.${n}`).gold)).toEqual([800, 1600, 2400, 4000]);
    expect(r('mastery.rogue.50')).toEqual({ gold: 2000 });
    expect(r('synergy.awaken6')).toEqual({ pet: 'fox' });
    expect(r('chests.300')).toEqual({ gold: 1600 });
    expect([r('forge.plus5'), r('forge.plus10'), r('forge.tier4')]).toEqual([
      { ore: 20 },
      { ore: 60 },
      { gold: 2400 },
    ]);
  });
});

describe('Task 21 §1.2 — completion condition of each group', () => {
  it('campaign: map won', () => {
    expect(state(base(), 'campaign.map5')).toBe('in-progress');
    expect(
      state(base({ completedMaps: [1, 2, 3, 4, 5], highestUnlockedMap: 6 }), 'campaign.map5'),
    ).toBe('complete');
  });
  it('hunt: lifetime kills (stats.enemiesKilled)', () => {
    const p = base({ stats: { ...base().stats, enemiesKilled: 4999 } });
    expect(state(p, 'hunt.1000')).toBe('complete');
    expect(questProgress(p, QUEST_BY_ID.get('hunt.5000')!)).toMatchObject({
      current: 4999,
      target: 5000,
      state: 'in-progress',
    });
  });
  it('enemy types and elites; bosses (distinct maps)', () => {
    const p = base({
      questCounters: counters({
        killsByType: { swift: 500, brute: 299, bombard: 300 },
        eliteKills: 100,
        bossesDefeated: [1, 2, 3, 4, 5],
      }),
    });
    expect(
      ['types.swift', 'types.brute', 'types.bombard', 'types.elite'].map((id) => state(p, id)),
    ).toEqual(['complete', 'in-progress', 'complete', 'complete']);
    expect(state(p, 'bosses.5')).toBe('complete');
    expect(state(p, 'bosses.15')).toBe('in-progress');
  });
  it('mastery: each class level; synergies; chests', () => {
    const p = base();
    const lv = { ...p, classes: { ...p.classes, mage: { ...p.classes.mage, level: 30 } } };
    expect(
      ['mastery.mage.10', 'mastery.mage.30', 'mastery.mage.40', 'mastery.warrior.10'].map((id) =>
        state(lv, id),
      ),
    ).toEqual(['complete', 'complete', 'in-progress', 'in-progress']);
    const s = base({
      questCounters: counters({
        synergiesOpened: ['thermal_shock'],
        synergiesAwakened: [],
        chestsOpened: 100,
      }),
    });
    expect(state(s, 'synergy.open')).toBe('complete');
    expect(state(s, 'synergy.awaken')).toBe('in-progress');
    expect(state(s, 'chests.100')).toBe('complete');
    expect(state(s, 'chests.300')).toBe('in-progress');
  });
  // Task 42: `forge.tier4` is back as «Equip 7 items of Epic or better on one class»; its counter
  // is the best number of Epic+ items one class wears (it only grows).
  it('forge.tier4: visible again; the counter counts Epic+ items on one class', () => {
    expect(QUESTS.some((q) => q.hidden)).toBe(false);
    const epic = (uid: string, rarity = 'epic') => ({ uid, rarity });
    const items = [epic('i1'), epic('i2', 'legendary'), epic('i3', 'rare'), epic('i4')];
    const p0 = base({});
    const loadout = {
      ...p0.classes.mage.loadout,
      ring: 'i1',
      amulet: 'i2',
      armor: 'i3',
      helmet: 'i4',
    };
    const p = { ...p0, items, classes: { ...p0.classes, mage: { ...p0.classes.mage, loadout } } };
    const counted = withLoadoutCounter(p);
    expect(counted.questCounters.bestTierLoadout).toBe(3);
    expect(withLoadoutCounter(counted)).toBe(counted); // nothing grew → same profile
    const seven = base({ questCounters: counters({ bestTierLoadout: 7 }) });
    expect(claimableQuests(seven)).toContain('forge.tier4');
    expect(allQuestProgress(seven).find((q) => q.quest.id === 'forge.tier4')!.state).toBe(
      'complete',
    );
  });
});

describe('Task 21 §1.3 — counters from finalized runs (once)', () => {
  it('adds kills by type, elites, distinct bosses, chests, synergies; abandoned adds nothing', () => {
    let c = addRunToCounters(NO_QUEST_COUNTERS, run({}));
    expect(c).toMatchObject({
      killsByType: { swift: 20, brute: 10, bombard: 5 },
      eliteKills: 4,
      bossesDefeated: [1],
      chestsOpened: 3,
      synergiesOpened: ['thermal_shock'],
    });
    c = addRunToCounters(c, run({ runId: 'r2' })); // same boss again: still one
    expect(c.bossesDefeated).toEqual([1]);
    expect(c.eliteKills).toBe(8);
    expect(addRunToCounters(c, run({ outcome: 'abandoned', bossKilled: false }))).toBe(c);
    const lost = addRunToCounters(c, run({ outcome: 'defeat', bossKilled: false, mapId: 2 }));
    expect(lost.bossesDefeated).toEqual([1]);
    expect(lost.killsByType.swift).toBe(60);
  });
  it('validates the run summary (unknown synergy, negative counts, awakened ⊄ opened)', () => {
    const ok = run({}).quest!;
    expect(validateRunQuestSummary(ok)).toEqual(ok);
    for (const bad of [
      { ...ok, synergiesOpened: ['nope'] },
      { ...ok, chestsOpened: -1 },
      { ...ok, killsByType: { ...ok.killsByType, swift: 1.5 } },
      { ...ok, synergiesAwakened: ['thermal_shock'], synergiesOpened: [] },
    ])
      expect(() => validateRunQuestSummary(bad)).toThrow();
    expect(() =>
      applyRunResult(base(), run({ quest: { ...ok, chestsOpened: -1 } }), NOW),
    ).toThrow();
  });
  it('a reload or a repeated result event never counts a run twice', () => {
    class Memory implements StorageLike {
      readonly data = new Map<string, string>();
      getItem(k: string) {
        return this.data.get(k) ?? null;
      }
      setItem(k: string, v: string) {
        this.data.set(k, v);
      }
      removeItem(k: string) {
        this.data.delete(k);
      }
    }
    const storage = new Memory();
    const open = () =>
      createProgressionService(
        createSaveStore({ storage, now: () => NOW, newProfileId: () => 'p' }),
      );
    const svc = open();
    svc.commitRun(run({}), NOW);
    svc.commitRun(run({}), NOW);
    expect(svc.getState().profile!.questCounters.chestsOpened).toBe(3);
    const again = open();
    again.commitRun(run({}), NOW);
    expect(again.getState().profile!.questCounters).toMatchObject({
      chestsOpened: 3,
      eliteKills: 4,
    });
  });
});

describe('Task 21 §1.1 — claim', () => {
  const won = () => {
    let p = base();
    for (let m = 1; m <= 10; m++)
      p = applyRunResult(p, run({ runId: `w${m}`, mapId: m, quest: undefined }), NOW).profile;
    return p;
  };
  it('claims once: Gold, ore and pet in one change; then «claimed»', () => {
    const p = won();
    expect(claimableQuests(p)).toEqual(expect.arrayContaining(['campaign.map5', 'campaign.map10']));
    const after = claimQuest(p, 'campaign.map10');
    expect(after.gold - p.gold).toBe(480); // Task 40: 600 × 0.8
    expect(after.ore - p.ore).toBe(20);
    expect(after.ownedPets).toContain('firefly');
    expect(after.questsClaimed).toEqual(['campaign.map10']);
    expect(state(after, 'campaign.map10')).toBe('claimed');
    expect(() => claimQuest(after, 'campaign.map10')).toThrow(QuestError);
    expect(() => claimQuest(after, 'campaign.map10')).toThrow(/claimed/);
  });
  it('an incomplete or unknown quest cannot be claimed (profile unchanged)', () => {
    const p = won();
    expect(() => claimQuest(p, 'campaign.map15')).toThrow(/incomplete/);
    expect(() => claimQuest(p, 'nope')).toThrow(/unknown/);
  });
  // Task 40: no item rewards any more; the pet fallbacks are unchanged (pet prices unchanged).
  it('owned pet rewards become Gold: shop pet → price; quest pet → 2000', () => {
    const q = (id: string) => QUEST_BY_ID.get(id)!;
    expect(questPayout({ ownedPets: [] }, q('campaign.map20'))).toEqual({
      gold: 960,
      ore: 40,
      pet: null,
      fallbackGold: 0,
    });
    expect(questPayout({ ownedPets: ['firefly'] }, q('campaign.map10'))).toMatchObject({
      gold: 480 + 2000,
      pet: null,
    });
    expect(questPayout({ ownedPets: ['owlet'] }, q('types.elite'))).toMatchObject({
      gold: 320 + 1500,
      pet: null,
    });
    expect(questPayout({ ownedPets: [] }, q('synergy.awaken6'))).toMatchObject({
      gold: 0,
      pet: 'fox',
    });
    const p = { ...won(), ownedPets: ['firefly'] };
    const after = claimQuest(p, 'campaign.map10');
    expect(after.ownedPets).toEqual(['firefly']);
    expect(after.gold - p.gold).toBe(2480);
  });
  it('progress list covers every visible quest (Task 40: the 3 Forge quests are hidden)', () => {
    expect(allQuestProgress(base()).map((x) => x.quest.id)).toEqual(
      QUESTS.filter((x) => !x.hidden).map((x) => x.id),
    );
  });
});

// Store: claim in one validated save; a failed write keeps the old profile.
class FailingStorage {
  readonly data = new Map<string, string>();
  writes = 0;
  failWrites = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    this.writes++;
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const storage = new FailingStorage();
let campaign: typeof import('../../src/gameplay-ui/campaign-state');
let debug: typeof import('../../src/gameplay-ui/campaign-debug');
beforeAll(async () => {
  vi.stubGlobal('localStorage', storage);
  campaign = await import('../../src/gameplay-ui/campaign-state');
  debug = await import('../../src/gameplay-ui/campaign-debug');
});
const profile = () => campaign.campaignStore.getSnapshot().progression.profile!;
describe('Task 21 — store claim and debug tools', () => {
  it('claim: refused while incomplete; one save when complete; failed write changes nothing', () => {
    const store = campaign.campaignStore;
    expect(profile().questsClaimed).toEqual([]);
    expect(store.claimQuest('hunt.1000')).toBe('incomplete');
    expect(debug.campaignDebug.completeQuest('hunt.1000')).toBe(true);
    const writes = storage.writes;
    expect(store.claimQuest('hunt.1000')).toBeNull();
    expect(storage.writes).toBe(writes + 2); // document + backup
    expect(profile()).toMatchObject({ gold: 160, ore: 5, questsClaimed: ['hunt.1000'] }); // 200 × 0.8
    expect(store.claimQuest('hunt.1000')).toBe('claimed');
    expect(debug.campaignDebug.completeQuest('chests.25')).toBe(true);
    storage.failWrites = true;
    const before = profile();
    expect(store.claimQuest('chests.25')).not.toBeNull();
    expect(profile()).toEqual(before);
    storage.failWrites = false;
  });
  it('debug completes every quest through valid saves; counters; reset', () => {
    for (const q of QUESTS) expect(debug.campaignDebug.completeQuest(q.id), q.id).toBe(true);
    // Task 42: no hidden quests any more (forge.tier4 is back).
    expect(claimableQuests(profile()).length + profile().questsClaimed.length).toBe(58);
    expect(debug.campaignDebug.addQuestCounter('swift', 7)).toBe(true);
    expect(debug.campaignDebug.addQuestCounter('swift', -1)).toBe(false);
    expect(debug.campaignDebug.resetQuests()).toBe(true);
    expect(profile().questsClaimed).toEqual([]);
    expect(profile().questCounters.killsByType.swift).toBe(0);
  });
});
