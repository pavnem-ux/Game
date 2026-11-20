/**
 * Task 08.5 §1.1 debug time scale. The scale multiplies the simulation step of each frame; the
 * world still advances through its own boundaries, so the logic and event order are unchanged
 * (only fewer, larger `GameplayWorld.update` calls). Used only in DEV/QA branches of the scene.
 */
export const DEBUG_TIME_SCALES = Object.freeze([1, 2, 4, 8] as const);
export type DebugTimeScale = (typeof DEBUG_TIME_SCALES)[number];
/** Longest real frame step the scene simulates at ×1 (seconds). */
export const MAX_FRAME_STEP = 0.05;

export function isDebugTimeScale(value: unknown): value is DebugTimeScale {
  return DEBUG_TIME_SCALES.includes(value as DebugTimeScale);
}
/**
 * Task 36 «Game speed» (player setting, production): the same simulation-time path as the QA time
 * scale — more simulated seconds per real frame, still advanced through the world's boundaries, so
 * the same seed and inputs give the same results at every speed. Separate from the QA scale, which
 * stays DEV / QA-only (AGENTS §4.10).
 */
export const GAME_SPEEDS = Object.freeze([1, 1.5, 2] as const);
export type GameSpeed = (typeof GAME_SPEEDS)[number];
export const DEFAULT_GAME_SPEED: GameSpeed = 1;
export function isGameSpeed(value: unknown): value is GameSpeed {
  return GAME_SPEEDS.includes(value as GameSpeed);
}
/** The HUD button's cycle: ×1 → ×1.5 → ×2 → ×1. */
export function nextGameSpeed(speed: GameSpeed): GameSpeed {
  return GAME_SPEEDS[(GAME_SPEEDS.indexOf(speed) + 1) % GAME_SPEEDS.length];
}
/** Label of a speed («×1.5»). */
export const gameSpeedLabel = (speed: GameSpeed): string => `×${speed}`;
/**
 * Simulation seconds for one rendered frame of `deltaMs` at `scale` (game speed, times the QA scale
 * in DEV / QA builds). The real-time cap per frame applies before scaling.
 */
export function frameStep(deltaMs: number, scale: number = 1): number {
  return Math.min(MAX_FRAME_STEP, Math.max(0, deltaMs) / 1000) * scale;
}

/**
 * Task 36: the world is advanced in fixed simulation steps (owner decision): the scene accumulates
 * each frame's scaled time and feeds `GameplayWorld.update(SIM_STEP)` once per whole step. Every
 * speed and every frame rate then sees exactly the same steps, so the same seed and inputs give
 * bit-identical results (enemy steering integrates per update; uneven steps would round floats
 * differently). The rendered state lags by less than one step (≈ 8 ms).
 */
export const SIM_STEP = 1 / 120;
/** Most steps simulated in one frame (the frame cap × the top speed, plus QA headroom). */
export const MAX_STEPS_PER_FRAME = 120;
export class SimStepper {
  /** Accumulated, not yet simulated time, in steps (fractional). */
  private pending = 0;
  /** Whole steps to simulate for `seconds` of scaled frame time (the rest carries over). */
  steps(seconds: number): number {
    if (!(seconds > 0)) return 0;
    this.pending += seconds / SIM_STEP;
    // A hair of tolerance: 1/60 s is 2 steps even when the division rounds just below 2.
    const n = Math.min(MAX_STEPS_PER_FRAME, Math.floor(this.pending + 1e-9));
    this.pending = Math.max(0, this.pending - n);
    return n;
  }
  /** A new run (or a restart): no carried-over time. */
  reset(): void {
    this.pending = 0;
  }
}
