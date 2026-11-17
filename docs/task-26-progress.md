# Task 26 — progress

Spec: [task-26-art-pack-2.md](task-26-art-pack-2.md) (owner's file, kept verbatim). Branch
`task-26-art`, created from the latest `main` (Task 25 merged). Input: the owner's `art-pack-2.zip`
(4 ground textures, 5 pickups, `manifest-pack2.json`, `ART_PROVENANCE-pack2.md`). Rendering only:
hitboxes, pickup radii, simulation and balance are unchanged.

Current: Phase 3 done — next: Phase 4 (delivery)

Draft PR: https://github.com/pavnem-ux/Game/pull/24

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR, "before" screenshots
- [x] 1 Pipeline: files, manifest merge, provenance, registry kinds `ground` / `pickup`; tests
- [x] 2 Ground: tiling per act, tint, layering; tests (act → texture, same seed with art on/off)
- [x] 3 Pickups, chests, currency icons
- [ ] 4 Delivery: full checks, e2e desktop/mobile, `test:production`, FPS at 120 enemies, "after"
      screenshots (crystals, coins, telegraphs on all four grounds), README, PR

## Pack contents (checked in Phase 0)

| Group   | Files                                                                            | Size      |
| ------- | -------------------------------------------------------------------------------- | --------- |
| Ground  | `ground_{forest,marsh,ashlands,frost}` (1024 px, seamless)                       | 707 KB    |
| Pickups | `xp_crystal`, `coin`, `ore` (128 px), `chest_wooden`, `chest_enchanted` (192 px) | 40 KB     |
| Total   | 9 WebP + `manifest-pack2.json`                                                   | ≈ 0.75 MB |

With pack 1 (≈ 0.76 MB) the whole art set is ≈ 1.5 MB, under the 2 MB budget.

## Decisions

- **Manifest merge waits for the parser (Phase 1).** Pack 2's entries use a new anchor `tile` and a
  `kind` field. The Task 25 parser only accepts `bottom-center` / `center`, so merging the entries
  before it learns `tile` would make the whole manifest invalid and turn _all_ art (pack 1
  included) back into procedural looks. The images, the manifest merge, the provenance row and the
  parser / registry change therefore land together in step 1.1; until then the pack waits unpacked
  outside the repo. This also keeps the "before" screenshots free of pack-2 art.
- **Ore is not a world pickup.** Activity Ore is banked and paid with a victory (Task 24); nothing
  drops Ore on the ground. The `ore` image is used for the UI Ore badges only.
- **"Before" screenshots.** `tests/art2-screens.mjs <tag>` (not part of `test:e2e`; needs a dev
  server) writes `docs/art-pack-2/<tag>-*.jpg` at DPR 2: maps 1, 15, 25, 35 (acts I–IV) with XP
  crystals and coin piles from the normal reward pipeline (kills in view, a caught treasure thief),
  a wooden and an enchanted chest and a bombard telegraph — full view and a close-up — plus the hub
  and a results screen. The same script produces the "after" set in Phase 4.
- **Pipeline (Phase 1).** The 9 images are under `public/assets/ground/` and `public/assets/pickups/`
  (byte-identical); `manifest-pack2.json` is merged into `public/assets/manifest.json` in the
  owner's format (1-space JSON, pack-1 entries first, no key collisions: 17 + 9 = 26 entries); the
  pack-2 row is appended to `docs/ART_PROVENANCE.md`.
  - **Parser:** anchor `tile` (allowed only together with `kind: "ground"`), optional `kind`
    (`unit` / `portrait` / `ground` / `pickup`); pack-1 entries without `kind` stay valid.
  - **Registry:** `PICKUP_ART` (crystal, coin, both chests: the same per-look slots as units, so
    the same procedural fallback), `GROUND_ART` (act I–IV → texture; `ground(act)` returns null
    until loaded) and `CURRENCY_ART` (Gold → `coin`, Ore → `ore`, for the UI badges). The scene
    loads units + pickups + grounds (`sceneEntries`, 21 images); portraits and the UI-only `ore`
    are DOM images.
  - **Tests:** every pack-2 key resolves and its declared kind matches its use; act → ground;
    pickup looks; missing ground / pickup → procedural; `tile` / `kind` validation; art set
    < 2 MB; existing Task 25 tests updated for the larger pack (26 entries, 17 looks).
  - One unit-test run failed a single test while the dev server and a build were running; three
    later runs (one with a parallel build) passed, and the failing name was not captured. Watching
    CI for a repeat.
- **Ground (Phase 2).** `art-ground.ts` (pure): `GROUND_TILE_WORLD = 512` (one repetition of the
  1024 px texture covers 512 world units, so it is sharp at DPR 2; provisional), act → texture
  (`ground_forest` / `ground_marsh` / `ground_ashlands` / `ground_frost`) and `groundTint(look)`:
  the map's Task 18 variation (hue shift ±14°, brightness 0.92–1.08) as per-channel factors = the
  map's ground base colour ÷ its act's base colour, each clamped to 1 ± 0.08.
  - `BiomeRenderer.applyArtGround` swaps the existing ground `tileSprite` (depth −10, under
    everything) to the act texture once it has loaded; a run started earlier switches over. The
    tint is baked once per map into a canvas copy (Canvas ignores `setTint`): multiply by
    tint / max(tint), then add the copy onto itself at alpha max(tint) − 1, which gives an exact
    per-channel multiply in [0.92, 1.08]. The copy is freed when the map changes. Paths, signature
    features, decor, particles and the light / darkness overlay are untouched and stay on top.
  - Called from `draw()` (every rendered frame and every `__alpha.advance`); after the swap it is a
    null check. Without the image the procedural ground stays.
  - **Tests:** `tests/engine/art-ground.test.ts` — act → texture for maps 1/11/21/31 and
    10/20/30/40 (and the sandbox), tile size, tint within ±8% on all 40 maps, variation kept and
    stable per map, brightness direction. `tests/art-browser.mjs`: the seeded map-25 run is
    identical with the art (now including the ashlands ground) and with the manifest blocked;
    `artGround` = `art:ground_ashlands~map25` with art, `null` without.
- **Pickups, chests, icons (Phase 3).**
  - **Sizes from the pickup radii** (`PICKUP_SIZE_PER_RADIUS` in `art-display.ts`, provisional):
    XP crystal 3.6 × the crystal radius 5 = 18 px; coin piles 2.2 × the pile's drawn radius, which
    keeps the Task 11 value scaling (`coinPileRadius`, 4–9, now shared by both paths); closed
    chests 2.4 × the chest radius 16 ≈ 38 px. Largest visible side, centre anchor, baked once per
    size like the units (coin sizes rounded to whole px). Pickup radii and magnet pull are
    simulation and unchanged.
  - **Kept:** the crystal hover, chest blinking before expiry (alpha), the opening puff and the
    Task 18 lights (all unchanged code paths). Without an image the procedural pickup is drawn.
  - **Crystal halo.** The art crystal is a thin green shard and almost vanished on the forest
    grass; the procedural crystal sat on a soft glow. A soft green halo is baked into the crystal's
    display texture (one sprite per crystal; additive glows are capped at 32 per frame), so
    crystals read on all four grounds.
  - **Currency icons.** `CurrencyIcon` (UI kit) shows the pack's `coin` / `ore`, with the former
    inline SVGs as the fallback. Used by the Gold / Ore badges (hub header, forge, quests), the
    shop's «Buy · <icon> N» buttons (pets too; there the icon is labelled «Gold», so the button
    reads «Buy · Gold 80» — `campaign-browser.mjs` matched the old «◎» glyph and now matches the
    new name) and the results screen's Gold / Ore rows. The in-run HUD coin counter keeps its «◎»
    (not in the spec's list).
  - **Fix found by the existing tests.** The kit test server-renders the badges; the icon's
    `useSyncExternalStore` lacked a server snapshot and React threw. The manifest store now has
    `getServerSnapshot` (no manifest → fallback), used by `CurrencyIcon` and Task 25's
    `ClassPortrait`.
  - **Tests:** pickup sizes from the radii and the coin scaling (`art-display.test.ts`); the art
    e2e checks the Gold / Ore badges show the pack icons on desktop and phone and the SVGs without
    the manifest; the full e2e suite passes.
