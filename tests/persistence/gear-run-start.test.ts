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
    const geared = {
      ...p,
      gold: 0,
      ownedItems: ['plate-t1', 'heavy_sword-t1', 'ring_fury-t1'],
      classes: {
        ...p.classes,
        warrior: {
          ...p.classes.warrior,
          loadout: {
            weapon: 'heavy_sword-t1',
            helmet: null,
            gloves: null,
            pants: null,
            armor: 'plate-t1',
            amulet: null,
            ring: null,
          },
        },
        mage: {
          ...p.classes.mage,
          loadout: {
            weapon: 'starter_staff',
            helmet: null,
            gloves: null,
            pants: null,
            armor: null,
            amulet: null,
            ring: 'ring_fury-t1',
          },
        },
      },
    };
    expect(service.replaceProfile(geared).ok).toBe(true);
    const sent = vi.spyOn(store.alphaBridge, 'send');
    const starts = () =>
      sent.mock.calls.map((c) => c[0]).filter((c) => c.type === 'start') as {
        options: { characterClass: string; equipment: { loadout: unknown } };
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
  });
});
