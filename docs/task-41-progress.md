# Task 41 — progress

Spec: [task-41-bag-slots.md](task-41-bag-slots.md). Branch `task-41-bag-slots` → PR into the
integration branch `items-rework` (not `main`).

PR: https://github.com/pavnem-ux/Game/pull/41 (draft, into `items-rework`)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR (stacked on Task 40, owner decision)
- [x] 1 Slot upgrades: per-class slot levels 0–30, costs, main / milestone secondary multipliers in the gear pipeline
- [x] 2 Salvage + bag: Ore per rarity, equipped lock, bulk salvage, capacity 60, «new» flags
- [x] 3 Save: version bump (slot levels 0, «new» flags off), validation; quests forge.plus5 / plus10 back
- [x] 4 Bag screen: equipped rows + upgrade, bag grid (filters, sort, markers, multi-select), item card
- [x] 5 Shop layout: compact grid, «All» tab, compare / «better», short header line, sold-out placeholders
- [x] 6 Delivery: docs, e2e, final checks, PR ready

## Decisions / blockers

- Started on top of `task-40-items-model` (PR #40 not yet merged into `items-rework`; owner chose to
  stack). `main` had no commits beyond `items-rework`, so nothing to merge there.
- Slot-upgraded main stats are not rounded in the pipeline (×1.04 of a whole number); the UI rounds.
- «new» markers live in `profile.newItems` (uids), not on the item instances.
- «better» = every main value ≥ the worn item's (slot bonus included) and one higher; an empty slot
  makes any fitting item better.
- At the bag cap the DEV grant tools refuse too (like the shop); Task 42 handles drops.
- Quest goal `item-level` became `slot-level` (highest slot level of any class); ids and rewards kept.
- The Bag replaces the Equipment page (same page id; nav / hub label «Bag»). The class's starter
  weapon is shown first in the grid (not counted) so it can be re-equipped; the pet slot of the old
  paper doll is gone (Pets page). With nothing selected the card shows the selected slot's item.
- Shop compare shows the main-stat difference per stat (armor: HP and resistance on one line); «better» uses the Bag rule. Bag full disables «Buy» with the bag-full reason.
- Mobile (frozen): on phones the item card sits under the bag, so the e2e scrolls it into view instead of asserting «Equip» without scrolling; nav items keep a 44 px minimum width.
