# Legendary items (Task 43)

Spec: [task-43-legendaries.md](task-43-legendaries.md) · progress:
[task-43-progress.md](task-43-progress.md) · items model: [EQUIPMENT_SHOP.md](EQUIPMENT_SHOP.md).
All numbers are **provisional** and live in `LEGENDARY_RULES` (`src/equipment/config.ts`).

## The item

A Legendary has the Legendary rarity:

- main stat ×1.20;
- 3 random secondary stats at an 80–100% roll;
- its fixed **unique effect** (`legendaryId`).

How it looks:

- It has its own name, with no stat suffix.
- The icon is the slot's band icon with the Legendary frame.
- The colour is gold / orange everywhere: bag frame, card, ground glow, toast, Loot.
- The item card shows the effect text under the stats.

Other rules:

- Reforge changes only the 3 secondary stats, never the effect.
- Salvage pays 25 Ore and always asks a second confirmation.
- Duplicates are allowed; each copy rolls its own secondary stats.
- Validation (`validateItem`): a `legendaryId` is allowed only on a Legendary of that item's slot, and for weapons only of that class.
- Legendaries without an effect, from the DEV «Legendary set», stay valid.

## The 10 Legendaries (pool order)

| #   | Name                       | Slot             | Unique effect                                                                                                                                |
| --- | -------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Crown of the Barrow King   | Helmet           | HP drops below 30% → barrier of 30% max HP (10 s). Cooldown 60 s.                                                                            |
| 1   | Bark of the Old Leshy      | Armor            | When hit: thorns of 150% of your resistance to enemies within 120. At most once per 1 s.                                                     |
| 2   | Stride of the Ash Wolf     | Legs             | +15% movement speed. After 3 s of moving without stopping, the next attack is a guaranteed crit (a stop ≥ 0.2 s or the crit resets the 3 s). |
| 3   | Millwheel Gauntlets        | Gloves           | Every 30th basic weapon attack: a shockwave of radius 200 around you, 100% weapon damage.                                                    |
| 4   | Heart of the Mourner       | Amulet           | Healing above max HP becomes a barrier, up to 20% max HP (10 s).                                                                             |
| 5   | Ring of the Water Tsar     | Ring             | Each crystal picked up heals 0.3% max HP, at most 3% max HP per second.                                                                      |
| 6   | Edge of the Warden         | Weapon · Warrior | Every 5th direct hit on the same elite or boss deals double damage (counter per target).                                                     |
| 7   | Staff of the Frost Warlord | Weapon · Mage    | Direct hits Chill (Slow 20%, 2 s, refreshed); direct hits on Chilled targets +20% damage.                                                    |
| 8   | Bow of the Thunder Kite    | Weapon · Archer  | Direct hits on targets farther than 300 deal +30% damage.                                                                                    |
| 9   | Fangs of the Mire Serpent  | Weapon · Rogue   | A dying enemy's Bleed (remaining duration, strength) spreads to the 2 nearest enemies within 250.                                            |

## Drops and pools

- **Only boss items** can become Legendary, on a victory. Elite drops never do.
- **Chance** per boss item: Normal 0.5%, Hard 1%, Nightmare 3%, Elite Trial 3% (`legendaryRoll` in `src/equipment/drops.ts`; one draw from the run's `items` stream).
- **Pool of map m:**
  - act = ⌊(m − 1) / 10⌋, k = (m − 1) mod 10;
  - indexes (k + act), (k + act + 3), (k + act + 6) mod 10;
  - examples: map 1 → #0 #3 #6, map 4 → #3 #6 #9, map 11 → #1 #4 #7;
  - each Legendary is in 12 pools.
- **Pick:** other classes' weapons are removed first, then one is chosen uniformly; every pool holds a non-weapon.
- **Item level:** as for other drops (min(class level, difficulty cap), ≤ 50).
- **Map card:** shows the pool (other classes' weapons dimmed) and the chance of the chosen tier.

## Engine rules

- **Where they run:** effects live in `src/talents/legendary.ts` (`LegendaryCombat`), on the run's `TalentRuntime`. It supplies the cooldowns `legendary:<id>` and the proc guard. The Skill Engine calls them at the talent hook points.
- **When they are active:** an effect works while its item is equipped by the run's class; the list is fixed at run start.
- **Legendary hits** (thorns, shockwave):
  - exact base damage, never critical, `procs = false`;
  - tagged `legendary` + `secondary`, source `legendary:<id>` with its own run-stats row;
  - never trigger talents, passives, synergies or other Legendaries.
  - A Bleed spread by Mire never spreads again, and a kill by it alone never procs.
- **«Direct hit»** = basic attacks and skills. DoT, talent, synergy, pet and Legendary hits don't count (Warden, Frost Warlord, Thunder Kite).
- **Barriers** use the one shared barrier slot (the larger one stays).
- **Healing** goes through Combat Core and never revives.
- **Stride's +15% movement** is a gear modifier: normal pipeline, caps once.
- **Stride's guaranteed crit** is set when the next attack snapshot is created. It uses the additive Combat Core flag `forceCritical`, which keeps the one crit draw so seeded sequences don't shift.
- **Time and randomness:** simulation time only, no new randomness in effects, same behaviour at every game speed.

## DEV / QA

- «Gear Debug» → «Legendary»: grant any Legendary at the chosen item level.
- Run debug → «Boss item: Legendary»: the boss item becomes the first fitting Legendary of the map's pool (testing command `legendary-drop`).

## Verification and limits

- Tests: `tests/equipment/legendaries.test.ts` (catalogue, validation, pools, chances), `tests/talents/legendaries.test.ts` (all 10 effects), `tests/gameplay/item-drops.test.ts` (boss Legendary in the run).
- Not verified: balance in real play; the Crown / Heart barrier duration (10 s) is not in the spec.
