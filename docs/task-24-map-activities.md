# Task 24 — Map Activities (Shrine, Lantern, Thief, Nest)

Repo: pavnem-ux/Game. Base: latest `main` with Task 23 (English) merged. Branch `task-24-activities`.
Progress: `docs/task-24-progress.md`.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 24: <step> <summary>` → push → tick in progress file. Phases back-to-back;
   stop only on a blocker or when done.
3. Follow AGENTS.md: PR to `main`, never merge; GameplayWorld is the only scheduler (activity spawn,
   completion, failure and expiry are boundaries); Combat Core owns HP/damage; seeded RNG; rewards once;
   enemy cap 120 and reserved elite/boss slots respected. Owner approves adding the tie-order slots in 1.6.
4. Reuse: chests/buffs (Task 12), coins/ore (Tasks 11/19), enemy types and spawner (Task 12), light and
   sprites (Task 18), quests (Task 21), audio (Task 14). Player text in English. Numbers in config,
   provisional in docs.

## 1. Spec

### 1.1 Scheduling

- First activity at 0:50, then every 75 s ±15 s (seeded) while the run is active and before the map
  duration is reached. Max 2 activities on the map at once (skip the spawn at the limit, timer keeps going).
- Position: 500–900 units from the player, inside the arena, ≥ 300 from chests/other activities.
- Not started within 45 s → fades out (no reward).
- Available types: maps 1–10 Shrine + Thief; 11–20 + Lantern; 21–40 + Nest. Type roll seeded, no same type
  twice in a row when another is available.
- Off-screen arrow at the screen edge (icon + distance) for each active activity; on-screen label;
  spawn toast («A shrine has appeared»), success/failure toast, sounds.

### 1.2 Shrine («Shrine of Embers»)

- Circle radius 90. Capture by standing inside: 9 s total; outside, progress decays at half speed.
- While the player is inside: one extra enemy (act mix of normal types) spawns on a ring 250–350 around the
  shrine every 1.5 s (within the cap).
- Reward: an enchanted chest at the shrine (existing Task 12 content table).

### 1.3 Dying Lantern («Dying Lantern»)

- Activate by standing within 60 for 1 s. Then defend for 30 s: the lantern has 100 Light; each enemy
  within 70 of it drains 2 Light/s (no enemy AI change — enemies chase the player as usual).
- During the defence one extra enemy spawns on a ring 300–400 around the lantern every 2 s (within the cap).
- Success: coins = 6% of the map's victory Gold + Ore 1 (maps 21–40: Ore 2); the lantern stays lit as a
  light source until the run ends. Failure at 0 Light: no reward.

### 1.4 Treasure Thief («Treasure Thief»)

- Spawns 350 from the player and flees: new `flee` enemy behaviour (moves away from the player, steers
  away from arena edges), speed = 95% of the player's base movement speed, HP = 6× a normal melee enemy
  (map scaling applies), no attack, normal status rules.
- Escapes (disappears, no reward) 20 s after spawning. Kill reward: coin burst worth 8% of the map's
  victory Gold; 20% (seeded) +1 Ore.

### 1.5 Blight Nest («Blight Nest»)

- Stationary, targetable enemy-affiliation entity, HP = 25× a normal melee enemy (map scaling), no attack,
  immune to Slow/Stun (DoTs work).
- Spawns one enemy (act mix) within 120 every 3 s while alive (within the cap; skipped at the cap).
- Lives until destroyed or 90 s (then it stops spawning and crumbles, no reward).
- Destroyed: a wooden chest at the nest (existing content table).

### 1.6 Integration

- New boundaries: activity spawn (after chest spawn in tie order), capture/defence completion and failure,
  thief escape, nest spawns and expiry (with reinforcement spawning). Progress is computed from simulation
  time at boundaries (no per-frame accumulation), frozen on pause/offer/revive prompt.
- Rewards follow existing coin/ore rules (victory: all coins; defeat: 50% coins; ore only on victory — ore
  from activities is banked into the run and paid with the victory snapshot).
- Run stats: activities spawned/completed/failed by type. Bug reports include active activities.
- Quests (Task 21): +8 quests — cleanse 10/50 shrines, defend 10/40 lanterns, catch 10/50 thieves, destroy
  10/50 nests; rewards Gold 500/1500 and Ore 15/40 (first/second tier of each). Lifetime counters + save
  migration (schema bump), retroactive = 0.
- Visuals: procedural sprites per activity, light (shrine glow, lantern light radius growing with Light),
  progress ring/bar over the object.

### 1.7 Debug (dev/QA only)

Spawn any activity next to the player, complete/fail it, show schedule overlay.

## 2. Phases

- **0 Setup:** branch, progress file, draft PR.
- **1 Framework:** scheduling, positions, expiry, off-screen arrows, toasts, run stats. Tests: spawn times
  (seeded), max 2, type availability per act, positions valid, expiry at 45 s, pause freezes.
- **2 Shrine + Thief:** Tests: 9 s capture, decay outside, extra spawns within cap, chest reward once;
  thief flee path deterministic, escape at 20 s, reward once, ore roll seeded.
- **3 Lantern + Nest:** Tests: activation 1 s, Light drain per enemy, 30 s success / 0 Light failure,
  reward amounts; nest HP, spawn interval, cap respected, Slow/Stun immunity, 90 s expiry, chest reward.
- **4 Quests & save:** counters, 8 quests, migration. Tests: counters once per finalized run; claim rules.
- **5 Visuals & audio:** sprites, light, progress UI, sounds.
- **6 Delivery:** full checks from AGENTS.md §6 (+ e2e desktop/mobile); docs `docs/ACTIVITIES.md`, README,
  `docs/playtest.md` (Russian); PR with an income table (average activity rewards per run on maps 1, 15,
  30, 40 via accelerated mode). Don't merge.
