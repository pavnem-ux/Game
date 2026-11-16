# Task 25 — progress

Spec: [task-25-art-pack-1.md](task-25-art-pack-1.md) (owner's file, kept verbatim). Branch
`task-25-art`, created from the latest `main` (Tasks 22–24 merged). Input: the owner's
`art-pack-1.zip` (17 WebP files, `manifest.json`, `ART_PROVENANCE.md`), unpacked byte-identical to
`public/assets/…` and `docs/ART_PROVENANCE.md`. Rendering only: hitboxes, simulation and balance
are unchanged.

Current: Phase 1 done — next: Phase 2 (in-run sprites)

Draft PR: https://github.com/pavnem-ux/Game/pull/23

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR, "before" screenshots
- [x] 1 Pipeline
  - [x] 1.1 Files under `public/assets/`, `docs/ART_PROVENANCE.md`, AGENTS.md §4.12 (owner decision)
  - [x] 1.2 Manifest loader and asset registry with procedural fallback; tests
- [ ] 2 In-run sprites: players, enemies, elites, thief, nest; size/anchor/flip; effects kept; tests
- [ ] 3 Portraits: character select + hub
- [ ] 4 Delivery: full checks, e2e desktop/mobile, `test:production`, FPS at 120 enemies, "after"
      screenshots (incl. every enemy type on all four biome grounds), README, PR

## Pack contents (checked in Phase 0)

| Group      | Files                                                                                                                               | Size      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Characters | `player_{warrior,mage,archer,rogue}` (256 px)                                                                                       | 56 KB     |
| Enemies    | `enemy_{melee,ranged,swift_imp,bombard_warlock,treasure_thief}` (256 px), `enemy_stone_troll`, `elite_*` ×2, `nest_blight` (384 px) | 269 KB    |
| Portraits  | `portrait_{warrior,mage,archer,rogue}` (768 px)                                                                                     | 433 KB    |
| Total      | 17 WebP + `manifest.json`                                                                                                           | ≈ 0.76 MB |

All 17 manifest keys have a file, and every file has a manifest key. The total is under the 1 MB
budget.

## Decisions

- **Owner files kept byte-identical.** `public/assets/` (manifest + images),
  `docs/ART_PROVENANCE.md` and the spec are in `.prettierignore`, so future packs can be dropped in
  with the same manifest format.
- **Facing (for Phase 2).** Most unit sprites face right as the spec assumes. Two exceptions seen
  on the contact sheet: `enemy_treasure_thief` runs toward the left, and `enemy_bombard_warlock`
  faces the viewer. The size/anchor config table will carry a per-key "faces left" flag so the
  thief still looks where it runs; a front-facing sprite simply flips like the others.
- **"Before" screenshots.** `tests/art-screens.mjs <tag>` (not part of `test:e2e`; needs a dev
  server) writes `docs/art-pack-1/<tag>-*.jpg`: hub and character select on desktop 1280×720 and
  phone 844×390, map 1 with the five enemy types, and map 25 with the five types, both elite
  profiles (reached through the normal campaign schedule), the treasure thief and the blight nest.
  The same script produces the "after" set in Phase 4.
- **Missing reference.** `ART_PROVENANCE.md` points to `docs/art-assets-list.md` and a future
  `docs/art-prompts.txt`; neither is in the pack or the repo. They are the owner's to add.
- **Pipeline (Phase 1).** Three small modules in `src/engine/visuals/`:
  - `art-manifest.ts` (pure): parses and validates the manifest — key = file name without
    extension, `assets/…/<key>.webp|png` only (no URLs, no `..`), size 1–2048 px, anchor
    `bottom-center` | `center`, no duplicate keys (checked on the raw text, since `JSON.parse` keeps
    the last duplicate silently) and no file used twice. Every problem is listed at once.
  - `art-registry.ts` (pure): look → art key table (`UNIT_ART`, one place to edit), portrait keys,
    and `ArtRegistry.texture(look)`, which returns `art:<key>` only once that image has loaded and
    otherwise the Task 18 procedural texture. Lookups allocate nothing (safe in the render loop).
    Bosses, items, projectiles, pets and chests have no art entry and keep their procedural look.
  - `art-pack.ts` fetches the manifest once per page (shared with the portraits in Phase 3);
    `art-loader.ts` queues the 13 unit images in Phaser's loader.
- **Loading without blocking.** The Phaser game is created with the menu, so the art loads in the
  background as soon as the scene is created, with a thin progress bar at the bottom of the canvas.
  The scene does not wait in `preload()`: its command bridge subscribes in `create()`, and a
  "Start run" sent during a blocking preload would be lost. A run started before the images arrive
  shows the procedural looks and switches when they land (from the HTTP cache this is a few
  frames). A missing / invalid manifest or a failed image logs one warning and keeps the
  procedural look. Portraits (433 KB) are not loaded by the scene; the menus load them as images.
  Measured in Chromium: the manifest and all 13 unit images load with 200; the only 404 on the page
  is the browser's automatic `/favicon.ico`, which existed before this task.
