# Task 36 — progress

Spec: [task-36-game-speed.md](task-36-game-speed.md). Branch `task-36-game-speed`.

PR: https://github.com/pavnem-ux/Game/pull/34

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Core: speeds ×1 / ×1.5 / ×2 on the simulation-time path, persisted setting, same results at every speed (test)
- [x] 2 UI: HUD button next to the timer (cycles), pause menu and Settings «Game speed»
- [ ] 3 Bug report includes the speed; QA time scale still absent from production (check)
- [ ] 4 Delivery: final checks, README line, PR

## Decisions / blockers

- Speeds live in `src/engine/time-scale.ts` (`GAME_SPEEDS`, `nextGameSpeed`); the setting is
  `uiSettings.gameSpeed` (own localStorage key, never the save), read every frame, so a run starts —
  and continues — at the saved choice. The QA time scale multiplies on top only in DEV / QA builds.
- Determinism (owner decision after a finding): with the spec's plain scaled frame step, enemy
  steering rounded floats differently at bigger steps (~1e-4 px), which over ~60 s could flip a hit.
  The scene now feeds the world fixed `SIM_STEP` = 1/120 s steps from an accumulator (`SimStepper`;
  ×2 = twice the steps per frame; ≤ 120 steps per frame). Same seed + inputs ⇒ bit-identical at
  ×1 / ×1.5 / ×2 (and at any frame rate): `tests/engine/game-speed.test.ts`, 4 classes × 60 s.
- UI (`src/gameplay-ui/GameSpeed.tsx`): `GameSpeedButton` in the HUD timer block (shows ×1 / ×1.5 /
  ×2, cycles; mouse-down does not take focus) and `GameSpeedChoice` (×1 / ×1.5 / ×2 radio group) in the
  pause dialog and Settings → Game, with a hint. Checked in the dev build: ×1 / ×1.5 / ×2 advance
  0.99 / 1.48 / 1.98 simulation s per real s; the pause stays frozen when the choice changes there;
  the choice survives a reload. On short / narrow screens the Task 16 CSS hides the HUD timer block,
  and with it the button (mobile is frozen); the pause menu and Settings still offer the choice.
