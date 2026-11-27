# Task 44 — progress

Spec: [task-44-readable-stats.md](task-44-readable-stats.md). Branch `task-44-readable-stats` → PR into
the integration branch `items-rework` (not `main`).

PR: https://github.com/pavnem-ux/Game/pull/44 (draft, into `items-rework`)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR (stacked on Task 43)
- [x] 1 One stat formatter («%» everywhere, flat main stats plain, «Armor»), applied to every screen
- [x] 2 Stat explanations (hover / tap) with caps
- [x] 3 Bag «Stats» panel: final run-start values, gear share, equip preview
- [x] 4 Delivery: docs Units note, tests, final checks, PR ready

## Decisions / blockers

- PRs #40–#43 are not merged into `items-rework` yet: stacked on `task-43-legendaries` (spec rule).
- «%» everywhere also covers the run skills (Haste, Precision, Deadly Strikes, Swiftness, Battle Cry), talent texts («pp» → «%») and pet auras; «Resistance» → «Armor» in every player-facing text (skills, talents, pets, Legendary text). Identifiers and docs keep their names.
- Explanations are a focusable stat name (`StatName`): hover on desktop, tap/focus on touch; the cap is part of the explanation line («Crit chance (max 75%): …»).
