# Task 38 — progress

Spec: [task-38-new-activities.md](task-38-new-activities.md). Branch `claude/stoic-carson-76vdrx`.

PR: https://github.com/pavnem-ux/Game/pull/37

## Checklist

- [x] 0 Setup: branch, spec, progress file, draft PR
- [x] 1 Groundwork: shared enemies-in-circle count, multi-point activities, unlock maps, DEV/QA hooks
- [x] 2 Snare Circle
- [x] 3 Cursed Altar
- [x] 4 Lantern Chain
- [x] 5 Three Seals
- [x] 6 Docs + delivery: ACTIVITIES.md, README line, final checks, PR ready

## Decisions / blockers

- Owner spec: no new tests or screenshots (overrides the usual "logic ships with tests"); existing
  checks must stay green.
- Phases 1–5 landed as one commit (shared module changes); checked with a local scripted run (not
  committed): threshold snap + bonus, lifetime snap / fade, altar cost + 40 s Fury and refusal,
  chain in time / dimmed, 2 and 3 seals with bursts and Ore.
- Shared "enemies inside a circle" = `GameplayWorld.enemiesNear` (now also collects ids); linked
  points live in `ActivityState.points` (one state, one timer, one slot).
- Snare snap = Combat Core periodic damage from the player (`activity-snare`), Resistance
  pre-compensated so 25% / 10% of Max HP is exact; activity enemies (thief / nest) are not caught.
- Altar cost = new additive `CombatCore.payHp` (not damage, never lethal, no events); refusal is
  checked at each control step and again at the instant of acceptance. `grantBuff` takes an
  optional duration and never shortens a longer running buff.
- Save unchanged: quest counters stay on the four Task 24 types (`CountedActivityType`).
- Tests touched only where the owner's spec changed expectations: the unlock table in
  `activities.test.ts`; `task12-debug.test.ts` timeline test now uses test protection (the new
  activity rolls let the act-1 elite kill the idle, undefended player at 4:07).
- Lantern Chain timer with the spec formula is 5–7 s (600–800 units at 185 speed × 1.5); the
  spec's «14 s» example would need a slower base speed — numbers left as specified.
