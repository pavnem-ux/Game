# Task 40 — progress

Spec: [task-40-items-model.md](task-40-items-model.md). Branch `task-40-items-model` → PR into the
integration branch `items-rework` (not `main`).

PR: https://github.com/pavnem-ux/Game/pull/40 (into `items-rework`)

## Checklist

- [x] 0 Setup: `items-rework` from `main`, branch, spec, progress file, draft PR
- [x] 1 Item model: instances, rarity, main stats, secondary stats (seeded `items` stream), names / icons by band
- [x] 2 Stat pipeline: flat gear modifiers before percent and caps; five new run stats
- [x] 3 Profile + save: owned instances, loadouts by uid, level gate, Forge removed, save migration
- [x] 4 Shop: derived seeded stock (Common + 3 Uncommon per slot), prices, bought offers per level
- [x] 5 Class levels (growth ×2/15, XP 100 + 6·L²), rewards (Gold ×0.8, Trial XP / scales), enemies, quests
- [x] 6 UI: shop / equipment pages adapted; DEV / QA grant-item hook
- [x] 7 Delivery: docs, final checks, PR ready

## Decisions / blockers

- Interpretation: Elite Trial class XP ×0.2 also applies to the defeat XP share (`xpScale` scales
  the whole class XP of the run), not only to the victory XP.
- Interpretation: the map 20 quest's item reward is removed (there are no fixed shop items any
  more); the quest pays its Gold (×0.8) and Ore only.
- Interpretation: the Forge page is kept for pet upgrades (hub tile «Upgrade pets with Gold and
  Ore»); item upgrades and the forge item tab are removed.
- Save v10 migration also clamps class XP that already pays for the next level on the new curve to
  cost − 1 (levels never change), so a migrated save is valid.
- With the 100 + 6·L² curve no map recommends level 30 any more (map 40 → 27; all 40 maps → 28).
- Hidden Forge quests that were already claimed stay in `questsClaimed` (ids kept; validation
  accepts them).
- The Gold-find cap (25%) is not reachable by today's pools (ring + legs, 8% each); it guards later
  sources (Task 43).
- Not verified: balance of the new numbers in real play (no bot measurement); Cloudflare Preview
  (the owner checks the Preview URL).
