# Task 18 — Visual Pass: Light, Biomes, Sprites

Repo: pavnem-ux/Game. Base: latest `main` with Task 15 merged. Branch `task-18-visuals`.
Progress: `docs/task-18-progress.md`. Rendering only — simulation, balance and collisions unchanged.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from
   the first unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 18: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md: PR to `main`, never
   merge; Phaser/React only render; original procedural art only (code-generated textures, no image
   files from elsewhere, no CDN); no new runtime dependencies; allocation-free `update` hot loops.
4. Visual randomness uses a render-only RNG seeded from the map id — never the simulation RNG streams.
   Same map ⇒ same look; simulation results identical with any visual setting.
5. Read `src/engine/AlphaScene.ts` and `docs/task-*-progress.md` code maps first; don't re-explore.

## 1. Spec

### 1.1 Quality setting

«Качество графики»: Высокое / Среднее / Низкое (persisted with settings; if Task 16 already added it,
reuse it). Controls light resolution, particle counts, decor density, glow. Default Высокое on desktop,
Среднее on touch devices.

### 1.2 Light («Последний свет»)

- Darkness overlay over the arena (act-dependent strength) with a warm soft light circle around the
  player (radius ~260, gentle flicker).
- Light sources: player projectiles, XP crystals, coins, chests, fire/ice skills, telegraphs, bosses.
- Boss phase: light shifts redder, darkness deepens, boss aura. Revive: brief bright flash.
- Telegraphs and enemy projectiles must stay clearly visible in darkness (they emit their own light).
- Low quality: cheap radial gradient instead of a light texture.

### 1.3 Biomes per act (generated once per map, then static)

| Act | Ground palette         | Decor                                       | Ambient particles |
| --- | ---------------------- | ------------------------------------------- | ----------------- |
| I   | moss green, dirt paths | trees, bushes, mushrooms, flowers           | fireflies         |
| II  | murky teal, puddles    | bog tufts, bones, barrow stones             | low fog           |
| III | ash grey, cracks       | ruins, broken columns, glowing ember cracks | ash, embers       |
| IV  | dark ice blue          | ice crystals, dead trees, frozen stones     | snow              |

- Ground: tiled procedural texture (noise patches, paths) baked into a render texture at map start.
- Decor: 8–12 code-drawn props per act baked to textures once; scattered with the map seed (density by
  quality), non-colliding, kept away from the arena centre spawn point.
- Each map gets a hue/variation shift + one signature feature from its seed (e.g. clearing, ruin circle,
  frozen lake drawn on the ground), so all 40 maps look different.

### 1.4 Sprites instead of per-frame shapes

- Player (4 classes), all enemy types, elites, bosses, projectiles, pickups, chests: draw each look once
  into textures at boot; render with pooled sprites (no per-frame Graphics redraw for units).
- Distinct silhouettes per class/enemy type (keep current colours as the base), outline for readability,
  ellipse shadow, idle bob, squash on hit, existing hit flash, death puff. Elites: rim glow; bosses:
  larger with aura.
- Keep HP bars, names, stun labels, damage numbers and telegraph shapes readable above the new art.

### 1.5 Performance

- Measure FPS (debug overlay) at 120 enemies, map 40, before and after, desktop + Chromium CPU-throttled
  mobile profile, each quality level. Target: not slower than before at any level; Низкое noticeably faster.

## 2. Phases

- **0 Setup:** branch, progress file, draft PR; "before" screenshots (maps 1, 15, 25, 35; boss phase) and
  FPS baseline.
- **1 Sprites:** 1.1 texture factory + pools; 1.2 player/enemies/elites/bosses; 1.3 projectiles, pickups,
  chests. Tests: texture keys exist for every entity type; pools reuse objects; no simulation change
  (same seed ⇒ same results with old vs new renderer).
- **2 Biomes:** 2.1 ground; 2.2 decor; 2.3 particles; 2.4 per-map variation/signature. Tests: same map ⇒
  same decor layout; different maps differ; decor excluded from the spawn centre.
- **3 Light:** 3.1 overlay + player light; 3.2 light sources; 3.3 boss phase. 3.4 quality setting.
- **4 Delivery:** full checks from AGENTS.md §6 (+ e2e, `test:production`); "after" screenshots (same
  shots, all quality levels); FPS table; docs `docs/VISUALS.md`, README, visual checks in `docs/playtest.md`
  (Russian: readability of telegraphs/projectiles in darkness). PR description; don't merge.
