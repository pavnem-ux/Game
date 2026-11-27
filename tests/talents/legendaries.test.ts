import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { GameplayOptions } from '../../src/gameplay';
import { defaultLoadout, generateItem, LEGENDARY_RULES } from '../../src/equipment';
import type { GearSlot, ItemInstance, LegendaryId } from '../../src/equipment';
import type { CharacterClass } from '../../src/character-stats';
import type { AttackSnapshot } from '../../src/combat-core';
import type { CombatTag } from '../../src/skills';
import { lcgStream } from '../../src/gameplay/rng';
import { stationaryMelee } from '../skills/helpers';

const SLOT: Record<LegendaryId, GearSlot> = Object.fromEntries(
  LEGENDARY_RULES.items.map((l) => [l.id, l.slot]),
) as Record<LegendaryId, GearSlot>;
/** A level-20 run of `c` wearing the Legendary `id` (campaign map 3 unless `campaign` is false). */
function wearing(c: CharacterClass, id: LegendaryId | null, extra: Partial<GameplayOptions> = {}) {
  const items: ItemInstance[] = id
    ? [
        generateItem(lcgStream(1), {
          uid: 'i1',
          slot: SLOT[id],
          itemLevel: 20,
          rarity: 'legendary',
          characterClass: c,
          legendaryId: id,
        }),
      ]
    : [];
  const loadout = { ...defaultLoadout(c), ...(id ? { [SLOT[id]]: 'i1' } : {}) };
  const w = new GameplayWorld({
    characterClass: c,
    level: 20,
    seed: 3,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    equipment: { loadout, items },
    campaign: { mapId: 3 },
    ...extra,
  });
  w.setTestProtection(true);
  return w;
}
function durable(w: GameplayWorld, distance: number, angle = 0) {
  const id = w.spawnEnemy('melee', distance, angle, stationaryMelee);
  const e = w.core.getEntity(id);
  w.core.updateEntityStats(id, {
    maxHp: 1e6,
    physicalDamage: e.physicalDamage,
    magicalDamage: e.magicalDamage,
    resistance: 0,
    criticalChance: e.criticalChance,
    criticalDamage: e.criticalDamage,
    dodgeChance: 0,
  });
  w.core.heal(id, 1e6);
  return id;
}
const hp = (w: GameplayWorld, id: string) => w.core.getEntity(id).currentHp;
/** Damage the player down to about `fraction` of max HP (whole-HP test loss). */
const dropTo = (w: GameplayWorld, fraction: number) => {
  const p = w.core.getEntity(w.playerId);
  w.setPlayerHp(p.currentHp - Math.ceil(p.currentHp - p.maxHp * fraction));
};
const player = (w: GameplayWorld) => w.core.getEntity(w.playerId);
const BASIC: Record<CharacterClass, readonly CombatTag[]> = {
  warrior: ['basic', 'physical', 'melee'],
  mage: ['basic', 'magical', 'projectile'],
  archer: ['basic', 'physical', 'projectile'],
  rogue: ['basic', 'physical', 'melee', 'dagger'],
};
const snap = (): AttackSnapshot =>
  ({
    id: 'attack-x',
    attackerId: 'player',
    damageType: 'physical',
    coefficient: 1,
    baseDamage: 10,
    critical: false,
    rawDamage: 10,
  }) as AttackSnapshot;

/** Task 43 §2 / §4 — the 10 Legendary effects (provisional numbers). */
describe('Task 43 — defensive Legendaries', () => {
  it('Crown: HP dropping below 30% grants a 30% max HP barrier; cooldown 60 s', () => {
    const w = wearing('warrior', 'barrow_crown');
    const max = player(w).maxHp;
    dropTo(w, 0.5);
    expect(w.core.getBarrier(w.playerId)).toBe(0);
    dropTo(w, 0.25);
    expect(w.core.getBarrier(w.playerId)).toBeCloseTo(max * 0.3, 6);
    w.core.setBarrier(w.playerId, 0);
    w.healPlayer();
    dropTo(w, 0.2); // within 60 s: nothing
    expect(w.core.getBarrier(w.playerId)).toBe(0);
    const plain = wearing('warrior', null);
    dropTo(plain, 0.2);
    expect(plain.core.getBarrier(plain.playerId)).toBe(0);
  });
  it('Heart: healing above max HP becomes a barrier, at most 20% max HP', () => {
    const w = wearing('mage', 'mourner_heart');
    const max = player(w).maxHp;
    w.skills.healPlayer(max * 0.05);
    expect(w.core.getBarrier(w.playerId)).toBeCloseTo(max * 0.05, 6);
    w.skills.healPlayer(max * 0.5);
    expect(w.core.getBarrier(w.playerId)).toBeCloseTo(max * 0.2, 6);
    // A partial heal converts only the part above max HP.
    const v = wearing('mage', 'mourner_heart');
    v.setPlayerHp(player(v).currentHp - 10);
    v.skills.healPlayer(15);
    expect(v.core.getBarrier(v.playerId)).toBeCloseTo(5, 6);
  });
  it('Ring: each crystal picked up heals 0.3% max HP, at most 3% max HP per second', () => {
    const w = wearing('archer', 'water_tsar_ring');
    const max = player(w).maxHp;
    dropTo(w, 0.5);
    let at = player(w).currentHp;
    w.skills.legendary.onCrystalsCollected(4);
    expect(player(w).currentHp - at).toBeCloseTo(max * 0.012, 6);
    at = player(w).currentHp;
    w.skills.legendary.onCrystalsCollected(40); // same second: capped at 3% in total
    expect(player(w).currentHp - at).toBeCloseTo(max * (0.03 - 0.012), 6);
    w.update(1.01); // a new second: the budget is back
    at = player(w).currentHp;
    w.skills.legendary.onCrystalsCollected(1);
    expect(player(w).currentHp - at).toBeCloseTo(max * 0.003, 6);
    // A real pickup in the world goes through the same hook.
    const v = wearing('archer', 'water_tsar_ring');
    dropTo(v, 0.5);
    const before = player(v).currentHp;
    v.dropTestCrystal(1, 0);
    v.update(1 / 60);
    expect(player(v).currentHp - before).toBeGreaterThanOrEqual(player(v).maxHp * 0.003 - 1e-6);
  });
  it('Bark: when hit, thorns of 150% resistance hit enemies within 120, once per 1 s', () => {
    const w = wearing('warrior', 'leshy_bark');
    const near = durable(w, 100);
    const far = durable(w, 300, Math.PI);
    w.skills.onPlayerDirectDamage(near);
    const thorns = player(w).resistance * 1.5;
    expect(Math.abs(1e6 - hp(w, near) - thorns)).toBeLessThanOrEqual(1); // Core rounds damage
    expect(hp(w, far)).toBe(1e6);
    w.skills.onPlayerDirectDamage(near); // same instant: cooldown
    expect(Math.abs(1e6 - hp(w, near) - thorns)).toBeLessThanOrEqual(1);
    expect(
      w
        .getEvents()
        .some(
          (e) =>
            e.channel === 'combat' &&
            'attackId' in e.event &&
            w.skills.attackSource((e.event as { attackId: string }).attackId) ===
              'legendary:leshy_bark',
        ),
    ).toBe(true);
  });
});

describe('Task 43 — offensive Legendaries', () => {
  it('Stride: +15% movement speed; 3 s of moving → the next attack is a guaranteed crit', () => {
    const plain = wearing('rogue', null);
    const w = wearing('rogue', 'ash_wolf_stride');
    expect(w.skills.effectiveStats.movementSpeed).toBeGreaterThan(
      plain.skills.effectiveStats.movementSpeed,
    );
    const tags = new Set<CombatTag>(BASIC.rogue);
    w.setMovement(1, 0);
    for (let i = 0; i < 186; i++) w.update(1 / 60); // 3.1 s of moving
    expect(w.skills.attack(tags, 1, 'physical').critical).toBe(true);
    // The crit restarts the 3 s; a stop of ≥ 0.2 s resets them too.
    w.update(1 / 60);
    const next = Array.from({ length: 20 }, () => w.skills.legendary.takeGuaranteedCrit());
    expect(next.every((x) => !x)).toBe(true);
  });
  it('Millwheel: every 30th basic weapon attack releases a shockwave (radius 200, 100% weapon damage)', () => {
    const w = wearing('warrior', 'millwheel_gauntlets');
    const near = durable(w, 150);
    const far = durable(w, 260, Math.PI);
    const event = { type: 'attack-started', weaponId: w.skills.host.basicWeaponId } as never;
    for (let i = 0; i < 29; i++) w.skills.onBasicAttack(event);
    expect(hp(w, near)).toBe(1e6);
    w.skills.onBasicAttack(event);
    expect(hp(w, near)).toBeLessThan(1e6);
    expect(hp(w, far)).toBe(1e6);
  });
  it('Warden: every 5th direct hit on the same elite or boss deals double damage', () => {
    const w = wearing('warrior', 'warden_edge');
    w.debugFireCampaignEvent('elite-1');
    const elite = w.getSnapshot().campaign!.eliteEnemyIds[0];
    const normal = durable(w, 200);
    const tags = new Set<CombatTag>(BASIC.warrior);
    const m = (id: string) => w.skills.targetMultiplier(snap(), id, undefined, tags);
    const base = m(normal);
    const seq = Array.from(
      { length: 10 },
      () => m(elite) / (w.skills.host.targetDamageScale?.(elite) ?? 1),
    );
    expect(seq.map((x) => Math.round(x * 100) / 100)).toEqual([1, 1, 1, 1, 2, 1, 1, 1, 1, 2]);
    expect(base).toBe(1);
    // Talent / Legendary / synergy hits are not direct and never count.
    const secondary = new Set<CombatTag>(['legendary', 'secondary', 'physical']);
    for (let i = 0; i < 10; i++)
      expect(w.skills.targetMultiplier(snap(), elite, undefined, secondary)).toBe(
        w.skills.host.targetDamageScale?.(elite) ?? 1,
      );
  });
  it('Frost Warlord: direct hits Chill (Slow 20%, 2 s); Chilled targets take +20%', () => {
    const w = wearing('mage', 'frost_warlord_staff');
    const t = durable(w, 1500); // out of the staff's reach: only the test's hit lands
    const tags = new Set<CombatTag>(BASIC.mage);
    expect(w.skills.targetMultiplier(snap(), t, undefined, tags)).toBe(1);
    w.skills.hit(t, w.skills.attack(tags, 1, 'magical'), tags);
    expect(w.skills.controlState(t).slowed).toBe(true);
    expect(w.skills.targetMultiplier(snap(), t, undefined, tags)).toBeCloseTo(1.2, 9);
    w.update(2.1); // the Chill ends
    expect(w.skills.targetMultiplier(snap(), t, undefined, tags)).toBe(1);
  });
  it('Thunder Kite: direct hits on targets farther than 300 deal +30%', () => {
    const w = wearing('archer', 'thunder_kite_bow');
    const near = durable(w, 250);
    const far = durable(w, 400, Math.PI);
    const tags = new Set<CombatTag>(BASIC.archer);
    expect(w.skills.targetMultiplier(snap(), near, undefined, tags)).toBe(1);
    expect(w.skills.targetMultiplier(snap(), far, undefined, tags)).toBeCloseTo(1.3, 9);
  });
  it('Mire Serpent: a dying enemy’s Bleed spreads to the 2 nearest within 250 (never re-spreads)', () => {
    const w = wearing('rogue', 'mire_serpent_fangs');
    const victim = w.spawnEnemy('melee', 300, 0, stationaryMelee);
    const a = durable(w, 380, 0); // 80 from the victim
    const b = durable(w, 300, 0.4); // ≈ 119
    const c = durable(w, 300, 0.7); // ≈ 205
    const d = durable(w, 300, 1.4); // farther than 250
    w.skills.applyStatus(
      victim,
      { effectType: 'bleed', rawDamagePerTick: 5, duration: 6, probabilityPercent: 100 },
      2,
    );
    const tags = new Set<CombatTag>(BASIC.rogue);
    w.skills.hit(
      victim,
      w.core.createAttack({ attackerId: w.playerId, damageType: 'physical', coefficient: 1000 }),
      tags,
    );
    expect(w.core.getEntity(victim).alive).toBe(false);
    const bleed = (id: string) => w.statuses.getGroup(id, 'bleed');
    expect(bleed(a)?.stacks.length).toBe(2);
    expect(bleed(b)?.stacks.length).toBe(2);
    expect(bleed(c)).toBeNull();
    expect(bleed(d)).toBeNull();
    expect(bleed(a)!.stacks.every((s) => s.originId === 'legendary:mire_serpent_fangs')).toBe(true);
    // Spread stacks never spread again.
    w.skills.hit(
      a,
      w.core.createAttack({ attackerId: w.playerId, damageType: 'physical', coefficient: 1e9 }),
      tags,
    );
    expect(bleed(c)).toBeNull();
  });
});
