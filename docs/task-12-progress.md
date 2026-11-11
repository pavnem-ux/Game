# Task 12 — progress

Spec: [task-12-enemies-chests.md](task-12-enemies-chests.md) (owner's file; Prettier only added
blank lines and aligned the tables). Branch `task-12-enemies-chests` from `main` at `b6e7a88`
(Task 11 merged: `src/gameplay/coins.ts` present). All new numbers are **provisional**.

Current: Phase 3 (chests)

Draft PR: https://github.com/pavnem-ux/Game/pull/10

## Checklist

- [x] 0.1 Branch from `main`, progress file, draft PR
- [x] 1.1 Level cost formula `20 + 10·(L−1) + a·(L−1)²`, a = 0.25
- [x] 1.2 Pickup radius 42 → 74
- [x] Phase 1 tests (cost for L = 1, 10, 30, 50; no XP lost; pickup at 74 collects, beyond does not)
- [x] 2.1 Per-type enemy stats config
- [x] 2.2 swift + brute
- [x] 2.3 `artillery` behaviour + bombard
- [x] 2.4 Spawn mix per act
- [x] Phase 2 tests
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
- Enemies (2.1–2.4): `src/gameplay/enemy-types.ts` — `EnemyKind` (melee, ranged, swift, brute,
  bombard), `NEW_ENEMY_TYPES` (name, hp/damage/speed factors, radius, XP, brute attack interval
  ×1.4), `ARTILLERY` (range 420, retreat 150, interval 3.2 × 1.3, circle 70, delay 1.0),
  `ENEMY_MIX` (first maps 2/4/6, per-act shares), `enemyMix`, `enemyKindConfig`,
  `enemyKindStats` (map-scaled base × factors; bombard: magical = melee physical × 1.2),
  `enemyKindXp`. Exported from `src/gameplay/index.ts`.
- Artillery (2.3): `ArtilleryEnemyConfig` (`behavior: 'artillery'`, `telegraph {radius, delay}`) in
  `src/enemy-ai/types.ts` + validation; `EnemyAI.attempt` marks the player's position
  (`artillery-marked`), pending strikes are EnemyAI boundary events (priority 4 = the world's enemy
  attack slot, key after attempts); `land()` resolves `artillery-strike` (overlap via the shared
  `circleHitsBody` in `src/enemy-ai/telegraph.ts`, also used by the boss circle AoE; damage through
  `core.createAttack/resolveAttack`, survival policy kind `'artillery'`, cancelled if the source is
  gone). `EnemyAI.getStrikes()`; world snapshot `artilleryStrikes`; the world forwards strike
  damage like contact hits (status adapter, combat events, dodge hook).
- World (2.2–2.4): `enemyKinds` map per enemy id; `spawnEnemy(kind)` accepts every kind;
  `enemyProfile(kind)` (map speed modifier on top); `registerEnemy` stats via `enemyKindStats`;
  kill XP via `enemyKindXp`; snapshot enemies carry `kind`; `nextSpawnKind()` (ranged = exact
  Task 06 rule first, then the new kind ≥ ½ behind its share, else melee); `wave-spawned.kinds`;
  `autoSpawnCounts()`. Run stats `EnemyType` adds swift/brute/bombard (kills, damage taken) with
  Russian labels. `AlphaScene` draws the new shapes and the filling red strike circle.
- Tests: `tests/gameplay/enemy-kinds.test.ts`.

## Decisions

- 1.1: the quadratic term is rounded to a whole number (`Math.round`), because run XP and costs are
  whole numbers everywhere (validated). L = 2 still costs 30; L = 3 costs 41 (was 40).
- 1.2: existing tests that relied on the old radius or cost: the linear-cost test now expects
  20 / 30 / 41, the run-level healing tests grant 91 XP for three levels (was 90), and the alpha e2e
  «real death crystals» case now kills at range (archer, enemies 250 units away). With a 74 radius
  a Warrior's melee kills drop their crystals inside the pickup reach, so they were collected at once.
- 2.4: «Act I max 15/8/5%» is read as the act's share once a kind is unlocked (no ramp inside the
  act). The ranged share stays as now (a share of all normal spawns); melee is the rest.
- 2.4: selection rule. Ranged first with the exact Task 06 rule (maps 1 and sandbox keep their exact
  spawn sequence), then the new kind furthest behind its share by ≥ ½. Simulated over 3000 spawns
  for every act's shares: max deviation ranged < 1, new kinds ≤ 0.64. A plain «furthest behind
  by ≥ 1» rule let brute drift to 1.12–1.24.
- 2.3: the strike hits when the player's body overlaps the circle (same rule as the boss circle
  AoE, shared helper). A strike whose bombard died or was removed is cancelled (no damage). A stun
  stops new marks; a strike already marked still lands (like a launched projectile). The attack is
  created at landing (Combat Core, survival policy, talent damage-taken multiplier).
- 2.3: retreat distance 150 and hysteresis 18 like the ranged enemy (spec: «keeps range like the
  ranged enemy»).
- Task 10 test `modifiers.test.ts` (swift map 12) now checks the ×1.1 speed per kind: Act II waves
  mix in the new kinds from the first spawns.

## Verification log

- Phase 2: typecheck ✓, format ✓, `npm test` 1228 ✓, build ✓, `test:e2e` 3 PASS; screenshot of
  the new shapes and a strike circle checked (DEV build).
- Phase 1: typecheck ✓, format ✓, `npm test` 1217 ✓, `test:e2e` 3 PASS.
