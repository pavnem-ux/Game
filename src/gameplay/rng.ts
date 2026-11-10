import type { RandomSource } from '../combat-core';

/**
 * Task 08.5 §4.1 seeded RNG module: every gameplay random draw comes from one of these streams,
 * all derived from the run's base seed. The formulas are exactly the ones `GameplayWorld` used
 * inline before (Tasks 06–08), so existing seeds reproduce identical runs.
 *
 * Streams (separate so adding draws to one never shifts another):
 * - `combat`: Combat Core crit/Dodge rolls and status-effect application chances;
 * - `skills`: level-up card offers, rerolls and skill procs;
 * - `spawn`:  enemy spawn positions/angles (enemy kinds, drops and boss ability order are
 *             deterministic and need no randomness).
 * No wall-clock time or Math.random here (AGENTS.md §4.5).
 */
export const DEFAULT_SEED = 1337;
export const STREAM_SALTS = Object.freeze({
  skills: 0x5bd1e995,
  spawn: 0x9e3779b9,
  /** Task 09.1: talent procs (a new stream, so existing sequences stay identical). */
  talents: 0x27d4eb2f,
});
/** Largest seed a run can be started with from the UI (32-bit unsigned). */
export const MAX_UI_SEED = 0xffffffff;

export function validateSeed(seed: number): number {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('Invalid random seed.');
  return seed;
}
/** 32-bit LCG (Numerical Recipes constants), values in [0, 1). */
export function lcgStream(initialState: number): RandomSource {
  let state = initialState;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export interface RunRandom {
  readonly seed: number;
  readonly combat: RandomSource;
  readonly skills: RandomSource;
  readonly spawn: RandomSource;
  readonly talents: RandomSource;
}
export function createRunRandom(seed: number = DEFAULT_SEED): RunRandom {
  validateSeed(seed);
  return Object.freeze({
    seed,
    combat: lcgStream(seed),
    skills: lcgStream((seed ^ STREAM_SALTS.skills) >>> 0),
    spawn: lcgStream(seed ^ STREAM_SALTS.spawn),
    talents: lcgStream((seed ^ STREAM_SALTS.talents) >>> 0),
  });
}
