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
import { equipItem, grantItem } from '../../src/profile';

let campaign: typeof import('../../src/gameplay-ui/campaign-state');
let store: typeof import('../../src/gameplay-ui/store');
beforeAll(async () => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  campaign = await import('../../src/gameplay-ui/campaign-state');
  store = await import('../../src/gameplay-ui/store');
});

describe('Task 11 §1.3 — a run starts with that class’s own loadout', () => {
  it('switching class uses that class’s loadout', () => {
    const service = campaign.campaignStore.service();
    const p = campaign.campaignStore.getSnapshot().progression.profile!;
    // Task 40: item instances by uid (granted through the seeded DEV hook, then equipped).
    let g = grantItem(p, {
      slot: 'armor',
      rarity: 'common',
      itemLevel: 1,
      characterClass: 'warrior',
    });
    g = grantItem(g, {
      slot: 'weapon',
      rarity: 'uncommon',
      itemLevel: 1,
      characterClass: 'warrior',
    });
    g = grantItem(g, { slot: 'ring', rarity: 'rare', itemLevel: 1, characterClass: 'mage' });
    g = equipItem(equipItem(g, 'warrior', 'i1'), 'warrior', 'i2');
    const geared = { ...equipItem(g, 'mage', 'i3'), gold: 0 };
    expect(geared.classes.warrior.loadout).toMatchObject({ weapon: 'i2', armor: 'i1' });
    expect(service.replaceProfile(geared).ok).toBe(true);
    const sent = vi.spyOn(store.alphaBridge, 'send');
    const starts = () =>
      sent.mock.calls.map((c) => c[0]).filter((c) => c.type === 'start') as {
        options: { characterClass: string; equipment: { loadout: unknown; items: unknown } };
      }[];
    expect(campaign.campaignStore.startRun(1, 'warrior')).toBe(true);
    expect(campaign.campaignStore.startRun(1, 'mage')).toBe(true);
    expect(campaign.campaignStore.startRun(1, 'rogue')).toBe(true);
    expect(starts().map((s) => [s.options.characterClass, s.options.equipment.loadout])).toEqual([
      ['warrior', geared.classes.warrior.loadout],
      ['mage', geared.classes.mage.loadout],
      [
        'rogue',
        {
          weapon: 'starter_daggers',
          helmet: null,
          gloves: null,
          pants: null,
          armor: null,
          amulet: null,
          ring: null,
        },
      ],
    ]);
    // The run receives the owned instances with the loadout (stats come from the instances).
    expect(starts()[0].options.equipment.items).toEqual(geared.items);
  });
});
