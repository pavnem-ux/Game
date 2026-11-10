import { beforeAll, describe, expect, it, vi } from 'vitest';

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
const storage = new MemoryStorage();
let debug: typeof import('../../src/gameplay-ui/campaign-debug');
let campaign: typeof import('../../src/gameplay-ui/campaign-state');
let store: typeof import('../../src/gameplay-ui/store');
let persistence: typeof import('../../src/persistence');
beforeAll(async () => {
  vi.stubGlobal('localStorage', storage);
  debug = await import('../../src/gameplay-ui/campaign-debug');
  campaign = await import('../../src/gameplay-ui/campaign-state');
  store = await import('../../src/gameplay-ui/store');
  persistence = await import('../../src/persistence');
});
const profile = () => campaign.campaignStore.getSnapshot().progression.profile!;

describe('Task 10 §1.5 debug: unlock all 40 maps, jump to any map', () => {
  it('jump to map 37 unlocks maps up to it (never lowers) and starts a normal campaign run there', () => {
    const sent = vi.spyOn(store.alphaBridge, 'send');
    expect(profile().highestUnlockedMap).toBe(1);
    expect(debug.campaignDebug.jumpToMap(37)).toBe(true);
    expect(profile().highestUnlockedMap).toBe(37);
    expect(campaign.campaignStore.getSnapshot().selectedMapId).toBe(37);
    const start = sent.mock.calls.map((c) => c[0]).find((c) => c.type === 'start');
    expect(start).toMatchObject({ type: 'start', options: { campaign: { mapId: 37 } } });
    expect(persistence.parseProfileJson(storage.getItem(persistence.SAVE_KEY) ?? '').ok).toBe(true);
    // Never lowers; out of range refused.
    expect(debug.campaignDebug.unlockMaps(3)).toBe(true);
    expect(profile().highestUnlockedMap).toBe(37);
    expect(debug.campaignDebug.jumpToMap(41)).toBe(false);
    expect(debug.campaignDebug.jumpToMap(0)).toBe(false);
  });
  it('«Открыть все карты» unlocks all 40', () => {
    expect(debug.campaignDebug.unlockMaps()).toBe(true);
    expect(profile().highestUnlockedMap).toBe(40);
  });
});
