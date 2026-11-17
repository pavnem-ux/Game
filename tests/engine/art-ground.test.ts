import { describe, expect, it } from 'vitest';
import {
  GROUND_TILE_WORLD,
  GROUND_TINT_LIMIT,
  groundArtForMap,
  groundTint,
} from '../../src/engine/visuals/art-ground';
import { mapLook } from '../../src/engine/visuals/biomes';

/** Task 26 Phase 2: biome ground art per act and the per-map tint (pure). */
describe('Task 26 — ground art per act', () => {
  it('act I forest, II marsh, III ashlands, IV frost at the act boundaries', () => {
    const byMap = (ids: number[]) => ids.map((id) => groundArtForMap(id));
    expect(byMap([1, 11, 21, 31])).toEqual([
      'ground_forest',
      'ground_marsh',
      'ground_ashlands',
      'ground_frost',
    ]);
    expect(byMap([10, 20, 30, 40])).toEqual([
      'ground_forest',
      'ground_marsh',
      'ground_ashlands',
      'ground_frost',
    ]);
    // The sandbox (no map) uses act I.
    expect(groundArtForMap(null)).toBe('ground_forest');
  });
  it('one repetition of the texture covers 512 world units (config, provisional)', () => {
    expect(GROUND_TILE_WORLD).toBe(512);
  });
});

describe('Task 26 — per-map tint keeps the Task 18 variation within ±8%', () => {
  const looks = [null, ...Array.from({ length: 40 }, (_, i) => i + 1)].map((id) => mapLook(id));
  it('every channel factor of every map stays within 1 ± 0.08', () => {
    for (const look of looks)
      for (const f of groundTint(look)) {
        expect(f).toBeGreaterThanOrEqual(1 - GROUND_TINT_LIMIT - 1e-9);
        expect(f).toBeLessThanOrEqual(1 + GROUND_TINT_LIMIT + 1e-9);
      }
  });
  it('maps of one act still differ (the variation survives), and the same map is stable', () => {
    const act1 = looks.slice(1, 11).map((l) => groundTint(l).join(','));
    expect(new Set(act1).size).toBeGreaterThan(5);
    expect(groundTint(mapLook(7))).toEqual(groundTint(mapLook(7)));
  });
  it('follows the map brightness: a darker map gets factors below 1', () => {
    const dark = looks.slice(1).find((l) => l.brightness < 0.95 && Math.abs(l.hueShift) < 4)!;
    const bright = looks.slice(1).find((l) => l.brightness > 1.05 && Math.abs(l.hueShift) < 4)!;
    if (dark) expect(Math.max(...groundTint(dark))).toBeLessThan(1);
    if (bright) expect(Math.min(...groundTint(bright))).toBeGreaterThan(1);
    expect(dark || bright).toBeTruthy();
  });
});
