# Task 32 — Art Pack 8: Boss Sprites

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main` with Task 31 merged. If Task 31 (PR #30) is not merged yet,
branch from `origin/task-31-art`, open the PR against `main`, and merge the latest `origin/task-31-art` into your
branch before finishing. Branch `task-32-bosses-art`.
Input (attached): `art-pack-8.zip` — 40 boss sprites 512×512 WebP named by boss id (`src/campaign/bosses.ts`),
bottom-centre anchor, all facing right; `manifest-pack8.json`; `ART_PROVENANCE-pack8.md`. Rendering/UI only —
boss stats, abilities, hitboxes and balance unchanged. Don't edit the image files.

## Spec
- Files → `public/assets/bosses/*`; merge the manifest into `public/assets/manifest.json`; append the provenance
  row to `docs/ART_PROVENANCE.md`. Registry kind `boss` keyed by boss id; fallback to the current procedural boss.
- **Lazy loading:** boss sprites are not in the boot preload (3 MB). Load the current map's boss when the run
  starts (before the 10:00 spawn; if not loaded in time, show the fallback and swap when ready). The map-path
  side panel loads the selected map's boss portrait on demand.
- **In run:** scale so the visible body ≈ 2.6× the boss collision radius (one config value), anchor at the feet,
  flip toward the player with the existing no-jitter threshold. Keep everything drawn on top as now: HP bar and
  name, telegraphs, aura/enrage effects, hit flash, status tints, light source, death effect. Telegraphs must stay
  clearly visible over the sprite.
- **UI:** map-path side panel and boss spawn notification show the boss portrait (same file) for unlocked maps;
  locked maps keep a silhouette/«?».
- Tests: every boss id from the campaign config resolves; unknown id → fallback; boss sprites absent from the
  boot preload list.
