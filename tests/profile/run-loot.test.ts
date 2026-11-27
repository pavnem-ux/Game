import { describe, expect, it } from 'vitest';
import { generateItem } from '../../src/equipment';
import type { ItemInstance, Rarity } from '../../src/equipment';
import { lcgStream } from '../../src/gameplay/rng';
import { applyRunResult, createProfile, grantItem } from '../../src/profile';
import type { PlayerProfile, RunResult } from '../../src/profile';

const NOW = '2026-11-27T10:00:00.000Z';
let n = 0;
const drop = (rarity: Rarity, slot: 'ring' | 'weapon' = 'ring'): ItemInstance =>
  generateItem(lcgStream(++n), {
    uid: `drop-${n}`,
    slot,
    rarity,
    itemLevel: 3,
    characterClass: 'mage',
  });
const run = (
  id: string,
  loot: ItemInstance[],
  outcome: RunResult['outcome'] = 'victory',
): RunResult => ({
  runId: id,
  mapId: 1,
  characterClass: 'mage',
  outcome,
  elapsed: 600,
  kills: 10,
  eliteKills: 1,
  bossKilled: outcome === 'victory',
  runLevel: 3,
  loot,
});
const filled = (count: number): PlayerProfile => {
  let p = createProfile('loot', NOW);
  for (let i = 0; i < count; i++)
    p = grantItem(p, { slot: 'ring', rarity: 'common', itemLevel: 1, characterClass: 'mage' });
  return p;
};

/** Task 42 §2–3 — a run's loot reaches the profile once. */
describe('Task 42 — run loot into the profile', () => {
  it('victory / defeat: items get real uids and «new»; a repeated result adds nothing', () => {
    const p = filled(2);
    const loot = [drop('rare'), drop('epic', 'weapon')];
    const r = applyRunResult(p, run('r1', loot), NOW);
    expect(r.profile.items.slice(2).map((i) => i.uid)).toEqual(['i3', 'i4']);
    expect(r.profile.items.at(-1)).toEqual({ ...loot[1], uid: 'i4' });
    expect(r.profile.newItems.slice(-2)).toEqual(['i3', 'i4']);
    expect(r.summary.loot.map((e) => [e.item.uid, e.salvagedOre])).toEqual([
      ['i3', null],
      ['i4', null],
    ]);
    const again = applyRunResult(r.profile, run('r1', loot), NOW);
    expect(again.profile).toBe(r.profile);
    expect(again.summary.loot).toEqual([]);
    const lost = applyRunResult(p, run('r2', [drop('rare')], 'defeat'), NOW);
    expect(lost.profile.items).toHaveLength(3);
    const quit = applyRunResult(p, run('r3', [drop('rare')], 'abandoned'), NOW);
    expect(quit.profile.items).toHaveLength(2);
  });
  it('full bag: Common / Uncommon auto-salvaged for Ore; Rare and better go in past capacity', () => {
    const p = filled(24);
    const loot = [drop('uncommon'), drop('uncommon'), drop('rare'), drop('common'), drop('epic')];
    const r = applyRunResult(p, run('r4', loot), NOW);
    // The first Uncommon fills slot 25; the next Uncommon (1 Ore) and Common (0) are salvaged.
    expect(r.summary.loot.map((e) => e.salvagedOre)).toEqual([null, 1, null, 0, null]);
    expect(r.profile.items).toHaveLength(27); // over capacity (27 / 25), nothing Rare+ lost
    expect(r.profile.ore).toBe(p.ore + r.summary.oreGained + 1);
  });
  it('invalid loot is rejected before anything changes', () => {
    const p = filled(0);
    const other = generateItem(lcgStream(1), {
      uid: 'drop-x',
      slot: 'weapon',
      rarity: 'rare',
      itemLevel: 3,
      characterClass: 'warrior',
    });
    expect(() => applyRunResult(p, run('r5', [other]), NOW)).toThrow(RangeError);
    expect(() => applyRunResult(p, run('r6', [{ ...drop('rare'), itemLevel: 99 }]), NOW)).toThrow();
  });
});
