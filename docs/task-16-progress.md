# Task 16 — progress

Spec: [task-16-mobile-browsers.md](task-16-mobile-browsers.md) (owner's file; Prettier only added
blank lines). Branch `task-16-mobile` from `main` at `6d89106` (Tasks 14, 15 and 18 merged: the
«Качество графики» setting from Task 18 is reused and extended here). Gameplay balance unchanged.

Current: Phase 1 (touch input)

Draft PR: (pending)

## Checklist

- [x] 0.1 Branch, spec, progress file, draft PR, baseline screenshots + FPS
- [ ] 1.1 Joystick → input sample
- [ ] 1.2 Dash / pause buttons, multi-touch, «Левша», haptics
- [ ] Phase 1 tests
- [ ] 2.1 Canvas / DPR, safe areas, orientation notice, gesture blocking, fullscreen
- [ ] 2.2 Responsive menus and HUD
- [ ] Phase 2 e2e (mobile emulation with touch)
- [ ] 3.1 Browser compatibility fixes
- [ ] 3.2 Quality setting extension + FPS in the debug overlay
- [ ] Phase 3 FPS table
- [ ] 4.1 Full checks (AGENTS.md §6 + e2e, `test:production`)
- [ ] 4.2 Docs (`MOBILE.md`, README, `playtest.md`)
- [ ] 4.3 PR description

## Tools

- `tests/mobile-shots.mjs`: menu + in-run screenshots at 390×844, 844×390, 768×1024, 1280×720 with
  touch emulation (`SHOT_PREFIX`). Output `artifacts/mobile/`; the before set is in `docs/mobile/`
  (JPEG).
- `tests/visual-fps.mjs` (Task 18) gains a landscape phone profile `phone 844×390 landscape, CPU ×4`
  (`FPS_PROFILES="phone 844"`).

## Baseline (before)

Screenshots: `docs/mobile/before-*.jpg`. Observations: on a landscape phone the page header, footer
and the large HUD take most of the height; the arena is a strip. Portrait menus stack but the hub
nav is cramped; the 1024 px minimum from Task 13 forces scaling on tablets.

FPS (dev server, headless Chromium without GPU, CPU ×4, 8 s; compare relatively):

| Profile                 | Scenario            | High | Medium | Low  |
| ----------------------- | ------------------- | ---- | ------ | ---- |
| phone 390×844           | map 40 (80 enemies) | 26.3 | 32.6   | 31.8 |
| phone 390×844           | sandbox (≈112)      | 26.3 | 32.1   | 27.4 |
| phone 844×390 landscape | map 40 (80 enemies) | 30.3 | 30.2   | 34.0 |
| phone 844×390 landscape | sandbox (≈112)      | 23.0 | 24.9   | 30.1 |

## Decisions

- Map 40 holds at most 80 enemies (campaign cap); 120-enemy numbers come from the sandbox (as in
  Task 18).

## Verification log
