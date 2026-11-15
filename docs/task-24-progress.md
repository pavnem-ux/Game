# Task 24 — progress

Spec: [task-24-map-activities.md](task-24-map-activities.md) (owner's file). Branch
`task-24-activities`, created from `origin/task-23-english` (owner's exception: Task 23 / PR #21 and
Task 22 / PR #20 are not merged yet). The PR targets `main`; until #20 and #21 merge its diff also
shows their commits. Before each phase the latest `origin/task-23-english` is merged in so review
fixes from #20/#21 are included.

Current: Phase 5

Draft PR: https://github.com/pavnem-ux/Game/pull/22

## Checklist

- [x] 0 Branch, spec, progress file, draft PR
- [x] 1 Framework: scheduling, positions, expiry, off-screen arrows, toasts, run stats
- [x] 2 Shrine + Thief
- [x] 3 Lantern + Nest
- [x] 4 Quests & save (8 quests, lifetime counters, schema bump)
- [ ] 5 Visuals & audio
- [ ] 6 Delivery: full checks + e2e, `docs/ACTIVITIES.md`, README, `docs/playtest.md`, income table, PR

## Decisions

- **Module.** `src/gameplay/activities.ts` (`RunActivities`, pure, own seeded stream `activities`)
  holds scheduling, placement and every activity's state; `GameplayWorld` drives it at boundaries
  like `RunChests`. Thief and nest are ordinary registered enemies (kind `melee`, own profile and
  HP), so Combat Core owns their HP/death and the normal kill reward (crystal + coin chance) also
  applies; the activity reward comes on top.
- **Time model.** Player position changes only at the fixed 1/60 s control step, so "player inside"
  and "enemies near the lantern" are sampled at each control step and are constant until the next
  one. Each activity stores `value at t0 + rate`; completion/failure/expiry are exact boundaries
  (`t0 + remaining / rate`). Nothing accumulates per rendered frame; pause, level-up offers,
  death and the revival prompt freeze the clock and therefore all progress.
- **Tie order (owner-approved slots, spec §1.6).** Activity completion / failure / expiry / thief
  escape / nest crumble: rank 8.7 (right after chest/buff expiry 8.6). Extra enemy spawns of
  shrine / lantern / nest: rank 9.1 (with reinforcement spawning 9, right after it). Activity
  spawn: rank 9.3 (right after chest spawn 9.25, before campaign events 9.5).
- **Not started.** The 45 s window applies to the shrine (until the player first enters) and the
  lantern (until activated). Thief (20 s escape) and nest (90 s) have their own end times.
  A shrine whose progress decays back to 0 after it was started fails ("abandoned") so it cannot
  hold one of the two activity slots forever.
- **Lantern activation** needs 1 s inside 60 units without leaving; leaving resets it.
- **Reward chests** (shrine: enchanted, nest: wooden) are placed at the activity even when the
  3-chest limit is reached (a reward is never lost); they use the normal chest lifetime and table.
- **Quests.** A new group «Activities» (9th tab) with 8 quests; the catalogue is now 58 quests
  (`QUEST_COUNT`). Counters count completed activities per type, added once per finalized run
  (victory or defeat; abandoned adds nothing), like the Task 21 counters. DEV "Complete" counts.
- **Ore** from activities is banked in the run (`activityOre`) and paid only with a victory,
  added to the normal map ore (first-victory ×3 does not apply to it).
- **Thief** spawns 350 units from the player at a seeded free angle; its coin burst is 6 coin piles
  that together are worth 8% of the map's victory Gold (normal pickup and coin rules).
- **Caps.** Thief / nest and every extra spawn need a free slot below the active cap (which
  already excludes the reserved elite/boss slots); otherwise the spawn is skipped (`cap`).

## Verification log

- Phase 1: `tests/gameplay/activities.test.ts` (types per act, no repeat, first spawn 0:50 then
  75 ± 15 s seeded and reproducible, none after the map duration, max 2 / skip at the limit, cap
  reason for thief/nest, placement 500–900 / arena / ≥ 300 from chests and activities, 45 s fade,
  run stats, pause freezes, frame size does not change times), `tests/engine/activity-arrows.test.ts`.
  Extra activity spawns use the act mix with their own counters, so reinforcement-wave composition
  is unchanged (the Task 12 spawn-mix test still holds). Browser: marker, label, toast and the
  off-screen pointer checked on a DEV-spawned shrine.
- Phase 2: `tests/gameplay/activities-shrine-thief.test.ts` — shrine: 9 s capture as an exact
  boundary, half-speed decay outside and abandon at 0, one extra enemy every 1.5 s only while
  inside and never above the active cap (ring 250–350), one enchanted chest at the shrine once;
  thief: 350 from the player, `flee` profile at 95% of the base speed, 6× melee HP, never attacks,
  deterministic path inside the arena, escape at 20 s with no reward / kill / counted damage,
  kill reward = 6 coin piles worth 8% of the map's victory Gold once, seeded ~20% +1 Ore;
  banked activity Ore paid only with a victory (`applyRunResult`).
- Phase 3: `tests/gameplay/activities-lantern-nest.test.ts` — lantern: 1 s activation within 60
  (leaving resets), 100 Light, −2 Light/s per enemy within 70, 0 Light fails, 30 s defence
  succeeds (Light at 0 on that very instant still counts), fade only before activation, reward
  6% of victory Gold + Ore 1 (maps 11–20) / 2 (21–40), lantern stays lit, 14 extra spawns at
  +2…+28 s on a 300–400 ring within the cap; nest: 25× melee HP, never moves or attacks, one
  spawn within 120 every 3 s (skipped at the cap), immune to Slow / Stun via the new optional
  `SkillEngine` host hook `controlImmune` (DoTs still apply), crumbles at 90 s without reward,
  destroyed → one wooden chest at the nest; enemy-ai validation of `flee` / `stationary`.
- Phase 4: `tests/quests/activities.test.ts` — the 8 quests and rewards, counters once per
  finalized run (duplicate run id ignored, abandoned adds nothing), claim once (+500 Gold +15 Ore),
  older summaries without activities, invalid counts rejected, save v7 → v8 migration (all 0,
  nothing else changes) and invalid stored counters rejected. Updated pins: schema v8 (Task 11/19/
  21 save tests, transfer "newer version" now v9), 58 quests in 9 groups, and the Task 23 old-save
  test now expects exactly the v7 → v8 migration.
