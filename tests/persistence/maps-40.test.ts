import { describe, expect, it } from 'vitest';
import { getCampaignMap } from '../../src/campaign';
import { migrateV2toV3, parseProfileJson, SAVE_SCHEMA_VERSION } from '../../src/persistence';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';
import { NO_QUEST_COUNTERS } from '../../src/quests';

const NOW = '2026-11-10T12:00:00.000Z';
function winUpTo(last: number): PlayerProfile {
  let p = createProfile('t10-save', NOW);
  for (let id = 1; id <= last; id++)
    p = applyRunResult(
      p,
      {
        runId: `win-${id}`,
        mapId: id,
        characterClass: id % 2 ? 'warrior' : 'mage',
        outcome: 'victory',
        elapsed: getCampaignMap(id).durationSeconds,
        kills: 100 + id,
        eliteKills: 2,
        bossKilled: true,
        runLevel: 10,
      },
      NOW,
    ).profile;
  return p;
}
/** Task 19: v5-only fields never exist in an older save (ore, item levels, run ore). */
function stripV5(data: Record<string, unknown> & { recentRuns?: Record<string, unknown>[] }) {
  delete data.ore;
  delete data.itemLevels;
  for (const run of data.recentRuns ?? []) delete run.ore;
  // Task 21: quest counters / claims did not exist either (v7 starts them at 0).
  delete data.questCounters;
  delete data.questsClaimed;
  return data;
}
/** A save as Task 08–09 wrote it (schema v2, 10 maps): map 10 completed was the end. */
function oldV2(last: number) {
  const data = stripV5(JSON.parse(JSON.stringify(winUpTo(last))));
  data.schemaVersion = 2;
  if (last === 10) data.highestUnlockedMap = 10; // there was no map 11 before Task 10
  return data;
}

describe('Task 10 Phase 4.1 — saves with 40 maps', () => {
  it('an old v2 save loads with no data loss (only the version changes; Task 11 gear defaults)', () => {
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(3);
    const v2 = oldV2(4);
    const r = parseProfileJson(JSON.stringify(v2));
    if (!r.ok) throw r.error;
    expect(r.migratedFrom).toBe(2);
    expect(r.profile).toEqual({
      ...v2,
      ore: 0,
      // Task 40: v9 → v10 drops the old `ownedItems` / `itemLevels` (equipment reset).
      questCounters: NO_QUEST_COUNTERS,
      questsClaimed: [],
      schemaVersion: SAVE_SCHEMA_VERSION,
    });
  });
  it('an old v2 save that completed map 10 gets map 11 unlocked; everything else is kept', () => {
    const v2 = oldV2(10);
    const r = parseProfileJson(JSON.stringify(v2));
    if (!r.ok) throw r.error;
    expect(r.profile.highestUnlockedMap).toBe(11);
    expect(r.profile).toEqual({
      ...v2,
      ore: 0,
      // Task 40: v9 → v10 drops the old `ownedItems` / `itemLevels` (equipment reset).
      questCounters: NO_QUEST_COUNTERS,
      questsClaimed: [],
      schemaVersion: SAVE_SCHEMA_VERSION,
      highestUnlockedMap: 11,
    });
    // Without the migration that v2 save would be inconsistent under 40 maps (map 10 → 11).
    expect(parseProfileJson(JSON.stringify({ ...v2, schemaVersion: 3 })).ok).toBe(false);
    // The migration is a no-op for every other shape.
    expect(migrateV2toV3({ completedMaps: [1, 2], highestUnlockedMap: 3 })).toEqual({
      completedMaps: [1, 2],
      highestUnlockedMap: 3,
    });
  });
  it('maps 11–40 persist: unlocks, completed maps and best results round-trip', () => {
    const p = winUpTo(40);
    expect(p.highestUnlockedMap).toBe(40);
    expect(p.completedMaps).toHaveLength(40);
    expect(Object.keys(p.bestResults)).toHaveLength(40);
    const r = parseProfileJson(JSON.stringify(p));
    if (!r.ok) throw r.error;
    expect(r.profile).toEqual(p);
    const mid = winUpTo(23);
    const back = parseProfileJson(JSON.stringify(mid));
    expect(back.ok && back.profile.highestUnlockedMap).toBe(24);
    expect(back.ok && back.profile.bestResults['23'].victories).toBe(1);
  });
  it('maps above 40 are still rejected', () => {
    const p = JSON.parse(JSON.stringify(winUpTo(2)));
    expect(parseProfileJson(JSON.stringify({ ...p, highestUnlockedMap: 41 })).ok).toBe(false);
    expect(parseProfileJson(JSON.stringify({ ...p, completedMaps: [1, 41] })).ok).toBe(false);
  });
});
