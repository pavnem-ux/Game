import { describe, expect, it } from 'vitest';
import { createProgressionService, createSaveStore } from '../../src/persistence';
import type { StorageLike } from '../../src/persistence';
import type { RunResult } from '../../src/profile';

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
const NOW = '2026-11-10T12:00:00.000Z';
const open = (s: StorageLike) =>
  createProgressionService(
    createSaveStore({ storage: s, now: () => NOW, newProfileId: () => 'p' }),
  );
const result = (over: Partial<RunResult>): RunResult => ({
  runId: 'coins-1',
  mapId: 1,
  characterClass: 'warrior',
  outcome: 'victory',
  elapsed: 600,
  kills: 300,
  eliteKills: 4,
  bossKilled: true,
  runLevel: 8,
  coins: 37,
  ...over,
});

describe('Task 11 §1.4 — coin Gold is applied exactly once with the run result', () => {
  it('victory: coins + bonus once; repeated result events and a reload never pay again', () => {
    const storage = new MemoryStorage();
    const svc = open(storage);
    const first = svc.commitRun(result({}), NOW);
    expect(first.summary).toMatchObject({ goldGained: 37 + 24, duplicate: false });
    expect(svc.commitRun(result({}), NOW).summary.duplicate).toBe(true);
    expect(svc.getState().profile!.gold).toBe(61);
    const reloaded = open(storage);
    expect(reloaded.getState().profile!.gold).toBe(61);
    expect(reloaded.commitRun(result({ coins: 999 }), NOW).summary.duplicate).toBe(true);
    expect(reloaded.getState().profile!.gold).toBe(61);
  });
  it('defeat pays 50% of the coins; abandoned pays nothing; invalid coin counts are rejected', () => {
    const svc = open(new MemoryStorage());
    svc.commitRun(
      result({ runId: 'd', outcome: 'defeat', bossKilled: false, elapsed: 300, coins: 31 }),
      NOW,
    );
    expect(svc.getState().profile!.gold).toBe(15);
    svc.commitRun(result({ runId: 'a', outcome: 'abandoned', bossKilled: false, coins: 80 }), NOW);
    expect(svc.getState().profile!.gold).toBe(15);
    expect(() => svc.commitRun(result({ runId: 'bad', coins: -3 }), NOW)).toThrow();
    expect(svc.getState().profile!.gold).toBe(15);
  });
});
