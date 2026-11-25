# Task 38 — Game Speed up to ×5

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `task-38-game-speed-x5`.
Extends Task 36 (`docs/task-36-game-speed.md`): same player setting, same fixed-step simulation path, more speeds.
The QA time scale stays QA-only (AGENTS §4.10).

## Spec
1. **Speeds:** `GAME_SPEEDS` in `src/engine/time-scale.ts` becomes ×1 (default), ×1.5, ×2, ×3, ×4, ×5. Nothing else
   about the mechanism changes: the scaled frame time still feeds `SimStepper`, the world still advances only in whole
   `SIM_STEP` steps, so the same seed and inputs give identical results at every speed. Saved settings with an old
   value (1 / 1.5 / 2) stay valid; an unknown value still falls back to ×1.
2. **Step cap:** `MAX_STEPS_PER_FRAME` (120) was sized for ×2 × QA ×8. At ×5 a capped frame needs 30 steps, and ×5 ×
   QA ×8 needs 240. Raise the cap so production ×5 is never clamped, and make sure time above the cap is dropped
   instead of piling up in `pending` (today `pending - n` keeps the excess, so a long clamp would build a backlog the
   game then keeps catching up on). Production must never run more than one capped frame's worth of steps per frame.
3. **HUD button** (`GameSpeedButton`, `src/gameplay-ui/GameSpeed.tsx`): cycles ×1 → ×1.5 → ×2 → ×3 → ×4 → ×5 → ×1.
   The highlighted style in `src/gameplay-ui/alpha.css` currently lists only `data-speed='1.5'` and `'2'`: apply it to
   every speed above ×1. Keep the mouse-down focus guard.
4. **Pause menu and Settings** (`GameSpeedChoice`): show all six options. They must fit the pause panel and Settings
   without overflowing: one row if it fits, otherwise wrap into two neat rows (no horizontal scroll). Don't redesign
   the control.
5. Unchanged from Task 36: paused / level-up offer / revive / results stay frozen at any speed; the run timer shows
   simulation time; music at normal speed, sound effects follow game events; rewards, XP and Gold are the same for the
   same seed and inputs; bug reports include the speed (already done — just check new values come through).
6. **Docs:** update the speed list in the comments of `time-scale.ts` / `GameSpeed.tsx` / `ui-settings.ts` and the
   Task 36 line in `docs/PLAYABLE_COMBAT_ALPHA.md` (×1 … ×5). No new doc.

## Verification
- Extend the existing determinism test `tests/engine/game-speed.test.ts` to the new speeds. No other new tests.
- In the final report, list anything you found that does not scale with the speed (real-time timers, tweens etc.).
