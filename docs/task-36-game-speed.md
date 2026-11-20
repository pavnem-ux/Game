# Task 36 — Player Game Speed (×1 / ×1.5 / ×2)

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `task-36-game-speed`.
Owner-approved feature: a production speed control. The QA time-scale controls stay QA-only (AGENTS §4.10) — do not
expose them; build a separate player setting on the same simulation-time path.

## Spec
- Speeds: ×1 (default), ×1.5, ×2. Scales the simulation time advanced per real frame (same mechanism as the QA
  time scale: GameplayWorld still advances through boundaries; large steps stay exact). Everything in the run speeds
  up together: movement, enemies, cooldowns, timers, spawns, chests, activities. Rewards, XP, Gold and outcomes are
  unchanged for the same seed and inputs (simulation-time based) — test it.
- Controls: a compact button in the in-run HUD (top, next to the timer) cycling ×1 → ×1.5 → ×2 → ×1, and the same
  choice in the pause menu and Settings («Game speed»). Persist the last choice in settings (not in the save profile);
  each run starts at the saved speed.
- While paused, on the level-up offer, revive prompt or results the game stays frozen as now (speed has no effect).
- The run timer shows simulation time (as now); the speed button shows the current multiplier.
- Music plays at normal speed; sound effects follow game events (no pitch change). Screen shake/VFX durations use
  real time where they already do.
- Bug reports include the current speed.
- Tests: same seed + same inputs ⇒ identical results at ×1, ×1.5, ×2; speed setting persists; QA time scale still
  absent from the production build.
