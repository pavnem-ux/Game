import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AlphaCommand } from '../../src/gameplay-ui/store';

class MemoryStorage {
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
let campaign: typeof import('../../src/gameplay-ui/campaign-state');
let debug: typeof import('../../src/gameplay-ui/campaign-debug');
const sent: AlphaCommand[] = [];
let next = 0;
beforeAll(async () => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  const values = [123456789, 4294967295, 0];
  vi.stubGlobal('crypto', {
    getRandomValues: (a: Uint32Array) => {
      a[0] = values[next++ % values.length];
      return a;
    },
  });
  campaign = await import('../../src/gameplay-ui/campaign-state');
  debug = await import('../../src/gameplay-ui/campaign-debug');
  const { alphaBridge } = await import('../../src/gameplay-ui/store');
  alphaBridge.onCommand((c) => sent.push(c));
});
const lastSeed = () => {
  const c = sent.at(-1);
  return c?.type === 'start' ? c.options.seed : undefined;
};

describe('Task 08.5 §4.2 per-run seed', () => {
  it('every campaign run gets a fresh 32-bit seed from the UI', () => {
    expect(campaign.campaignStore.startRun(1)).toBe(true);
    expect(lastSeed()).toBe(123456789);
    // Task 09: the class's talent ranks go into the run options at run start.
    const start = sent.at(-1);
    expect(start?.type === 'start' && start.options.talents).toEqual({ ranks: {} });
    campaign.campaignStore.startRun(1);
    expect(lastSeed()).toBe(4294967295);
    campaign.campaignStore.startRun(1);
    expect(lastSeed()).toBe(0);
  });
  it('debug: start the selected map with a given seed; invalid seeds start nothing', () => {
    expect(debug.campaignDebug.startWithSeed('42')).toBe(true);
    expect(lastSeed()).toBe(42);
    const count = sent.length;
    for (const bad of ['', '-1', '1.5', 'abc', '4294967296', '99999999999'])
      expect(debug.campaignDebug.startWithSeed(bad)).toBe(false);
    expect(sent.length).toBe(count);
    expect(() => campaign.campaignStore.startRun(1, undefined, -1)).toThrow(RangeError);
  });
});
