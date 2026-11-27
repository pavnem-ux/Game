# Task 43 — progress

Spec: [task-43-legendaries.md](task-43-legendaries.md). Branch `task-43-legendaries` → PR into the
integration branch `items-rework` (not `main`).

PR: https://github.com/pavnem-ux/Game/pull/43 (draft, into `items-rework`)

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR (stacked on Task 42)
- [x] 1 Catalogue: the 10 Legendaries (names, slots, effect config), validation, names / effect text
- [x] 2 Drops: boss-only Legendary roll by difficulty, map pools, class weapon filter, item level
- [x] 3 Effects A: Crown (barrier), Heart (overheal barrier), Ring (crystal heal), Stride (+15% move, guaranteed crit)
- [x] 4 Effects B: Bark (thorns), Millwheel (shockwave), Warden (5th hit ×2), Frost Warlord (Chill), Thunder Kite (range), Mire Serpent (Bleed spread)
- [x] 5 UI: card effect text, Legendary naming / frame, map pool on the map card; DEV grant / force drop
- [ ] 6 Delivery: docs/LEGENDARIES.md, tests, final checks, PR ready

## Decisions / blockers

- PRs #40–#42 are not merged into `items-rework` yet: stacked on `task-42-drops-reforge` (spec rule).
- The owner noted one item was reworked in this spec; the table in the spec file is followed as is.
- Legendary items without a `legendaryId` (Task 40 DEV «Legendary set») stay valid as plain Legendaries (no unique effect). The Crown / Heart barrier duration is 10 s (provisional; the spec gives none).
- Effects live in `src/talents/legendary.ts` (LegendaryCombat) on the run's TalentRuntime (cooldowns `legendary:<id>`, proc guard); the Skill Engine calls them at the talent hook points. Legendary hits are tagged `legendary` + `secondary` (added to the talent secondary list), `procs = false`, source `legendary:<id>` (own run-stats row).
- Stride's guaranteed crit needs a Combat Core flag: `forceCritical` (additive; keeps the one crit draw so seeded sequences don't shift). The crit cap (75%) would otherwise block a guaranteed crit.
- Crown triggers on crossing below 30% by damage; Heart converts the part of any player heal above max HP (also a full-HP run-level heal); Ring heals through the same heal path (its overflow can feed Heart).
- Mire spreads each of the dead enemy's player Bleed stacks (strength) with the group's remaining duration; stacks it spread itself never spread again, and a kill by them alone never procs.
