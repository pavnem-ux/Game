import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MAPS } from '../../src/campaign';
import type { CharacterClass } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import {
  createProgressionService,
  createSaveStore,
  exportProfile,
  prepareImport,
} from '../../src/persistence';
import type { ProgressionService, StorageLike } from '../../src/persistence';
import { isMapUnlocked } from '../../src/profile';
import { runResultFrom } from '../../src/gameplay-ui/campaign-state';
import { resolveOffers } from '../skills/helpers';

/**
 * Task 08 §6.3 manual test path at logic level, without any debug tool: every run is the normal
 * simulation (no forced outcomes, boss HP cuts or skipped time). Regular waves are off to keep
 * the suite fast; scheduled elites, the boss and all boss abilities still run. The player is
 * protected and idle (no input), standing in for a human dodging. A full-wave Map 10 run is
 * recorded in docs/task-08-progress.md (Verification log).
 */
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
const open = (storage: StorageLike) =>
  createProgressionService(
    createSaveStore({
      storage,
      now: () => '2026-11-02T12:00:00.000Z',
      newProfileId: () => 'walkthrough',
    }),
  );

let runs = 0;
function play(service: ProgressionService, mapId: number, cls: CharacterClass) {
  const profile = service.getState().profile!;
  expect(isMapUnlocked(profile, mapId)).toBe(true);
  service.selectClass(cls);
  const w = new GameplayWorld({
    characterClass: cls,
    level: profile.classes[cls].level,
    seed: 100 + mapId,
    spawning: { enabled: false },
    campaign: { mapId, runId: `walk-${++runs}` },
  });
  w.setTestProtection(true);
  while (w.getSnapshot().campaign!.status === 'active' && w.time < 2000) {
    w.update(0.5);
    resolveOffers(w);
  }
  const snap = w.getSnapshot();
  const result = runResultFrom(snap)!;
  const commit = service.commitRun(result, '2026-11-02T12:30:00.000Z');
  return { snap, result, commit };
}

describe('Task 08 §6.3 walkthrough (normal simulation, no debug tools)', () => {
  it('new profile → Map 1 → reload → Map 2 other class → … → Map 10 victory, export/import', () => {
    const storage = new MemoryStorage();
    let service = open(storage);
    expect(service.getState().profile!.highestUnlockedMap).toBe(1);

    // Map 1 with the warrior: skills from run level-ups, elites, boss at 10:00, victory.
    const m1 = play(service, 1, 'warrior');
    expect(m1.result).toMatchObject({ outcome: 'victory', bossKilled: true, mapId: 1 });
    expect(m1.snap.campaign!.eliteKills).toBeGreaterThan(0);
    expect(m1.snap.campaign!.firedEvents).toContain('boss');
    expect(m1.snap.skills.owned.length).toBeGreaterThan(0);
    expect(m1.commit.saved).toBe(true);
    expect(m1.commit.summary).toMatchObject({ newlyUnlockedMap: 2, levelAfter: 2 });
    const gold1 = service.getState().profile!.gold;
    expect(gold1).toBe(CAMPAIGN_MAPS[0].victoryGold);

    // "Restart the browser": a new service over the same storage keeps the progress.
    service = open(storage);
    let p = service.getState().profile!;
    expect(p).toMatchObject({ highestUnlockedMap: 2, gold: gold1, completedMaps: [1] });
    expect(p.classes.warrior.level).toBe(2);

    // Map 2 with another class: separate class XP, shared Gold.
    const m2 = play(service, 2, 'mage');
    expect(m2.result.outcome).toBe('victory');
    p = service.getState().profile!;
    expect(p.classes.mage.level).toBeGreaterThan(1);
    expect(p.classes.warrior.level).toBe(2);
    expect(p.gold).toBe(gold1 + CAMPAIGN_MAPS[1].victoryGold);

    // Maps 3–10 in order, rotating classes; Map 10 must be completable.
    const classes: CharacterClass[] = ['archer', 'rogue', 'warrior', 'mage'];
    for (let mapId = 3; mapId <= 10; mapId++) {
      const r = play(service, mapId, classes[(mapId - 3) % 4]);
      expect(r.result, `map ${mapId}`).toMatchObject({ outcome: 'victory', bossKilled: true });
      expect(r.snap.campaign!.boss).toMatchObject({ alive: false });
    }
    p = service.getState().profile!;
    expect(p.completedMaps).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p.stats).toMatchObject({ runs: 10, wins: 10, defeats: 0 });

    // Export and import back into a fresh browser.
    const exported = exportProfile(p, '2026-11-02T13:00:00.000Z');
    expect(exported.ok).toBe(true);
    const parsed = prepareImport(exported.ok ? exported.json : '');
    expect(parsed.ok).toBe(true);
    const other = open(new MemoryStorage());
    expect(other.replaceProfile(parsed.ok ? parsed.profile : p).ok).toBe(true);
    expect(other.getState().profile).toEqual(p);
  }, 300_000);
});
