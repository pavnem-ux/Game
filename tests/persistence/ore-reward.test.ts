import { describe, expect, it } from 'vitest';
import { ORE_RULES, runOre } from '../../src/equipment';
import { applyRunResult, createProfile } from '../../src/profile';
import type { PlayerProfile, RunResult } from '../../src/profile';
import { createProgressionService, createSaveStore, parseProfile } from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';

class MemoryStorage implements StorageLike {
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
const NOW = '2026-11-12T12:00:00.000Z';
const result = (over: Partial<RunResult>): RunResult => ({
  runId: 'ore-1',
  mapId: 1,
  characterClass: 'warrior',
  outcome: 'victory',
  elapsed: 600,
  kills: 300,
  eliteKills: 4,
  bossKilled: true,
  runLevel: 8,
  coins: 0,
  ...over,
});
const allMapsOpen = (): PlayerProfile => ({
  ...createProfile('p', NOW),
  highestUnlockedMap: 40,
});

describe('Task 19 §1.2 — ore rewards', () => {
  it('victory: 2 + floor(map / 4) (maps 1, 4, 40 → 2, 3, 12); ×3 on the first victory', () => {
    expect(ORE_RULES).toEqual({ base: 2, perMaps: 4, firstVictoryMultiplier: 3 });
    expect([1, 3, 4, 7, 8, 39, 40].map((m) => runOre('victory', m, false))).toEqual([
      2, 2, 3, 3, 4, 11, 12,
    ]);
    expect([1, 4, 40].map((m) => runOre('victory', m, true))).toEqual([6, 9, 36]);
    for (const first of [true, false]) {
      expect(runOre('defeat', 40, first)).toBe(0);
      expect(runOre('abandoned', 40, first)).toBe(0);
    }
  });
  it('applied in the run snapshot: ×3 only on the first victory of a map; none on defeat/abandon', () => {
    let p = allMapsOpen();
    const apply = (over: Partial<RunResult>) => {
      const out = applyRunResult(p, result(over), NOW);
      p = out.profile;
      return out.summary;
    };
    expect(apply({ runId: 'd', mapId: 4, outcome: 'defeat', bossKilled: false }).oreGained).toBe(0);
    expect(apply({ runId: 'a', mapId: 4, outcome: 'abandoned', bossKilled: false }).oreGained).toBe(
      0,
    );
    expect(p.ore).toBe(0);
    expect(apply({ runId: 'w1', mapId: 4 }).oreGained).toBe(9); // first victory ×3
    expect(apply({ runId: 'w2', mapId: 4 }).oreGained).toBe(3);
    expect(apply({ runId: 'w3', mapId: 40 }).oreGained).toBe(36);
    expect(apply({ runId: 'w4', mapId: 40 }).oreGained).toBe(12);
    expect(apply({ runId: 'w5', mapId: 1 }).oreGained).toBe(6);
    expect(p.ore).toBe(9 + 3 + 36 + 12 + 6);
    expect(p.recentRuns[0]).toMatchObject({ runId: 'w5', ore: 6 });
    // A defeat after a victory on the map still pays nothing.
    expect(apply({ runId: 'd2', mapId: 1, outcome: 'defeat', bossKilled: false }).oreGained).toBe(
      0,
    );
  });
  it('no duplicates after repeated result events or a reload; the saved profile carries ore', () => {
    const storage = new MemoryStorage();
    const open = () =>
      createProgressionService(
        createSaveStore({ storage, now: () => NOW, newProfileId: () => 'p' }),
      );
    const svc = open();
    expect(svc.commitRun(result({}), NOW).summary).toMatchObject({
      oreGained: 6,
      duplicate: false,
    });
    const again = svc.commitRun(result({}), NOW).summary;
    expect(again).toMatchObject({ duplicate: true, oreGained: 6 }); // the original summary
    expect(svc.getState().profile!.ore).toBe(6);
    const reloaded = open();
    expect(reloaded.getState().profile!.ore).toBe(6);
    expect(reloaded.commitRun(result({}), NOW).summary.duplicate).toBe(true);
    expect(reloaded.getState().profile!.ore).toBe(6);
    // A second (different) victory on the now-cleared map 1 pays the normal amount.
    reloaded.commitRun(result({ runId: 'ore-2' }), NOW);
    expect(reloaded.getState().profile!.ore).toBe(8);
  });
  it('save validation: ore is a whole number ≥ 0 (missing → 0)', () => {
    const base = JSON.parse(JSON.stringify(createProfile('p', NOW)));
    delete base.ore;
    const parsed = parseProfile(base);
    expect(parsed.ok && parsed.profile.ore).toBe(0);
    for (const bad of [-1, 1.5, '3', null])
      expect(parseProfile({ ...base, ore: bad }).ok).toBe(false);
    const ok = parseProfile({ ...base, ore: 42 });
    expect(ok.ok && ok.profile.ore).toBe(42);
  });
});
