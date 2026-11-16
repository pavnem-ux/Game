import { renderRandom, mapVisualSeed } from './render-rng';
import type { RenderRandom } from './render-rng';

/**
 * Task 18 biomes per act (pure; rendering only). The look of a map is generated once from the map
 * id with the render-only RNG: same map ⇒ same ground, decor layout and signature feature. Nothing
 * here collides or touches the simulation. All numbers PROVISIONAL.
 */
export type ActId = 1 | 2 | 3 | 4;
export type ParticleKind = 'fireflies' | 'fog' | 'ash' | 'snow';
export interface BiomeSpec {
  readonly name: string;
  /** Ground: base fill, two noise patch colours, path colour. */
  readonly ground: Readonly<{ base: number; patchA: number; patchB: number; path: number }>;
  readonly decor: readonly DecorKey[];
  readonly particles: ParticleKind;
  /** Darkness strength of the light overlay (0–1, Phase 3). */
  readonly darkness: number;
  /** Signature features this act can draw on a map's ground. */
  readonly signatures: readonly SignatureKind[];
}
export const DECOR_KEYS = Object.freeze([
  // Act I — forest
  'decor-pine',
  'decor-oak',
  'decor-bush',
  'decor-mushrooms',
  'decor-flowers',
  'decor-stump',
  'decor-mossrock',
  'decor-grass',
  // Act II — marsh
  'decor-bogtuft',
  'decor-reeds',
  'decor-bones',
  'decor-skull',
  'decor-barrow',
  'decor-menhir',
  'decor-puddle',
  'decor-deadlog',
  // Act III — ashlands
  'decor-ruinwall',
  'decor-column',
  'decor-fallencolumn',
  'decor-rubble',
  'decor-embercrack',
  'decor-burnttree',
  'decor-ashpile',
  'decor-brazier',
  // Act IV — frost
  'decor-icecrystal',
  'decor-icespire',
  'decor-deadtree',
  'decor-frozenstone',
  'decor-snowdrift',
  'decor-icerock',
  'decor-frostbush',
  'decor-runestone',
] as const);
export type DecorKey = (typeof DECOR_KEYS)[number];
export type SignatureKind =
  | 'clearing'
  | 'flower-ring'
  | 'bog-lake'
  | 'barrow-circle'
  | 'ruin-circle'
  | 'ember-rift'
  | 'frozen-lake'
  | 'ice-ring';

export const BIOMES: Readonly<Record<ActId, BiomeSpec>> = Object.freeze({
  1: Object.freeze({
    name: 'Forest',
    ground: Object.freeze({ base: 0x1b2a1f, patchA: 0x24402a, patchB: 0x15211a, path: 0x3b3526 }),
    decor: DECOR_KEYS.slice(0, 8),
    particles: 'fireflies',
    darkness: 0.42,
    signatures: Object.freeze(['clearing', 'flower-ring'] as const),
  }),
  2: Object.freeze({
    name: 'Marsh',
    ground: Object.freeze({ base: 0x14262a, patchA: 0x1b3a3a, patchB: 0x0d1a1d, path: 0x2a3330 }),
    decor: DECOR_KEYS.slice(8, 16),
    particles: 'fog',
    darkness: 0.5,
    signatures: Object.freeze(['bog-lake', 'barrow-circle'] as const),
  }),
  3: Object.freeze({
    name: 'Ashlands',
    ground: Object.freeze({ base: 0x232224, patchA: 0x302e2f, patchB: 0x18171a, path: 0x3a3532 }),
    decor: DECOR_KEYS.slice(16, 24),
    particles: 'ash',
    darkness: 0.56,
    signatures: Object.freeze(['ruin-circle', 'ember-rift'] as const),
  }),
  4: Object.freeze({
    name: 'Frost',
    ground: Object.freeze({ base: 0x16222f, patchA: 0x223447, patchB: 0x0f1822, path: 0x2b3b4c }),
    decor: DECOR_KEYS.slice(24, 32),
    particles: 'snow',
    darkness: 0.6,
    signatures: Object.freeze(['frozen-lake', 'ice-ring'] as const),
  }),
});

/** Arena geometry used by the layout (matches ALPHA: 3600 square, player spawn at the centre). */
export const ARENA = Object.freeze({ size: 3600, centre: 1800, edge: 40 });
/** Decor never closer than this to the spawn centre (the start ring stays clear). */
export const SPAWN_CLEAR_RADIUS = 170;
/** Decor props on a full-density map (× quality density). */
export const DECOR_BASE_COUNT = 190;

export interface MapLook {
  readonly mapId: number | null;
  readonly act: ActId;
  readonly biome: BiomeSpec;
  readonly seed: number;
  /** Hue rotation in degrees applied to the biome palette (per-map variation). */
  readonly hueShift: number;
  /** Brightness factor applied to the palette. */
  readonly brightness: number;
  readonly palette: BiomeSpec['ground'];
  readonly signature: Readonly<{ kind: SignatureKind; x: number; y: number; radius: number }>;
  /** Winding dirt/ice paths (polyline points) drawn on the ground. */
  readonly paths: readonly (readonly Readonly<{ x: number; y: number }>[])[];
}
/** Act of a campaign map (4 × 10 maps); the sandbox uses act I. */
export const actForMap = (mapId: number | null): ActId =>
  mapId === null ? 1 : (Math.min(4, Math.max(1, Math.ceil(mapId / 10))) as ActId);

/** Rotates the hue of a 0xRRGGBB colour by `degrees` and scales its brightness. Pure. */
export function shiftColor(color: number, degrees: number, brightness = 1): number {
  const r = ((color >> 16) & 255) / 255,
    g = ((color >> 8) & 255) / 255,
    b = (color & 255) / 255;
  const a = (degrees * Math.PI) / 180,
    cos = Math.cos(a),
    sin = Math.sin(a);
  // Hue rotation matrix in RGB (luminance-preserving approximation).
  const m = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ];
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255 * brightness)));
  return (
    (clamp(m[0] * r + m[1] * g + m[2] * b) << 16) |
    (clamp(m[3] * r + m[4] * g + m[5] * b) << 8) |
    clamp(m[6] * r + m[7] * g + m[8] * b)
  );
}

/** The map's generated look (palette, signature feature, paths). Same map id ⇒ same look. */
export function mapLook(mapId: number | null): MapLook {
  const seed = mapVisualSeed(mapId);
  const rand = renderRandom(seed);
  const act = actForMap(mapId);
  const biome = BIOMES[act];
  const hueShift = Math.round((rand() * 2 - 1) * 14);
  const brightness = 0.92 + rand() * 0.16;
  const palette = Object.freeze({
    base: shiftColor(biome.ground.base, hueShift, brightness),
    patchA: shiftColor(biome.ground.patchA, hueShift, brightness),
    patchB: shiftColor(biome.ground.patchB, hueShift, brightness),
    path: shiftColor(biome.ground.path, hueShift, brightness),
  });
  const kind = biome.signatures[Math.floor(rand() * biome.signatures.length)];
  const angle = rand() * Math.PI * 2;
  const distance = 420 + rand() * 520;
  const signature = Object.freeze({
    kind,
    x: Math.round(ARENA.centre + Math.cos(angle) * distance),
    y: Math.round(ARENA.centre + Math.sin(angle) * distance),
    radius: Math.round(150 + rand() * 90),
  });
  const paths = Array.from({ length: 2 + Math.floor(rand() * 2) }, () => winding(rand));
  return Object.freeze({
    mapId,
    act,
    biome,
    seed,
    hueShift,
    brightness,
    palette,
    signature,
    paths: Object.freeze(paths),
  });
}
/** A path crossing the arena through jittered waypoints. */
function winding(rand: RenderRandom) {
  const horizontal = rand() < 0.5;
  const start = 300 + rand() * (ARENA.size - 600);
  const points: { x: number; y: number }[] = [];
  let lateral = start;
  for (let t = 0; t <= ARENA.size; t += 300) {
    lateral = Math.max(150, Math.min(ARENA.size - 150, lateral + (rand() * 2 - 1) * 180));
    points.push(horizontal ? { x: t, y: lateral } : { x: lateral, y: t });
  }
  return Object.freeze(points.map((p) => Object.freeze(p)));
}

export interface DecorItem {
  readonly key: DecorKey;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly flip: boolean;
}
/**
 * Decor scattered with the map's render seed (density by quality). Props stay off the spawn
 * centre, off the signature feature and inside the arena edge. Deterministic for (map, density).
 */
export function decorLayout(look: MapLook, density: number): readonly DecorItem[] {
  const rand = renderRandom(look.seed ^ 0xdec0);
  const items: DecorItem[] = [];
  const count = Math.round(DECOR_BASE_COUNT * Math.max(0, density));
  const { decor } = look.biome;
  // Fixed draw count per candidate keeps layouts of different densities related (prefixes).
  for (let i = 0; i < DECOR_BASE_COUNT * 2 && items.length < count; i++) {
    const x = ARENA.edge + rand() * (ARENA.size - ARENA.edge * 2);
    const y = ARENA.edge + rand() * (ARENA.size - ARENA.edge * 2);
    const pick = rand(),
      scale = 0.8 + rand() * 0.45,
      flip = rand() < 0.5;
    if (Math.hypot(x - ARENA.centre, y - ARENA.centre) < SPAWN_CLEAR_RADIUS) continue;
    if (Math.hypot(x - look.signature.x, y - look.signature.y) < look.signature.radius * 0.8)
      continue;
    items.push(
      Object.freeze({
        key: decor[Math.floor(pick * decor.length)],
        x: Math.round(x),
        y: Math.round(y),
        scale: Math.round(scale * 100) / 100,
        flip,
      }),
    );
  }
  return Object.freeze(items);
}
