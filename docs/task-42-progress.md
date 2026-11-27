# Task 42 — progress

Spec: [task-42-drops-reforge.md](task-42-drops-reforge.md). Branch `task-42-drops-reforge` → PR into
the integration branch `items-rework` (not `main`).

PR: (draft, to be opened)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR (stacked on Task 41)
- [ ] 1 Bag capacity: base 25 + 5 Gold expansions; over-capacity rules (shop refuses)
- [ ] 2 Drops: seeded per-run item stream; boss (victory) + elite 5% rolls; item level caps; pickups in the run
- [ ] 3 Run end: loot into the profile once (full bag: auto-salvage Common/Uncommon, Rare+ past capacity); Loot on results
- [ ] 4 Reforge: one secondary stat, cost by rarity / level / count, saved count
- [ ] 5 Shop refresh: paid redraw per class and level, count in the seed
- [ ] 6 Quest forge.tier4 back; save version bump; DEV / QA hooks
- [ ] 7 UI: Bag header expand, reforge on the card, shop refresh button, run pickups / toast / Loot
- [ ] 8 Delivery: docs, e2e, final checks, PR ready

## Decisions / blockers

- PRs #40 and #41 are not merged into `items-rework` yet: stacked on `task-41-bag-slots` (spec rule).
