/**
 * Task 34: how talent-spawned objects are drawn (pure; PROVISIONAL numbers, rendering only — the
 * entities have no hitbox, and nothing here reaches the simulation).
 *  - Ballista (archer.b3): the pack sprite at the entity position (feet), visible width
 *    `ART_BODY_WIDTH_PER_RADIUS` (2.4) × `radius`; a short pop-in on spawn, a fade-out before it
 *    expires, and a recoil (sprite nudged back) after each shot.
 *  - Shadow copy (rogue.b2.n03): the rogue's own art, dark violet, translucent, with a glow and a
 *    trailing afterimage while it moves; fades in / out.
 */
export const SUMMON_DISPLAY = Object.freeze({
  ballista: Object.freeze({
    /** Display radius (world px): visible width ≈ 2.4 × this. */
    radius: 22,
    /** Recoil: nudged back this far (px), easing home over `recoilTime` (s). */
    recoil: 4,
    recoilTime: 0.1,
    popIn: 0.18,
    fadeOut: 0.35,
    /** Light around it and the lifetime ring at its feet (px). */
    light: 90,
    ringRadius: 20,
  }),
  shadowCopy: Object.freeze({
    alpha: 0.55,
    /** Multiply tint of the rogue art (dark violet). */
    tint: 0x5b3c9e,
    glow: 0x9a7cff,
    fadeIn: 0.15,
    fadeOut: 0.3,
    /** Afterimages while moving: count, spacing (s of movement history) and alpha falloff. */
    ghosts: 2,
    ghostAlpha: 0.35,
    /** Moving slower than this (px / s) leaves no afterimage. */
    ghostMinSpeed: 30,
  }),
});

export interface SummonPose {
  /** Scale multiplier (pop-in overshoot). */
  scale: number;
  alpha: number;
  /** Recoil offset (px, along −facing). */
  recoil: number;
}
/**
 * Ballista pose: `age` since it appeared, `remaining` until it expires, `sinceShot` since its last
 * shot (Infinity = none). Pop-in: 0 → 1.08 → 1 over `popIn`; fade-out over the last `fadeOut`.
 */
export function ballistaPose(
  age: number,
  remaining: number,
  sinceShot: number,
  out: SummonPose,
): SummonPose {
  const c = SUMMON_DISPLAY.ballista;
  const t = age / c.popIn;
  out.scale = t >= 1 ? 1 : Math.max(0, t) * (1 + 0.08 * Math.sin(Math.PI * Math.max(0, t)));
  out.alpha = Math.max(0, Math.min(1, t * 2, remaining / c.fadeOut));
  out.recoil =
    sinceShot >= 0 && sinceShot < c.recoilTime ? c.recoil * (1 - sinceShot / c.recoilTime) : 0;
  return out;
}
/** Shadow copy alpha: fade in after it appears, fade out before it expires (0 … `alpha`). */
export function shadowCopyAlpha(age: number, remaining: number): number {
  const c = SUMMON_DISPLAY.shadowCopy;
  return c.alpha * Math.max(0, Math.min(1, age / c.fadeIn, remaining / c.fadeOut));
}
