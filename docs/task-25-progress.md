# Task 25 — progress

Spec: [task-25-art-pack-1.md](task-25-art-pack-1.md) (owner's file, kept verbatim). Branch
`task-25-art`, created from the latest `main` (Tasks 22–24 merged). Input: the owner's
`art-pack-1.zip` (17 WebP files, `manifest.json`, `ART_PROVENANCE.md`), unpacked byte-identical to
`public/assets/…` and `docs/ART_PROVENANCE.md`. Rendering only: hitboxes, simulation and balance
are unchanged.

Current: Phase 3 done — next: Phase 4 (delivery)

Draft PR: https://github.com/pavnem-ux/Game/pull/23

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR, "before" screenshots
- [x] 1 Pipeline
  - [x] 1.1 Files under `public/assets/`, `docs/ART_PROVENANCE.md`, AGENTS.md §4.12 (owner decision)
  - [x] 1.2 Manifest loader and asset registry with procedural fallback; tests
- [x] 2 In-run sprites: players, enemies, elites, thief, nest; size/anchor/flip; effects kept; tests
- [x] 3 Portraits: character select + hub
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
- **In-run sprites (Phase 2).** `art-display.ts` (pure) holds the single tuning table
  (`ART_BODY_WIDTH_PER_RADIUS = 2.4`, per-key `scale` / `facesLeft` / `flip`), the visible-body
  measurement and the facing rule; `art-sprites.ts` measures each image's opaque bounds once and
  bakes a display copy per (image, radius). `UnitRenderer.artUnit` draws it; the scene uses it for
  the player, the five enemy kinds, both elite profiles, the thief and the nest whenever that image
  has loaded, and the unchanged procedural path otherwise. Bosses keep their art.
  - **Size and anchor.** The visible body (opaque pixels, not the transparent padding) is
    2.4 × the collision radius wide; the feet (bottom of the body) are at position.y + radius, the
    body's horizontal centre on position.x. Resulting widths: swift 26 px, player 31, melee 34,
    ranged / bombard / thief 36, brute 53, nest 72; elites scale with their larger radius.
    Hitboxes are untouched (the simulation never sees any of this).
  - **Pre-scaled copies.** Each image is baked once per radius at 2 × its world size (sharp at DPR 2) by repeated halving with high-quality smoothing. Drawing a 256–384 px image at 30–70 px on
    every frame is both slower on the Canvas renderer (Task 18 measured 1:1 textures as fastest)
    and visibly aliased. Bakes, bounds and layouts are cached, so the render loop allocates nothing
    new per unit.
  - **Facing.** Enemies face the player and the fleeing thief faces away from it; the player faces
    its movement input. The facing only changes when |dx| > 8 px (enemies) or |input.x| > 0.2
    (player), so units hovering around the player's x never flicker. The thief's image runs left
    (`facesLeft`); the nest never flips.
  - **Feedback kept.** A separate ground shadow under the feet (procedural textures bake theirs
    in), idle bob (lifts the body, never below the feet), squash on hit with the feet planted,
    white hit-flash silhouette (baked from the display copy), elite / activity rim glow around the
    body, elite ground ring, HP bars, names, status labels, stun badge and slow ring placed above
    the drawn body / at the feet, dash afterimages with the player's art, Task 18 lighting
    unchanged.
  - **Quality «Low».** Uses the same baked copies (no separate mip); not needed after baking.
  - **Tests.** `tests/engine/art-display.test.ts`: bounds, 2.4 × radius width, anchors, tuning
    table, facing threshold (no flicker around the player's x), mirror signs.
    `tests/art-browser.mjs` (in `test:e2e`): the same seeded map-25 run with every enemy type,
    thief, nest and a turning player is advanced 24 × 0.25 s with the page clock paused (only
    `__alpha.advance` drives the world, and it draws every step). The world digest after each step
    is identical with the art loaded and with the manifest blocked (procedural fallback). All 13
    looks load, with no missing-texture warnings or errors. Test support: a DEV/QA-only `move`
    testing action and `artLooks` in `__alpha.presentation()`.
- **Portraits (Phase 3).** `ClassPortrait` (UI kit) shows `portrait_<class>` in a framed tile in
  the class accent colour, cropped to the head and shoulders (`object-fit: cover`). It replaces the
  SVG emblem on the four character-select cards (88 px selected, 72 px otherwise; the emblems were
  76 / 60) and in the hub's chosen-hero panel (96 px; was 84). The equipment screen, the talents
  header and the small hero chips keep the emblem, as the spec asks. The portrait falls back to
  the emblem while the manifest loads, when the pack has no portrait for the class, or if the image
  fails, so the layout never depends on the pack. The manifest is fetched once per page and shared
  with the in-run loader (`artManifestStore` for React). Portraits are decorative (`alt=""`): the
  class name is always next to them.
  - **Mobile.** The 844×390 phone hub and character select still fit (screenshots; the
    `english-screens` clipped-text / no-scroll check and `mobile-browser` pass).
  - **Tests.** `tests/art-browser.mjs` checks the four portraits on character select and the hub
    portrait load real images on desktop and phone with no horizontal scroll, and that the four
    emblems + the hub emblem come back without the manifest.
  - **Test race fixed (not this task's change).** `mobile-browser.mjs` measured the Task 22
    «Equip» button 150 ms after the tap, while the equipment preview's `panel-in` slide was still
    running: a sub-pixel transform made the box 43.99998 px high and failed the 44 px rule on a
    slower run (it passed on others). The test now waits for that panel's animations to finish
    before measuring; the 44 px rule itself is unchanged.
