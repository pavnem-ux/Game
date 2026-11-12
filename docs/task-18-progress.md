# Task 18 — progress

Spec: [task-18-visuals-biomes.md](task-18-visuals-biomes.md) (owner's file; Prettier only added
blank lines and aligned the biome table). Branch `task-18-visuals` from `main` at `b48d25c`
(Task 15 merged). Rendering only: simulation, balance and collisions unchanged. Tasks 16/17 are not
on `main`, so the «Качество графики» setting is new here (step 3.4).

Current: done — PR ready for review (not merged); phone FPS target not met (see below)

Draft PR: https://github.com/pavnem-ux/Game/pull/15

## Checklist

- [x] 0.1 Branch, spec, progress file, draft PR
- [x] 0.2 "Before" screenshots (maps 1, 15, 25, 35; boss phase) and FPS baseline
- [x] 1.1 Texture factory + pools
- [x] 1.2 Player / enemies / elites / bosses
- [x] 1.3 Projectiles, pickups, chests
- [x] Phase 1 tests
- [x] 2.1 Ground
- [x] 2.2 Decor
- [x] 2.3 Particles
- [x] 2.4 Per-map variation / signature
- [x] Phase 2 tests
- [x] 3.1 Darkness overlay + player light
- [x] 3.2 Light sources
- [x] 3.3 Boss phase
- [x] 3.4 Quality setting
- [x] 4.1 Full checks (AGENTS.md §6 + e2e, `test:production`)
- [x] 4.2 "After" screenshots (all quality levels), FPS table
- [x] 4.3 Docs (`VISUALS.md`, README, `playtest.md`)
- [x] 4.4 PR description

## Tools

- `tests/visual-shots.mjs`: arena screenshots of maps 1 (warrior), 15 (mage), 25 (archer), 35
  (rogue) and a map-25 boss phase, 18-enemy group, debug overlay hidden. `SHOT_PREFIX`,
  `SHOT_QUALITY`. Output `artifacts/visuals/`; the "before" set is kept in `docs/visuals/`.
- `tests/visual-fps.mjs`: FPS (average) and p95 frame time over 5 s, desktop 1280×800 and phone
  390×844 with CDP CPU throttling ×4. `FPS_QUALITY`, `FPS_SECONDS`.

## Code map (Task 18)

- `src/engine/visuals/` — pure: `keys.ts` (21 texture keys, `playerTextureKey`, `enemyTextureKey(kind,
role, ranged)`, `playerProjectileKey`, `chestTextureKey`, `textureSize`, `unitScale`, `ART_SCALE`
  2), `art.ts` (one `Draw` per key against the `Pen` subset of Phaser Graphics; dark outlines,
  class/enemy silhouettes in the alpha palette), `pool.ts` (`Pool<T>`: begin/next/end, hides the
  unused rest, grows only). Phaser: `texture-factory.ts` (`buildUnitTextures`: draw once,
  `generateTexture`, idempotent), `UnitRenderer.ts` (pools of shadow / body / flash / glow / item /
  projectile images; `unit()` with idle bob, squash + white flash overlay on hit, elite rim glow /
  boss aura (additive), `item()`, `projectile()` rotated + tinted, `glow()`; `DEPTH` layers: items 3,
  shadows 4, ground graphics 5, glows 5.5, bodies 6 (+y sort), projectiles 7, overlay 8, labels ≥ 10).
- `AlphaScene`: `buildUnitTextures` + `UnitRenderer` + `overlay` graphics in `create()`; `draw()`
  calls `units.begin()` … `units.end()`. Units, dash ghosts, pickups, chests, projectiles are
  sprites; HP bars, marks and stun lines are on `overlay` (above sprites); telegraphs, zones, slow
  rings and elite rings stay on the ground graphics. Death puff fx at the enemy's last drawn
  position (`lastEnemyPos`, updated in place; cleared on start/menu).
- Biomes (2.1–2.4): `render-rng.ts` (mulberry32 `renderRandom`, `mapVisualSeed(mapId)`; never the
  simulation streams), `biomes.ts` (pure: `BIOMES` per act — Лес / Топь / Пепелище / Стужа: palette,
  8 decor keys, particle kind, darkness, signature kinds; `mapLook(mapId)`: hue shift ±14°, brightness
  0.92–1.08, signature feature (clearing / flower ring / bog lake / barrow circle / ruin circle /
  ember rift / frozen lake / ice ring) 420–940 from the centre, 2–3 winding paths; `decorLayout(look,
density)`: 190 × density props, never within 170 of the spawn centre or inside the signature,
  lower density = prefix of the full layout; `shiftColor`). `decor-art.ts` (32 props drawn on a
  `Pen`, base-anchored with baked shadows; `fx-mote`, `fx-fog`). `BiomeRenderer.ts`: `build(mapId,
quality)` (no-op for the same map/quality) — ground tile 256² baked per map (`ground-map-<id>`) as a
  tileSprite, one static graphics for paths + signature + start ring + wall, decor images; `update()`
  culls decor outside the view and moves particles (Float32Array state, wrap around the view):
  fireflies (additive flicker), fog banks (¼ count, faint), ash falling + embers rising, snow. The
  scene builds the sandbox look at create and the map's look at `start()`; `World.ts` stays for the
  prototype.
- Tests: `tests/engine/visual-sprites.test.ts` (keys for every entity type, art for every key on a
  recording pen, pool reuse, same seed ⇒ same results with/without the render-side mapping),
  `tests/engine/visual-biomes.test.ts` (acts → biomes, art for every prop, same map ⇒ same look and
  layout, all 40 maps differ, decor off the spawn centre / signature / edge, density prefix, palette).

- Light (3.1–3.3): `LightRenderer.ts` (render texture × `lightResolution`, filled with the act's
  darkness and erased with `light-radial` stamps — Canvas `destination-out`; Low: `light-vignette`
  image around the player; warm `glow` halo above the darkness; `MAX_LIGHTS` 48 / 24 / 0).
  `AlphaScene.drawLights()`: darkness = biome darkness (+0.12 boss), boss colours `BOSS_DARK`, player
  light 260 × flicker, sources in priority order (telegraphs, enemy shots, boss, chests, player shots,
  zones, skill areas, crystals, coins), accent glows on Высокое only; revive → `cameras.main.flash`
  and darkness fades back over 0.8 s. Depths: darkness 9.5, overlay (HP bars) 9.7, particles 9.6.
- `tint-cache.ts`: baked tinted/white copies (Canvas ignores `setTint`/`setTintFill`); used for glows,
  bolts, particles, halo, hit-flash silhouettes.
- Quality (3.4): `quality.ts` (`QUALITY_PRESETS`, `MAX_LIGHTS`, `defaultQuality(touch)`),
  `UiSettings.graphicsQuality` (default from `(pointer: coarse)`), Settings select «Качество
  графики»; `AlphaScene.applyQuality()` on create and on every settings change.
- Performance changes: unit shadows baked into textures (`drawArt`), `ART_SCALE` 1 (1:1 draws), hit
  flash = body texture swap, view culling, no per-frame depth sort, ≤ 32 free glows, setTexture only
  on change.
- Tests: `tests/engine/visual-quality.test.ts`; campaign e2e expects `graphicsQuality: 'high'`.
- Docs: `docs/VISUALS.md`, README, `playtest.md` §5.7, `docs/visuals/*.jpg` (before / after-<quality>).

## FPS baseline (before, dev server, headless Chromium without GPU — compare relatively)

| Profile               | Scenario | Quality | Enemies alive | FPS         | p95 frame      |
| --------------------- | -------- | ------- | ------------- | ----------- | -------------- |
| desktop 1280×800      | map 40   | n/a     | 80            | 34.6 / 35.2 | 50.0 / 33.4 ms |
| desktop 1280×800      | sandbox  | n/a     | 112           | 47.9 / 46.2 | 33.4 ms        |
| phone 390×844, CPU ×4 | map 40   | n/a     | 79            | 34.0 / 35.7 | 50.1 ms        |
| phone 390×844, CPU ×4 | sandbox  | n/a     | 112           | 27.6 / 28.5 | 66.7 ms        |

(Two runs each. The level-30 mage keeps killing during the window, so "alive" is the count at the
end.)

## FPS — final (2 runs each, same session; `main` served from a worktree on port 5174)

| Profile / scenario            | `main` (before) | High | Medium | Low  |
| ----------------------------- | --------------- | ---- | ------ | ---- |
| desktop 1280×800, map 40      | 40.6            | 41.9 | 40.8   | 41.0 |
| desktop 1280×800, sandbox     | 46.6            | 45.2 | 44.7   | 48.6 |
| phone 390×844 CPU ×4, map 40  | 43.5            | 33.8 | 33.3   | 39.4 |
| phone 390×844 CPU ×4, sandbox | 34.2            | 27.5 | 34.3   | 32.2 |

Desktop: target met. Phone (CPU ×4): **not met** — High/Medium up to ~22% slower on map 40, Low ≈
before (not "noticeably faster"). Investigation (CPU profiles, layer and commit bisects): Phaser
**Canvas** draws each sprite separately (save/restore + drawImage), while the old renderer drew all
units in one Graphics; the Phase 2 commit (sprites + biomes) was already ~8% slower on the phone, the
light layer and glows add the rest. Frame times quantise to vsync (16.7 / 33 ms), so small savings
show as noisy steps. Next step for the owner: WebGL (`Phaser.AUTO`) batches sprites — not measurable
here (headless without GPU; software WebGL ran at 16–21 FPS).

## Decisions

- The game runs on `Phaser.CANVAS`: tints are baked (`TintCache`) so colours match on Canvas and WebGL.
- The Phase 2 commit (`84f7d67`) imported `visuals/quality.ts` without adding it (it was untracked);
  the Phase 3 commit adds it. History was not rewritten.
- Screenshots in `docs/visuals/` are JPEG (q 82): 20 shots in 1.4 MB instead of 9.7 MB of PNG.

- The shot script chooses any open level-up offer before capturing (XP is auto-collected during
  the scripted seconds); the "before" set was retaken that way from the old renderer.

- **120 enemies on map 40 is not reachable:** the campaign caps live enemies at `enemyCap −
reservedSlots` = 80 on map 40, and this task must not change balance. FPS is measured on map 40 at
  its cap **and** in the sandbox at the alpha cap of 120 (≈112 alive while measuring).

## Verification log

- Phase 3/4: typecheck ✓, format ✓, `npm test` 1317 ✓, build ✓, `test:production` 2 PASS, QA +
  `test:qa` PASS, `test:e2e` 3 PASS.

- Phase 2: typecheck ✓, format ✓, `npm test` 1315 ✓, build ✓, `test:e2e` 3 PASS. FPS (no quality
  setting yet): desktop map 40 40.9 / sandbox 49.2; phone ×4 map 40 38.1 / sandbox 26.8.

- Phase 1: typecheck ✓, format ✓, `npm test` 1310 ✓, build ✓, `test:production` 2 PASS, `test:e2e` 3 PASS.
