import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import { ENEMY_KINDS } from '../../src/gameplay/enemy-types';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import { ART, drawArt } from '../../src/engine/visuals/art';
import type { Pen } from '../../src/engine/visuals/art';
import {
  TEXTURE_KEYS,
  chestTextureKey,
  enemyTextureKey,
  playerProjectileKey,
  playerTextureKey,
  textureSize,
} from '../../src/engine/visuals/keys';
import { Pool } from '../../src/engine/visuals/pool';

/** Records drawing calls; every method returns the pen (like Phaser's chaining). */
function recordingPen() {
  const calls: string[] = [];
  const pen = new Proxy({} as Pen, {
    get:
      (_t, name: string) =>
      (...args: number[]) => {
        for (const a of args)
          if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${name}: ${a}`);
        calls.push(name);
        return pen;
      },
  });
  return { pen, calls };
}

describe('Task 18 Phase 1 — texture keys and art', () => {
  it('every entity type has a texture key, and every key has art', () => {
    for (const c of CHARACTER_CLASSES) expect(TEXTURE_KEYS).toContain(playerTextureKey(c));
    for (const kind of ENEMY_KINDS)
      for (const ranged of [false, true]) {
        expect(TEXTURE_KEYS).toContain(enemyTextureKey(kind, 'normal', ranged));
        expect(TEXTURE_KEYS).toContain(enemyTextureKey(kind, 'elite', ranged));
        expect(enemyTextureKey(kind, 'boss', ranged)).toBe('boss');
      }
    for (const t of ['wooden', 'enchanted'] as const)
      expect(TEXTURE_KEYS).toContain(chestTextureKey(t));
    expect(playerProjectileKey('alpha-bow', 'archer')).toBe('proj-arrow');
    expect(playerProjectileKey('skill:fireball', 'archer')).toBe('proj-bolt');
    expect(playerProjectileKey('alpha-staff', 'mage')).toBe('proj-bolt');
    for (const k of ['proj-enemy', 'crystal', 'coin', 'shadow', 'glow'] as const)
      expect(TEXTURE_KEYS).toContain(k);
    expect(Object.keys(ART).sort()).toEqual([...TEXTURE_KEYS].sort());
  });
  it('each look draws finite shapes inside its texture square', () => {
    for (const key of TEXTURE_KEYS) {
      const { pen, calls } = recordingPen();
      const size = drawArt(key, pen);
      expect(size).toBe(textureSize(key));
      expect(size).toBeGreaterThan(0);
      expect(calls.length).toBeGreaterThan(1);
      expect(calls.some((c) => c.startsWith('fill'))).toBe(true);
    }
  });
});

describe('Task 18 Phase 1 — pools', () => {
  it('pools reuse objects frame after frame and hide the unused rest', () => {
    let created = 0;
    const hidden: number[] = [];
    const pool = new Pool(
      () => ({ id: created++ }),
      (o) => hidden.push(o.id),
    );
    pool.begin();
    const first = [pool.next(), pool.next(), pool.next()];
    expect(pool.end()).toBe(3);
    pool.begin();
    const second = [pool.next(), pool.next()];
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(pool.end()).toBe(2);
    expect(hidden).toEqual([2]);
    pool.begin();
    for (let i = 0; i < 3; i++) pool.next();
    pool.end();
    expect(created).toBe(3); // no new objects once the pool has grown
    expect(pool.size).toBe(3);
  });
});

describe('Task 18 Phase 1 — rendering never changes the simulation', () => {
  it('same seed ⇒ identical results whether or not the render-side mapping runs every frame', () => {
    const run = (render: boolean) => {
      const w = new GameplayWorld({ characterClass: 'archer', seed: 3, campaign: { mapId: 12 } });
      w.setTestProtection(true);
      const pool = new Pool(
        () => ({ key: '' }),
        () => undefined,
      );
      w.setMovement(0.6, -0.3);
      for (let i = 0; i < 60 * 30; i++) {
        w.update(1 / 60);
        if (w.run.currentOffer) w.skipSkillOffer();
        if (!render) continue;
        const s = w.getSnapshot();
        pool.begin();
        pool.next().key = playerTextureKey(s.character.characterClass);
        for (const e of s.enemies)
          if (e.alive)
            pool.next().key = enemyTextureKey(e.kind, 'normal', e.config.behavior === 'ranged');
        for (const p of s.playerProjectiles)
          pool.next().key = playerProjectileKey(p.weaponId, s.character.characterClass);
        pool.end();
      }
      return JSON.stringify(w.getSnapshot());
    };
    expect(run(true)).toBe(run(false));
  });
});
