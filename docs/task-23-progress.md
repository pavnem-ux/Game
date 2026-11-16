# Task 23 — progress

Spec: [task-23-english.md](task-23-english.md) (owner's file). Branch `task-23-english` stacked on
`task-22-hud` (PR #20, not merged yet when this task started; the spec's base is "main with Task
22 merged"). Rebase onto `main` once #20 is merged. Text only: no gameplay, balance, layout or
save-semantics changes.

Current: done — PR ready for review (not merged)

Draft PR: https://github.com/pavnem-ux/Game/pull/21

## Inventory (before)

Cyrillic in `src/` (+ `index.html`): **89 files, 1,944 lines, ~1,513 string literals**. Largest:
`gameplay-ui/strings-ru.ts` (282 literals), `talents/catalog.ts` (234), `skills/damage-readout.ts`
(107), `campaign/config.ts` (95), `equipment/config.ts` (77), `gameplay-ui/DeveloperPanel.tsx` (69),
`gameplay-ui/SkillPanels.tsx` (67), skill catalogs (4 × 49 + 22), `skills/synergies.ts` (48),
`skills/synergy-info.ts` (39), `quests/config.ts` (27), `config/game.ts` (23, prototype).
Comments with Cyrillic (e.g. talent handlers) are translated too.

## Checklist

- [x] 0 Branch, spec, progress file, draft PR, inventory
- [x] 1 Glossary `docs/glossary-en.md`
- [x] 2.1 UI / locale (`strings-en.ts`, components, number format, `index.html`)
- [x] 2.2 Content catalogs (maps, bosses, enemies, items, talents, synergies, skills, pets, quests,
      chests / buffs)
- [x] 2.3 Notifications, errors, debug / QA, prototype
- [x] 3 Checks: no-Cyrillic test, screen snapshots (1280×720 + 844×390), old save / export
- [x] 4 Full checks, AGENTS.md §5, README, PR

## Decisions

- Item names are `<Rarity> <Template>` («Rare Plate Armor»); the Russian gender forms of the tier
  adjective now all hold the same English word (keys kept for compatibility).
- Units: Russian «п.п.» → «pp» (percentage points), «п.» → «pts».
- The 12 Level III awakening names were missing from the glossary; added with † (owner review).
- `tests/talents/catalog.test.ts` still parses the Russian `docs/talents.md`: structure must match,
  names must equal the glossary mapping, and every English rank text keeps the same numbers.

## Verification log

- Phase 3: `tests/engine/no-cyrillic.test.ts` (fails on any Cyrillic in `src/` / `index.html`;
  verified to fail with a probe file); `tests/persistence/old-save-task23.test.ts` loads a v7 save
  and an export written by the pre-Task-23 code (commit f3116ee) unchanged and round-trips export →
  import; `tests/english-screens.mjs` (now part of `npm run test:e2e`): 19 screens × 1280×720 and
  844×390 — no Cyrillic, no horizontal scroll, no clipped text. It found the map-path names cut
  off with an ellipsis; fixed by layout (the name wraps onto two lines).
- Before/after screenshots: `docs/english/{before,after}-{desktop,mobile}-*.jpg` (home,
  equipment, talents, shop, map, quests, run, level-up, pause, results).
- Phase 4 (final): `npm run typecheck` ✓, `npm test` ✓ (131 files, 1,409 tests), `npm run
format:check` ✓, `npm run build` ✓, `npm run test:production` ✓, `npm run test:e2e` ✓
  (prototype, alpha, campaign, mobile, English screens), `GAME_LOCAL_QA=1 npm run build:qa` +
  `npm run test:qa` ✓, `test:build-policy` ✓. AGENTS.md §5 now says «UI text is English»; README
  has an English player guide and a Task 23 section.
- Not verified: the Cloudflare Preview (the sandbox cannot open `*.workers.dev`) and real phones
  (Chromium emulation only). Tone and wording of the translation need the owner's read-through;
  glossary entries marked † are proposals.
