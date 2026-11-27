# Task 45 — progress

Spec: [task-45-equipment-screen.md](task-45-equipment-screen.md). Branch `task-45-equipment-screen` →
PR into the integration branch `items-rework` (not `main`).

PR: https://github.com/pavnem-ux/Game/pull/45 (draft, into `items-rework`)

## Checklist

- [x] 0 Setup: branch, spec, progress file, Legendary icon files, draft PR (stacked on Task 44)
- [x] 1 Legendary icons: assets, provenance, registry / preload, used everywhere an item icon shows
- [x] 2 Equipment screen: name, paper doll (slots with icon / rarity name / +N, pet card), upgrade + Stats under the doll, bag + card on the right
- [x] 3 Hub: one battle button; no top navigation (title → hub, Gold / Ore); tiles for every section; «← Home» + Esc
- [x] 4 Delivery: docs, e2e, final checks, PR ready

## Decisions / blockers

- PRs #40–#44 are not merged into `items-rework` yet: stacked on `task-44-readable-stats` (spec rule).
- Legendary icons are manifest entries `item_<legendaryId>` (kind item-icon) under assets/icons/items/legendary/; `ItemArt` falls back to the slot's band icon when the art is missing. Preloading follows `ITEM_TEMPLATE_IDS` (now 40).
- Equipment: `BagScreen.tsx` → `EquipmentScreen.tsx` (`EquipmentPage`); the bag list keeps «Bag · N / cap». The pet aura enters Stats through a new optional `statSummary(..., petAura)` argument (`petAura(id, level)` in `src/pets/logic.ts`, also used by `PetRunner.modifiers()`), shown as «(+N pet)». No rule or number changed.
- Quick start removed outright (no DEV hook needs it): the browser suites now start runs through the hub («To battle» → «Play: map N») via the shared `tests/e2e-nav.mjs`, which also opens pages through the hub tiles.
- Esc → hub is skipped while any `aria-modal` dialog is open (the dialog's own Esc closes it).

## Verification

- `npm run typecheck`, `npm test` (158 files / 1647 tests), `npm run format:check`, `npm run build` — pass.
- `npm run test:e2e` (browser, alpha, campaign, activities, art) — pass.
- `npm run test:production`; `GAME_LOCAL_QA=1 npm run build:qa` + `npm run test:qa` — pass.
- Not run: `npm run test:e2e:extended` (mobile / English-screen suites were updated for the hub-only menu but not executed; mobile is frozen). Manual art scripts (`tests/*-screens.mjs`) were updated mechanically and not run.
