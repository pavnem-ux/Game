# Task 28 — Art Pack 4: Synergy Icons and Talent Branch Emblems

Repo: pavnem-ux/Game. Base: latest `main`. Branch `task-28-icons`. Progress: `docs/task-28-progress.md`.
Input: attached `art-pack-4.zip` (12 synergy icons 128×128, 12 talent branch emblems 192×192 WebP,
`manifest-pack4.json`, `ART_PROVENANCE-pack4.md`). UI only — synergies, talents, balance unchanged.

## Rules
1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 28: <step> <summary>` → push → tick in progress file. Phases back-to-back.
3. Follow AGENTS.md: PR to `main`, never merge. Use the art registry with fallback to the current look for any
   missing key. Don't edit the image files. Player text in English.

## 1. Spec
- Files → `public/assets/icons/synergies/*`, `public/assets/icons/talents/*`; merge `manifest-pack4.json` into
  `public/assets/manifest.json`; append the provenance row to `docs/ART_PROVENANCE.md`.
- Registry kinds: `synergy-icon` (keyed by synergy id) and `talent-branch-icon` (keyed by class + branch number,
  as in the manifest). Tests: every synergy id and every class/branch pair from the catalogs resolves.
- **Synergies:** icon in unlock / level-up / awakening banners (Task 15), pause-menu synergy list with level
  pips, the «▲ <name> II/III» hint on skill cards (small icon), results/run-stats damage sources by synergy.
  Level III (awakened) gets a gold ring/glow drawn in code around the same icon — no extra art.
- **Talents:** branch emblem in each branch header of the talent screen; every node in a branch shows the
  branch emblem with the node number badge (1–5) and rank pips I–III; locked nodes dimmed/desaturated,
  maxed nodes gold ring; the superpower branch (branch 3) keeps its special frame and "unlocks at level 30"
  seal. Talent node tooltips unchanged.
- Sizes in one config (banner ~72, list ~32, card hint ~20, branch header ~96, talent node ~56 desktop /
  touch size on mobile). Crisp on DPR 2; mobile layouts still fit.

## 2. Phases
- **0 Setup:** branch, progress file, draft PR; "before" screenshots: talent screen (each class), pause synergy
  list, a synergy banner, a skill card with the synergy hint.
- **1 Pipeline:** files, manifest, provenance, registry kinds + tests.
- **2 Synergy UI.** **3 Talent UI.**
- **4 Delivery:** full checks from AGENTS.md §6 (+ e2e desktop/mobile, `test:production`); "after" screenshots
  of the same screens; README; PR. Don't merge.
