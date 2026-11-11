import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GameplaySnapshot } from '../../src/gameplay';
import type { ErrorLogStorage } from '../../src/gameplay-ui/error-log';

/** In-memory localStorage with a write counter (Task 08.5 §3.2 crash safety). */
class MemoryStorage implements ErrorLogStorage {
  readonly data = new Map<string, string>();
  writes: string[] = [];
  failOn: string | null = null;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failOn === k) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    this.writes.push(k);
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const storage = new MemoryStorage();
let log: typeof import('../../src/gameplay-ui/error-log');
let crash: typeof import('../../src/gameplay-ui/crash-state');
let campaign: typeof import('../../src/gameplay-ui/campaign-state');
let bridge: typeof import('../../src/gameplay-ui/store');
let SAVE_KEY: string;

beforeAll(async () => {
  vi.stubGlobal('localStorage', storage);
  log = await import('../../src/gameplay-ui/error-log');
  crash = await import('../../src/gameplay-ui/crash-state');
  campaign = await import('../../src/gameplay-ui/campaign-state');
  bridge = await import('../../src/gameplay-ui/store');
  ({ SAVE_KEY } = await import('../../src/persistence'));
});

describe('Task 08.5 §3.2 error log', () => {
  it('keeps only the last 5 errors in its own key', () => {
    const s = new MemoryStorage();
    for (let i = 1; i <= 7; i++)
      log.recordError(new Error(`boom ${i}`), 'error', { storage: s, now: () => `t${i}` });
    const errors = log.readErrors(s);
    expect(errors.map((e) => e.message)).toEqual([
      'Error: boom 3',
      'Error: boom 4',
      'Error: boom 5',
      'Error: boom 6',
      'Error: boom 7',
    ]);
    expect([...s.data.keys()]).toEqual([log.ERROR_LOG_KEY]);
    expect(errors[4]).toMatchObject({ source: 'error', time: 't7' });
    expect(errors[4].stack).toContain('boom 7');
  });
  it('accepts any thrown value and never throws, even when storage fails', () => {
    const s = new MemoryStorage();
    s.failOn = log.ERROR_LOG_KEY;
    expect(() =>
      log.recordError({ odd: true }, 'unhandledrejection', { storage: s }),
    ).not.toThrow();
    expect(log.recordError('plain', 'render', { storage: null }).message).toBe('plain');
    s.failOn = null;
    s.data.set(log.ERROR_LOG_KEY, '{not json');
    expect(log.readErrors(s)).toEqual([]);
    s.data.set(log.ERROR_LOG_KEY, JSON.stringify([{ junk: 1 }, 'x']));
    expect(log.readErrors(s)).toEqual([]);
  });
});

describe('Task 08.5 §3.2 crash path leaves the save intact', () => {
  it('a crash during a run records the error, discards the run and never writes the save', () => {
    const service = campaign.campaignStore.service();
    const profile = service.getState().profile!;
    expect(profile).toBeTruthy();
    const before = storage.getItem(SAVE_KEY);
    expect(before).toBeTruthy();
    const fakeWorld = (status: string) =>
      ({
        time: 30,
        kills: 3,
        coins: { collected: 0, piles: [] },
        character: { characterClass: 'warrior' },
        progression: { level: 2 },
        runStats: {
          damageDealt: 10,
          damageTaken: 0,
          bySource: [],
          deathTime: null,
          reviveUsed: false,
          lowHpMoments: 0,
        },
        campaign: {
          runId: 'crash-run',
          mapId: 1,
          status,
          duration: 600,
          resolvedAt: status === 'active' ? null : 30,
          eliteKills: 0,
          bossKilled: false,
        },
      }) as unknown as GameplaySnapshot;
    bridge.alphaBridge.publish({
      screen: 'playing',
      world: fakeWorld('active'),
      events: [],
      runId: 1,
      record: 0,
      error: '',
    });
    storage.writes = [];
    crash.crashState.report(new Error('scene exploded'), 'error');
    expect(crash.crashState.get()?.message).toBe('Error: scene exploded');
    // The run later "resolving" (or being abandoned on pagehide) must not commit anything.
    bridge.alphaBridge.publish({
      screen: 'results',
      world: fakeWorld('defeat'),
      events: [],
      runId: 1,
      record: 0,
      error: '',
    });
    expect(storage.writes).toEqual([log.ERROR_LOG_KEY]);
    expect(storage.getItem(SAVE_KEY)).toBe(before);
    expect(service.getState().profile).toBe(profile);
    expect(log.readErrors(storage).at(-1)?.message).toBe('Error: scene exploded');
    // Recovery: fresh menu state, no crash, still no save write.
    crash.crashState.recover();
    expect(crash.crashState.get()).toBeNull();
    expect(bridge.alphaBridge.getSnapshot()).toMatchObject({ screen: 'menu', world: null });
    expect(storage.getItem(SAVE_KEY)).toBe(before);
  });
});
