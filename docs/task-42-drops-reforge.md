# Task 42 — Item drops, bag expansions, reforge, shop refresh (items rework, part 3 of 4)

Follow `docs/TASK_WORKFLOW.md`, with the items-rework branching:

- If PRs #40 and #41 are already merged into `items-rework`: merge the latest `main` into `items-rework`, push, and
  branch **`task-42-drops-reforge`** from it. If they are not merged yet: stack on `task-41-bag-slots` (as Task 41
  stacked on Task 40) and note it in the progress file.
- Open the draft PR **into `items-rework`**, not `main`.

Builds on Tasks 40–41 (item instances, affixes, seeded `items` stream, Bag, salvage, slot upgrades). All numbers
are provisional and live in one config place. All player-facing text in English.

## Goal

Rare and Epic items now come from fights. The bag gets smaller and can be expanded for a lot of Gold. Reforge and a
paid shop refresh give Gold a purpose in the mid game.

## Spec

### 1. Bag capacity (replaces the 60 of Task 41)

- **Base 25 items** (starter weapons don't count; equipped items do). Account-wide, like the items.
- **Expansions: +10 each, bought with Gold**, up to 5 (max 75):

| Expansion | 1 (→35) | 2 (→45) | 3 (→55) | 4 (→65) | 5 (→75) |
| --------- | ------- | ------- | ------- | ------- | ------- |
| Gold      | 5 000   | 12 000  | 25 000  | 40 000  | 60 000  |

- The «Expand bag» button sits in the Bag header next to `Bag · 23 / 25`, shows the next price, and confirms.
- Existing saves above 25 items keep them (over capacity, see §3).

### 2. Drops

- **Boss (victory only):** 1 guaranteed item. Rarity by difficulty:

| Difficulty  | Uncommon | Rare | Epic |
| ----------- | -------- | ---- | ---- |
| Normal      | 60%      | 35%  | 5%   |
| Hard        | 30%      | 55%  | 15%  |
| Nightmare   | 10%      | 55%  | 35%  |
| Elite Trial | 10%      | 55%  | 35%  |

- **Each elite killed:** 5% chance of an item: Rare 80%, Epic 20%. Kept on defeat too.
- **Slot:** random among the 7 slots; a weapon is always the played class's.
- **Item level** = min(class level, cap), cap by difficulty: Normal `5 + map`, Hard `10 + map`, Nightmare / Elite
  Trial `15 + map`, never above 50.
- Affixes and values by the Task 40 rules. All draws from a seeded per-run stream, deterministic at every game
  speed. Legendary drops come in Task 43: leave one place where a Legendary roll will plug in.
- **In the run:** an elite's item drops on the ground as a pickup with a glow in its rarity colour (Uncommon green,
  Rare blue, Epic purple) and is collected by walking over it (the pickup radius applies). A short toast names it
  («Epic Plate Gauntlets of Fury»). Items still on the ground when the run ends are collected automatically, on
  victory and on defeat. The boss item goes straight to the results (the run ends at the boss kill).
- **Results screen:** a «Loot» block lists the items gained (icon, name in rarity colour, item level).

### 3. Full bag

- When the bag is full at the end of a run: new **Common and Uncommon** items are salvaged automatically (Ore paid,
  listed in Loot as «auto-salvaged → N Ore»).
- **Rare and higher are never lost:** they go into the bag even past capacity. The header shows the overflow in red
  (`Bag · 27 / 25`); while over capacity the shop refuses purchases until the player salvages or expands.

### 4. Reforge

- On the Bag item card, for **Rare, Epic and Legendary** items: pick one secondary stat → «Reforge». It is replaced
  by a random stat from the slot's pool that the item doesn't already have (never the same stat), with a new value
  in the rarity's roll range. A Legendary's unique effect (Task 43) is never touched.
- **Cost:** `base × max(0.2, itemLevel / 50) × 1.25^n` Gold, n = how many times this item was reforged (saved on
  the instance). Base: Rare 300, Epic 450, Legendary 600. The card shows the cost before confirming. No undo.
- The item name suffix follows its stats after a reforge (Task 40 rule).

### 5. Shop refresh

- A «Refresh stock» button per class in the shop: draws a new stock for the same class level (Common + 3 Uncommon
  per slot) and clears bought offers.
- **Cost:** 2 × the Uncommon price at the class level (`2 × round(60 × (1 + L/5))`), doubled for each further
  refresh at the same class level; resets on level-up. The refresh count is part of the stock seed.

### 6. Quests

- Bring back `forge.tier4` (same id and reward) as «Equip 7 items of Epic or better on one class».

### 7. Save and DEV

- Bump the save version: bag expansions bought, reforge count per item, shop refresh count per class. Production
  saves are still not migrated here.
- DEV / QA: force the boss drop rarity, spawn an elite drop at the player, set bag expansions.

## Docs

- `docs/EQUIPMENT_SHOP.md`: drops, bag capacity and expansions, full bag, reforge, shop refresh.
