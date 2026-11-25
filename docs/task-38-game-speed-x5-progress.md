# Task 38 (game speed ×5) — progress

Spec: [task-38-game-speed-x5.md](task-38-game-speed-x5.md). Branch `task-38-game-speed-x5`.

PR: https://github.com/pavnem-ux/Game/pull/38

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Core: speeds ×1 … ×5, step cap raised, excess time above the cap dropped (determinism test)
- [x] 2 UI: HUD button cycle + highlight for every speed above ×1; six options fit pause / Settings
- [x] 3 Delivery: comments, PLAYABLE_COMBAT_ALPHA line, final checks, PR

## Decisions / blockers

- The task number 38 is also used by the open map-activities PR (#37, `docs/task-38-progress.md`);
  this progress file has its own name so the two never conflict.
- Step cap 120 → 240 (×5 × QA ×8 × the 0.05 s frame cap); production ×5 needs ≤ 30 steps per frame.
  When a frame is clamped, the whole steps above the cap are dropped (only the fraction of a step
  carries over). Determinism test: 4 classes × 60 s, bit-identical at all six speeds (input every
  1 s = 120 steps, whole frames at every speed); its timeout is 60 s (six runs per class).
- UI: highlight via `:not([data-speed='1'])`; the options are a 6-column grid that becomes 3 + 3
  under a 400 px container (pause column 260 px → two rows; Settings → one row). Checked in the dev
  build at 1440 and 1024 px: no overflow, no horizontal scroll; ×1 … ×5 advance 1.0 / 1.5 / 2.0 /
  3.0 / 4.1 / 5.0 simulation s per real s; pause at ×5 stays frozen.
- Fix found while checking: the HUD publish throttle counted scaled time, so React would get ~50
  snapshots/s at ×5 (AGENTS §4.9 wants ~10 Hz); it now counts real frame time.
- Real-time (not scaled) by design: synergy toasts (2.5 s), camera shake, pet follow smoothing,
  biome ambience, music. Simulation-time (shorter in real time at high speed): damage numbers, hit
  flashes, VFX, hit-stop, HUD toasts / chest popups / elite banner (`world.time` windows).
