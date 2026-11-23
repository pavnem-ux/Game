# Task 38 — four new map activities

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `claude/stoic-carson-76vdrx` (session branch; no name given). Progress: [task-38-progress.md](task-38-progress.md).

Read `docs/ACTIVITIES.md`, `src/gameplay/activities.ts`, `src/gameplay/chests.ts` and the activity code in `src/gameplay/GameplayWorld.ts` first. Follow the existing conventions exactly: numbers live in `ACTIVITY_RULES`, type assignment in `activityTypesFor`, randomness uses the seeded `activities` stream, progress is sampled at the fixed 1/60 s control step, removals and damage go through Combat Core, world events go on the `activities` channel, the snapshot is extended, and each activity gets in-world labels, an `edgeArrow` pointer, HUD toasts, light effects and the existing activity sounds.

All global rules still apply (campaign only, max 2 activities on the map, 500–900 units from the player, 120 margin, 300 from chests and other activities, freeze on pause / level-up / death / revive prompt, never the same type twice in a row). A multi-point activity counts as ONE activity toward the limit, and every one of its points must satisfy the arena margin.

The player controls movement only. Every interaction must be "stand inside / touch", never a button or modal.

All player-facing text is English.

Run the phases back-to-back without waiting for approval. Do not add new tests or screenshots. Keep the existing checks passing.

## Phase 1 — shared groundwork

- A reusable "enemies inside circle" count (the Dying Lantern already counts enemies near the lantern; extract or reuse it rather than duplicating).
- Support for activities made of several linked points with one shared state and timer (needed by Lantern Chain and Three Seals).
- Map unlocks in `activityTypesFor`:
  - maps 1+: Snare Circle
  - maps 6+: Cursed Altar
  - maps 11+: Lantern Chain
  - maps 21+: Three Seals
- DEV/QA "Map activities" menu: add spawn and force complete / fail hooks for all four.

## Phase 2 — Snare Circle

- A marked circle, radius 110, lifetime 40 s.
- On spawn, compute a threshold: `clamp(round(enemiesWithin600OfPlayer * 0.4), 6, 20)`. Show `Lure enemies · 4/12` on the circle, updating live.
- When the count inside reaches the threshold: 0.6 s telegraph (circle flashes), then it snaps on the enemies inside at that moment.
- If the threshold is never reached, it snaps anyway at the end of its lifetime if at least one enemy is inside. Otherwise it fades with no effect.
- Snap effect: normal enemies die, elites take 25% of max HP, bosses take 10% of max HP. Never damages the player. Kills go through Combat Core and give the normal crystal and coin drops.
- Bonus only when triggered by reaching the threshold: one coin pile worth 3% of the map's victory Gold.
- Toast: "A snare has appeared".

## Phase 3 — Cursed Altar

- Altar with a radius-60 circle. Label: `Stand to accept · −25% max HP → Fury`.
- Standing inside for 1.5 s accepts. Leaving resets progress. Show progress on the circle.
- Cost: 25% of the player's MAX HP, removed from current HP through Combat Core. It is not enemy damage: no death trigger, no revive prompt, and it does not count as damage taken from enemies.
- If current HP is at or below the cost, the altar refuses. Label: `Too weak to pay`, no progress.
- Reward: Fury with the same strength as the chest Fury but 2× its duration. Put the multiplier in `ACTIVITY_RULES`. If Fury is already active, refresh it to the longer duration (do not stack strength).
- Fades after 45 s if not accepted. Single use.
- Toast: "A cursed altar has appeared".

## Phase 4 — Lantern Chain

- Visually distinct from the Dying Lantern (cold blue light instead of warm).
- First lantern: stand within 60 for 1 s to light it (same as the Dying Lantern activation). Unlit, it fades after 45 s.
- On lighting: the second lantern appears 600–800 units from the first, inside the arena, with its own `edgeArrow`. Timer = `ceil(distance / playerBaseMoveSpeed * 1.5)` seconds, shown as `Reach the next lantern · 14 s`.
- Touching the second lantern (within 60) in time: Enchanted Chest at the second lantern.
- On timeout, the second lantern dims. Touching it afterwards, within 20 s, gives a Wooden Chest. After that it fades with no reward.
- No extra enemy spawns. The pressure is the timer and the existing crowd.
- Toast: "A lantern chain has appeared".

## Phase 5 — Three Seals

- A sealed chest with three seals 250 units from it, 120° apart, with a seeded random rotation. The whole footprint must fit inside the arena margin.
- Each seal: stand within 60 for 3 s to break it. Outside, progress decays at half speed (like the shrine). Each seal shows its progress.
- Breaking a seal spawns a burst of 5 enemies on a ring just beyond that seal, on the side away from the chest (needs free slots below the enemy cap, otherwise fewer or skipped).
- After any 2 seals are broken, the chest unlocks. Label on the chest: `Open now, or break the last seal`. The third seal stays for 15 s, then fades.
- Touching the chest opens it and ends the activity:
  - 2 seals: coins = 6% of victory Gold (one pile) + 1 Ore
  - 3 seals: coins = 10% of victory Gold + 2 Ore
  - Ore is banked like other activity Ore (paid on victory only, `RunResult.activityOre`).
- No seal touched within 45 s: fades. Total lifetime after the first seal is touched: 90 s, then it fades with no reward.
- Toast: "Three seals have appeared".

## Phase 6 — docs

Update `docs/ACTIVITIES.md` with all four activities, their numbers, unlock maps and rewards, in the same style as the existing sections. Bump the save version only if persisted data changes.
