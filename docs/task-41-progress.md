# Task 41 — progress

Spec: [task-41-bag-slots.md](task-41-bag-slots.md). Branch `task-41-bag-slots` → PR into the
integration branch `items-rework` (not `main`).

PR: https://github.com/pavnem-ux/Game/pull/41 (draft, into `items-rework`)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR (stacked on Task 40, owner decision)
- [x] 1 Slot upgrades: per-class slot levels 0–30, costs, main / milestone secondary multipliers in the gear pipeline
- [ ] 2 Salvage + bag: Ore per rarity, equipped lock, bulk salvage, capacity 60, «new» flags
- [ ] 3 Save: version bump (slot levels 0, «new» flags off), validation; quests forge.plus5 / plus10 back
- [ ] 4 Bag screen: equipped rows + upgrade, bag grid (filters, sort, markers, multi-select), item card
- [ ] 5 Shop layout: compact grid, «All» tab, compare / «better», short header line, sold-out placeholders
- [ ] 6 Delivery: docs, e2e, final checks, PR ready

## Decisions / blockers

- Started on top of `task-40-items-model` (PR #40 not yet merged into `items-rework`; owner chose to
  stack). `main` had no commits beyond `items-rework`, so nothing to merge there.
- Slot-upgraded main stats are not rounded in the pipeline (×1.04 of a whole number); the UI rounds.
