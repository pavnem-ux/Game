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
/** Simulation seconds for one rendered frame of `deltaMs` at `scale`. */
export function frameStep(deltaMs: number, scale: DebugTimeScale = 1): number {
  return Math.min(MAX_FRAME_STEP, Math.max(0, deltaMs) / 1000) * scale;
}
