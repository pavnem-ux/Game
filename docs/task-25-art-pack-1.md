# Task 25 — Art Pack 1: Character, Portrait and Enemy Sprites

Repo: pavnem-ux/Game. Base: latest `main` with Task 23 (English) merged. Branch `task-25-art`.
Progress: `docs/task-25-progress.md`. Input: attached `art-pack-1.zip` (17 WebP files + `manifest.json` +
`ART_PROVENANCE.md`). Rendering only — hitboxes, simulation and balance unchanged.

## Rules
1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 25: <step> <summary>` → push → tick in progress file. Phases back-to-back.
3. Follow AGENTS.md: PR to `main`, never merge; Phaser/React only render; allocation-free hot loops.
4. Owner decision: update AGENTS.md §4.12 to «Original content: procedural art or art created/commissioned
   by the project owner, listed in `docs/ART_PROVENANCE.md`. No assets from other games, no CDN assets.»
5. Don't edit the image files (already processed). Future packs will add files with the same manifest format.

## 1. Spec
- Put files under `public/assets/…` exactly as in the zip; `docs/ART_PROVENANCE.md` from the zip;
  `assets/manifest.json` drives loading (key = file name without extension).
- Asset registry: entity look → texture key from the manifest; **fallback to the existing procedural
  texture (Task 18) for any missing key**, so partial packs work and bosses/items keep current art.
- Mapping: players by class; `enemy_melee`, `enemy_ranged`, `enemy_swift_imp`, `enemy_stone_troll`,
  `enemy_bombard_warlock` by enemy type; elite profiles melee → `elite_savage_brute`, ranged →
  `elite_dark_conjurer`; `enemy_treasure_thief`, `nest_blight` to Task 24 entities if they exist in `main`
  (otherwise register the keys only).
- Display size: scale each sprite so its visible body width ≈ 2.4× the entity's collision radius
  (players/enemies), bosses unchanged; anchor bottom-centre at the entity's feet (position + radius). Put the
  scale factors in one config table for tuning. Hitboxes don't change.
- Facing: sprites face right; flip horizontally by movement/attack direction (players by movement, enemies
  toward the player). No flip jitter: change facing only when |dx| > a small threshold.
- Keep all existing feedback on top of the art: shadow ellipse, idle bob, squash on hit, hit flash (tint),
  elite rim glow, status tints/labels, HP bars and names above the new heights, light from Task 18.
- Portraits: character select cards and the hub's selected-class panel use `portrait_<class>`; equipment
  screen keeps the class silhouette/sprite. Mobile layouts (Task 16) must still fit.
- Loading: assets preload in the boot/loading scene with a progress bar; total pack < 1 MB.
- Quality «Low» may use smaller mip (Phaser texture filtering) but the same files.

## 2. Phases
- **0 Setup:** branch, progress file, draft PR; "before" screenshots (map 1 and map 25 with all enemy types
  via debug spawn, character select, hub).
- **1 Pipeline:** files + provenance + AGENTS.md update; manifest loader; registry with fallback. Tests:
  every manifest key resolves; missing key → procedural fallback; no duplicate keys.
- **2 In-run sprites:** players, enemies, elites, (thief, nest); size/anchor/flip; effects kept. Tests:
  same seed ⇒ identical simulation with sprites on/off; flip threshold; no texture missing warnings.
- **3 Portraits:** character select + hub.
- **4 Delivery:** full checks from AGENTS.md §6 (+ e2e desktop/mobile, `test:production`); FPS at 120
  enemies before/after (debug overlay); "after" screenshots incl. readability of each enemy type on all
  four biome grounds; README; PR. Don't merge.
