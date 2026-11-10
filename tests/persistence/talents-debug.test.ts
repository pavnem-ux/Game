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
let persistence: typeof import('../../src/persistence');
beforeAll(async () => {
  vi.stubGlobal('localStorage', storage);
  debug = await import('../../src/gameplay-ui/campaign-debug');
  campaign = await import('../../src/gameplay-ui/campaign-state');
  persistence = await import('../../src/persistence');
});
const profile = () => campaign.campaignStore.getSnapshot().progression.profile!;
/** The stored save is always a valid profile (debug edits go through validation). */
const storedValid = () =>
  persistence.parseProfileJson(storage.getItem(persistence.SAVE_KEY) ?? '').ok;

describe('Task 09 §1.6 talent debug tools (validated, DEV/QA only)', () => {
  it('set any node rank: prerequisites are filled to II, the level is raised only if needed', () => {
    expect(profile().classes.rogue.level).toBe(1);
    expect(debug.campaignDebug.setTalentRank('rogue', 'rogue.b1.n03', 1)).toBe(true);
    let rogue = profile().classes.rogue;
    expect(rogue.talents).toEqual({ 'rogue.b1.n01': 2, 'rogue.b1.n02': 2, 'rogue.b1.n03': 1 });
    expect(rogue.level).toBe(10); // 5 points → smallest level with 5 points
    expect(storedValid()).toBe(true);
    // Lowering a node below II clears later nodes that would lose their prerequisite.
    expect(debug.campaignDebug.setTalentRank('rogue', 'rogue.b1.n02', 1)).toBe(true);
    rogue = profile().classes.rogue;
    expect(rogue.talents).toEqual({ 'rogue.b1.n01': 2, 'rogue.b1.n02': 1 });
    expect(rogue.level).toBe(10); // never lowered by a rank change
    expect(debug.campaignDebug.setTalentRank('rogue', 'rogue.b1.n01', 0)).toBe(true);
    expect(profile().classes.rogue.talents).toEqual({});
    // Wrong class, unknown node and bad ranks are refused without writing.
    const before = storage.getItem(persistence.SAVE_KEY);
    expect(debug.campaignDebug.setTalentRank('rogue', 'mage.b1.n01', 1)).toBe(false);
    expect(debug.campaignDebug.setTalentRank('rogue', 'rogue.b1.n09', 1)).toBe(false);
    expect(debug.campaignDebug.setTalentRank('rogue', 'rogue.b1.n01', 4)).toBe(false);
    expect(storage.getItem(persistence.SAVE_KEY)).toBe(before);
  });
  it('superpower preset per class: on = level ≥ 30 + branch 3 node 1 rank I; off clears it', () => {
    expect(debug.campaignDebug.toggleSuperpowerPreset('archer')).toBe(true);
    let archer = profile().classes.archer;
    expect(archer.level).toBe(30);
    expect(archer.talents).toEqual({ 'archer.b3.n01': 1 });
    expect(profile().classes.mage.talents).toEqual({}); // other trees untouched
    expect(debug.campaignDebug.toggleSuperpowerPreset('archer')).toBe(false);
    archer = profile().classes.archer;
    expect(archer.talents).toEqual({});
    expect(archer.level).toBe(30);
    expect(storedValid()).toBe(true);
  });
  it('grant/remove points via level: the tree is kept while valid, reset when it no longer fits', () => {
    debug.campaignDebug.setTalentRank('warrior', 'warrior.b2.n02', 2); // 2 + 2 + ... points
    const spent = Object.values(profile().classes.warrior.talents).reduce((a, b) => a + b, 0);
    expect(spent).toBe(4);
    expect(debug.campaignDebug.setClassLevel('warrior', 40)).toEqual({ talentsReset: false });
    expect(profile().classes.warrior.talents).toEqual({ 'warrior.b2.n01': 2, 'warrior.b2.n02': 2 });
    expect(debug.campaignDebug.setClassLevel('warrior', 8)).toEqual({ talentsReset: false }); // 4 points
    expect(debug.campaignDebug.setClassLevel('warrior', 6)).toEqual({ talentsReset: true }); // 3 points
    expect(profile().classes.warrior).toMatchObject({ level: 6, talents: {} });
    expect(debug.campaignDebug.setClassLevel('warrior', 51)).toBeNull();
    expect(storedValid()).toBe(true);
  });
  it('reset a class tree', () => {
    debug.campaignDebug.setTalentRank('mage', 'mage.b1.n02', 3);
    expect(Object.keys(profile().classes.mage.talents)).toHaveLength(2);
    expect(debug.campaignDebug.resetTalents('mage')).toBe(true);
    expect(profile().classes.mage.talents).toEqual({});
  });
});
