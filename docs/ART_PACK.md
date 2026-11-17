# Art packs — Task 25

The owner's art (created / commissioned by the owner, listed in
[ART_PROVENANCE.md](ART_PROVENANCE.md); AGENTS.md §4.12) replaces the procedural looks of the
player, the enemies, the elites, the treasure thief and the blight nest in a run, and adds class
portraits to the menus. **Rendering only**: hitboxes, simulation, balance and saves are unchanged,
and every look falls back to its Task 18 procedural texture whenever its image is missing or not
loaded (yet). Spec: [task-25-art-pack-1.md](task-25-art-pack-1.md); journal:
[task-25-progress.md](task-25-progress.md).

## Files and manifest

```
public/assets/manifest.json           # one entry per image (owner's file, kept byte-identical)
public/assets/characters/player_*.webp    # 256 px, anchor bottom-center
public/assets/enemies/*.webp              # 256 / 384 px, anchor bottom-center
public/assets/portraits/portrait_*.webp   # 768 px, anchor center
docs/ART_PROVENANCE.md                # origin and processing of every batch
```

Manifest entry (extra fields such as `source` are allowed and ignored):

```json
"enemy_melee": {
  "file": "assets/enemies/enemy_melee.webp",
  "size": [256, 256],
  "anchor": "bottom-center"
}
```

Rules enforced by `parseArtManifest` (`src/engine/visuals/art-manifest.ts`, pure):

- key = file name without extension (lowercase letters, digits, `_`);
- `file` is `assets/…/<key>.webp` or `.png` — no URLs, no `..`, no CDN;
- `size` is `[width, height]`, 1–2048 px; `anchor` is `bottom-center` or `center`;
- no duplicate keys (checked on the raw text: `JSON.parse` silently keeps the last one) and no
  file used twice. All problems are reported at once.

`public/assets/`, `docs/ART_PROVENANCE.md` and the spec are in `.prettierignore`: the owner's
files stay byte-identical. Pack 1 is 17 images, about 0.76 MB (budget < 1 MB, tested).

### Adding a pack

1. Copy the new images under `public/assets/…` and merge their entries into `manifest.json`;
   add a batch row to `docs/ART_PROVENANCE.md`.
2. If a key replaces a look, add it to `UNIT_ART` (`art-registry.ts`) — one line per look.
   Portrait keys `portrait_<class>` are picked up automatically.
3. Tune its size / facing in `ART_DISPLAY` (`art-display.ts`) if the defaults do not fit.
4. `npm test` checks every file exists, matches its manifest size (read from the WebP header),
   is listed, the pack stays under 1 MB and every key is used.

A key the code does not use yet is accepted by the parser but fails the "every key is used"
test — map it, or remove it from the pack.

## Which art replaces which look

| Look (procedural key)                    | Art key                                      | Notes                                |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------ |
| `player-<class>`                         | `player_<class>`                             | faces its movement                   |
| `enemy-melee` / `enemy-ranged`           | `enemy_melee` / `enemy_ranged`               | face the player                      |
| `enemy-swift`                            | `enemy_swift_imp`                            |                                      |
| `enemy-brute`                            | `enemy_stone_troll`                          |                                      |
| `enemy-bombard`                          | `enemy_bombard_warlock`                      |                                      |
| `elite-melee` / `elite-ranged`           | `elite_savage_brute` / `elite_dark_conjurer` | elite profiles' split                |
| `activity-thief`                         | `enemy_treasure_thief`                       | faces away (flees); image faces left |
| `activity-nest`                          | `nest_blight`                                | never flipped                        |
| `boss`, items, projectiles, pets, chests | —                                            | keep the procedural art              |
| Character select, hub panel              | `portrait_<class>`                           | DOM image, emblem fallback           |

## Loading

The Phaser game exists from the menu on, so the scene does **not** block in `preload()` (its
command bridge subscribes in `create()`; a "Start run" sent during a blocking preload would be
lost). `startArtLoad` (`art-loader.ts`) fetches the manifest once per page (`art-pack.ts`,
shared with the portraits) and loads the 13 unit images in the background with a thin progress
bar at the bottom of the canvas. `ArtRegistry.texture(look)` returns `art:<key>` only once that
image has loaded; until then (or if it fails, or the manifest is missing / invalid — one warning
in the console) the procedural texture is drawn. A run started mid-load simply switches look.
Portraits (433 KB) are not loaded by the scene; the menus load them as `<img>`.

## Drawing (one tuning table)

`src/engine/visuals/art-display.ts` (pure) holds everything tunable:

| Setting                      | Value (provisional)       | Meaning                                           |
| ---------------------------- | ------------------------- | ------------------------------------------------- |
| `ART_BODY_WIDTH_PER_RADIUS`  | 2.4                       | visible body width = 2.4 × collision radius       |
| `ART_DISPLAY[key].scale`     | 1                         | extra size factor per image                       |
| `ART_DISPLAY[key].facesLeft` | `enemy_treasure_thief`    | the image is drawn facing left                    |
| `ART_DISPLAY[key].flip`      | `false` for `nest_blight` | never mirrored                                    |
| `ENEMY_FACING_THRESHOLD`     | 8 px                      | enemies turn once the player is this far sideways |
| `PLAYER_FACING_THRESHOLD`    | 0.2                       | the player turns once \|input.x\| exceeds this    |

- **Visible body.** The opaque bounds of each image are measured once when it loads, so padding
  in the file does not change the size. Resulting widths: swift 26 px, player 31, melee 34,
  ranged / bombard / thief 36, brute 53, nest 72; elites scale with their larger radius.
- **Anchor.** The feet (bottom of the body) are at `position.y + radius`, the body's horizontal
  centre at `position.x`. Hitboxes never change.
- **Pre-scaled copies** (`art-sprites.ts`). Each image is baked once per radius into a canvas
  texture at 2 × its world size (sharp at DPR 2) by repeated halving with high-quality smoothing.
  Drawing a 256–384 px image at 30–70 px every frame is slower on the Canvas renderer and
  aliases. Bounds, bakes and layouts are cached: the render loop allocates nothing per unit.
- **Feedback kept** (`UnitRenderer.artUnit`): separate ground shadow under the feet (procedural
  textures bake theirs in), idle bob (lifts the body), squash on hit with the feet planted, white
  hit-flash silhouette, elite / activity rim glow, elite ground ring, HP bars, names, status
  labels, stun badge and slow ring above the drawn body / at the feet, dash afterimages, Task 18
  lighting. Quality «Low» uses the same baked copies.

## Portraits

`ClassPortrait` (UI kit) shows `portrait_<class>` in a framed tile in the class accent colour,
cropped to the head and shoulders. Used on the four character-select cards (88 px selected,
72 px otherwise) and in the hub's chosen-hero panel (96 px). The equipment screen, the talents
header and the hero chips keep the SVG emblem. Fallback to the emblem while the manifest loads,
without a portrait for the class, or if the image fails. Decorative (`alt=""`): the class name
is always next to it.

## Verification

- `tests/engine/art-pack.test.ts` — the real pack (sizes from WebP headers, nothing unlisted,
  under 1 MB, every key used), manifest validation, registry fallback, key collisions.
- `tests/engine/art-display.test.ts` — bounds, 2.4 × radius width, anchors, tuning table, facing
  threshold (no flicker), mirror signs.
- `tests/art-browser.mjs` (in `test:e2e`) — the same seeded map-25 run (every enemy type, thief,
  nest, a turning player) advanced 24 × 0.25 s with the page clock paused gives an identical world
  after every step with the art loaded and with the manifest blocked; all 13 looks load; no
  missing-texture warnings or errors; portraits on character select + hub on desktop and phone
  (no horizontal scroll); emblems as the fallback.
- `tests/art-screens.mjs <tag>` — before / after screenshots in `docs/art-pack-1/` (hub,
  character select, map 1, map 25 with elites / thief / nest, and 2× close-ups of every enemy
  type on the four biome grounds: maps 1, 11, 21, 31).
- `tests/art-fps.mjs [rounds] [dpr]` — FPS with 120 enemies, procedural vs art.

### FPS with 120 enemies

Sandbox run (no reserved elite / boss slots, so all 120 slots are filled; topped up as the
player kills, ≈ 117 alive on average), 1280×720, headless Chromium on a 4-core cloud container
(software rendering, no GPU), debug-overlay FPS averaged over 8 s, two alternating rounds:

| DPR | Procedural (before) | Owner art (after) |
| --- | ------------------- | ----------------- |
| 1   | 54.6 / 55.6 fps     | 55.8 / 53.6 fps   |
| 2   | 54.0 / 51.3 fps     | 53.2 / 50.1 fps   |

The difference is within the run-to-run noise. Not measured: real phones and GPUs.

## Limits / not verified

- Only Chromium (desktop and phone emulation); no real phones.
- Sizes and facings are provisional, for the owner to tune after a playtest (one table).
- The elite ground ring and mark rings stay at the hitbox (centre), as before.
- `ART_PROVENANCE.md` refers to `docs/art-assets-list.md` and a future `docs/art-prompts.txt`,
  which are the owner's to add.
