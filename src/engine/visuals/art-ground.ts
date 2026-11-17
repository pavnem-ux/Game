import { GROUND_ART } from './art-registry';
import { BIOMES, actForMap } from './biomes';
import type { MapLook } from './biomes';

/**
 * Task 26: the owner's biome ground textures (pure; no Phaser). Each act tiles its texture under
 * everything; the map's Task 18 variation (hue shift + brightness) survives as a subtle per-channel
 * tint, kept within ±8% brightness. Decor, signature features, paths, particles and the light /
 * darkness overlay stay on top unchanged. Without the image the procedural ground stays.
 */

/** World units covered by one repetition of the ground texture (provisional, for tuning). */
export const GROUND_TILE_WORLD = 512;
/** The per-map tint never moves a channel by more than this fraction (spec: ±8% brightness). */
export const GROUND_TINT_LIMIT = 0.08;

/** Art key of the ground texture for a map (act I forest, II marsh, III ashlands, IV frost). */
export const groundArtForMap = (mapId: number | null): string => GROUND_ART[actForMap(mapId)];

const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;
/**
 * Per-channel multiplier [r, g, b] carrying the map's variation: the map's ground base colour
 * divided by its act's base colour, each clamped to 1 ± GROUND_TINT_LIMIT.
 */
export function groundTint(look: MapLook): readonly [number, number, number] {
  const act = channels(BIOMES[look.act].ground.base);
  const map = channels(look.palette.base);
  const lo = 1 - GROUND_TINT_LIMIT,
    hi = 1 + GROUND_TINT_LIMIT;
  const f = (i: 0 | 1 | 2) =>
    Math.round(Math.min(hi, Math.max(lo, act[i] === 0 ? 1 : map[i] / act[i])) * 1000) / 1000;
  return Object.freeze([f(0), f(1), f(2)] as const);
}
