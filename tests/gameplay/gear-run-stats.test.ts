import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import { RunExperience, XP_RULES } from '../../src/gameplay/experience';
import { defaultLoadout, generateItem } from '../../src/equipment';
import type { AffixStat, GearSlot, ItemInstance, Rarity } from '../../src/equipment';
import { lcgStream } from '../../src/gameplay/rng';
import { resolveOffers } from '../skills/helpers';

/** Task 40 run stats from gear secondary stats, read once at run start. */
const item = (
  uid: string,
  slot: GearSlot,
  rarity: Rarity,
  stats: AffixStat[],
  itemLevel = 1,
): ItemInstance =>
  generateItem(lcgStream(1), {
    uid,
    slot,
    itemLevel,
    rarity,
    characterClass: 'mage',
    stats,
  });
function world(
  items: ItemInstance[],
  extra: Partial<ConstructorParameters<typeof GameplayWorld>[0]> = {},
) {
  const loadout = { ...defaultLoadout('mage') } as Record<GearSlot, string | null>;
  for (const i of items) loadout[i.slot] = i.uid;
  return new GameplayWorld({
    characterClass: 'mage',
    seed: 3,
    initialEnemies: false,
    spawning: { enabled: false },
    equipment: { loadout, items },
    ...extra,
  });
}
const value = (i: ItemInstance, stat: AffixStat) => i.affixes.find((a) => a.stat === stat)!.value;

describe('Task 40 — gear run stats in the world', () => {
  it('run XP % adds bonus XP on collection with a carry (no XP lost to rounding)', () => {
    const xp = new RunExperience();
    xp.setBonusPercent(10);
    for (let i = 0; i < 10; i++) {
      xp.drop({ x: 0, y: 0 }, 3);
      xp.collect({ x: 0, y: 0 }, 10);
    }
    expect(xp.getState().totalXp).toBe(33); // 30 + 10% (0.3 per pickup, carried)
    expect(() => xp.setBonusPercent(-1)).toThrow(RangeError);
    const amulet = item('i1', 'amulet', 'rare', ['pickupRadiusPercent', 'runXpPercent']);
    const w = world([amulet]);
    expect(w.permanentModifiers.runXpPercent).toBe(value(amulet, 'runXpPercent'));
    expect(w.permanentModifiers.pickupRadiusPercent).toBe(value(amulet, 'pickupRadiusPercent'));
  });
  it('pickup radius % widens the crystal magnet', () => {
    const reach = 10 + XP_RULES.pickupRadius * 1.1 + XP_RULES.crystalRadius;
    const xp = new RunExperience();
    xp.drop({ x: reach - 1, y: 0 }, 5);
    expect(xp.collect({ x: 0, y: 0 }, 10)).toEqual([]);
    expect(xp.collect({ x: 0, y: 0 }, 10, 1.1).length).toBeGreaterThan(0);
  });
  it('gold find % adds to the coin bonus; elite & boss damage % scales hits on elites and the boss only', () => {
    const ring = item('i1', 'ring', 'uncommon', ['goldFindPercent']);
    const weapon = item('i2', 'weapon', 'uncommon', ['eliteDamagePercent']);
    const w = world([ring, weapon], { campaign: { mapId: 1, difficulty: 'trial' } });
    w.setTestProtection(true);
    expect(w.permanentModifiers.goldFindPercent).toBe(value(ring, 'goldFindPercent'));
    w.update(0.5);
    const elite = w.getSnapshot().campaign!.eliteEnemyIds[0];
    const bonus = value(weapon, 'eliteDamagePercent');
    expect(w.targetDamageScale(elite)).toBeCloseTo(1 + bonus / 100, 12);
    expect(w.targetDamageScale(w.spawnEnemy('melee', 900))).toBe(1);
    // Without the stat every target takes ×1.
    const plain = world([], { campaign: { mapId: 1, difficulty: 'trial' } });
    plain.setTestProtection(true);
    plain.update(0.5);
    expect(plain.targetDamageScale(plain.getSnapshot().campaign!.eliteEnemyIds[0])).toBe(1);
  });
  it('HP regen heals whole HP through Core over time and never revives', () => {
    const helmet = item('i1', 'helmet', 'uncommon', ['hpRegenPercent'], 50);
    const pct = value(helmet, 'hpRegenPercent');
    const w = world([helmet], { level: 50 });
    const hp = () => w.core.getEntity(w.playerId).currentHp;
    const max = w.core.getEntity(w.playerId).maxHp;
    w.setPlayerHp(hp() - Math.floor(max / 2)); // whole-HP loss
    const start = hp();
    for (let i = 0; i < 10; i++) {
      w.update(1);
      resolveOffers(w);
    }
    const healed = hp() - start;
    // ≈ max × pct% per second, healed in whole HP (the remainder is carried).
    expect(healed).toBeGreaterThan(0);
    expect(Number.isInteger(healed)).toBe(true);
    expect(Math.abs(healed - (max * pct * 10) / 100)).toBeLessThanOrEqual(1);
    expect(hp()).toBeLessThanOrEqual(max);
    w.setPlayerHp(0);
    w.update(0.1);
    expect(w.core.getEntity(w.playerId).alive).toBe(false);
    w.update(5);
    expect(w.core.getEntity(w.playerId).alive).toBe(false);
    expect(hp()).toBe(0);
  });
});
