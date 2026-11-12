import { beforeAll, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  readonly data = new Map<string, string>();
  writes = 0;
  failWrites = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    this.writes++;
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const storage = new MemoryStorage();
let campaign: typeof import('../../src/gameplay-ui/campaign-state');
let debug: typeof import('../../src/gameplay-ui/campaign-debug');
let persistence: typeof import('../../src/persistence');
beforeAll(async () => {
  vi.stubGlobal('localStorage', storage);
  campaign = await import('../../src/gameplay-ui/campaign-state');
  debug = await import('../../src/gameplay-ui/campaign-debug');
  persistence = await import('../../src/persistence');
});
const profile = () => campaign.campaignStore.getSnapshot().progression.profile!;
const stored = () => JSON.parse(storage.getItem(persistence.SAVE_KEY)!);

describe('Task 19 §1.3 forge (campaign store, one validated save per upgrade)', () => {
  it('refused without the item / Gold / ore — nothing written', () => {
    const store = campaign.campaignStore;
    expect(profile().ore).toBe(0); // creates the fresh profile first
    const writes = storage.writes;
    expect(store.upgradeItem('plate-t1')).toBe('not-owned');
    expect(store.upgradeItem('starter_sword')).toBe('starter');
    expect(storage.writes).toBe(writes);
    expect(debug.campaignDebug.grantGold(80)).toBe(true);
    expect(store.buyItem('plate-t1')).toBeNull();
    expect(store.upgradeItem('plate-t1')).toBe('gold');
    expect(debug.campaignDebug.grantGold(8)).toBe(true);
    expect(store.upgradeItem('plate-t1')).toBe('ore');
    expect(profile()).toMatchObject({ gold: 8, ore: 0, itemLevels: {} });
  });
  it('upgrade: Gold, ore and the level change in ONE save', () => {
    const store = campaign.campaignStore;
    expect(debug.campaignDebug.grantOre(5)).toBe(true);
    const writes = storage.writes;
    expect(store.upgradeItem('plate-t1')).toBeNull();
    expect(storage.writes).toBe(writes + 2); // profile document + its backup copy
    expect(profile()).toMatchObject({ gold: 0, ore: 4, itemLevels: { 'plate-t1': 1 } });
    expect(stored()).toMatchObject({ gold: 0, ore: 4, itemLevels: { 'plate-t1': 1 } });
  });
  it('a failed write keeps the old profile (no Gold/ore lost, level unchanged)', () => {
    expect(debug.campaignDebug.grantGold(1000)).toBe(true);
    const before = profile();
    storage.failWrites = true;
    expect(campaign.campaignStore.upgradeItem('plate-t1')).not.toBeNull();
    expect(profile()).toEqual(before);
    storage.failWrites = false;
    expect(stored()).toMatchObject({ gold: 1000, ore: 4, itemLevels: { 'plate-t1': 1 } });
  });
  it('debug: set item level (owns it; 0–10 only); levels persist through reload parsing', () => {
    expect(debug.campaignDebug.setItemLevel('guard_helm-t2', 10)).toBe(true);
    expect(profile().ownedItems).toContain('guard_helm-t2');
    expect(profile().itemLevels['guard_helm-t2']).toBe(10);
    expect(campaign.campaignStore.upgradeItem('guard_helm-t2')).toBe('max');
    expect(debug.campaignDebug.setItemLevel('guard_helm-t2', 11)).toBe(false);
    expect(debug.campaignDebug.setItemLevel('starter_bow', 1)).toBe(false);
    expect(debug.campaignDebug.setItemLevel('guard_helm-t2', 0)).toBe(true);
    expect(profile().itemLevels['guard_helm-t2']).toBeUndefined();
    const parsed = persistence.parseProfile(stored());
    expect(parsed.ok && parsed.profile.itemLevels).toEqual({ 'plate-t1': 1 });
  });
});
