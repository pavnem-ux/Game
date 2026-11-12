/**
 * Task 18: render-only random numbers (mulberry32). Seeded from the map id, never from the
 * simulation's RNG streams: the same map always looks the same, and drawing never changes results.
 */
export type RenderRandom = () => number;
export function renderRandom(seed: number): RenderRandom {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Visual seed of a map (sandbox runs use 0). Stable hash, independent of run seeds. */
export function mapVisualSeed(mapId: number | null): number {
  const id = mapId ?? 0;
  return (Math.imul(id + 1, 0x9e3779b1) ^ 0x5f3759df) >>> 0;
}
