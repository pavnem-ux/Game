import { describe, expect, it } from 'vitest';
import {
  SAVE_SCHEMA_VERSION,
  migrations,
  parseProfile,
  parseProfileJson,
} from '../../src/persistence';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';

const NOW = '2026-11-02T10:00:00.000Z';
function played(): PlayerProfile {
  let p = createProfile('p-1', NOW);
  for (let i = 0; i < 3; i++)
    p = applyRunResult(
      p,
      {
        runId: `r${i}`,
        mapId: i + 1,
        characterClass: 'mage',
        outcome: 'victory',
        elapsed: 700,
        kills: 200,
        eliteKills: 4,
        bossKilled: true,
        runLevel: 10,
      },
      NOW,
    ).profile;
  return p;
}
const json = (p: unknown) => JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
const code = (raw: unknown) => {
  const r = parseProfile(raw);
  return r.ok ? 'ok' : r.error.code;
};

describe('saveSchema (Task 08 §1.4, step 4.1)', () => {
  it('v7 is current (Task 21 quests) and the migrations map upgrades v1 → … → v7', () => {
    expect(SAVE_SCHEMA_VERSION).toBe(7);
    expect(Object.keys(migrations)).toEqual(['1', '2', '3', '4', '5', '6']);
  });
  it('a valid profile round-trips through JSON unchanged', () => {
    const p = played();
    const r = parseProfileJson(JSON.stringify(p));
    expect(r.ok && r.profile).toEqual(p);
    expect(r.ok && r.migratedFrom).toBeNull();
  });
  it('missing fields get defaults; the profile is never reset because a field was added', () => {
    const p = json(played());
    delete p.stats;
    delete p.recentRuns;
    delete (p.classes as Record<string, unknown>).rogue;
    delete ((p.classes as Record<string, Record<string, unknown>>).mage as Record<string, unknown>)
      .talents;
    const r = parseProfile(p);
    if (!r.ok) throw r.error;
    expect(r.profile.classes.mage.level).toBe(played().classes.mage.level);
    expect(r.profile.classes.mage.talents).toEqual({});
    expect(r.profile.classes.rogue).toEqual({
      xp: 0,
      level: 1,
      lifetimeXp: 0,
      talents: {},
      // Task 11: a missing loadout defaults to the starter weapon and empty slots.
      loadout: {
        weapon: 'starter_daggers',
        helmet: null,
        gloves: null,
        pants: null,
        armor: null,
        amulet: null,
        ring: null,
      },
    });
    expect(r.profile.stats.runs).toBe(0);
    expect(r.profile.recentRuns).toEqual([]);
    expect(r.profile.gold).toBe(played().gold);
    expect(r.profile.highestUnlockedMap).toBe(4);
  });
  it('unknown fields are dropped (imported data is data only)', () => {
    const p = { ...json(played()), injected: '<script>', __proto__x: 1 };
    const r = parseProfile(p);
    expect(r.ok && 'injected' in r.profile).toBe(false);
  });
  it('rejects invalid values, inconsistent unlocks and bad structure', () => {
    const base = json(played());
    const cases: Record<string, unknown>[] = [
      { ...base, gold: -1 },
      { ...base, gold: 1.5 },
      { ...base, highestUnlockedMap: 41 },
      { ...base, highestUnlockedMap: 1 }, // completed maps 1–3 imply map 4 unlocked
      { ...base, selectedClass: 'bard' },
      { ...base, profileId: '' },
      { ...base, createdAt: 'yesterday' },
      {
        ...base,
        classes: { ...(base.classes as object), mage: { level: 51, xp: 0, lifetimeXp: 0 } },
      },
      {
        ...base,
        classes: { ...(base.classes as object), mage: { level: 2, xp: 150, lifetimeXp: 0 } },
      },
      { ...base, processedRunIds: ['a', 'a'] },
      { ...base, processedRunIds: Array.from({ length: 51 }, (_, i) => `r${i}`) },
      { ...base, recentRuns: [{ runId: 'x' }] },
      { ...base, bestResults: { '42': {} } },
      { ...base, completedMaps: 'all' },
      { ...base, schemaVersion: 0 },
      { ...base, schemaVersion: 'one' },
    ];
    for (const c of cases) expect(code(c), JSON.stringify(Object.keys(c))).toBe('invalid');
    expect(code(null)).toBe('not-an-object');
    expect(code([base])).toBe('not-an-object');
  });
  it('newer-version and malformed JSON are reported with distinct codes', () => {
    expect(code({ ...json(played()), schemaVersion: 8 })).toBe('newer-version');
    const bad = parseProfileJson('{"schemaVersion": 1,');
    expect(!bad.ok && bad.error.code).toBe('malformed-json');
  });
  it('migration stub: an older version is upgraded through the migrations map', () => {
    const v1 = { ...json(played()), schemaVersion: 1 };
    const r = parseProfile(v1, {
      targetVersion: 2,
      migrations: { 1: (d) => ({ ...d, gold: (d.gold as number) + 1 }) },
    });
    expect(r.ok && r.profile.schemaVersion).toBe(2);
    expect(r.ok && r.profile.gold).toBe(played().gold + 1);
    expect(r.ok && r.migratedFrom).toBe(1);
    const missing = parseProfile(v1, { targetVersion: 2, migrations: {} });
    expect(!missing.ok && missing.error.code).toBe('unsupported-version');
  });
  it('never mutates its input', () => {
    const raw = json(played());
    delete raw.stats;
    const copy = JSON.stringify(raw);
    parseProfile(raw);
    expect(JSON.stringify(raw)).toBe(copy);
  });
});
