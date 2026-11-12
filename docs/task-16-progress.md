# Task 16 — progress

Spec: [task-16-mobile-browsers.md](task-16-mobile-browsers.md) (owner's file; Prettier only added
blank lines). Branch `task-16-mobile` from `main` at `6d89106` (Tasks 14, 15 and 18 merged: the
«Качество графики» setting from Task 18 is reused and extended here). Gameplay balance unchanged.

Current: Phase 4 (delivery)

Draft PR: https://github.com/pavnem-ux/Game/pull/16

## Checklist

- [x] 0.1 Branch, spec, progress file, draft PR, baseline screenshots + FPS
- [x] 1.1 Joystick → input sample
- [x] 1.2 Dash / pause buttons, multi-touch, «Левша», haptics
- [x] Phase 1 tests
- [x] 2.1 Canvas / DPR, safe areas, orientation notice, gesture blocking, fullscreen
- [x] 2.2 Responsive menus and HUD
- [x] Phase 2 e2e (mobile emulation with touch)
- [x] 3.1 Browser compatibility fixes
- [x] 3.2 Quality setting extension + FPS in the debug overlay
- [x] Phase 3 FPS table
- [ ] 4.1 Full checks (AGENTS.md §6 + e2e, `test:production`)
- [ ] 4.2 Docs (`MOBILE.md`, README, `playtest.md`)
- [ ] 4.3 PR description

## Tools

- `tests/mobile-shots.mjs`: menu + in-run screenshots at 390×844, 844×390, 768×1024, 1280×720 with
  touch emulation (`SHOT_PREFIX`). Output `artifacts/mobile/`; the before set is in `docs/mobile/`
  (JPEG).
- `tests/visual-fps.mjs` (Task 18) gains a landscape phone profile `phone 844×390 landscape, CPU ×4`
  (`FPS_PROFILES="phone 844"`).

## Code map (Task 16)

- Touch input (1.1): `src/engine/touch-input.ts` (pure): `JOYSTICK` (60 px full speed, 10% dead
  zone), `joystickVector`, `keyboardVector`, `movementInput` (active joystick outside its dead zone
  wins), `inJoystickZone` (left half below the top 30%; right half for «Левша»). `AlphaScene.update`
  builds one vector from keys + joystick and calls `world.setMovement` before `world.update` — the
  same input-sample path for both. The joystick stores its origin in canvas px and the offset in CSS
  px; only its own pointer releases it (multi-touch).
- Touch controls (1.2): `TouchControls.tsx` (dash button 84 px, conic cooldown ring, bottom right /
  left for «Левша», touch devices only), bridge command `dash` → `world.requestDash()` (same as
  Space/Shift). `touch.ts`: `isTouchDevice` / `useTouchDevice` (coarse pointer or first touch),
  `pulse()` and `hapticFrame()` (dash 12 ms, level-up 25 ms; scene calls it next to `soundFrame`).
  Settings `leftHanded`, `haptics` (UiSettings; Settings page «Сенсорное управление»).
- DPR (2.1): `AlphaCanvas` sizes the canvas to CSS × DPR (DPR ≤ quality `dprCap`: 2 / 1.5 / 1),
  `Phaser.Scale.NONE` + zoom 1/DPR, ResizeObserver + settings subscription, `registry.dpr`. The scene
  zooms the main camera by DPR and gives the world the CSS viewport (`cssViewport()`), so spawning
  and simulation are unchanged. `screen-space.ts` (`pinToScreen`, `screenToZoomed`) keeps joystick,
  hit vignette and the light map in canvas pixels under the zoom; `LightRenderer` maps world → light
  map with `zoom × resolution`.
- Device chrome (2.1): `DeviceChrome.tsx`: `OrientationNotice` (portrait phone ≤ 600 px during a
  run: «Поверните устройство», pauses the run), `FullscreenButton` (Fullscreen API incl. webkit
  prefix; hidden where missing), `useBlockGestures` (iOS gesture events, multi-finger canvas moves);
  arena `contextmenu` blocked; `viewport-fit=cover`.
- Layout (2.2, `alpha.css` Task 16 blocks): shell `100vh` → `100dvh`, no min-height; safe-area
  offsets for HUD and bottom HUD; outer header/footer hidden on phones (≤ 760 px wide or ≤ 560 px
  high); compact HUD for short screens (text ≥ 12 px); coarse pointers: 44 px targets in menus and
  in-run dialogs; menu nav = one horizontally scrolling row (own row on portrait phones, active item
  scrolled into view by `CampaignMenu`); skill-bar dash pill hidden on touch (the big button
  replaces it).
- Tests: `tests/engine/touch-input.test.ts`; `tests/mobile-browser.mjs` (in `npm run test:e2e`):
  joystick, dash button = Space, multi-touch; at 844×390 and 768×1024 a run from the hub, move,
  dash, card pick by tap, results, every menu screen without horizontal scroll, tap targets ≥ 44
  px. Alpha e2e: portrait shows the rotate notice and pauses; landscape joystick.

- Browsers (3.1): audio unlock also on `touchend` (iOS), `engine.setHidden()` suspends/resumes
  the AudioContext on `visibilitychange` (and resumes from iOS `interrupted`); Phaser already pauses
  its loop and rendering on a hidden tab, the scene pauses the run. Equipment hover uses pointer
  events (mouse only). `-webkit-backdrop-filter` next to every `backdrop-filter`; plain fallbacks
  before every `color-mix()`; `100vh` before `100dvh`. Vite `build.target`: es2020, chrome111,
  edge111, firefox114, safari16.4, ios16.4. Private mode / unavailable storage: existing Task 08 save
  warning.
- Quality (3.2): `QUALITY_PRESETS` gains `dprCap` (2 / 1.5 / 1) and `damageNumbers` (40 / 24 / 12);
  `FloatingNumbers.setLimit()` (pool unchanged, no allocation); `applyQuality()` applies both. FPS
  is in the debug overlay (Task 08.5). Touch devices default to Среднее (Task 18).
- Tests: `tests/engine/mobile-quality.test.ts` (caps, setLimit, DPR helpers, simulation identical
  at every quality level).

## FPS — Phase 3 (side by side with `main`, same session)

`tests/visual-fps.mjs`, phone 844×390 landscape, CPU ×4, 8 s, two rounds averaged, `main` served
from a worktree at the same time. The machine was much more loaded than at Phase 0 (`main` itself
fell from ~30 to ~15 FPS), so only the side-by-side comparison is meaningful; absolute numbers say
nothing about a real phone.

| Quality                            | `main` map 40 (80) | branch map 40 (80) | `main` sandbox (≈114) | branch sandbox (≈114) |
| ---------------------------------- | ------------------ | ------------------ | --------------------- | --------------------- |
| Низкое (DPR 1)                     | 16.5               | 16.2               | 14.6                  | 16.3                  |
| Среднее (DPR ≤ 1.5, touch default) | 15.8               | 18.3               | 14.9                  | 16.5                  |
| Высокое (DPR ≤ 2)                  | 14.1               | 10.8               | 13.8                  | 11.9                  |

Низкое/Среднее: equal or better than before while the arena now fills the screen. Высокое is
slower because it renders at DPR 2 (4× pixels, sharper). The ≥ 50 FPS mid-range-phone target cannot
be verified here (headless Chromium, no GPU, shared CPU) — it needs a real device (playtest).

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

- Phones are measured in landscape: portrait shows the rotate notice and pauses the run.

- Desktop is unchanged except the dash button and coarse-pointer target sizes, which only appear on
  touch devices; the mouse-drag joystick that already existed on desktop stays.
- «Поверните устройство» pauses the run (it would otherwise keep running behind the notice).
- Menus on phones hide the outer page header/footer (the menu has its own brand bar).

- Map 40 holds at most 80 enemies (campaign cap); 120-enemy numbers come from the sandbox (as in
  Task 18).

## Verification log

- Phases 1–2: typecheck ✓, format ✓, `npm test` 1322 ✓, build ✓, `test:production` 2 PASS,
  `test:e2e` 4 PASS (incl. mobile).
