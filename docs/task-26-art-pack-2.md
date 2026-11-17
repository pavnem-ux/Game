# Task 26 — Art Pack 2: Biome Grounds and Pickups

Repo: pavnem-ux/Game. Base: latest `main` with Task 25 merged. If Task 25 (PR #23) is not merged yet,
branch from `origin/task-25-art`, open the PR against `main`, and merge the latest `origin/task-25-art`
into your branch before each phase. Branch `task-26-art`. Progress: `docs/task-26-progress.md`.
Input: attached `art-pack-2.zip` (4 ground textures, 5 pickups, `manifest-pack2.json`,
`ART_PROVENANCE-pack2.md`). Rendering only — hitboxes, pickup radii, simulation and balance unchanged.

## Rules
1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 26: <step> <summary>` → push → tick in progress file. Phases back-to-back.
3. Follow AGENTS.md: PR to `main`, never merge; render-only; allocation-free hot loops; Task 25 art registry
   with procedural fallback for any missing key. Don't edit the image files (already processed).
4. Player text in English.

## 1. Spec
- Files → `public/assets/ground/*`, `public/assets/pickups/*`. Merge `manifest-pack2.json` into
  `public/assets/manifest.json` (one manifest). Append the row from `ART_PROVENANCE-pack2.md` to
  `docs/ART_PROVENANCE.md`.
- Registry: add kinds `ground` and `pickup` to the Task 25 art registry (keep `unit`/`portrait`).
- **Ground:** each act uses its texture as a tiling sprite under everything: Act I `ground_forest`, II
  `ground_marsh`, III `ground_ashlands`, IV `ground_frost`. Tile size in world units in config (start 512).
  Keep the Task 18 per-map variation as a subtle tint (keep within ±8% brightness) and keep decor, map
  signature features, particles and the light/darkness overlay on top. Procedural ground stays as fallback.
- **Pickups:** `xp_crystal` for XP crystals, `coin` for coin piles, `ore` for ore pickups (if ore exists as
  a pickup), `chest_wooden` / `chest_enchanted` for chests (closed state; opening keeps the current
  open/puff effect). Display size from existing pickup radii (config table); merged piles keep their current
  size/value scaling. Keep magnet pull, glow and light sources (Task 18), blinking before chest expiry.
- **UI currency icons:** Gold and Ore badges (hub, shop, forge, results, quests) use `coin` and `ore`.
- Loading: added to the existing preload with progress bar; whole art set stays < 2 MB.

## 2. Phases
- **0 Setup:** branch, progress file, draft PR; "before" screenshots: maps 1, 15, 25, 35 with pickups and
  chests on screen (debug spawn), hub and results.
- **1 Pipeline:** files, manifest merge, provenance, registry kinds. Tests: every key resolves; missing key
  → procedural fallback; manifest has no duplicate keys.
- **2 Ground:** tiling per act, tint, layering. Tests: act → texture mapping for maps 1/11/21/31 and 10/20/
  30/40; same seed ⇒ identical simulation with art on/off.
- **3 Pickups & chests & icons.**
- **4 Delivery:** full checks from AGENTS.md §6 (+ e2e desktop/mobile, `test:production`); FPS at 120
  enemies before/after; "after" screenshots — check XP crystals, coins and telegraph circles stay clearly
  visible on all four grounds (report any problem with a screenshot instead of editing images); README;
  PR. Don't merge.
