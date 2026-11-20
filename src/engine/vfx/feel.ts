/**
 * Task 33: render-only "feel" (pure; PROVISIONAL numbers). Nothing here touches the simulation:
 *  - hero motion: a short lunge toward the target on a melee swing, a cast swell before spells, a
 *    bow-pull squash — the sprite returns to rest within `HERO_MOTION.duration`;
 *  - hit-stop: a struck sprite's animation pose (idle bob, squash) freezes for `HIT_STOP` seconds on
 *    crits / boss hits; its position keeps following the simulation;
 *  - heavy hits shake the screen a little (only if the screen-shake setting is on), rate-limited.
 */
export const HERO_MOTION = Object.freeze({
  /** Seconds until the sprite is back at rest. */
  duration: 0.12,
  /** Lunge distance toward the target (world px). */
  lunge: 6,
  /** Cast swell (scale +). */
  cast: 0.07,
  /** Bow pull: horizontal squash / vertical stretch. */
  bowX: 0.09,
  bowY: 0.06,
});
export const HIT_STOP = 0.04;
export const HEAVY_SHAKE = Object.freeze({ duration: 110, intensity: 0.0035, cooldown: 0.25 });

export type HeroMotion = 'lunge' | 'cast' | 'bow';
export interface HeroPose {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
}
/** The hero's pose `age` seconds after a motion started (identity once it is over). */
export function heroPose(
  kind: HeroMotion | null,
  age: number,
  dirX: number,
  dirY: number,
  out: HeroPose,
): HeroPose {
  out.dx = out.dy = 0;
  out.sx = out.sy = 1;
  if (!kind || age < 0 || age >= HERO_MOTION.duration) return out;
  // Out and back: 0 → 1 → 0 over the duration.
  const k = Math.sin((Math.PI * age) / HERO_MOTION.duration);
  if (kind === 'lunge') {
    const len = Math.hypot(dirX, dirY) || 1;
    out.dx = (dirX / len) * HERO_MOTION.lunge * k;
    out.dy = (dirY / len) * HERO_MOTION.lunge * k;
  } else if (kind === 'cast') out.sx = out.sy = 1 + HERO_MOTION.cast * k;
  else {
    out.sx = 1 - HERO_MOTION.bowX * k;
    out.sy = 1 + HERO_MOTION.bowY * k;
  }
  return out;
}
/** The animation time to draw a sprite with: frozen at `stoppedAt` during its hit-stop. */
export const poseTime = (now: number, stoppedAt: number | undefined): number =>
  stoppedAt !== undefined && now >= stoppedAt && now - stoppedAt < HIT_STOP ? stoppedAt : now;
/** A heavy hit shakes only when the setting allows it and the last heavy shake is long enough ago. */
export const heavyShake = (enabled: boolean, now: number, lastAt: number): boolean =>
  enabled && now - lastAt >= HEAVY_SHAKE.cooldown;
