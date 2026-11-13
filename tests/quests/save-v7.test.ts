import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  SAVE_KEY,
  createSaveStore,
  exportProfile,
  migrateV6toV7,
  parseProfileJson,
  prepareImport,
} from '../../src/persistence';
import { createProfile, applyRunResult } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';
import { NO_QUEST_COUNTERS, claimQuest, claimableQuests } from '../../src/quests';
import { buildBugReport } from '../../src/gameplay-ui/bug-report';
import { getCampaignMap } from '../../src/campaign';

const NOW = '2026-11-13T12:00:00.000Z';
class Memory {
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
/** A Task 20 (v6) save: maps 1–12 won, mage level 30, 1 240 kills, some gear/pets; no quests. */
function v6Save() {
  let p: PlayerProfile = createProfile('old', NOW);
  for (let m = 1; m <= 12; m++)
    p = applyRunResult(
      p,
      {
        runId: `w${m}`,
        mapId: m,
        characterClass: 'archer',
        outcome: 'victory',
        elapsed: getCampaignMap(m).durationSeconds,
        kills: m === 12 ? 1240 - 11 * 100 : 100,
        eliteKills: 3,
        bossKilled: true,
        runLevel: 10,
      },
      NOW,
    ).profile;
  const data = JSON.parse(JSON.stringify(p));
  data.schemaVersion = 6;
  delete data.questCounters;
  delete data.questsClaimed;
  // Mage level 30 (start of the level, no talents spent).
  const xpTo30 = Array.from({ length: 29 }, (_, i) => 100 + 50 * i).reduce((a, b) => a + b, 0);
  data.classes.mage = { ...data.classes.mage, level: 30, xp: 0, lifetimeXp: xpTo30 };
  data.ownedPets = ['owlet'];
  data.activePet = 'owlet';
  return data;
}

describe('Task 21 Phase 2 — save v7 with retroactive completion', () => {
  it('map 12 won + a level-30 class → exactly the matching quests are claimable; nothing else changes', () => {
    const v6 = v6Save();
    const r = parseProfileJson(JSON.stringify(v6));
    if (!r.ok) throw r.error;
    expect(r.migratedFrom).toBe(6);
    expect(r.profile.questsClaimed).toEqual([]);
    // Per-type kill / chest / boss counters start at 0 (only total kills existed).
    expect(r.profile.questCounters).toEqual(NO_QUEST_COUNTERS);
    expect([...claimableQuests(r.profile)].sort()).toEqual(
      [
        'campaign.map5',
        'campaign.map10',
        'hunt.1000',
        'mastery.archer.10',
        'mastery.mage.10',
        'mastery.mage.20',
        'mastery.mage.30',
      ].sort(),
    );
    // Archer level from 12 victories: check it is below 20 (so only its level-10 quest).
    expect(r.profile.classes.archer.level).toBeGreaterThanOrEqual(10);
    expect(r.profile.classes.archer.level).toBeLessThan(20);
    // Everything else is the old data.
    const { schemaVersion: _a, questCounters: _b, questsClaimed: _c, ...rest } = r.profile;
    const { schemaVersion: _d, ...old } = v6;
    expect(rest).toEqual(old);
  });
  it('the migration reads the best worn tier-4+ loadout; only adds the two fields', () => {
    const v6 = v6Save();
    v6.ownedItems = ['plate-t4', 'guard_helm-t5'];
    v6.classes.rogue.loadout = {
      ...v6.classes.rogue.loadout,
      armor: 'plate-t4',
      helmet: 'guard_helm-t5',
    };
    const m = migrateV6toV7(v6);
    expect(Object.keys(m).sort()).toEqual(
      [...Object.keys(v6), 'questCounters', 'questsClaimed'].sort(),
    );
    expect((m.questCounters as { bestTierLoadout: number }).bestTierLoadout).toBe(2);
  });
  it('validation: known unique claimed quests that are complete; counters ≥ 0 and known', () => {
    const r = parseProfileJson(JSON.stringify(v6Save()));
    if (!r.ok) throw r.error;
    const ok = JSON.parse(JSON.stringify(claimQuest(r.profile, 'campaign.map10')));
    expect(parseProfileJson(JSON.stringify(ok)).ok).toBe(true);
    const bad: [string, object][] = [
      ['unknown quest', { questsClaimed: ['nope'] }],
      ['duplicate claim', { questsClaimed: ['campaign.map10', 'campaign.map10'] }],
      ['incomplete claim', { questsClaimed: ['campaign.map40'] }],
      ['negative counter', { questCounters: { ...ok.questCounters, chestsOpened: -1 } }],
      ['unknown synergy', { questCounters: { ...ok.questCounters, synergiesOpened: ['x'] } }],
      ['unknown boss map', { questCounters: { ...ok.questCounters, bossesDefeated: [41] } }],
      [
        'awakened not opened',
        { questCounters: { ...ok.questCounters, synergiesAwakened: ['thermal_shock'] } },
      ],
    ];
    for (const [label, patch] of bad)
      expect(parseProfileJson(JSON.stringify({ ...ok, ...patch })).ok, label).toBe(false);
  });
  it('store reload, backup, export → import and bug reports include quests; invalid import never overwrites', () => {
    const r = parseProfileJson(JSON.stringify(v6Save()));
    if (!r.ok) throw r.error;
    const p = claimQuest(
      { ...r.profile, questCounters: { ...NO_QUEST_COUNTERS, chestsOpened: 30 } },
      'chests.25',
    );
    const storage = new Memory();
    const store = createSaveStore({ storage, now: () => NOW });
    expect(store.save(p).ok).toBe(true);
    expect(store.save(p).ok).toBe(true);
    const loaded = createSaveStore({ storage, now: () => NOW }).load();
    expect(loaded.status === 'loaded' && loaded.profile.questsClaimed).toEqual(['chests.25']);
    expect(JSON.parse(storage.getItem(BACKUP_KEY)!).questCounters.chestsOpened).toBe(30);
    const exported = exportProfile(p, NOW);
    if (!exported.ok) throw exported.error;
    const imported = prepareImport(exported.json);
    expect(imported.ok && imported.profile.questsClaimed).toEqual(['chests.25']);
    const report = buildBugReport({
      createdAt: NOW,
      build: { version: '0', commit: 'abc1234', label: 'x' },
      userAgent: 'T',
      world: null,
      screen: 'menu',
      profile: p,
      errors: [],
    });
    expect(report.save).toMatchObject({ ok: true, profile: { questsClaimed: ['chests.25'] } });
    const before = storage.getItem(SAVE_KEY);
    expect(
      prepareImport(
        JSON.stringify({ ...JSON.parse(exported.json), questsClaimed: ['hunt.100000'] }),
      ).ok,
    ).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(before);
  });
});
