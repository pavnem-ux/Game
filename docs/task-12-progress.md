# Task 12 — progress

Spec: [task-12-enemies-chests.md](task-12-enemies-chests.md) (owner's file; Prettier only added
blank lines and aligned the tables). Branch `task-12-enemies-chests` from `main` at `b6e7a88`
(Task 11 merged: `src/gameplay/coins.ts` present). All new numbers are **provisional**.

Current: Phase 2 (enemies)

Draft PR: https://github.com/pavnem-ux/Game/pull/10

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR
- [x] 1.1 Level cost formula `20 + 10·(L−1) + a·(L−1)²`, a = 0.25
- [x] 1.2 Pickup radius 42 → 74
- [x] Phase 1 tests (cost for L = 1, 10, 30, 50; no XP lost; pickup at 74 collects, beyond does not)
- [ ] 2.1 Per-type enemy stats config
- [ ] 2.2 swift + brute
- [ ] 2.3 `artillery` behaviour + bombard
- [ ] 2.4 Spawn mix per act
- [ ] Phase 2 tests
- [ ] 3.1 Chest spawn / expiry scheduling
- [ ] 3.2 Opening + wooden content
- [ ] 3.3 Enchanted content + buffs
- [ ] 3.4 HUD, popups, run stats
- [ ] Phase 3 tests
- [ ] 4.1 Tune `a`; level table; per-act enemy mix and chest income
- [ ] 4.2 Full checks (AGENTS.md §6 + e2e), docs (`ENEMY_AI.md`, `EXPERIENCE_WAVES.md`, `CHESTS.md`,
      README, `playtest.md`)
- [ ] 4.3 PR description

## Code map (Task 12)

Earlier maps: `docs/task-11-progress.md`, `docs/task-10-progress.md`.

- Pacing (1.1): `XP_RULES.costQuadratic` 0.25 in `src/gameplay/experience.ts`; `runXpCost(L)` =
  `20 + 10·(L−1) + round(a·(L−1)²)` (rounded so costs stay whole numbers). L = 1 / 10 / 30 / 50 →
  20 / 130 / 520 / 1110.
- Radius (1.2): `XP_RULES.pickupRadius` 74 (crystals and coins share it; reach = player radius +
  74 + crystal radius 5). Crystal merging uses its own 64-unit cells (unchanged).
- Tests: `tests/gameplay/pacing-radius.test.ts`.

## Decisions

- 1.1: the quadratic term is rounded to a whole number (`Math.round`), because run XP and costs are
  whole numbers everywhere (validated). L = 2 still costs 30; L = 3 costs 41 (was 40).
- 1.2: existing tests that relied on the old radius or cost: the linear-cost test now expects
  20 / 30 / 41, the run-level healing tests grant 91 XP for three levels (was 90), and the alpha e2e
  «real death crystals» case now kills at range (archer, enemies 250 units away). With a 74 radius
  a Warrior's melee kills drop their crystals inside the pickup reach, so they were collected at once.

## Verification log

- Phase 1: typecheck ✓, format ✓, `npm test` 1217 ✓, `test:e2e` 3 PASS.
