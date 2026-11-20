import type { GraphicsQuality } from '../visuals/quality';

/**
 * Task 33: how many VFX sprites may live at once per «Graphics quality» (PROVISIONAL). Every
 * effect is built from pooled sprites ("particles": sparks, rings, arcs, flashes, shards, trail
 * puffs); spawns beyond `particles` are dropped (oldest effects keep playing). `perEffect` caps a
 * single recipe burst; `countScale` scales a recipe's particle counts (Low = minimal). Above
 * `thinAbove` live sprites the layer «thins»: lower alpha and only every other optional particle.
 */
export interface VfxCaps {
  readonly particles: number;
  readonly perEffect: number;
  readonly countScale: number;
  readonly thinAbove: number;
  /** Alpha multiplier of player VFX while thinned (telegraphs are never thinned). */
  readonly thinAlpha: number;
  /** Additive glows (Canvas `lighter`); Low draws plain alpha only. */
  readonly additive: boolean;
  /** Projectile / weapon trails. */
  readonly trails: boolean;
}
export const VFX_CAPS: Readonly<Record<GraphicsQuality, VfxCaps>> = Object.freeze({
  high: Object.freeze({
    particles: 220,
    perEffect: 18,
    countScale: 1,
    thinAbove: 140,
    thinAlpha: 0.6,
    additive: true,
    trails: true,
  }),
  medium: Object.freeze({
    particles: 120,
    perEffect: 10,
    countScale: 0.6,
    thinAbove: 80,
    thinAlpha: 0.6,
    additive: true,
    trails: true,
  }),
  low: Object.freeze({
    particles: 40,
    perEffect: 4,
    countScale: 0.25,
    thinAbove: 24,
    thinAlpha: 0.55,
    additive: false,
    trails: false,
  }),
});
/** Particles one burst may spawn: the recipe count scaled by quality, at least 1, at most the cap. */
export function burstCount(count: number, caps: VfxCaps): number {
  if (count <= 0) return 0;
  return Math.max(1, Math.min(caps.perEffect, Math.round(count * caps.countScale)));
}
