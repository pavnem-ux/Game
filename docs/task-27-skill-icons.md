# Task 27 — Art Pack 3: Skill Icons

Repo: pavnem-ux/Game. Base: latest `main` with Task 26 merged. If Task 26 (PR #24) is not merged yet,
branch from `origin/task-26-art`, open the PR against `main`, and merge the latest `origin/task-26-art`
into your branch before each phase. Branch `task-27-icons`. Progress: `docs/task-27-progress.md`.
Input: attached `art-pack-3.zip` (37 skill icons 128×128 WebP, `manifest-pack3.json`,
`ART_PROVENANCE-pack3.md`). UI only — skills, balance and simulation unchanged.

## Rules
1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 27: <step> <summary>` → push → tick in progress file. Phases back-to-back.
3. Follow AGENTS.md: PR to `main`, never merge. Use the Task 25 art registry with fallback: if an icon is
   missing, show the current glyph icon. Don't edit the image files. Player text in English.

## 1. Spec
- Files → `public/assets/icons/skills/*`; merge `manifest-pack3.json` into `public/assets/manifest.json`;
  append the provenance row to `docs/ART_PROVENANCE.md`. Registry kind `skill-icon`, keyed by skill id
  (all 37 class + universal skills; test that every catalog skill id has an icon).
- Replace the glyph icons everywhere a skill is shown:
  - level-up offer cards (large icon);
  - in-run HUD active skill cooldowns (Task 22 bottom-left): icon with the existing radial cooldown
    overlay on top, rank badge, dimmed while on cooldown;
  - pause-menu skill list (actives, passives), synergy pair display and synergy hints («▲ … II/III»)
    showing the two skill icons;
  - results screen / run stats damage sources where a skill is listed;
  - debug/QA panels where skills are listed (optional).
- Icons are round artworks with a soft glow: show them without an extra square frame; keep the existing
  rank, «new», «upgrade» labels readable on top (small badge, not covering the symbol centre).
- Sizes come from one config (card ~96 px, HUD ~44 px desktop / touch size from Task 16, list ~32 px);
  crisp on DPR 2; mobile layouts still fit.
- Preload icons with the existing loader; art set stays < 2 MB.

## 2. Phases
- **0 Setup:** branch, progress file, draft PR; "before" screenshots: offer screen, HUD with 4 actives, pause
  skills list, results.
- **1 Pipeline:** files, manifest merge, provenance, registry kind; test every skill id resolves, fallback
  works for an unknown id.
- **2 Screens:** offer cards, HUD cooldowns, pause list + synergy displays, results.
- **3 Delivery:** full checks from AGENTS.md §6 (+ e2e desktop/mobile, `test:production`); "after"
  screenshots of the same screens; README; PR. Don't merge.
