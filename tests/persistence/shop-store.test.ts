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

describe('Task 11 §1.5 shop / equipment actions (campaign store, validated saves)', () => {
  it('buy: refused without Gold (nothing written); with Gold one save deducts Gold and owns the item', () => {
    const store = campaign.campaignStore;
    expect(store.buyItem('plate-t1')).toBe('gold');
    expect(profile().ownedItems).toEqual([]);
    expect(debug.campaignDebug.grantGold(500)).toBe(true);
    const writes = storage.writes;
    expect(store.buyItem('plate-t1')).toBeNull();
    // One save: the profile document (one JSON write) plus the store's backup copy.
    expect(storage.writes).toBe(writes + 2);
    expect(profile()).toMatchObject({ gold: 420, ownedItems: ['plate-t1'] });
    expect(stored()).toMatchObject({ gold: 420, ownedItems: ['plate-t1'] });
    expect(store.buyItem('plate-t1')).toBe('owned');
    expect(store.buyItem('plate-t2')).toBe('locked'); // tier 2 opens after map 8
    expect(profile().gold).toBe(420);
  });
  it('equip / unequip per class; the change is saved and applies to that class only', () => {
    const store = campaign.campaignStore;
    expect(store.equipItem('mage', 'ring_fury-t1')).toBe('not-owned');
    expect(store.equipItem('warrior', 'plate-t1')).toBeNull();
    expect(profile().classes.warrior.loadout.armor).toBe('plate-t1');
    expect(profile().classes.mage.loadout.armor).toBeNull();
    expect(stored().classes.warrior.loadout.armor).toBe('plate-t1');
    expect(store.unequipSlot('warrior', 'armor')).toBeNull();
    expect(profile().classes.warrior.loadout.armor).toBeNull();
    expect(store.unequipSlot('warrior', 'weapon')).toBeNull();
    expect(profile().classes.warrior.loadout.weapon).toBe('starter_sword');
  });
  it('a failed write leaves the profile unchanged (no Gold lost, item not owned)', () => {
    storage.failWrites = true;
    const before = profile();
    expect(campaign.campaignStore.buyItem('ring_fury-t1')).not.toBeNull();
    expect(profile()).toEqual(before);
    storage.failWrites = false;
  });
  it('debug: unlock all items; equip the best tier for a class', () => {
    expect(debug.campaignDebug.unlockAllItems()).toBe(true);
    expect(profile().ownedItems).toHaveLength(85);
    expect(debug.campaignDebug.equipBestTier('mage')).toBe(true);
    expect(profile().classes.mage.loadout).toEqual({
      weapon: 'flame_staff-t5',
      armor: 'plate-t5',
      amulet: 'amulet_magic-t5',
      ring: 'ring_precision-t5',
    });
    expect(persistence.parseProfile(stored()).ok).toBe(true);
  });
});
