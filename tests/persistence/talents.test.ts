import { NO_QUEST_COUNTERS } from '../../src/quests';
import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY,
  createProgressionService,
  createSaveStore,
  exportProfile,
  parseProfileJson,
  prepareImport,
} from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';
import {
  PROFILE_SCHEMA_VERSION,
  addClassXp,
  applyRunResult,
  createProfile,
} from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const NOW = '2026-11-02T12:00:00.000Z';
const open = (s: StorageLike) =>
  createProgressionService(
    createSaveStore({ storage: s, now: () => NOW, newProfileId: () => 'p' }),
  );
/** A profile with two levelled classes and a finished run (seeded through the normal APIs). */
function seeded(): PlayerProfile {
  const base = applyRunResult(
    createProfile('p', NOW),
    {
      runId: 'r1',
      mapId: 1,
      characterClass: 'rogue',
      outcome: 'victory',
      elapsed: 600,
      kills: 50,
      eliteKills: 4,
      bossKilled: true,
      runLevel: 8,
    },
    NOW,
  ).profile;
  const up = (cls: 'rogue' | 'mage', xp: number) => addClassXp(base.classes[cls], xp).progress;
  return {
    ...base,
    classes: { ...base.classes, rogue: up('rogue', 60_000), mage: up('mage', 5_000) },
  };
}
function withSeed(s: MemoryStorage) {
  const svc = open(s);
  expect(svc.replaceProfile(seeded()).ok).toBe(true);
  return svc;
}

describe('Task 09 §1.4 talent persistence (schema v2)', () => {
  it('purchases autosave and survive a reload; refused purchases change nothing', () => {
    const s = new MemoryStorage();
    let svc = withSeed(s);
    const rogueLevel = svc.getState().profile!.classes.rogue.level;
    expect(rogueLevel).toBeGreaterThanOrEqual(30);
    for (const id of ['rogue.b1.n01', 'rogue.b1.n01', 'rogue.b1.n02', 'rogue.b3.n01'])
      expect(svc.purchaseTalent('rogue', id)).toMatchObject({ ok: true, saved: true });
    const before = s.data.get(SAVE_KEY);
    expect(svc.purchaseTalent('rogue', 'rogue.b1.n04')).toMatchObject({
      ok: false,
      reason: 'prerequisite',
    });
    expect(svc.purchaseTalent('mage', 'mage.b3.n01')).toMatchObject({ ok: false, reason: 'level' });
    expect(s.data.get(SAVE_KEY)).toBe(before);
    svc = open(s); // "restart the browser"
    expect(svc.getState().profile!.classes.rogue.talents).toEqual({
      'rogue.b1.n01': 2,
      'rogue.b1.n02': 1,
      'rogue.b3.n01': 1,
    });
  });
  it('class switch keeps every tree; trees are independent per class', () => {
    const s = new MemoryStorage();
    const svc = withSeed(s);
    svc.purchaseTalent('rogue', 'rogue.b2.n01');
    svc.purchaseTalent('mage', 'mage.b1.n01');
    svc.selectClass('mage');
    svc.selectClass('warrior');
    svc.selectClass('rogue');
    const p = open(s).getState().profile!;
    expect(p.classes.rogue.talents).toEqual({ 'rogue.b2.n01': 1 });
    expect(p.classes.mage.talents).toEqual({ 'mage.b1.n01': 1 });
    expect(p.classes.warrior.talents).toEqual({});
  });
  it('export → import keeps talents', () => {
    const s = new MemoryStorage();
    const svc = withSeed(s);
    svc.purchaseTalent('rogue', 'rogue.b1.n01');
    svc.purchaseTalent('rogue', 'rogue.b1.n01');
    const out = exportProfile(svc.getState().profile!, NOW);
    expect(out.ok).toBe(true);
    const parsed = prepareImport(out.ok ? out.json : '');
    expect(parsed.ok && parsed.profile.classes.rogue.talents).toEqual({ 'rogue.b1.n01': 2 });
    const other = open(new MemoryStorage());
    expect(other.replaceProfile(parsed.ok ? parsed.profile : seeded()).ok).toBe(true);
    expect(other.getState().profile!.classes.rogue.talents).toEqual({ 'rogue.b1.n01': 2 });
  });
  it('an old v1 profile migrates without loss (talents empty, talentsSpent dropped)', () => {
    // Task 19: v1 had no ore (v5 field); the migrated profile gets the defaults. Task 40: the
    // v10 item fields are the fresh defaults too (equipment resets in v9 → v10).
    const v2 = {
      ...seeded(),
      ore: 0,
      questCounters: NO_QUEST_COUNTERS,
      questsClaimed: [],
    };
    const v1 = JSON.parse(JSON.stringify(v2));
    delete v1.ore;
    delete v1.questCounters;
    delete v1.questsClaimed;
    v1.schemaVersion = 1;
    for (const c of Object.keys(v1.classes)) {
      delete v1.classes[c].talents;
      v1.classes[c].talentsSpent = 0;
    }
    const r = parseProfileJson(JSON.stringify(v1));
    expect(r.ok && r.migratedFrom).toBe(1);
    if (!r.ok) throw r.error;
    expect(r.profile).toEqual({ ...v2, schemaVersion: PROFILE_SCHEMA_VERSION });
    for (const c of Object.values(r.profile.classes)) {
      expect(c.talents).toEqual({});
      expect('talentsSpent' in c).toBe(false);
    }
    // Through the store: a v1 save on disk loads as v2 with gold/XP/maps/runs intact.
    const s = new MemoryStorage();
    s.data.set(SAVE_KEY, JSON.stringify(v1));
    const loaded = open(s).getState().profile!;
    expect(loaded.gold).toBe(v2.gold);
    expect(loaded.classes.rogue).toEqual({ ...v2.classes.rogue, talents: {} });
    expect(loaded.completedMaps).toEqual(v2.completedMaps);
    expect(loaded.recentRuns).toEqual(v2.recentRuns);
  });
  it('invalid talent data can never overwrite a valid save', () => {
    const s = new MemoryStorage();
    const svc = withSeed(s);
    svc.purchaseTalent('rogue', 'rogue.b1.n01');
    const valid = s.data.get(SAVE_KEY);
    const good = svc.getState().profile!;
    const bad = (talents: Record<string, unknown>, cls: 'rogue' | 'mage' = 'rogue') =>
      ({
        ...good,
        classes: { ...good.classes, [cls]: { ...good.classes[cls], talents } },
      }) as unknown as PlayerProfile;
    const cases = [
      bad({ 'rogue.b1.n01': 4 }), // rank above III
      bad({ 'rogue.b1.n02': 1 }), // prerequisite missing
      bad({ 'nope.b1.n01': 1 }), // unknown node
      bad({ 'mage.b3.n01': 1 }, 'mage'), // superpower branch below level 30
      // More points spent than earned (12 ranks; the seeded mage is level 12 on the Task 40 curve).
      bad({ 'mage.b1.n01': 3, 'mage.b1.n02': 3, 'mage.b1.n03': 3, 'mage.b2.n01': 3 }, 'mage'),
    ];
    expect(good.classes.mage.level).toBeLessThan(24);
    for (const profile of cases) {
      const r = svc.replaceProfile(profile);
      expect(r.ok).toBe(false);
      expect(s.data.get(SAVE_KEY)).toBe(valid);
      expect(svc.getState().profile).toEqual(good);
      // The same data as an import file is rejected before anything is replaced.
      const imported = prepareImport(JSON.stringify(profile));
      expect(!imported.ok && imported.error.code).toBe('invalid');
    }
  });
  it('a failed write keeps the purchase in memory as unsaved (like run results)', () => {
    const s = new MemoryStorage();
    const svc = withSeed(s);
    s.fail = true;
    expect(svc.purchaseTalent('rogue', 'rogue.b1.n01')).toMatchObject({
      ok: true,
      saved: false,
      failure: 'quota',
    });
    expect(svc.getState().profile!.classes.rogue.talents).toEqual({ 'rogue.b1.n01': 1 });
    expect(svc.getState().status.state).toBe('unsaved');
  });
});
