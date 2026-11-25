# Task 39 — Stronger elites and map difficulty tiers

Follow `docs/TASK_WORKFLOW.md`. Base: latest `main`. Branch `task-39-difficulty-tiers`.
Owner request (chat) and answers to the clarifying questions. All numbers provisional (owner-controlled).

## Spec

1. **Elites everywhere:** elite health = **×10** the map's normal enemy health (was ×2.5). Elite damage
   unchanged (×1.4). The «Strong elites» map modifier still multiplies on top (×1.25 health, ×1.15 damage).
2. **Difficulty tiers per map** (four in total):
   - **Normal** — as today.
   - **Hard** — every monster (normal enemies, elites, boss) has **+50%** health and damage.
   - **Nightmare** — every monster has **+100%** health and damage.
   - **Elite Trial** — no normal enemies (no waves). The map lasts **3 minutes**: **5 elites** at 0:00,
     1:00 and 2:00; the **boss** appears at 3:00. Trial elites have **×3** health and damage of the map's
     Normal elites; the boss has **×3** health and damage of the map's Normal boss. The map is won when
     the boss dies (as on every map).
     Speed, enemy count and wave frequency are unchanged on Hard / Nightmare.
3. **Unlocks (per map, chained):** Normal → Hard → Nightmare → Elite Trial; the next tier of a map opens
   after a victory on the previous tier of the same map. A victory on any tier unlocks the next map
   (only Normal is open on a new map, so this is the Normal victory in practice).
4. **Rewards:** victory Gold and Ore ×1.5 (Hard), ×2 (Nightmare), ×2 (Elite Trial). Run XP and class XP
   unchanged. Defeat rewards unchanged.
5. UI: choose the tier on the map card before starting; locked tiers show what opens them. The run
   (pause info, results, recent runs) shows the tier. English UI text.
6. Save: the highest tier won per map is persisted (save version bump with a migration: maps already won
   count as Normal wins).

## Verification

Focused unit tests for the tier multipliers, the Elite Trial schedule, unlocks, rewards and the save
migration; existing tests updated only where the elite ×10 or the new data changes their expectations.
