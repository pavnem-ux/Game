import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GEAR_SLOTS, offerItem } from '../../src/equipment';
import { shopOffersOf } from '../../src/profile';

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

describe('Task 40 shop / equipment actions (campaign store, validated saves)', () => {
  it('buy: refused without Gold (nothing written); with Gold one save deducts Gold and owns the item', () => {
    const store = campaign.campaignStore;
    const offers = profile() && shopOffersOf(profile(), 'warrior');
    expect(offers).toHaveLength(28); // 7 slots × (1 Common + 3 Uncommon)
    const armor = offers.find((o) => o.id === 'armor:common')!;
    expect(armor.price).toBe(48); // round(40 × (1 + 1 / 5))
    const before = storage.writes;
    expect(store.buyOffer('warrior', armor.id)).toBe('gold');
    expect(storage.writes).toBe(before);
    expect(profile().items).toEqual([]);
    expect(debug.campaignDebug.grantGold(500)).toBe(true);
    const writes = storage.writes;
    expect(store.buyOffer('warrior', armor.id)).toBeNull();
    // One save: the profile document (one JSON write) plus the store's backup copy.
    expect(storage.writes).toBe(writes + 2);
    expect(profile().gold).toBe(452);
    expect(profile().items).toHaveLength(1);
    expect(profile().items[0]).toMatchObject({
      uid: 'i1',
      slot: 'armor',
      itemLevel: 1,
      rarity: 'common',
    });
    expect(stored()).toMatchObject({ gold: 452, nextItemNumber: 2 });
    expect(stored().shopBought.warrior).toEqual({ level: 1, offers: ['armor:common'] });
    // The bought offer is gone until the class levels up; other classes have their own stock.
    expect(store.buyOffer('warrior', armor.id)).toBe('sold-out');
    expect(store.buyOffer('warrior', 'armor:mythic')).toBe('unknown-offer');
    expect(shopOffersOf(profile(), 'warrior')).toHaveLength(27);
    expect(shopOffersOf(profile(), 'mage')).toHaveLength(28);
    expect(profile().gold).toBe(452);
  });
  it('equip / unequip per class by uid; the change is saved and applies to that class only', () => {
    const store = campaign.campaignStore;
    expect(store.equipItem('mage', 'i99')).toBe('not-owned');
    expect(store.equipItem('warrior', 'i1')).toBeNull();
    // Armor is shared: the same instance may also be worn by another class.
    expect(store.equipItem('mage', 'i1')).toBeNull();
    expect(profile().classes.warrior.loadout.armor).toBe('i1');
    expect(profile().classes.mage.loadout.armor).toBe('i1');
    expect(profile().classes.rogue.loadout.armor).toBeNull();
    expect(stored().classes.warrior.loadout.armor).toBe('i1');
    expect(store.unequipSlot('mage', 'armor')).toBeNull();
    expect(profile().classes.mage.loadout.armor).toBeNull();
    expect(profile().classes.warrior.loadout.armor).toBe('i1');
    expect(store.unequipSlot('warrior', 'weapon')).toBeNull();
    expect(profile().classes.warrior.loadout.weapon).toBe('starter_sword');
  });
  it('equipping needs class level ≥ item level; weapons only fit their class', () => {
    const store = campaign.campaignStore;
    expect(debug.campaignDebug.grantItem('warrior', 'ring', 'rare', 5)).toBe(true);
    const ring = profile().items.at(-1)!;
    expect(ring).toMatchObject({ slot: 'ring', itemLevel: 5, rarity: 'rare' });
    expect(store.equipItem('warrior', ring.uid)).toBe('level');
    expect(debug.campaignDebug.setClassLevel('warrior', 5)).not.toBeNull();
    expect(store.equipItem('warrior', ring.uid)).toBeNull();
    expect(debug.campaignDebug.grantItem('archer', 'weapon', 'common', 1)).toBe(true);
    const bow = profile().items.at(-1)!;
    expect(bow.characterClass).toBe('archer');
    expect(store.equipItem('warrior', bow.uid)).toBe('not-eligible');
    expect(store.equipItem('archer', bow.uid)).toBeNull();
    // A level-up brings a new stock at the new item level (bought offers reset).
    expect(shopOffersOf(profile(), 'warrior')).toHaveLength(28);
    expect(
      shopOffersOf(profile(), 'warrior').every((o) => offerItem(o, 'warrior', 'x').itemLevel === 5),
    ).toBe(true);
  });
  it('a failed write leaves the profile unchanged (no Gold lost, item not owned)', () => {
    storage.failWrites = true;
    const before = profile();
    expect(campaign.campaignStore.buyOffer('rogue', 'ring:common')).not.toBeNull();
    expect(profile()).toEqual(before);
    storage.failWrites = false;
  });
  it('debug: grant a random item; equip a Legendary set at the class level', () => {
    expect(debug.campaignDebug.grantItem('mage', 'amulet', 'mythic' as never, 1)).toBe(false);
    expect(debug.campaignDebug.grantItem('mage', 'amulet', 'epic', 51)).toBe(false);
    const n = profile().items.length;
    expect(debug.campaignDebug.equipBestTier('mage')).toBe(true);
    const set = profile().items.slice(n);
    expect(set).toHaveLength(7);
    expect(set.every((i) => i.rarity === 'legendary' && i.itemLevel === 1)).toBe(true);
    expect(Object.values(profile().classes.mage.loadout)).toEqual(
      GEAR_SLOTS.map((slot) => set.find((i) => i.slot === slot)!.uid),
    );
    expect(set.find((i) => i.slot === 'weapon')!.characterClass).toBe('mage');
    expect(persistence.parseProfile(stored()).ok).toBe(true);
  });
});
