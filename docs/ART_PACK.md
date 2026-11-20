# Art packs — Tasks 25, 26, 27 and 28

The owner's art (created / commissioned by the owner, listed in
[ART_PROVENANCE.md](ART_PROVENANCE.md); AGENTS.md §4.12) replaces the procedural looks of the
player, the enemies, the elites, the treasure thief and the blight nest in a run, and adds class
portraits to the menus (pack 1, Task 25). Pack 2 (Task 26) adds a tiling ground per act, art for XP
crystals, coin piles and chests, and the Gold / Ore icons in the menus. Pack 3 (Task 27) adds the
37 skill icons used wherever a skill is shown in the run UI. Pack 4 (Task 28) adds the 12 synergy
icons and the 12 talent branch emblems. **Rendering only**: hitboxes, simulation, balance and saves are unchanged,
and every look falls back to its Task 18 procedural texture whenever its image is missing or not
loaded (yet). Specs: [task-25-art-pack-1.md](task-25-art-pack-1.md),
[task-26-art-pack-2.md](task-26-art-pack-2.md), [task-27-skill-icons.md](task-27-skill-icons.md),
[task-28-synergy-talent-icons.md](task-28-synergy-talent-icons.md);
journals: [task-25-progress.md](task-25-progress.md), [task-26-progress.md](task-26-progress.md),
[task-27-progress.md](task-27-progress.md), [task-28-progress.md](task-28-progress.md).

## Files and manifest

```
public/assets/manifest.json           # one entry per image (owner's file, kept byte-identical)
public/assets/characters/player_*.webp    # 256 px, anchor bottom-center
public/assets/enemies/*.webp              # 256 / 384 px, anchor bottom-center
public/assets/portraits/portrait_*.webp   # 768 px, anchor center
public/assets/ground/ground_*.webp        # 1024 px seamless, anchor tile, kind ground (pack 2)
public/assets/pickups/*.webp              # 128 / 192 px, anchor center, kind pickup (pack 2)
public/assets/icons/skills/<id>.webp      # 128 px round icons, kind skill-icon, key skill_<id> (pack 3)
public/assets/icons/synergies/<id>.webp   # 128 px, kind synergy-icon, key synergy_<id> (pack 4)
public/assets/icons/talents/<name>.webp   # 192 px, kind talent-branch-icon, key talent_branch_<name> (pack 4)
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

- key = file name without extension (lowercase letters, digits, `_`); for `kind: "skill-icon"` the
  key is `skill_<file name>` and an optional `skillId` field must equal the file name; likewise
  `synergy-icon` → `synergy_<file name>` / `synergyId`; `talent-branch-icon` →
  `talent_branch_<file name>` with required `characterClass` (one of the four classes) and
  `branch` (positive integer), one emblem per class / branch;
- `file` is `assets/…/<key>.webp` or `.png` — no URLs, no `..`, no CDN;
- `size` is `[width, height]`, 1–2048 px; `anchor` is `bottom-center`, `center` or `tile`
  (`tile` only together with `kind: "ground"`);
- `kind` (optional, pack 2): `unit`, `portrait`, `ground`, `pickup`, `skill-icon` (pack 3),
  `synergy-icon` or `talent-branch-icon` (pack 4); it must match how the build uses the key
  (tested);
- no duplicate keys (checked on the raw text: `JSON.parse` silently keeps the last one) and no
  file used twice. All problems are reported at once.

`public/assets/`, `docs/ART_PROVENANCE.md` and the spec are in `.prettierignore`: the owner's
files stay byte-identical (the pack-2 entries were merged in the owner's 1-space JSON format). Pack
1 is 17 images (≈ 0.76 MB), pack 2 9 images (≈ 0.75 MB), pack 3 37 icons (≈ 0.32 MB), pack 4 24
images (≈ 0.24 MB), packs 5 + 6 (Task 30) 30 item icons and 6 pet sprites (≈ 0.35 MB),
pack 7 (Task 31) 32 decor props, 5 menu backgrounds, the emblem
and 11 objects (≈ 2.07 MB). Budget (owner decision, Task 31; 2 MiB in Task 26, 3 MiB in Task 30): in-game /
preloaded art ≤ 4 MiB (now 3,231,514 bytes with the manifest) and the lazily loaded menu backgrounds
≤ 2 MiB (now 1,249,110 bytes), checked separately. Pack 8 (Task 32): 40 boss sprites (≈ 3.17 MB),
lazy — a run loads only its map's boss and the map path only the selected map's portrait — so they
are outside both totals; each file is capped at 128 KiB (provisional; largest 93,958 bytes).
Pack 9 (Task 34): the Archer's ballista (`summon_ballista`, 15,494 bytes, in the in-game total).

### Adding a pack

1. Copy the new images under `public/assets/…` and merge their entries into `manifest.json`;
   add a batch row to `docs/ART_PROVENANCE.md`.
2. If a key replaces a look, add it to `UNIT_ART` / `PICKUP_ART` (`art-registry.ts`) — one line
   per look; grounds per act are in `GROUND_ART`, menu icons in `CURRENCY_ART`. Portrait keys
   `portrait_<class>` are picked up automatically, and so are icons: `skill_<skill id>`,
   `synergy_<synergy id>` and `talent_branch_<branch name>` (with `characterClass` / `branch`).
3. Tune its size / facing in `ART_DISPLAY` (`art-display.ts`) if the defaults do not fit.
4. `npm test` checks every file exists, matches its manifest size (read from the WebP header),
   is listed, the art budget holds (in-game ≤ 4 MiB, backgrounds ≤ 2 MiB) and every key is used with its declared kind.

A key the code does not use yet is accepted by the parser but fails the "every key is used"
test — map it, or remove it from the pack.

## Which art replaces which look

| Look (procedural key)              | Art key                                             | Notes                                |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------ |
| `player-<class>`                   | `player_<class>`                                    | faces its movement                   |
| `enemy-melee` / `enemy-ranged`     | `enemy_melee` / `enemy_ranged`                      | face the player                      |
| `enemy-swift`                      | `enemy_swift_imp`                                   |                                      |
| `enemy-brute`                      | `enemy_stone_troll`                                 |                                      |
| `enemy-bombard`                    | `enemy_bombard_warlock`                             |                                      |
| `elite-melee` / `elite-ranged`     | `elite_savage_brute` / `elite_dark_conjurer`        | elite profiles' split                |
| `activity-thief`                   | `enemy_treasure_thief`                              | faces away (flees); image faces left |
| `activity-nest`                    | `nest_blight`                                       | never flipped                        |
| `crystal`                          | `xp_crystal`                                        | 18 px, baked soft green halo         |
| `coin`                             | `coin`                                              | 2.2 × pile radius (value scaling)    |
| `chest-wooden` / `chest-enchanted` | `chest_wooden` / `chest_enchanted`                  | closed; baked glow as before         |
| map ground (act I–IV)              | `ground_forest` / `_marsh` / `_ashlands` / `_frost` | tiling, per-map tint ±8%             |
| Gold / Ore badges, shop, results   | `coin` / `ore`                                      | DOM image, SVG fallback              |
| `boss`, projectiles, pets, decor   | —                                                   | keep the procedural art              |
| Character select, hub panel        | `portrait_<class>`                                  | DOM image, emblem fallback           |

## Loading

The Phaser game exists from the menu on, so the scene does **not** block in `preload()` (its
command bridge subscribes in `create()`; a "Start run" sent during a blocking preload would be
lost). `startArtLoad` (`art-loader.ts`) fetches the manifest once per page (`art-pack.ts`,
shared with the portraits) and loads the 13 unit images, 4 pickups and 4 grounds in the background with a thin progress
bar at the bottom of the canvas. `ArtRegistry.texture(look)` returns `art:<key>` only once that
image has loaded; until then (or if it fails, or the manifest is missing / invalid — one warning
in the console) the procedural texture is drawn. A run started mid-load simply switches look.
Portraits (433 KB) and the menu-only `ore` icon are not loaded by the scene; the menus load them
as `<img>`. The progress bar is pinned to screen space (Task 25 review), so it stays visible under
the DPR camera zoom.

## Ground (Task 26)

`art-ground.ts` (pure): `GROUND_TILE_WORLD = 512` world units per repetition of the 1024 px
texture (sharp at DPR 2; provisional) and `groundTint(look)`: the map's Task 18 variation (hue
shift, brightness) as per-channel factors = the map's ground base colour ÷ its act's base colour,
clamped to 1 ± 0.08. `BiomeRenderer.applyArtGround` swaps the existing ground tile sprite (under
everything) to the act's texture once it has loaded, with the tint baked once per map (Canvas has
no `setTint`; the copy is freed with the map). Paths, signature features, decor, particles and the
light / darkness overlay are unchanged on top; without the image the procedural ground stays.

## Pickups and chests (Task 26)

Sizes come from the pickup radii in one table (`PICKUP_SIZE_PER_RADIUS`, `art-display.ts`,
provisional): XP crystal 3.6 × 5 = 18 px; coin piles 2.2 × the pile's drawn radius (the Task 11
value scaling, `coinPileRadius`, 4–9); closed chests 2.4 × 16 ≈ 38 px. Largest visible side,
centre anchor, baked per size like the units. The crystal and the chests get a soft halo baked
into their display copy: the procedural looks had one (the chest's glow disc in its texture), and
the thin crystal shard nearly vanished on the forest grass without it. Hover, chest blinking,
opening puff, magnet pull and the Task 18 lights are unchanged.

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

## Skill icons (Task 27)

`SkillIcon` (UI kit, `src/gameplay-ui/kit/SkillIcon.tsx`) shows the icon of a skill id
(`skillIconEntry(manifest, id)` in `art-registry.ts`) as a decorative `<img>`, with no frame
because the round art carries its own soft glow. Fallback: the catalogue glyph
(`SkillDefinition.icon`) while the manifest loads, for an id without an icon (and for bonus cards),
or if the image fails. All icons are preloaded once when the in-run app mounts
(`preloadSkillIcons`); the Phaser scene does not load them.

Sizes, one config `SKILL_ICON_SIZES` (CSS px, provisional), installed as `--skill-icon-*` on
`:root`:

| Where                                              | Size                             |
| -------------------------------------------------- | -------------------------------- |
| Level-up offer cards, Mage «Fifth Circle» choice   | 96 (`cardCompact` 64 on phones)  |
| HUD active skills                                  | 44 (`hudTouch` 44, Task 16 min.) |
| Pause skill list                                   | 32                               |
| Results / run stats damage sources (`skill:<id>`)  | 24                               |
| Synergy pair rows, card hints (two icons per pair) | 20                               |

- Offer cards: rank / «NEW» as a small corner badge (`NEW`, `▲ II`); the text labels stay.
- HUD: soft dark disc behind the icon, rank badge in the corner, dimmed while cooling, with a radial
  overlay showing the share of the cooldown still left. It reads the read-only
  `SkillCombatSnapshot.cooldownTotals` (Task 27; never read by the simulation).
- Synergy banners and DEV panels keep text (the spec marks DEV panels optional).

## Synergy icons and talent branch emblems (Task 28)

Sizes for every pack icon now live in one config, `ICON_SIZES` (`src/gameplay-ui/kit/icon-sizes.ts`,
`--icon-<size>` on `:root`; Task 27's `SKILL_ICON_SIZES` is the same object). Task 28 sizes
(provisional):

| Where                                               | Size                               |
| --------------------------------------------------- | ---------------------------------- |
| Synergy banners (unlock I, level II, awakening III) | 72 (`bannerCompact` 44 on phones)  |
| Pause synergy list                                  | 32 (`list`)                        |
| Card hint «▲ Synergy II/III»                        | 20 (`pair`)                        |
| Results / run stats damage source `synergy:<id>`    | 24 (`stats`)                       |
| Talent branch header                                | 96 (`branchCompact` 64 on phones)  |
| Talent node                                         | 56 (`talentNodeTouch` 48 on touch) |

- `SynergyIcon` / `TalentBranchIcon` / `ArtImage` (`src/gameplay-ui/kit/ArtIcon.tsx`) render a
  decorative `<img>`, or nothing while the manifest loads, when the key is missing, or when the
  image fails. The screen then keeps its current look: banner and list text, node letters. Icons
  are preloaded with the skill icons.
- Level III «Awakening»: the same synergy icon with a gold ring and glow drawn in CSS
  (`.is-awakened`); no extra art. Shown on the awakening banner, in the pause list (effective
  level) and on the «▲ … III» hint.
- Emblems are looked up by `characterClass` + `branch` (`talentBranchIconEntry`), not by key.
  Talent screen: each branch header shows its emblem. Every node shows the emblem with the node
  number (1–5) as a badge, with rank pips I–III below. Locked nodes are desaturated and darkened;
  maxed nodes get a gold ring and glow. The superpower branch keeps its frame and «unlocks at
  level 30» seal. Tooltips and the detail panel are unchanged.

## Verification

- `tests/engine/art-pack.test.ts` — the real packs (sizes from WebP headers, nothing unlisted,
  in-game ≤ 4 MiB / backgrounds ≤ 2 MiB, every key used with its declared kind), manifest validation (incl. `tile` / `kind`),
  registry fallback for units, pickups and grounds, key collisions.
- `tests/engine/art-display.test.ts` — bounds, 2.4 × radius width, anchors, tuning table, facing
  threshold (no flicker), mirror signs, loading bar on screen at DPR 1 / 1.5 / 2, pickup sizes
  from the radii and the coin-pile scaling.
- `tests/engine/art-ground.test.ts` — act → ground for maps 1/11/21/31 and 10/20/30/40, tile
  size, per-map tint within ±8% on all 40 maps.
- `tests/art-browser.mjs` (in `test:e2e`) — the same seeded map-25 run (every enemy type, thief,
  nest, a turning player) advanced 24 × 0.25 s with the page clock paused gives an identical world
  after every step with the art loaded (incl. the ashlands ground) and with the manifest blocked;
  all 17 looks (13 units + 4 pickups) load and the act ground is applied; no missing-texture
  warnings or errors; portraits on character select + hub and the Gold / Ore badge icons on
  desktop and phone (no horizontal scroll); emblems and SVG icons as the fallback. Task 27: skill
  icons load on the HUD (44 px), offer cards (96 px desktop / 64 px phone) and pause list (32 px)
  on desktop and phone; glyphs without the manifest. Task 28: the warrior's three synergy icons in
  the pause list; on the talent screen 3 branch header emblems, 14 node emblems with badges 1–5,
  node size 56 px desktop / 48 px phone, no horizontal scroll; letters and no badges without the
  manifest.
- `tests/ui-kit/art-icons.test.ts` — Task 28: the size config and that the stylesheet reads every
  size, synergy icon markup for all 12 synergies, the gold ring only at III, fallbacks, banner
  synergy ids, which damage sources get a synergy icon, the emblem view.
- `tests/ui-kit/skill-icons.test.ts` — icon view and glyph fallback (no manifest, unknown id, bonus
  card), rendered markup, the size config and that the stylesheet reads every size, the radial
  overlay share, pair ids for synergy hints, which damage sources get an icon.
- `tests/art-screens.mjs <tag>` — before / after screenshots in `docs/art-pack-1/` (hub,
  character select, map 1, map 25 with elites / thief / nest, and 2× close-ups of every enemy
  type on the four biome grounds: maps 1, 11, 21, 31).
- `tests/art2-screens.mjs <tag>` — pack-2 before / after screenshots in `docs/art-pack-2/` (maps 1,
  15, 25, 35 with crystals, coins, both chests and a bombard telegraph — full and close-up — plus
  the hub and a results screen).
- `tests/art3-screens.mjs <tag>` — pack-3 before / after screenshots in `docs/art-pack-3/` (offer
  screen, HUD with four actives + a close-up of the skill row, pause skill list and synergy pairs,
  results; phone HUD and offer).
- `tests/art4-screens.mjs <tag>` — pack-4 before / after screenshots in `docs/art-pack-4/` (talent
  screen of each class, the superpower seal at level 20, phone talent screen, synergy banners
  I / II / III, card hint, pause synergy list, seeded results with a synergy damage source).
- `tests/art-fps.mjs [rounds] [dpr]` — FPS with 120 enemies, procedural vs art.

### FPS with 120 enemies

Sandbox run (no reserved elite / boss slots, so all 120 slots are filled; topped up as the
player kills, ≈ 117 alive on average), 1280×720, headless Chromium on a 4-core cloud container
(software rendering, no GPU), debug-overlay FPS averaged over 8 s, two alternating rounds:

| DPR | Procedural (before) | Owner art (after) | Measured with                          |
| --- | ------------------- | ----------------- | -------------------------------------- |
| 1   | 54.6 / 55.6 fps     | 55.8 / 53.6 fps   | Task 25 (pack 1)                       |
| 2   | 54.0 / 51.3 fps     | 53.2 / 50.1 fps   | Task 25 (pack 1)                       |
| 1   | 51.5 / 51.4 fps     | 52.0 / 49.9 fps   | Task 26 (packs 1 + 2: ground, pickups) |
| 2   | 43.8 / 44.6 fps     | 43.8 / 44.7 fps   | Task 26 (packs 1 + 2: ground, pickups) |

"Procedural" blocks the manifest (no art at all); compare rows of the same task only — the
container load differed between the two sessions. Within each session the difference is within
the run-to-run noise. Not measured: real phones and GPUs.

## Limits / not verified

- Only Chromium (desktop and phone emulation); no real phones.
- Sizes and facings are provisional, for the owner to tune after a playtest (one table).
- The elite ground ring and mark rings stay at the hitbox (centre), as before.
- Readability (Task 26 "after" screenshots): XP crystals, chests and bombard telegraphs read on
  all four grounds. Small coin piles (11 px for a 1-coin pile, the Task 11 scale) are dimmer than
  the old bright-gold discs on the act I forest ground (`docs/art-pack-2/after-map1.jpg`, left of
  the bombard): visible, but the owner may want a larger `coin` factor or a brighter coin image.
- Skill icons at DPR 2: the 96 px card icon is drawn from the 128 px source (192 device px needed),
  so it is slightly soft; HUD (44 → 88), list and pair sizes are sharp. Not changed: image files.
- Talent emblems at DPR 2: the 96 px header emblem needs 192 device px, exactly the source size;
  synergy banner icons (72 → 144 device px) are slightly upscaled from 128 px.
- Ore is not a world pickup (activity Ore is banked), so `ore` is used for the menu icon only.
- `ART_PROVENANCE.md` refers to `docs/art-assets-list.md` and a future `docs/art-prompts.txt`,
  which are the owner's to add.
