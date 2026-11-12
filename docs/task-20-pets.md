# Task 20 — Pets (Питомцы)

Repo: pavnem-ux/Game. Base: latest `main` with Task 19 merged (ore must exist). Branch `task-20-pets`.
Progress: `docs/task-20-progress.md`.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 20: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md: PR to `main`, never
   merge; GameplayWorld schedules pet actions as boundaries; damage/heal only through Combat Core; seeded
   RNG; buffs via `composeRunStats` (caps once).
4. Reuse the talent-spawned entity base and secondary-source framework from Task 09.1 (ballista, shadow
   copy) and the Task 18 sprite factory. Player text in Russian. Numbers in config, provisional.

## 1. Spec

### 1.1 Rules

- Pets are account-wide unlocks. Exactly one active pet per profile (`activePet`), shared by all classes —
  whichever class starts a run brings it.
- Pet follows the player (offset 40 behind, smooth follow, no collisions), can't be targeted or damaged,
  spawns at run start, removed at run end. Paused with the world.
- Pet hits/heals are secondary: source id `pet.<id>`, `procs=false`, never trigger synergies, talents or
  on-hit effects unless listed; shown as their own source in run stats/DPS.
- «Player damage» below = the higher of the player's current physical/magical damage (snapshot).
- Pet levels 1–5; each level above 1 adds +20% to the pet's main number (level 5 = ×1.8).
  Upgrade to level 2/3/4/5: Gold 500/1000/2000/4000, Ore 10/20/35/50 (in the Forge, «Питомцы» tab).

### 1.2 Pets (level 1 values)

| Id         | Name            | Effect                                                                                                          | Source          |
| ---------- | --------------- | --------------------------------------------------------------------------------------------------------------- | --------------- |
| `firefly`  | Светлячок Лучик | heals 2% Max HP every 8 s                                                                                       | quest (Task 21) |
| `owlet`    | Совёнок Угу     | shoots the nearest enemy within 400 every 1.2 s: 20% player damage                                              | shop 1500 Gold  |
| `fox`      | Лисёнок-огонёк  | every 6 s dashes through the nearest enemy within 300: 60% player damage (magical) + 1 Burn stack (3/tick, 4 s) | quest (Task 21) |
| `hedgehog` | Ёжик-хранитель  | aura: +6 resistance; every 10 s a 1.5 s barrier of 5% Max HP (existing barrier slot rules)                      | shop 2500 Gold  |
| `kitten`   | Котёнок удачи   | +10% coins collected, +15% pickup radius                                                                        | shop 3000 Gold  |
| `wolf`     | Дух-волк        | aura: +8 attack speed, +5% movement speed                                                                       | quest (Task 21) |

- Main number per pet for levelling: heal %, damage %, damage %, resistance (and barrier %), coin %
  (radius stays), attack speed (movement stays).
- Quest-only pets are visible in the shop as «Награда за задание».

### 1.3 UI

- Pet selection (hub button «Питомцы» and a pet slot shown on the equipment screen for every class):
  owned pets list, choose the active one; pet card with portrait, level, effect at current/next level.
- Shop tab «Питомцы». Forge tab «Питомцы». HUD: small pet icon with cooldown ring for active effects.
- Procedural sprites per pet (idle bob, action animation); light source in darkness (Task 18).

### 1.4 Save

Schema v6 + migration: `ownedPets: []`, `petLevels: {}`, profile-level `activePet: null`. Validation like
items. Export/import, backup, bug reports include pets.

### 1.5 Debug

Unlock all pets, set pet level, spawn pet in the current run.

## 2. Phases

- **0 Setup:** branch, progress file, draft PR.
- **1 Data & meta:** pet config, ownership, loadout, levels, shop/forge logic, save v6.
  Tests: buy/upgrade costs; quest-only pets not purchasable; one active pet per profile, same for every
  class; migration without loss.
- **2 Runtime:** follow behaviour + the six effects. Tests per pet: timing, targeting/range, values per
  level, heal never revives, barrier rules, auras via `composeRunStats`, coin bonus applied once, no proc
  chains, pause freezes, same seed ⇒ same results.
- **3 UI & visuals:** slot, shop tab, forge tab, HUD, sprites.
- **4 Delivery:** full checks from AGENTS.md §6 (+ e2e incl. mobile); docs `docs/PETS.md`, README,
  `docs/playtest.md` (Russian); PR with a pet DPS/heal table at levels 1 and 5. Don't merge.
