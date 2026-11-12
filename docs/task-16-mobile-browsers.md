# Task 16 — Mobile & Cross-Browser Support

Repo: pavnem-ux/Game. Base: latest `main` with Task 14 (dash, audio) merged. Branch `task-16-mobile`.
Progress: `docs/task-16-progress.md`.
Goal: the game is fully playable on phones/tablets (touch) and on current Chrome, Safari (macOS/iOS),
Firefox and Edge, at any reasonable screen size.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from
   the first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 16: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md: PR to `main`, never
   merge; touch input must enter the simulation through the same input-sample path as keyboard
   (determinism). No new runtime dependencies, no CDN. Gameplay balance unchanged.
4. Reuse code maps; don't re-explore.
5. Player text in Russian; UI uses the Task 13 kit.

## 1. Spec

### 1.1 Touch controls (shown only on touch devices; desktop unchanged)

- Floating virtual joystick: appears where the thumb touches the left half of the screen; analog
  direction; dead zone 10%; full speed at 60 px from the origin.
- Dash button (bottom right, ≥ 72 px, thumb-reachable) with the cooldown ring; tap = same dash as
  Space/Shift.
- Pause button (top corner). Level-up cards, reroll/banish/skip, revive and results buttons are large
  tap targets (≥ 44 px). Multi-touch: joystick and dash work simultaneously.
- Optional setting «Левша»: mirror joystick and dash sides.
- Light haptic on dash/level-up where supported (`navigator.vibrate`), toggle in settings.

### 1.2 Layout & screens

- Responsive from 360×640 (phone) to 2560×1440. Landscape is the play orientation on phones: in
  portrait show «Поверните устройство» during a run (menus work in both).
- Remove the 1024 px minimum from Task 13; menus reflow (map path, talents, equipment, shop) for small
  screens; no horizontal page scroll; respect safe areas (`env(safe-area-inset-*)`, notches).
- Game canvas scales to fit with correct device-pixel ratio (cap DPR at 2 for performance); HUD scales
  and stays readable (min 12 px text).
- Prevent page zoom/scroll/pull-to-refresh/long-press menus during play; fullscreen button where the
  Fullscreen API exists; use `100dvh` with fallbacks (iOS Safari).

### 1.3 Browsers

- Targets: last 2 versions of Chrome, Edge, Firefox, Safari (macOS + iOS), Chrome Android.
- Fix known issues: AudioContext unlock on first touch (iOS), `visibilitychange` → auto-pause and audio
  suspend, pointer events instead of mouse-only handlers, localStorage unavailable/private mode warning
  (existing save rules), no unsupported CSS without fallback.
- Vite build target compatible with the list above.

### 1.4 Performance (mid-range phone)

- Target ≥ 50 FPS at 120 enemies on a mid-range phone profile. Reuse the «Качество графики» setting
  from Task 18 if present (otherwise add it: Высокое/Среднее/Низкое); extend it with damage numbers cap
  and DPR cap. Auto-pick Среднее on touch devices. Simulation results identical across quality levels.
- Pause rendering-heavy effects when the tab is hidden.

## 2. Phases

### Phase 0 — Setup

- 0.1 Branch from `main`, progress file, draft PR. Baseline screenshots at 390×844, 844×390, 768×1024,
  1280×720 (Chromium device emulation with touch).

### Phase 1 — Touch input

- 1.1 Joystick → input sample. 1.2 Dash/pause buttons, multi-touch, «Левша», haptics.
- Tests: joystick vectors (dead zone, clamp); same input sequence via keyboard and touch ⇒ identical
  simulation; dash via button = dash via key.

### Phase 2 — Layout

- 2.1 Canvas/DPR scaling, safe areas, orientation notice, gesture blocking, fullscreen.
- 2.2 Responsive menus and HUD.
- e2e (Chromium mobile emulation with touch): start a map, move, dash, pick a card, finish via debug,
  open each menu screen — at 390×844 landscape and 768×1024.

### Phase 3 — Browsers & performance

- 3.1 Compatibility fixes (1.3). 3.2 Quality setting + FPS measurement in debug overlay.
- Record FPS on Chromium CPU-throttled mobile profile at 120 enemies for each quality level.

### Phase 4 — Delivery

- 4.1 Full checks from AGENTS.md §6 (+ e2e, `test:production`).
- 4.2 Docs: `docs/MOBILE.md`, README; `docs/playtest.md` (Russian) gets a checklist for the owner to run
  on real devices: iPhone Safari, Android Chrome, iPad, desktop Safari/Firefox/Edge (sandbox can't test
  real devices or non-Chromium browsers — say so in the PR).
- 4.3 PR description: before/after screenshots, FPS table, test/build results, untested browsers.
  Don't merge.
