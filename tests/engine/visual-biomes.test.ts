import { describe, expect, it } from 'vitest';
import {
  ARENA,
  BIOMES,
  DECOR_KEYS,
  SPAWN_CLEAR_RADIUS,
  actForMap,
  decorLayout,
  mapLook,
  shiftColor,
} from '../../src/engine/visuals/biomes';
import { DECOR_ART, FX_ART } from '../../src/engine/visuals/decor-art';
import type { Pen } from '../../src/engine/visuals/art';
import { QUALITY_PRESETS } from '../../src/engine/visuals/quality';
import { mapVisualSeed, renderRandom } from '../../src/engine/visuals/render-rng';

const pen = () => {
  let n = 0;
  const p: Pen = new Proxy({} as Pen, {
    get:
      () =>
      (...args: number[]) => {
        if (args.some((a) => typeof a === 'number' && !Number.isFinite(a))) throw new Error('NaN');
        n++;
        return p;
      },
  });
  return { p, count: () => n };
};

describe('Task 18 Phase 2 — biomes per act', () => {
  it('acts I–IV map to forest / marsh / ashlands / frost with 8 props and their particles', () => {
    expect([1, 10, 11, 20, 21, 30, 31, 40, null].map(actForMap)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 1,
    ]);
    expect(BIOMES[1].particles).toBe('fireflies');
    expect(BIOMES[2].particles).toBe('fog');
    expect(BIOMES[3].particles).toBe('ash');
    expect(BIOMES[4].particles).toBe('snow');
    for (const act of [1, 2, 3, 4] as const) {
      expect(BIOMES[act].decor.length).toBeGreaterThanOrEqual(8);
      expect(BIOMES[act].decor.length).toBeLessThanOrEqual(12);
    }
    // Every prop and particle texture has art that draws something finite.
    expect(Object.keys(DECOR_ART).sort()).toEqual([...DECOR_KEYS].sort());
    for (const key of DECOR_KEYS) {
      const { p, count } = pen();
      DECOR_ART[key](p);
      expect(count()).toBeGreaterThan(1);
    }
    for (const draw of Object.values(FX_ART)) {
      const { p, count } = pen();
      draw(p);
      expect(count()).toBeGreaterThan(1);
    }
  });
});

describe('Task 18 Phase 2 — layout (render-only RNG from the map id)', () => {
  it('same map ⇒ same look and decor layout', () => {
    for (const id of [1, 15, 25, 35, 40, null]) {
      expect(mapLook(id)).toEqual(mapLook(id));
      expect(decorLayout(mapLook(id), 1)).toEqual(decorLayout(mapLook(id), 1));
    }
    expect(renderRandom(5)()).toBe(renderRandom(5)());
  });
  it('different maps differ (all 40 have distinct layouts and variations)', () => {
    const seeds = new Set<number>();
    const firsts = new Set<string>();
    const looks = new Set<string>();
    for (let id = 1; id <= 40; id++) {
      seeds.add(mapVisualSeed(id));
      const look = mapLook(id);
      looks.add(`${look.hueShift}:${look.signature.kind}:${look.signature.x}:${look.signature.y}`);
      firsts.add(JSON.stringify(decorLayout(look, 1).slice(0, 5)));
    }
    expect(seeds.size).toBe(40);
    expect(looks.size).toBe(40);
    expect(firsts.size).toBe(40);
  });
  it('decor stays off the spawn centre and the signature, inside the arena; density follows quality', () => {
    for (let id = 1; id <= 40; id++) {
      const look = mapLook(id);
      const full = decorLayout(look, QUALITY_PRESETS.high.decorDensity);
      for (const d of full) {
        expect(Math.hypot(d.x - ARENA.centre, d.y - ARENA.centre)).toBeGreaterThanOrEqual(
          SPAWN_CLEAR_RADIUS,
        );
        expect(Math.hypot(d.x - look.signature.x, d.y - look.signature.y)).toBeGreaterThanOrEqual(
          look.signature.radius * 0.8,
        );
        expect(d.x).toBeGreaterThanOrEqual(ARENA.edge);
        expect(d.x).toBeLessThanOrEqual(ARENA.size - ARENA.edge);
        expect(look.biome.decor).toContain(d.key);
      }
      const low = decorLayout(look, QUALITY_PRESETS.low.decorDensity);
      expect(low.length).toBeLessThan(full.length);
      // Lower density is a prefix of the full layout (same props, fewer of them).
      expect(full.slice(0, low.length)).toEqual(low);
    }
  });
  it('per-map palette shift stays a valid colour; hue 0 / brightness 1 is the identity', () => {
    expect(shiftColor(0x336699, 0, 1)).toBe(0x336699);
    for (let id = 1; id <= 40; id++) {
      const { palette } = mapLook(id);
      for (const c of Object.values(palette)) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});
