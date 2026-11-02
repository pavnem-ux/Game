import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createProfile } from '../../src/profile';
import type { PlayerProfile } from '../../src/profile';

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
beforeAll(async () => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  campaign = await import('../../src/gameplay-ui/campaign-state');
});

describe('campaign UI selection follows the profile (Task 08.5 fix)', () => {
  it('a reset/imported profile that locks the selected map falls back to an unlocked map', () => {
    const store = campaign.campaignStore;
    const base = store.service().getState().profile!;
    const unlocked: PlayerProfile = {
      ...base,
      highestUnlockedMap: 10,
      completedMaps: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    };
    expect(store.service().replaceProfile(unlocked).ok).toBe(true);
    store.selectMap(10);
    expect(store.getSnapshot().selectedMapId).toBe(10);
    // Debug reset / import of an earlier save: only Map 1 is open now.
    expect(store.service().replaceProfile(createProfile('fresh', base.createdAt)).ok).toBe(true);
    expect(store.getSnapshot().selectedMapId).toBe(1);
    // An unchanged selection stays as chosen.
    expect(store.service().replaceProfile(unlocked).ok).toBe(true);
    store.selectMap(3);
    expect(store.service().replaceProfile({ ...unlocked, gold: 5 }).ok).toBe(true);
    expect(store.getSnapshot().selectedMapId).toBe(3);
  });
});
