import { describe, expect, it, vi } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { GameplayOptions } from '../../src/gameplay';
import { calculateSuccessfulDamage } from '../../src/combat-core';
import { RunCoins } from '../../src/gameplay/coins';
import { RunExperience, XP_RULES } from '../../src/gameplay/experience';
import { PET_IDS } from '../../src/pets';
import type { PetId } from '../../src/pets';
import { stationaryMelee } from '../skills/helpers';

type DamageEvent = {
  type: 'damage';
  attackId: string;
  targetId: string;
  damageType: string;
  critical: boolean;
  damage: number;
};
function world(
  pet: { id: PetId; level: number } | null,
  over: Partial<GameplayOptions> = {},
): GameplayWorld {
  const w = new GameplayWorld({
    characterClass: 'warrior',
    level: 1,
    seed: 11,
    initialEnemies: false,
    spawning: { enabled: false },
    ...(pet ? { pet } : {}),
    ...over,
  });
  w.setTestProtection(true);
  return w;
}
const petActions = (w: GameplayWorld) =>
  w
    .getEvents()
    .filter((e) => e.channel === 'pets')
    .map((e) => ({
      time: e.time,
      ...(e.event as { action: string; amount: number; targetId: string | null }),
    }));
const petDamage = (w: GameplayWorld, source: string) =>
  w
    .getEvents()
    .filter((e) => e.channel === 'combat' && e.event.type === 'damage')
    .map((e) => ({ time: e.time, ...(e.event as DamageEvent) }))
    .filter((e) => w.skills.attackSource(e.attackId) === source);
/** Advance in small frames (the world's own boundaries decide every action time). */
function advance(w: GameplayWorld, seconds: number, frame = 0.05) {
  const end = w.time + seconds;
  while (w.time < end - 1e-9) w.update(Math.min(frame, end - w.time));
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
/** A stationary dummy straight to the right of the player (outside the sword's reach). */
const dummy = (w: GameplayWorld, distance: number, angle = 0) =>
  w.spawnEnemy('melee', distance, angle, stationaryMelee);

describe('Task 20 §1.1 — pet lifecycle', () => {
  it('spawns with the run, follows 40 behind the player, is not a combat entity', () => {
    const w = world({ id: 'owlet', level: 1 });
    const pet = w.getSnapshot().pet!;
    expect(pet).toMatchObject({ id: 'owlet', level: 1, interval: 1.2, nextActionAt: 1.2 });
    const p = w.getSnapshot().playerBody;
    // Facing right by default → 40 units to the left.
    expect([pet.x, pet.y]).toEqual([p.x - 40, p.y]);
    w.setMovement(0, 1);
    advance(w, 0.5);
    const q = w.getSnapshot();
    expect(near(q.pet!.x, q.playerBody.x) && near(q.pet!.y, q.playerBody.y - 40)).toBe(true);
    // Not targetable / damageable: Combat Core knows no pet entity.
    expect(() => w.core.getEntity('pet')).toThrow();
    expect(world(null).getSnapshot().pet).toBeNull();
  });
  it('the same active pet starts with every class', () => {
    for (const characterClass of ['warrior', 'mage', 'archer', 'rogue'] as const)
      expect(world({ id: 'wolf', level: 2 }, { characterClass }).getSnapshot().pet).toMatchObject({
        id: 'wolf',
        level: 2,
      });
  });
  it('rejects unknown pets and levels outside 1–5 before creating the world', () => {
    for (const pet of [
      { id: 'dragon', level: 1 },
      { id: 'owlet', level: 0 },
      { id: 'owlet', level: 6 },
      { id: 'owlet', level: 1.5 },
    ])
      expect(() => world(pet as { id: PetId; level: number })).toThrow();
  });
  it('pause freezes the pet; it is removed when the run ends', () => {
    const w = world({ id: 'firefly', level: 1 });
    w.setPaused(true);
    w.update(30);
    expect(petActions(w)).toHaveLength(0);
    expect(w.time).toBe(0);
    w.setPaused(false);
    advance(w, 8.01);
    expect(petActions(w)).toHaveLength(1);
    // Campaign run end: victory → the pet is gone.
    const c = world({ id: 'firefly', level: 1 }, { campaign: { mapId: 1, runId: 'pet-end' } });
    expect(c.getSnapshot().pet).not.toBeNull();
    c.debugForceOutcome('victory');
    c.update(0.05);
    expect(c.getSnapshot().campaign?.status).toBe('victory');
    expect(c.getSnapshot().pet).toBeNull();
  });
});

describe('Task 20 §1.5 — debug spawn in the current run', () => {
  it('spawns / replaces / removes the pet at the current clock; validated; aura recomposed', () => {
    const w = world(null);
    advance(w, 3);
    const plain = w.skills.effectiveStats.attackSpeed;
    w.spawnPet({ id: 'wolf', level: 1 });
    expect(w.skills.effectiveStats.attackSpeed).toBeCloseTo(plain + 8, 6);
    w.spawnPet({ id: 'owlet', level: 2 });
    expect(w.getSnapshot().pet).toMatchObject({ id: 'owlet', level: 2 });
    expect(w.getSnapshot().pet!.nextActionAt).toBeCloseTo(4.2, 9);
    expect(w.skills.effectiveStats.attackSpeed).toBeCloseTo(plain, 6);
    expect(() => w.spawnPet({ id: 'dragon' as PetId, level: 1 })).toThrow();
    expect(w.getSnapshot().pet).toMatchObject({ id: 'owlet' });
    w.spawnPet(null);
    expect(w.getSnapshot().pet).toBeNull();
  });
});

describe('Task 20 §1.2 — firefly (heal)', () => {
  it('heals 2% Max HP every 8 s (level 5: 3.6%); never revives', () => {
    for (const [level, percent] of [
      [1, 2],
      [5, 3.6],
    ] as const) {
      const w = world({ id: 'firefly', level });
      const max = w.getSnapshot().player.maxHp;
      w.setTestProtection(false);
      w.setPlayerHp(Math.floor(max / 2));
      w.setTestProtection(true);
      const before = w.getSnapshot().player.currentHp;
      advance(w, 7.9);
      expect(w.getSnapshot().player.currentHp).toBe(before);
      advance(w, 0.2);
      const heals = petActions(w).filter((a) => a.action === 'heal');
      expect(heals.map((h) => h.time)).toEqual([8]);
      expect(heals[0].amount).toBeCloseTo((max * percent) / 100, 6);
      expect(w.getSnapshot().player.currentHp).toBeCloseTo(before + (max * percent) / 100, 6);
      advance(w, 8);
      expect(
        petActions(w)
          .filter((a) => a.action === 'heal')
          .map((h) => h.time),
      ).toEqual([8, 16]);
      expect(w.getSnapshot().runStats.petSupport.healing).toBeCloseTo((2 * max * percent) / 100, 6);
    }
    // Death: clocks freeze; the firefly never heals a dead player.
    const d = world({ id: 'firefly', level: 1 });
    d.setTestProtection(false);
    d.setPlayerHp(0);
    for (let i = 0; i < 400; i++) d.update(0.05); // the clock is frozen at death
    expect(d.getSnapshot().player.alive).toBe(false);
    expect(d.getSnapshot().player.currentHp).toBe(0);
    expect(petActions(d)).toHaveLength(0);
  });
});

describe('Task 20 §1.2 — owlet (shots)', () => {
  it('every 1.2 s shoots the nearest enemy within 400 for 20% player damage (level 5: 36%)', () => {
    for (const [level, percent] of [
      [1, 20],
      [5, 36],
    ] as const) {
      const w = world({ id: 'owlet', level });
      const far = dummy(w, 300); // the pet is 40 behind: 340 from it
      dummy(w, 600, Math.PI / 2); // out of range
      advance(w, 1.19);
      expect(petActions(w)).toHaveLength(0);
      advance(w, 2.5);
      const shots = petActions(w);
      expect(shots.map((s) => Math.round(s.time * 100) / 100)).toEqual([1.2, 2.4, 3.6]);
      expect(new Set(shots.map((s) => s.targetId))).toEqual(new Set([far]));
      const hits = petDamage(w, 'pet.owlet');
      expect(hits.length).toBeGreaterThanOrEqual(2);
      const stats = w.skills.effectiveStats;
      const base = (Math.max(stats.physicalDamage, stats.magicalDamage) * percent) / 100;
      const res = w.core.getEntity(far).resistance;
      for (const h of hits) {
        expect(h.critical).toBe(false);
        expect(h.damageType).toBe(
          stats.magicalDamage > stats.physicalDamage ? 'magical' : 'physical',
        );
        expect(h.damage).toBeCloseTo(calculateSuccessfulDamage(base, res), 6);
      }
      // Its own source in run stats / DPS.
      expect(w.getSnapshot().runStats.bySource.map((s) => s.source)).toContain('pet.owlet');
    }
  });
  it('no target in range: the shot is skipped (idle), the timer keeps running', () => {
    const w = world({ id: 'owlet', level: 1 });
    dummy(w, 600);
    advance(w, 2.5);
    expect(petActions(w).map((a) => a.action)).toEqual(['idle', 'idle']);
    expect(petDamage(w, 'pet.owlet')).toHaveLength(0);
  });
});

describe('Task 20 §1.2 — fox (dash + Burn)', () => {
  it('every 6 s: 60% player damage (magical) to the nearest enemy within 300 + 1 Burn stack (3/tick, 4 s)', () => {
    const w = world({ id: 'fox', level: 1 });
    const target = dummy(w, 220); // 260 from the pet
    dummy(w, 500, Math.PI / 2);
    // The warrior's sword (reach 115) never touches the target 220 away.
    advance(w, 5.9);
    expect(petActions(w)).toHaveLength(0);
    advance(w, 0.2);
    expect(petActions(w).map((a) => [a.time, a.action, a.targetId])).toEqual([[6, 'dash', target]]);
    const [hit] = petDamage(w, 'pet.fox');
    const s = w.skills.effectiveStats;
    const base = (Math.max(s.physicalDamage, s.magicalDamage) * 60) / 100;
    expect(hit).toMatchObject({ damageType: 'magical', critical: false });
    expect(hit.damage).toBeCloseTo(
      calculateSuccessfulDamage(base, w.core.getEntity(target).resistance),
      6,
    );
    const burn = w.statuses.getGroup(target, 'burn')!;
    const own = burn.stacks.filter((st) => st.originId === 'pet.fox');
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ rawDamagePerTick: 3 });
    // The group was created by this hit (no other Burn source): 4 s duration.
    expect(burn.expiresAt - burn.createdAt).toBeCloseTo(4, 9);
    // Burn ticks are attributed to the fox too.
    advance(w, 2);
    expect(w.getSnapshot().runStats.bySource.some((x) => x.source === 'pet.fox')).toBe(true);
  });
  it('level 3: 84% damage; Burn stays 3/tick', () => {
    const w = world({ id: 'fox', level: 3 });
    const target = dummy(w, 200);
    advance(w, 6.05);
    const s = w.skills.effectiveStats;
    const [hit] = petDamage(w, 'pet.fox');
    expect(hit.damage).toBeCloseTo(
      calculateSuccessfulDamage(
        (Math.max(s.physicalDamage, s.magicalDamage) * 84) / 100,
        w.core.getEntity(target).resistance,
      ),
      6,
    );
    expect(
      w.statuses.getGroup(target, 'burn')!.stacks.find((st) => st.originId === 'pet.fox')!
        .rawDamagePerTick,
    ).toBe(3);
  });
});

describe('Task 20 §1.2 — hedgehog (aura + barrier)', () => {
  it('+6 resistance through composeRunStats (level 5: +10.8), caps once', () => {
    const plain = world(null).skills.effectiveStats;
    const w = world({ id: 'hedgehog', level: 1 });
    expect(w.skills.effectiveStats.resistance).toBeCloseTo(plain.resistance + 6, 9);
    expect(world({ id: 'hedgehog', level: 5 }).skills.effectiveStats.resistance).toBeCloseTo(
      plain.resistance + 10.8,
      9,
    );
    // The player entity carries the composed value.
    expect(w.core.getEntity('player').resistance).toBeCloseTo(
      w.skills.effectiveStats.resistance,
      9,
    );
  });
  it('every 10 s a 1.5 s barrier of 5% Max HP in the shared slot (never lowers a stronger one)', () => {
    const w = world({ id: 'hedgehog', level: 1 });
    const max = w.getSnapshot().player.maxHp;
    advance(w, 10.01);
    expect(w.core.getBarrier('player')).toBeCloseTo(max * 0.05, 6);
    advance(w, 1.6);
    expect(w.core.getBarrier('player')).toBe(0);
    // A stronger barrier already active: the hedgehog only extends its expiry.
    w.skills.grantBarrier(max * 0.5, 30);
    advance(w, 10);
    expect(w.core.getBarrier('player')).toBeCloseTo(max * 0.5, 6);
    expect(w.getSnapshot().runStats.petSupport.barrier).toBeCloseTo(2 * max * 0.05, 6);
  });
});

describe('Task 20 §1.2 — kitten (coins + pickup radius)', () => {
  it('+10% of collected coins, exactly once (fractional carry), skip grants excluded', () => {
    const c = new RunCoins();
    for (let i = 0; i < 25; i++) c.drop({ x: i * 1000, y: 0 }, 4);
    for (let i = 0; i < 25; i++) c.collect({ x: i * 1000, y: 0 }, 10, 1, 10);
    expect(c.collected).toBe(110); // 100 + 10
    expect(c.bonus).toBe(10);
    c.grant(50, 'skip');
    expect(c.collected).toBe(160);
    expect(c.bonus).toBe(10);
    // collectAll gets the same bonus; level 5 = 18%.
    const d = new RunCoins();
    d.drop({ x: 0, y: 0 }, 50);
    d.collectAll(18);
    expect(d.collected).toBe(59);
  });
  it('+15% pickup radius for crystals and coins (radius not levelled)', () => {
    const reach = 10 + XP_RULES.pickupRadius + XP_RULES.crystalRadius;
    const between = 10 + XP_RULES.pickupRadius * 1.1 + XP_RULES.crystalRadius;
    const c = new RunCoins();
    c.drop({ x: between, y: 0 }, 3);
    expect(c.collect({ x: 0, y: 0 }, 10)).toHaveLength(0);
    expect(c.collect({ x: 0, y: 0 }, 10, 1.15)).toHaveLength(1);
    expect(between).toBeGreaterThan(reach);
    const xp = new RunExperience();
    xp.drop({ x: between, y: 0 }, 1);
    expect(xp.collect({ x: 0, y: 0 }, 10).filter((e) => e.type === 'xp-collected')).toHaveLength(0);
    expect(
      xp.collect({ x: 0, y: 0 }, 10, 1.15).filter((e) => e.type === 'xp-collected'),
    ).toHaveLength(1);
    const k = world({ id: 'kitten', level: 5 }).skills.pet!;
    expect(k.pickupScale).toBe(1.15);
    expect(k.coinPercent).toBe(18);
  });
  it('in a run: the kitten bonus is credited once at pickup (and so in the run result)', () => {
    const run = (pet: { id: PetId; level: number } | null) => {
      const w = world(pet, { campaign: { mapId: 1, runId: 'kitten-run' } });
      const coins = (w as unknown as { coins: RunCoins }).coins;
      const p = w.getSnapshot().playerBody;
      // Ten piles of 10 in separate cells, all under the player.
      for (let i = 0; i < 10; i++)
        coins.drop({ x: p.x - 30 + i * 6, y: p.y + (i % 2) * 70 - 35 }, 10);
      advance(w, 0.2);
      return w.getSnapshot().coins;
    };
    const plain = run(null);
    const kitten = run({ id: 'kitten', level: 1 });
    expect(plain.collected).toBeGreaterThan(0);
    expect(plain.petBonus).toBeUndefined();
    expect(kitten.collected).toBe(plain.collected + Math.floor(plain.collected * 0.1));
    expect(kitten.petBonus).toBe(Math.floor(plain.collected * 0.1));
  });
});

describe('Task 20 §1.2 — wolf (aura)', () => {
  it('+8 attack speed, +5% movement speed through composeRunStats (level 5: +14.4 AS)', () => {
    const plain = world(null).skills.effectiveStats;
    const w1 = world({ id: 'wolf', level: 1 }).skills.effectiveStats;
    const w5 = world({ id: 'wolf', level: 5 }).skills.effectiveStats;
    // Composed once with the central caps (attack speed cap 300).
    expect(w1.attackSpeed).toBeLessThanOrEqual(300);
    expect(w1.attackSpeed - plain.attackSpeed).toBeCloseTo(8, 6);
    expect(w5.attackSpeed - plain.attackSpeed).toBeCloseTo(14.4, 6);
    expect(w1.movementSpeed).toBeGreaterThan(plain.movementSpeed);
    expect(w5.movementSpeed).toBeCloseTo(w1.movementSpeed, 9); // movement is not levelled
  });
});

describe('Task 20 §1.1 — secondary hits: no proc chains', () => {
  it('pet hits never reach synergies or passive on-hit reactions', () => {
    const w = world({ id: 'owlet', level: 5 });
    const synergies = vi.spyOn(
      (w.skills as unknown as { synergies: { onHit: (h: unknown) => void } }).synergies,
      'onHit',
    );
    dummy(w, 300);
    advance(w, 5);
    expect(petDamage(w, 'pet.owlet').length).toBeGreaterThan(0);
    expect(synergies).not.toHaveBeenCalled();
  });
});

describe('Task 20 — determinism', () => {
  it('same seed + same inputs ⇒ same results, whatever the frame size', () => {
    for (const id of PET_IDS) {
      const run = (frame: number) => {
        const w = world({ id, level: 3 }, { characterClass: 'mage', seed: 5 });
        w.setTestProtection(false);
        dummy(w, 220);
        dummy(w, 260, Math.PI);
        advance(w, 13, frame);
        return JSON.stringify({
          pet: petActions(w),
          stats: w.getSnapshot().runStats.bySource,
          hp: w.getSnapshot().player.currentHp,
          barrier: w.core.getBarrier('player'),
        });
      };
      expect(run(1 / 60)).toBe(run(1 / 60));
      expect(run(1 / 60)).toBe(run(0.25));
    }
  });
});
