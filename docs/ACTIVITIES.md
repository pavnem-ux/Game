# Map activities (Task 24)

Spec: [task-24-map-activities.md](task-24-map-activities.md) · progress:
[task-24-progress.md](task-24-progress.md). All numbers are **provisional** (owner-controlled) and
live in `ACTIVITY_RULES` (`src/gameplay/activities.ts`).

## 1. Rules

| Rule         | Value                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Where        | campaign runs only                                                                                                                     |
| Schedule     | first attempt at 0:50, then every 75 ± 15 s (seeded) while the run is active and before the map duration                               |
| Limit        | 2 activities on the map at once (lit lanterns do not count); at the limit the attempt is skipped, the timer keeps running              |
| Position     | 500–900 units from the player, inside the arena (120-unit margin), ≥ 300 from chests and other activities (16 seeded tries, else skip) |
| Types        | maps 1–10: shrine, thief · 11–20: + lantern · 21–40: + nest; seeded roll, never the same type twice in a row                           |
| Not started  | a shrine not entered / a lantern not activated within 45 s fades out (no reward)                                                       |
| Frozen       | pause, level-up offers, death and the revival prompt (everything is computed from simulation time)                                     |
| Enemy limits | thief, nest and every extra spawn need a free slot below the active cap (the reserved elite/boss slots stay free); otherwise skipped   |

### Shrine of Embers

- Circle of radius 90. Standing inside captures it in **9 s**; outside, progress decays at half
  speed. Decaying back to 0 after it was entered fails it ("abandoned").
- While the player is inside: one extra enemy every 1.5 s on a 250–350 ring around the shrine.
- Reward: an **Enchanted Chest** at the shrine (normal Task 12 content table).

### Dying Lantern

- Activation: stand within 60 for **1 s** (leaving resets it). Then a **30 s** defence: the lantern
  has 100 Light; every enemy within 70 drains 2 Light/s (enemy AI is unchanged — they chase the
  player). Light 0 fails it; reaching 30 s succeeds (Light reaching 0 at that same instant still
  counts as a success).
- During the defence: one extra enemy every 2 s on a 300–400 ring.
- Reward: coins = **6%** of the map's victory Gold (one pile at the lantern) + **Ore 1** (maps
  21–40: **2**); the lantern stays lit as a light source until the run ends.

### Treasure Thief

- Spawns 350 units from the player. New enemy-AI behaviour **`flee`**: moves directly away from
  the player and steers off arena edges closer than 220; speed = 95% of the player's base
  movement speed; HP = 6× a normal melee enemy (map scaling applies); never attacks; normal
  status rules.
- Escapes 20 s after spawning (no reward, no kill).
- Kill reward: a coin burst of 6 piles worth **8%** of the map's victory Gold, and a seeded 20%
  chance of **+1 Ore**.

### Blight Nest

- Stationary enemy (behaviour **`stationary`**), HP = 25× a normal melee enemy (map scaling), never
  attacks, **immune to Slow and Stun** (damage-over-time effects work).
- Spawns one enemy within 120 every 3 s while alive (skipped at the cap).
- Crumbles after 90 s (no reward). Destroyed: a **Wooden Chest** at the nest.

### Rewards

- Coins follow the existing rules (picked up normally; victory: all coins + bonus, defeat: 50%).
- Ore from activities is **banked** in the run and paid only with a victory, added to the map's
  Ore (the first-victory ×3 applies only to the map Ore). `RunResult.activityOre`.
- Reward chests (shrine, nest) are placed even at the 3-chest limit, so a reward is never lost.
- The thief / nest is an ordinary registered enemy: its kill also gives the normal melee crystal
  and coin chance. An escape / crumble removes it through Combat Core without any reward, kill,
  counted damage or death trigger (synergies, talents).

## 2. Scheduling (owner-approved tie slots, spec §1.6)

| Boundary                                                            | Rank | Position in the tie order                               |
| ------------------------------------------------------------------- | ---- | ------------------------------------------------------- |
| completion / failure / fade / lantern activation / escape / crumble | 8.7  | right after chest / buff expiry (8.6)                   |
| extra enemy spawns (shrine, lantern, nest)                          | 9.1  | with reinforcement spawning (9), right after it         |
| activity spawn                                                      | 9.3  | right after the chest spawn (9.25), before campaign 9.5 |

Progress is `value at t0 + rate`: the player's position changes only at the fixed 1/60 s control
step, so "inside the shrine / lantern" and "enemies near the lantern" are sampled at each control
step and stay constant until the next one; completion and failure times are exact boundaries.
Nothing accumulates per rendered frame, so the frame rate cannot change outcomes. A failure that
is already due survives a resample at its deadline (shrine progress or lantern Light at exactly 0
with a zero rate), and so does a result already reached (a shrine capture or lantern activation
completing on the step the player leaves), and after a lethal hit at time T the activity results already due at T still
resolve (AGENTS.md §4.6), including when that hit ends the run (revival already used): due results
are drained before the run's cleanup; new spawns, extra enemies and later deadlines stay frozen. Extra spawns use
the act's enemy mix with their own counters (reinforcement-wave composition is unchanged). All
randomness uses the new seeded stream `activities`.

## 3. API and data

- `RunActivities`: `spawnDue`, `spawnNear` (debug), `sample`, `nextResolveAt`, `resolveDue`,
  `nextEnemySpawnAt`, `enemySpawnsDue`, `ringPoint`, `attachEnemy`, `enemyDied`, `force` (debug),
  `isNest`, `getActivities`, `litLanterns`, `endRun`; `activityTypesFor`, `activityGold`,
  `lanternOre`.
- World events (channel `activities`): `activity-spawned`, `activity-spawn-skipped` (`limit` /
  `no-space` / `cap`), `activity-started`, `activity-faded`, `activity-completed`,
  `activity-failed` (`light` / `abandoned` / `escaped` / `expired` / `debug`), `activity-reward`
  (`coins`, `ore`, `chest`), `activity-enemy-spawned`.
- Snapshot `activities`: `items` (type, phase, progress, Light, fade / end times, enemy id, player
  inside), `litLanterns`, `nextSpawnAt`, `ore` (banked), `notice` (HUD toast). Null outside campaign
  runs.
- Enemy AI (additive): `FleeEnemyConfig` (`bounds`, `edgeMargin`), `StationaryEnemyConfig`.
  SkillEngine host (additive, optional): `controlImmune(targetId)`. RunChests (additive):
  `placeReward`.
- Run stats `activities`: spawned / completed / failed by type. Bug reports: `run.activeActivities`.
- Quests: group «Activities» — cleanse 10 / 50 shrines, defend 10 / 40 lanterns, catch 10 / 50
  thieves, destroy 10 / 50 nests; Gold 500 + Ore 15, then Gold 1500 + Ore 40. Lifetime counters
  `questCounters.activities` (added once per finalized run; abandoned adds nothing). **Save v8**
  (`migrateV7toV8`: counters start at 0).

## 4. Presentation

- World: shrine altar and lantern sprites, progress rings, the lantern's Light bar, the thief and
  nest drawn with their own looks; labels («Stand inside to cleanse», «Defend the lantern · 21 s»).
- Off-screen pointer at the screen edge for each activity (icon + distance; `edgeArrow`).
- HUD toast: «A shrine has appeared», «Lantern defended!», «The thief escaped», …
- Light: shrine glow, lantern light radius growing with its Light, defended lanterns lit for the
  rest of the run. Sounds: `activity-spawn`, `activity-complete`, `activity-fail`.
- Results: banked activity Ore shown next to the Ore line («(activities +2)»).

## 5. Debug (DEV / QA builds only)

«DEV · Testing» → «Map activities»: next spawn time, active count, banked Ore; spawn any activity
next to the player; Complete (normal reward) / Fail for each active one. Not in the production
build (`test:production` checks the markers).

## 6. Verification and limits

- Tests: `tests/gameplay/activities.test.ts`, `activities-shrine-thief.test.ts`,
  `activities-lantern-nest.test.ts`, `tests/quests/activities.test.ts`,
  `tests/engine/activity-arrows.test.ts`, `activity-visuals.test.ts`; e2e
  `tests/activities-browser.mjs` (desktop + phone).
- Income per run (bot: mage at the recommended level, seeds 1–3, walks to each activity; test
  protection keeps it alive — an upper bound for what a careful player collects):

  | Map | Victory Gold | Spawned | Completed | Coins | Ore (victory) | Enchanted / Wooden chests |
  | --- | ------------ | ------- | --------- | ----- | ------------- | ------------------------- |
  | 1   | 75           | 7.7     | 6.0       | 18    | 0.7           | 3.0 / 0                   |
  | 15  | 375          | 12.0    | 11.3      | 202   | 5.0           | 3.7 / 0                   |
  | 30  | 600          | 11.0    | 10.3      | 248   | 4.3           | 1.3 / 3.3                 |
  | 40  | 750          | 12.0    | 12.0      | 290   | 4.3           | 3.0 / 3.7                 |

- Not verified: how activities feel in human play (frequency, the thief's catchability without
  Slow, lantern difficulty with real crowds), real phones (Chromium emulation only), the
  Cloudflare Preview.
