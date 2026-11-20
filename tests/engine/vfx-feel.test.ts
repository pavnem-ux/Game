import { describe, expect, it } from 'vitest';
import type { GameplaySnapshot, WorldEvent } from '../../src/gameplay';
import { VFX_CAPS } from '../../src/engine/vfx/caps';
import { HIT_STOP_LIMIT, VfxDirector } from '../../src/engine/vfx/director';
import { VfxEmitter } from '../../src/engine/vfx/emitters';
import {
  HEAVY_SHAKE,
  HERO_MOTION,
  HIT_STOP,
  heavyShake,
  heroPose,
  poseTime,
} from '../../src/engine/vfx/feel';
import { ParticleStore } from '../../src/engine/vfx/particles';

/** Task 33 step 4: render-only feel, and the director's signals (pure parts). */
const pose = () => ({ dx: 0, dy: 0, sx: 1, sy: 1 });

describe('Task 33 — hero motion', () => {
  it('lunge toward the target, back at rest within ~120 ms', () => {
    expect(HERO_MOTION.duration).toBeLessThanOrEqual(0.12);
    const mid = heroPose('lunge', HERO_MOTION.duration / 2, 3, 4, pose());
    expect(mid.dx).toBeCloseTo((3 / 5) * HERO_MOTION.lunge, 9);
    expect(mid.dy).toBeCloseTo((4 / 5) * HERO_MOTION.lunge, 9);
    expect(heroPose('lunge', HERO_MOTION.duration, 1, 0, pose())).toEqual(pose());
    expect(heroPose(null, 0.05, 1, 0, pose())).toEqual(pose());
  });
  it('cast swells, bow pull squashes; neither moves the sprite', () => {
    const cast = heroPose('cast', HERO_MOTION.duration / 2, 1, 0, pose());
    expect([cast.dx, cast.dy]).toEqual([0, 0]);
    expect(cast.sx).toBeCloseTo(1 + HERO_MOTION.cast, 9);
    const bow = heroPose('bow', HERO_MOTION.duration / 2, 1, 0, pose());
    expect(bow.sx).toBeLessThan(1);
    expect(bow.sy).toBeGreaterThan(1);
  });
});

describe('Task 33 — hit-stop and heavy shake', () => {
  it('the struck pose freezes for 40 ms, then follows the clock again', () => {
    expect(HIT_STOP).toBe(0.04);
    expect(poseTime(10.01, 10)).toBe(10);
    expect(poseTime(10.039, 10)).toBe(10);
    expect(poseTime(10.041, 10)).toBe(10.041);
    expect(poseTime(10.01, undefined)).toBe(10.01);
  });
  it('a heavy hit shakes only with the setting on, at most every 0.25 s', () => {
    expect(heavyShake(false, 5, -Infinity)).toBe(false);
    expect(heavyShake(true, 5, -Infinity)).toBe(true);
    expect(heavyShake(true, 5.1, 5)).toBe(false);
    expect(heavyShake(true, 5 + HEAVY_SHAKE.cooldown, 5)).toBe(true);
  });
});

describe('Task 33 — director signals (synthetic events)', () => {
  const snapshot = (time: number, extra: Partial<GameplaySnapshot> = {}) =>
    ({
      time,
      enemies: [
        { entityId: 'e1', position: { x: 100, y: 50 }, alive: true },
        { entityId: 'boss', position: { x: 300, y: 50 }, alive: true },
      ],
      playerProjectiles: [],
      skillCombat: { zones: [] },
      campaign: { boss: { enemyId: 'boss' } },
      ...extra,
    }) as unknown as GameplaySnapshot;
  const ev = (sequence: number, channel: string, event: object) =>
    ({ sequence, time: 1, channel, event }) as unknown as WorldEvent;
  const setup = () => {
    const store = new ParticleStore(VFX_CAPS.high.particles, VFX_CAPS.high);
    const fx = new VfxEmitter(store);
    return { store, fx, director: new VfxDirector(fx) };
  };
  const ctx = { characterClass: 'warrior' as const, attackRange: 60, playerId: 'player' };
  it('a melee swing lunges the hero and draws a slash arc', () => {
    const { store, director } = setup();
    const sig = director.frame(
      snapshot(1),
      [
        ev(1, 'weapon', {
          type: 'attack-started',
          weaponId: 'starter_sword',
          sourceId: 'player',
          targetId: 'e1',
          strike: 1,
          origin: { x: 0, y: 0 },
          direction: { x: 1, y: 0 },
        }),
      ],
      ctx,
    );
    expect(sig.motion).toBe('lunge');
    expect([sig.dx, sig.dy]).toEqual([1, 0]);
    expect(store.at(0).tex).toBe('vfx_slash_arc');
  });
  it('crits and boss hits hit-stop the struck sprite; a crit on the boss is heavy', () => {
    const { director } = setup();
    const hit = (seq: number, target: string, critical: boolean) =>
      ev(seq, 'combat', {
        type: 'damage',
        attackId: `a${seq}`,
        sourceId: 'player',
        targetId: target,
        critical,
        appliedDamage: 5,
      });
    let sig = director.frame(snapshot(1), [hit(1, 'e1', false)], ctx);
    expect(sig.hitStops).toEqual([]);
    sig = director.frame(snapshot(1.1), [hit(2, 'e1', true), hit(3, 'boss', false)], ctx);
    expect(sig.hitStops).toEqual(['e1', 'boss']);
    expect(sig.heavy).toBe(false);
    sig = director.frame(snapshot(1.2), [hit(4, 'boss', true)], ctx);
    expect(sig.heavy).toBe(true);
    const many = Array.from({ length: 20 }, (_, i) => hit(10 + i, i % 2 ? 'e1' : 'boss', true));
    sig = director.frame(snapshot(1.3), many, ctx);
    expect(sig.hitStops.length).toBeLessThanOrEqual(HIT_STOP_LIMIT);
  });
  it('zone plumes follow the simulation clock (same count at any frame rate)', () => {
    const zone = {
      id: 'z1',
      sourceKey: 'inferno',
      center: { x: 0, y: 0 },
      radius: 80,
      expiresAt: 100,
    };
    const run = (steps: number) => {
      const { store, director } = setup();
      let spawned = 0;
      for (let i = 0; i <= steps; i++) {
        const before = store.count + store.dropped;
        director.frame(snapshot((i * 2) / steps, { skillCombat: { zones: [zone] } } as never), [], {
          ...ctx,
          characterClass: 'mage',
        });
        spawned += store.count + store.dropped - before;
      }
      return spawned;
    };
    expect(run(20)).toBe(run(120));
  });
  it('passive skills never draw; unknown events draw nothing', () => {
    const { store, director } = setup();
    director.frame(
      snapshot(1),
      [
        ev(1, 'skill', {
          type: 'skill-activated',
          skillId: 'battle_fury',
          rank: 1,
          origin: { x: 0, y: 0 },
        }),
        ev(2, 'progression', { type: 'level-up' }),
      ],
      ctx,
    );
    expect(store.count).toBe(0);
  });
});
