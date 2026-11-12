import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  PET_CONFIG,
  PET_IDS,
  PET_LEVEL_RULES,
  PetError,
  buyPet,
  checkPetPurchase,
  checkPetUpgrade,
  petLevelFactor,
  petParams,
  petUpgradeCost,
  setActivePet,
  upgradePet,
} from '../../src/pets';
import type { PetState } from '../../src/pets';
import { createProfile } from '../../src/profile';
import { migrateV5toV6, parseProfileJson } from '../../src/persistence';

const NOW = '2026-11-12T12:00:00.000Z';
const state = (over: Partial<PetState> = {}): PetState => ({
  gold: 100_000,
  ore: 1000,
  ownedPets: [],
  petLevels: {},
  activePet: null,
  ...over,
});

describe('Task 20 §1.1–1.2 — pet catalogue and levels', () => {
  it('six pets: three sold (1500 / 2500 / 3000 Gold), three quest-only', () => {
    expect(PET_IDS).toEqual(['firefly', 'owlet', 'fox', 'hedgehog', 'kitten', 'wolf']);
    const sold = PET_IDS.filter((id) => PET_CONFIG[id].source.kind === 'shop');
    expect(sold.map((id) => [id, (PET_CONFIG[id].source as { price: number }).price])).toEqual([
      ['owlet', 1500],
      ['hedgehog', 2500],
      ['kitten', 3000],
    ]);
    expect(PET_IDS.filter((id) => PET_CONFIG[id].source.kind === 'quest')).toEqual([
      'firefly',
      'fox',
      'wolf',
    ]);
  });
  it('level factor 1 + 0.2 × (level − 1): ×1, ×1.2 … ×1.8; only the main numbers scale', () => {
    expect([1, 2, 3, 4, 5].map(petLevelFactor)).toEqual([1, 1.2, 1.4, 1.6, 1.8]);
    expect(() => petLevelFactor(6)).toThrow();
    expect(petParams('firefly', 5)).toMatchObject({ healPercent: 3.6, interval: 8 });
    expect(petParams('owlet', 5)).toMatchObject({ damagePercent: 36, range: 400, interval: 1.2 });
    expect(petParams('fox', 3)).toMatchObject({ damagePercent: 84, burnPerTick: 3, range: 300 });
    expect(petParams('hedgehog', 5)).toMatchObject({ resistance: 10.8, barrierPercent: 9 });
    expect(petParams('kitten', 5)).toMatchObject({ coinPercent: 18, pickupRadiusPercent: 15 });
    expect(petParams('wolf', 5)).toMatchObject({ attackSpeed: 14.4, movementSpeedPercent: 5 });
  });
  it('upgrade costs to level 2/3/4/5: Gold 500/1000/2000/4000, ore 10/20/35/50', () => {
    expect([2, 3, 4, 5].map(petUpgradeCost)).toEqual([
      { gold: 500, ore: 10 },
      { gold: 1000, ore: 20 },
      { gold: 2000, ore: 35 },
      { gold: 4000, ore: 50 },
    ]);
    expect(PET_LEVEL_RULES.maxLevel).toBe(5);
    expect(() => petUpgradeCost(1)).toThrow();
    expect(() => petUpgradeCost(6)).toThrow();
  });
});

describe('Task 20 §1.1 — buy, activate, upgrade (pure)', () => {
  it('buy: Gold deducted and owned at once; quest pets, owned pets and short Gold refused', () => {
    const s = buyPet(state({ gold: 1500 }), 'owlet');
    expect(s).toMatchObject({ gold: 0, ownedPets: ['owlet'] });
    expect(checkPetPurchase(s, 'owlet')).toMatchObject({ ok: false, reason: 'owned' });
    for (const quest of ['firefly', 'fox', 'wolf'])
      expect(checkPetPurchase(state(), quest)).toMatchObject({ ok: false, reason: 'quest' });
    expect(checkPetPurchase(state({ gold: 2999 }), 'kitten')).toMatchObject({ reason: 'gold' });
    expect(checkPetPurchase(state(), 'dragon')).toMatchObject({ reason: 'unknown' });
    expect(() => buyPet(state(), 'wolf')).toThrow(PetError);
  });
  it('exactly one active pet per profile (or none); only owned pets', () => {
    let s = state({ ownedPets: ['owlet', 'kitten'] });
    s = setActivePet(s, 'owlet');
    expect(s.activePet).toBe('owlet');
    s = setActivePet(s, 'kitten'); // replaces, never two
    expect(s.activePet).toBe('kitten');
    expect(() => setActivePet(s, 'wolf')).toThrow(/not-owned/);
    expect(() => setActivePet(s, 'x')).toThrow(/unknown/);
    expect(setActivePet(s, null).activePet).toBeNull();
  });
  it('upgrade: one level at a time; Gold + ore + level together; max 5; never below 0', () => {
    let s = state({ gold: 7500, ore: 115, ownedPets: ['owlet'] });
    for (const level of [2, 3, 4, 5]) {
      s = upgradePet(s, 'owlet');
      expect(s.petLevels.owlet).toBe(level);
    }
    expect(s).toMatchObject({ gold: 0, ore: 0 });
    expect(checkPetUpgrade(s, 'owlet')).toMatchObject({ ok: false, reason: 'max' });
    expect(checkPetUpgrade(state({ gold: 499, ownedPets: ['owlet'] }), 'owlet')).toMatchObject({
      reason: 'gold',
    });
    expect(checkPetUpgrade(state({ ore: 9, ownedPets: ['owlet'] }), 'owlet')).toMatchObject({
      reason: 'ore',
    });
    expect(checkPetUpgrade(state(), 'owlet')).toMatchObject({ reason: 'not-owned' });
  });
});

describe('Task 20 §1.4 — save v6', () => {
  it('a v5 save migrates without loss (ownedPets [], petLevels {}, activePet null)', () => {
    const p = { ...createProfile('p', NOW), gold: 321, ore: 12 };
    const v5 = JSON.parse(JSON.stringify(p));
    v5.schemaVersion = 5;
    delete v5.ownedPets;
    delete v5.petLevels;
    delete v5.activePet;
    const r = parseProfileJson(JSON.stringify(v5));
    if (!r.ok) throw r.error;
    expect(r.migratedFrom).toBe(5);
    expect(r.profile).toEqual(p);
    expect(migrateV5toV6({ a: 1 })).toEqual({
      a: 1,
      ownedPets: [],
      petLevels: {},
      activePet: null,
    });
  });
  it('validation like items: known unique pets; levels 1–5 of owned pets; active pet owned', () => {
    const base = {
      ...JSON.parse(JSON.stringify(createProfile('p', NOW))),
      ownedPets: ['owlet', 'wolf'],
      petLevels: { owlet: 3 },
      activePet: 'wolf',
    };
    const ok = parseProfileJson(JSON.stringify(base));
    expect(ok.ok && ok.profile).toMatchObject({ ownedPets: ['owlet', 'wolf'], activePet: 'wolf' });
    const bad: [string, object][] = [
      ['unknown pet', { ownedPets: ['dragon'] }],
      ['duplicate', { ownedPets: ['owlet', 'owlet'] }],
      ['level 6', { petLevels: { owlet: 6 } }],
      ['level 0', { petLevels: { owlet: 0 } }],
      ['level 2.5', { petLevels: { owlet: 2.5 } }],
      ['level of unowned pet', { petLevels: { kitten: 2 } }],
      ['unowned active pet', { activePet: 'kitten' }],
      ['unknown active pet', { activePet: 'dragon' }],
      ['ownedPets not an array', { ownedPets: 'owlet' }],
    ];
    for (const [label, patch] of bad)
      expect(parseProfileJson(JSON.stringify({ ...base, ...patch })).ok, label).toBe(false);
    const one = parseProfileJson(JSON.stringify({ ...base, petLevels: { owlet: 1 } }));
    expect(one.ok && one.profile.petLevels).toEqual({});
  });
});

// Store actions: one validated save each; a failed write keeps the old profile.
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
beforeAll(async () => {
  vi.stubGlobal('localStorage', storage);
  campaign = await import('../../src/gameplay-ui/campaign-state');
  debug = await import('../../src/gameplay-ui/campaign-debug');
});
const profile = () => campaign.campaignStore.getSnapshot().progression.profile!;

describe('Task 20 — store actions (validated saves)', () => {
  it('buy / activate / upgrade, each in one save; refusals write nothing', () => {
    const store = campaign.campaignStore;
    expect(profile().ownedPets).toEqual([]);
    let writes = storage.writes;
    expect(store.buyPet('owlet')).toBe('gold');
    expect(store.buyPet('fox')).toBe('quest');
    expect(store.setActivePet('owlet')).toBe('not-owned');
    expect(storage.writes).toBe(writes);
    expect(debug.campaignDebug.grantGold(2000)).toBe(true);
    expect(debug.campaignDebug.grantOre(10)).toBe(true);
    writes = storage.writes;
    expect(store.buyPet('owlet')).toBeNull();
    expect(storage.writes).toBe(writes + 2); // document + backup
    expect(store.setActivePet('owlet')).toBeNull();
    expect(store.upgradePet('owlet')).toBeNull();
    expect(profile()).toMatchObject({
      gold: 0,
      ore: 0,
      ownedPets: ['owlet'],
      petLevels: { owlet: 2 },
      activePet: 'owlet',
    });
    storage.failWrites = true;
    const before = profile();
    expect(store.setActivePet(null)).not.toBeNull();
    expect(profile()).toEqual(before);
    storage.failWrites = false;
  });
  it('debug: unlock all pets (quest pets too), set level 1–5', () => {
    expect(debug.campaignDebug.unlockAllPets()).toBe(true);
    expect(profile().ownedPets).toEqual([...PET_IDS]);
    expect(debug.campaignDebug.setPetLevel('wolf', 5)).toBe(true);
    expect(profile().petLevels.wolf).toBe(5);
    expect(debug.campaignDebug.setPetLevel('wolf', 6)).toBe(false);
    expect(debug.campaignDebug.setPetLevel('wolf', 1)).toBe(true);
    expect(profile().petLevels.wolf).toBeUndefined();
  });
});
