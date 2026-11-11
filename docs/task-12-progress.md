# Task 12 — progress

Spec: [task-12-enemies-chests.md](task-12-enemies-chests.md) (owner's file; Prettier only added
blank lines and aligned the tables). Branch `task-12-enemies-chests` from `main` at `b6e7a88`
(Task 11 merged: `src/gameplay/coins.ts` present). All new numbers are **provisional**.

Current: Phase 1 (pacing & radius)

Draft PR: https://github.com/pavnem-ux/Game/pull/10

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR
- [ ] 1.1 Level cost formula `20 + 10·(L−1) + a·(L−1)²`, a = 0.25
- [ ] 1.2 Pickup radius 42 → 74
- [ ] Phase 1 tests (cost for L = 1, 10, 30, 50; no XP lost; pickup at 74 collects, beyond does not)
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

_(filled in as steps land; earlier maps: `docs/task-11-progress.md`, `docs/task-10-progress.md`)_

## Decisions

## Verification log
