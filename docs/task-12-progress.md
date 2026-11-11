# Task 12 — progress

Spec: [task-12-enemies-chests.md](task-12-enemies-chests.md) (owner's file; Prettier only added
blank lines and aligned the tables). Branch `task-12-enemies-chests` from `main` at `b6e7a88`
(Task 11 merged: `src/gameplay/coins.ts` present). All new numbers are **provisional**.

Current: Phase 4.3 (PR description)

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
- [x] 3.1 Chest spawn / expiry scheduling
- [x] 3.2 Opening + wooden content
- [x] 3.3 Enchanted content + buffs
- [x] 3.4 HUD, popups, run stats
- [x] Phase 3 tests
- [x] 4.1 Tune `a`; level table; per-act enemy mix and chest income
- [x] 4.2 Full checks (AGENTS.md §6 + e2e), docs (`ENEMY_AI.md`, `EXPERIENCE_WAVES.md`, `CHESTS.md`,
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
- Chests (3.1–3.4): `src/gameplay/chests.ts` — `CHEST_RULES` (45 s, 250–450, max 3, 60 s, blink 5 s,
  radius 16, 75/25, heal 50% × 15%, gold max(5, 2%), buffs 20 s), `BUFFS` (Ярость
  `damagePercent` +20, Быстрые руки `attackSpeed` +25, Лёгкий шаг `movementSpeedPercent` +20),
  `RunChests` (spawnDue/spawnAt, expireDue, touched, open, grantBuff, endRun), `buffModifiers`,
  `chestGold`. RNG stream `chests` (salt `0xc2b2ae35`).
- World: `chests` (campaign only); boundaries `chest-expire` rank 8.6 (after skill expirations
  8.5) and `chest-spawn` rank 9.25 (after reinforcement spawning 9, before the campaign events 9.5),
  both only while the run is active and the player can act; opening in `movePlayer` after
  crystals/coins; `openChest` (heal via `core.heal`, gold via `coins.drop` at the chest, magnet via
  `experience.collectAll` + `coins.collectAll` and the normal `progression()`; buffs via
  `syncBuffs()` → `SkillEngine.setExternalModifiers` (additive) → `composeRunStats`); buffs end in
  `campaignInput` on resolution. Snapshot `chests {items (blinking), buffs (remaining),
nextSpawnAt, lastOpened}`; channel `chests` (also fed to `RunStats`).
- `RunExperience.collectAll()`; `RunStats.chests` (spawned/opened by type, expired, contents, buff
  uptime); bug report `run.activeBuffs`.
- UI: `CampaignHud` buff bar (icon, name, seconds) + pickup popup (`chestPopupText`); chest
  drawing (wooden / enchanted, blinking) in `AlphaScene`; styles in `alpha.css`.
- Debug (1.5): world `debugSpawnChest(type, content?)`, `debugGrantBuff`, `setDebugAutoCollect`;
  controller `spawn-n`, `chest`, `buff`, `auto-collect`; QA snapshot `autoCollect`; panel fieldset
  «Сундуки и усиления» (`Chest Debug`) + enemy-kind spawner; overlay row «Уровень забега · 5/10/15
  мин» (`levelMarks`). Production markers added.
- Tests: `tests/gameplay/chests.test.ts`, `tests/persistence/task12-debug.test.ts`.

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
- 3.x: chests exist in campaign runs only (their gold uses the map's victory Gold and the coin
  rules; like coins in Task 11). The type is rolled at spawn (different look); the content at
  opening (a wooden chest's heal/gold depends on the HP at that moment). Contents of a dead player
  never resolve (chests open only in the control step, which runs only while the player can act;
  the heal also checks `alive`).
- 3.x: tie slots (owner-approved in the spec): chest/buff expiry 8.6 (with the skill expirations,
  after them); chest spawn 9.25 (after reinforcement spawning, before the Task 08 campaign events
  at 9.5). No other reordering.
- 3.x: position: up to 12 seeded tries (angle + distance) inside the arena (40-unit margin) and
  not overlapping another chest; otherwise the spawn is skipped like at the limit (`no-space`).
- 3.x: «+25% attack speed» = +25 points of `attackSpeed` (base 100 = the weapon's base rate);
  «damage +20% (physical and magical)» = `damagePercent` +20.
- 3.x: buff uptime counts a refreshed buff as one continuous application.
- 4.1: `a` = 0.4 (from 0.25): the clearing bots reach run level 69–72 at 15:00 on maps 10/25/40
  (target 70 ± 5). The first levels cost at most 10% more each (to level 5: 146 XP instead of 140; to
  level 10: 622 instead of 540).
- 4.1: chest gold adds up to +65% (map 1) / +30% (map 40) Gold to a won run when every wooden chest
  gives gold (full HP). Flagged for the owner (provisional `goldShare` 2%, `goldMin` 5).
- Browser QA `skills-ui-browser.mjs`: three queued level-ups now need 92 XP (20 + 30 + 42), was 90.
- `tests/campaign/boss-world.test.ts`: per-file timeout 30 s (each case simulates ~900 s since
  Task 11 moved map 10's boss to 15:00; ~4.5 s each was at the 5 s default under full-suite load).
- Task 10 test `modifiers.test.ts` (swift map 12) now checks the ×1.1 speed per kind: Act II waves
  mix in the new kinds from the first spawns.

## Measurements (4.1)

Bot runs on the accelerated simulation (`update(0.25)`), seed 1, debug auto-collect on (all XP and
coins pulled every second), test protection on (pacing only: every run reaches its end), each map at
its recommended level (class level = map number) with the reference talent build filled as far as
the level allows (0 / 5 / 12 / 21 ranks); the bot stands still and takes the first skill card.

Run level with a = 0.4 (final):

| Map        | Class  | Kills | 3:00 | 5:00 | 10:00 | 15:00 |
| ---------- | ------ | ----- | ---- | ---- | ----- | ----- |
| 1 (10 min) | mage   | 2563  | 18   | 29   | 45    | —     |
| 1 (10 min) | archer | 1862  | 17   | 24   | 39    | —     |
| 10         | mage   | 7384  | 28   | 41   | 58    | 70    |
| 10         | archer | 7211  | 26   | 39   | 57    | 69    |
| 25         | mage   | 7413  | 30   | 43   | 60    | 72    |
| 25         | archer | 7285  | 28   | 41   | 60    | 72    |
| 40         | mage   | 7432  | 30   | 43   | 61    | 72    |
| 40         | archer | 7375  | 29   | 42   | 60    | 72    |

Same runs' total XP re-costed for other `a` (15:00, mage/archer average; map 10 / 25 / 40):
a = 0 → 115.5 / 120.5 / 121; 0.25 → 77.5 / 80 / 80; 0.4 → 69.5 / 72 / 72; 0.5 → 66 / 68 / 68.
At 3:00: a = 0 → 34.5 / 37 / 38.5; 0.4 → 27 / 28.5 / 29.5 (the level count by 3:00 drops because those
runs already reach level ~30; the first levels themselves cost at most 10% more, see the decisions).

The standing-still melee bots (warrior, rogue) do not clear the waves at the recommended level
(266–857 kills; the arena fills to its cap), so they stay at run level 19–28 and are not a pacing
reference (a bot limitation; a human melee player moves).

Enemy mix (automatic spawns of one mage run per map, 2558–7444 spawns): map 1: melee 88 / ranged
12; map 10: 60 / 12 / swift 15 / brute 8 / bombard 5; map 25 (`ranged18`): 40 / 18 / 20 / 12 / 10;
map 40: 40 / 12 / 22 / 14 / 12 — exactly the configured shares.

Chests (mage, seeds 1–2, the bot walks to every chest; test protection keeps HP full, so every
wooden chest gives gold — an upper bound for gold): per run 13 (map 1) / 20 (maps 10–40) spawned,
all but the last one opened; enchanted 2–5 per run. Chest gold per run: map 1: 50–55, map 10:
84–102, map 25: 154–187, map 40: 210–240 (vs collected coins 89 / 241–251 / 441–464 / 588–638 and
victory bonus 30 / 120 / 186 / 300). Buff uptime 13–60 s per buff per run.

## Verification log

- Phase 4: typecheck ✓, format ✓, `npm test` 1244 ✓, build ✓, `test:production` 2 PASS, QA build +
  `test:qa` PASS, `test:e2e` 3 PASS.
- Phase 3: typecheck ✓, format ✓, `npm test` 1244 ✓, build ✓, `test:production` PASS (new
  markers), QA build + `test:qa` PASS, `test:e2e` 3 PASS; screenshot of chests, buff bar and
  bombards checked.
- Phase 2: typecheck ✓, format ✓, `npm test` 1228 ✓, build ✓, `test:e2e` 3 PASS; screenshot of
  the new shapes and a strike circle checked (DEV build).
- Phase 1: typecheck ✓, format ✓, `npm test` 1217 ✓, `test:e2e` 3 PASS.
