# Task 45 — progress

Spec: [task-45-equipment-screen.md](task-45-equipment-screen.md). Branch `task-45-equipment-screen` →
PR into the integration branch `items-rework` (not `main`).

PR: https://github.com/pavnem-ux/Game/pull/45 (draft, into `items-rework`)

## Checklist

- [x] 0 Setup: branch, spec, progress file, Legendary icon files, draft PR (stacked on Task 44)
- [x] 1 Legendary icons: assets, provenance, registry / preload, used everywhere an item icon shows
- [x] 2 Equipment screen: name, paper doll (slots with icon / rarity name / +N, pet card), upgrade + Stats under the doll, bag + card on the right
- [ ] 3 Hub: one battle button; no top navigation (title → hub, Gold / Ore); tiles for every section; «← Home» + Esc
- [ ] 4 Delivery: docs, e2e, final checks, PR ready

## Decisions / blockers

- PRs #40–#44 are not merged into `items-rework` yet: stacked on `task-44-readable-stats` (spec rule).
- Legendary icons are manifest entries `item_<legendaryId>` (kind item-icon) under assets/icons/items/legendary/; `ItemArt` falls back to the slot's band icon when the art is missing. Preloading follows `ITEM_TEMPLATE_IDS` (now 40).
