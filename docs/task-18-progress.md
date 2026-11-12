# Task 18 — progress

Spec: [task-18-visuals-biomes.md](task-18-visuals-biomes.md) (owner's file; Prettier only added
blank lines and aligned the biome table). Branch `task-18-visuals` from `main` at `b48d25c`
(Task 15 merged). Rendering only: simulation, balance and collisions unchanged. Tasks 16/17 are not
on `main`, so the «Качество графики» setting is new here (step 3.4).

Current: Phase 1 (sprites)

Draft PR: https://github.com/pavnem-ux/Game/pull/15

## Checklist

- [x] 0.1 Branch, spec, progress file, draft PR
- [x] 0.2 "Before" screenshots (maps 1, 15, 25, 35; boss phase) and FPS baseline
- [ ] 1.1 Texture factory + pools
- [ ] 1.2 Player / enemies / elites / bosses
- [ ] 1.3 Projectiles, pickups, chests
- [ ] Phase 1 tests
- [ ] 2.1 Ground
- [ ] 2.2 Decor
- [ ] 2.3 Particles
- [ ] 2.4 Per-map variation / signature
- [ ] Phase 2 tests
- [ ] 3.1 Darkness overlay + player light
- [ ] 3.2 Light sources
- [ ] 3.3 Boss phase
- [ ] 3.4 Quality setting
- [ ] 4.1 Full checks (AGENTS.md §6 + e2e, `test:production`)
- [ ] 4.2 "After" screenshots (all quality levels), FPS table
- [ ] 4.3 Docs (`VISUALS.md`, README, `playtest.md`)
- [ ] 4.4 PR description

## Tools

- `tests/visual-shots.mjs`: arena screenshots of maps 1 (warrior), 15 (mage), 25 (archer), 35
  (rogue) and a map-25 boss phase, 18-enemy group, debug overlay hidden. `SHOT_PREFIX`,
  `SHOT_QUALITY`. Output `artifacts/visuals/`; the "before" set is kept in `docs/visuals/`.
- `tests/visual-fps.mjs`: FPS (average) and p95 frame time over 5 s, desktop 1280×800 and phone
  390×844 with CDP CPU throttling ×4. `FPS_QUALITY`, `FPS_SECONDS`.

## FPS baseline (before, dev server, headless Chromium without GPU — compare relatively)

| Profile               | Scenario | Quality | Enemies alive | FPS         | p95 frame      |
| --------------------- | -------- | ------- | ------------- | ----------- | -------------- |
| desktop 1280×800      | map 40   | n/a     | 80            | 34.6 / 35.2 | 50.0 / 33.4 ms |
| desktop 1280×800      | sandbox  | n/a     | 112           | 47.9 / 46.2 | 33.4 ms        |
| phone 390×844, CPU ×4 | map 40   | n/a     | 79            | 34.0 / 35.7 | 50.1 ms        |
| phone 390×844, CPU ×4 | sandbox  | n/a     | 112           | 27.6 / 28.5 | 66.7 ms        |

(Two runs each. The level-30 mage keeps killing during the window, so "alive" is the count at the
end.)

## Decisions

- **120 enemies on map 40 is not reachable:** the campaign caps live enemies at `enemyCap −
reservedSlots` = 80 on map 40, and this task must not change balance. FPS is measured on map 40 at
  its cap **and** in the sandbox at the alpha cap of 120 (≈112 alive while measuring).

## Verification log
