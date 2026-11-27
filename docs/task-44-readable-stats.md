# Task 44 — Readable stats (items rework polish)

Follow `docs/TASK_WORKFLOW.md`, with the items-rework branching:

- If PRs #40–#43 are merged into `items-rework`: merge the latest `main` into it, push, and branch
  **`task-44-readable-stats`** from it. If not: stack on `task-43-legendaries` and note it in the progress file.
- Open the draft PR **into `items-rework`**, not `main`.

No numbers or rules change in this task — only how stats are shown and explained. All player-facing text in
English.

## Goal

A player understands every number on an item without knowing the engine. Today the units are mixed: «pp» (crit
chance, crit damage, cooldown reduction, dodge), a bare number for attack speed, «%» for the rest.

## Spec

### 1. One unit: «%»

- Show every percent-like stat with **«%»**, never «pp» and never a bare number:
  - Crit chance, Crit damage, Cooldown reduction, Dodge: `+3.2%` (the value is added to the current percent).
  - Attack speed: `+3.4%` (its value is percent of the base speed 100).
  - Unchanged: Damage %, Physical / Magic damage %, Elite & boss damage, Area size, Max HP %, Movement speed,
    Pickup radius, Run XP, Gold find (already «%»). HP regen: `+0.36% max HP / s`.
- Flat main stats stay plain numbers: `Damage +14`, `HP +60`, `Armor +20` (rename «resistance» to «Armor» wherever
  the player sees it, if it still shows).
- Apply the same format everywhere a stat is shown: Bag card and compare, shop cards, results Loot, pickup toasts,
  character / stat panels, Legendary effect texts, quest texts, DEV tools. Keep «pp» only in docs.
- One formatter for stat values (sign, decimals, unit) used by every screen.

### 2. Explain each stat

- Hovering (desktop) or tapping (mobile) a stat name on an item shows a one-line explanation:

| Stat                    | Explanation                                   |
| ----------------------- | --------------------------------------------- |
| Damage                  | Flat damage added to every hit.               |
| Physical / Magic damage | More damage of your class's type.             |
| Damage %                | More damage from all your hits.               |
| Attack speed            | Attack this much faster.                      |
| Crit chance             | Added to your chance to land a critical hit.  |
| Crit damage             | Critical hits deal this much more.            |
| Cooldown reduction      | Skills recharge faster.                       |
| Elite & boss damage     | More damage to elites and bosses.             |
| Area size               | Larger areas for your attacks and skills.     |
| HP / Max HP %           | More maximum health.                          |
| HP regen                | Heal this share of max HP every second.       |
| Armor                   | Reduces damage you take.                      |
| Dodge                   | Added to your chance to avoid a hit.          |
| Movement speed          | Move faster.                                  |
| Pickup radius           | Collect crystals and coins from farther away. |
| Run XP                  | More experience from crystals during a run.   |
| Gold find               | More Gold from coins (up to 25% from gear).   |

- Show the cap where one exists: «Crit chance (max 75%)», «Cooldown reduction (max 50%)», «Dodge (max 60%)».

### 3. Totals on the Bag

- Add a compact **«Stats»** panel to the Bag (collapsible, under the equipped slots): the class's final run-start
  values (damage, max HP, armor, attack speed, crit chance and damage, cooldown reduction, dodge, movement speed,
  pickup radius, run XP, gold find), each with the gear share in brackets, e.g. `Crit chance 24% (+9% gear)`.
- When an item card is open, the panel previews the change if it were equipped (green / red per line).

## Docs

- `docs/EQUIPMENT_SHOP.md`: a short «Units» note (pp in docs = «%» in the game).
