# Task 23 — Switch the Game to English (remove Russian)

Repo: pavnem-ux/Game. Base: latest `main` with Task 22 merged. Branch `task-23-english`.
Progress: `docs/task-23-progress.md`. Text only — no gameplay, balance, layout or save-semantics changes.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: commit `Task 23: <step> <summary>` → push → tick in progress file. Phases back-to-back.
3. Follow AGENTS.md (PR to `main`, never merge). Owner decision: the game UI is English only from now on —
   update AGENTS.md §5 («UI text is Russian») to «UI text is English» in this PR.
4. Translate meaning and tone (dark fairy tale), not word by word. Keep ids, save keys and config keys
   unchanged — only display strings change.
5. Design docs/catalogs in `docs/` stay as they are (Russian is fine there); `docs/playtest.md` stays Russian
   (it's for the owner). README gets an English player-facing section.

## 1. Spec

- All player-facing text in English: menus, HUD, tooltips, results, errors and warnings, settings, shop,
  forge, quests, talents, synergies, skills, enemies, elites, bosses, maps, acts, items, tiers, pets, chests,
  buffs, notifications, bug-report UI, debug/QA labels, document `<title>` and `lang="en"`.
- Keep the localization layer (one `en` locale file + typed keys) so other languages can be added later;
  remove the Russian locale and any hard-coded Russian strings in components, configs and catalogs.
- Glossary first: `docs/glossary-en.md` — every proper name and game term with RU → EN (game title
  proposal «The Last Light», class names, stats, statuses Poison/Burn/Bleed/Slow/Stun, currencies Gold/Ore,
  rarities Common/Uncommon/Rare/Epic/Legendary, all map/act/boss/elite/enemy/item/talent/synergy/skill/pet/
  quest names). Use it consistently everywhere.
- Numbers/time formats in English style (1,240 / 5,000; «Elite in 1:20»; «Boss in 0:45»).
- Fonts and layout: make sure longer English strings don't overflow on desktop and mobile; fix by layout,
  not by shortening meaning.
- Saves, exports and bug reports keep working (they store ids, not names); an old save loads unchanged.

## 2. Phases

- **0 Setup:** branch, progress file, draft PR; inventory of all Russian strings by file (count in the PR).
- **1 Glossary:** `docs/glossary-en.md`.
- **2 Strings:** 2.1 UI/locale; 2.2 content catalogs (maps, bosses, enemies, items, talents, synergies,
  skills, pets, quests, chests/buffs); 2.3 notifications, errors, debug/QA.
- **3 Checks:** test that fails if Cyrillic characters appear in `src/` (excluding tests and comments if
  any remain); e2e snapshot of every screen (desktop 1280×720 + mobile 844×390) — no overflow/truncation;
  old save + export/import still load.
- **4 Delivery:** full checks from AGENTS.md §6 (+ e2e, `test:production`); AGENTS.md §5 update; README;
  PR with the glossary for owner review and before/after screenshots. Don't merge.
