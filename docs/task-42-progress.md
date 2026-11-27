# Task 42 — progress

Spec: [task-42-drops-reforge.md](task-42-drops-reforge.md). Branch `task-42-drops-reforge` → PR into
the integration branch `items-rework` (not `main`).

PR: https://github.com/pavnem-ux/Game/pull/42 (draft, into `items-rework`)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR (stacked on Task 41)
- [x] 1 Bag capacity: base 25 + 5 Gold expansions; over-capacity rules (shop refuses)
- [x] 2 Drops: seeded per-run item stream; boss (victory) + elite 5% rolls; item level caps; pickups in the run
- [x] 3 Run end: loot into the profile once (full bag: auto-salvage Common/Uncommon, Rare+ past capacity); Loot on results
- [x] 4 Reforge: one secondary stat, cost by rarity / level / count, saved count
- [x] 5 Shop refresh: paid redraw per class and level, count in the seed
- [ ] 6 Quest forge.tier4 back; save version bump; DEV / QA hooks
- [ ] 7 UI: Bag header expand, reforge on the card, shop refresh button, run pickups / toast / Loot
- [ ] 8 Delivery: docs, e2e, final checks, PR ready

## Decisions / blockers

- PRs #40 and #41 are not merged into `items-rework` yet: stacked on `task-41-bag-slots` (spec rule).
- Run loot uses temporary uids (`drop-<n>`); the profile assigns real `i<n>` uids when the result is applied. The boss item is granted when the run resolves as a victory with the boss killed. `legendaryRoll` in `equipment/drops.ts` is the Task 43 hook (draws nothing today).
- Loot reaches the profile in drop order; the bag-full check is made per item as it is added (auto-salvage Ore goes to the profile Ore, listed per item in the summary, not in `oreGained`). Abandoned runs grant no loot. The Loot block on the results screen is part of step 7 (UI).
- Reforge draws come from a stream seeded by (shop salt, uid, reforge count): the same profile state always gives the same result (no wall clock).
