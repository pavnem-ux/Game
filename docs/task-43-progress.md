# Task 43 — progress

Spec: [task-43-legendaries.md](task-43-legendaries.md). Branch `task-43-legendaries` → PR into the
integration branch `items-rework` (not `main`).

PR: (draft, to be opened)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR (stacked on Task 42)
- [ ] 1 Catalogue: the 10 Legendaries (names, slots, effect config), validation, names / effect text
- [ ] 2 Drops: boss-only Legendary roll by difficulty, map pools, class weapon filter, item level
- [ ] 3 Effects A: Crown (barrier), Heart (overheal barrier), Ring (crystal heal), Stride (+15% move, guaranteed crit)
- [ ] 4 Effects B: Bark (thorns), Millwheel (shockwave), Warden (5th hit ×2), Frost Warlord (Chill), Thunder Kite (range), Mire Serpent (Bleed spread)
- [ ] 5 UI: card effect text, Legendary naming / frame, map pool on the map card; DEV grant / force drop
- [ ] 6 Delivery: docs/LEGENDARIES.md, tests, final checks, PR ready

## Decisions / blockers

- PRs #40–#42 are not merged into `items-rework` yet: stacked on `task-42-drops-reforge` (spec rule).
- The owner noted one item was reworked in this spec; the table in the spec file is followed as is.
