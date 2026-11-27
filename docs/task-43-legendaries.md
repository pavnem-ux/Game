# Task 43 — Legendary items (items rework, part 4 of 4)

Follow `docs/TASK_WORKFLOW.md`, with the items-rework branching:

- If PRs #40–#42 are merged into `items-rework`: merge the latest `main` into it, push, and branch
  **`task-43-legendaries`** from it. If not: stack on `task-42-drops-reforge` and note it in the progress file.
- Open the draft PR **into `items-rework`**, not `main`.

Builds on Tasks 40–42 (item instances, Bag, slot upgrades, drops, reforge, `legendaryRoll` hook in
`src/equipment/drops.ts`). All numbers are provisional and live in one config place. All player-facing text in
English.

## Goal

10 Legendary items, each with a unique effect that changes how the player plays. They drop only from bosses; each
boss has its own pool of 3.

## Spec

### 1. The item

- Rarity Legendary: main stat ×1.20, **3 random secondary stats** at an 80–100% roll (Task 40 rules), plus the
  item's fixed unique effect (`legendaryId`).
- Its own name (table below), no stat suffix. Icon: the slot's band icon (Task 40 §1a) with a Legendary frame. Rarity
  colour: orange / gold, everywhere (bag frame, card, ground glow, toast, Loot).
- The item card shows the unique effect text under the stats.
- Reforge (Task 42) changes only the 3 secondary stats, never the unique effect. Salvage pays 25 Ore (exists) and
  always asks to confirm.
- Duplicates are allowed: a second copy has different secondary stats.

### 2. The 10 Legendaries

Order (index) matters for the pools in §3.

| #   | Name                       | Slot             | Unique effect                                                                                                                                                  |
| --- | -------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Crown of the Barrow King   | Helm             | When HP drops below 30%: barrier of 30% max HP. Cooldown 60 s.                                                                                                 |
| 1   | Bark of the Old Leshy      | Armor            | When hit: thorns deal 150% of the player's resistance to enemies within 120. At most once per 1 s.                                                             |
| 2   | Stride of the Ash Wolf     | Leggings         | +15% movement speed. After 3 s of moving without stopping, the next attack is a guaranteed crit; a stop of 0.2 s or more resets the 3 s, and so does the crit. |
| 3   | Millwheel Gauntlets        | Gloves           | Every 30th basic weapon attack releases a shockwave: radius 200 around the player, 100% of the weapon damage.                                                  |
| 4   | Heart of the Mourner       | Amulet           | Healing above max HP becomes a barrier, up to 20% of max HP.                                                                                                   |
| 5   | Ring of the Water Tsar     | Ring             | Each crystal picked up heals 0.3% of max HP, at most 3% of max HP per second.                                                                                  |
| 6   | Edge of the Warden         | Weapon · Warrior | Every 5th direct hit on the same elite or boss deals double damage (counter per target).                                                                       |
| 7   | Staff of the Frost Warlord | Weapon · Mage    | Direct hits apply Chill (Slow 20%, 2 s, refreshed). Direct hits on Chilled targets deal +20% damage.                                                           |
| 8   | Bow of the Thunder Kite    | Weapon · Archer  | Direct hits on targets farther than 300 from the player deal +30% damage.                                                                                      |
| 9   | Fangs of the Mire Serpent  | Weapon · Rogue   | When an enemy with Bleed dies, its Bleed (remaining duration and strength) spreads to the 2 nearest enemies within 250.                                        |

### 3. Drops and pools

- **Only bosses** drop Legendaries (victory, like the boss item). Elite drops never become Legendary.
- Chance per boss item: Normal 0.5%, Hard 1%, Nightmare 3%, Elite Trial 3%. On success the boss item becomes a
  Legendary from the boss's pool (plug into `legendaryRoll`; apply it to the boss drop only).
- **Pool of map m:** `act = floor((m − 1) / 10)`, `k = (m − 1) % 10`; pool = Legendaries with index
  `(k + act) % 10`, `(k + act + 3) % 10`, `(k + act + 6) % 10`. Each Legendary is in 3 pools per act, 12 overall.
  Act I, map 1 → #0, #3, #6; map 4 → #3, #6, #9.
- Weapons of other classes are removed from the pool; then pick uniformly among what remains (1–3 items; never
  empty, every pool holds at least one non-weapon).
- **Item level:** as other drops — min(class level, difficulty cap), at most 50.
- Map card / boss info: show the map's Legendary pool (names, with the other classes' weapons dimmed).

### 4. Effects: engine rules

- Build the effects on the talent combat infrastructure (`src/talents`: runtime, dispatcher hooks, refresh-not-stack
  buffs, cooldowns, proc guard) rather than a parallel system. A Legendary effect is active while the item is
  equipped by the run's class.
- Every Legendary-created hit has the source `legendary:<id>` (its own run-stats row), `procs = false`, and never
  triggers talents, passives, synergies or other Legendaries.
- «Direct hit» = basic attacks and skills; DoT, talent, synergy and Legendary hits don't count (Edge of the Warden,
  Frost Warlord, Thunder Kite).
- Barriers follow the existing one-barrier rule (the larger one stays).
- Healing goes through Combat Core and never revives.
- Simulation time only; randomness from seeded streams. Same behaviour at ×1…×5.
- Movement speed +15% (Stride) is a gear modifier through the normal pipeline and caps.
- The guaranteed crit (Stride) is set when the next attack snapshot is created (crit is rolled once per attack).

### 5. DEV / QA

- Grant any Legendary at a chosen item level; force a Legendary boss drop.

## Docs

- New `docs/LEGENDARIES.md`: the 10 items, pools, chances, effect rules. Link it from `docs/EQUIPMENT_SHOP.md`.
