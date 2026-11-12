# Pets (Питомцы) — Task 20

Spec: [task-20-pets.md](task-20-pets.md) · progress: [task-20-progress.md](task-20-progress.md). All
numbers are **provisional** (owner-controlled) and live in `src/pets/config.ts`.

## 1. Rules

- Pets are account-wide unlocks (`profile.ownedPets`). Exactly one active pet per profile
  (`profile.activePet`, or none), shared by every class: whichever class starts a run brings it.
- The pet follows the player 40 units behind (opposite the facing direction). It is not a Combat
  Core entity: it can't be targeted, damaged or collided with. It spawns at run start, survives
  death/revival (frozen with the world) and is removed when the run ends. Pause freezes it.
- «Player damage» = the higher of the player's current physical / magical damage, read when the
  pet acts.
- Pet hits and heals are **secondary**: source `pet.<id>`, `procs=false`, tags `pet` + `secondary`,
  no crit. They never trigger synergies, passives, talents or on-hit effects (only the listed fox
  Burn). They show as their own source in run statistics / DPS («Питомец «…»»); heal and barrier
  totals are in `runStats.petSupport`.
- Levels 1–5. Each level above 1 adds +20% to the pet's main number (level 5 = ×1.8). Upgrade to
  level 2 / 3 / 4 / 5 in the forge («Питомцы» tab): Gold 500 / 1000 / 2000 / 4000, ore 10 / 20 / 35 /
  50 (total to level 5: 7500 Gold, 115 ore).

## 2. Pets (level 1 → level 5)

| Id         | Name            | Effect (L1)                                                                                               | L5                     | Main number            | Source          |
| ---------- | --------------- | --------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------- | --------------- |
| `firefly`  | Светлячок Лучик | heals 2% Max HP every 8 s                                                                                 | 3.6%                   | heal %                 | quest (Task 21) |
| `owlet`    | Совёнок Угу     | every 1.2 s shoots the nearest enemy within 400: 20% player damage                                        | 36%                    | damage %               | shop 1500       |
| `fox`      | Лисёнок-огонёк  | every 6 s dashes through the nearest enemy within 300: 60% player damage (magical) + 1 Burn (3/tick, 4 s) | 108% (Burn stays 3)    | damage %               | quest (Task 21) |
| `hedgehog` | Ёжик-хранитель  | aura +6 resistance; every 10 s a 1.5 s barrier of 5% Max HP                                               | +10.8, 9%              | resistance + barrier % | shop 2500       |
| `kitten`   | Котёнок удачи   | +10% coins collected, +15% pickup radius                                                                  | +18% (radius stays)    | coin %                 | shop 3000       |
| `wolf`     | Дух-волк        | aura +8 attack speed, +5% movement speed                                                                  | +14.4 (movement stays) | attack speed           | quest (Task 21) |

Quest pets are shown in the shop as «Награда за задание» and cannot be bought (Task 21 will grant
them; until then only the debug tools unlock them).

### Output per second (exact formulas, pre-resistance)

D = player damage, H = Max HP. Example: class level 30 (D = 760; Max HP 400 archer / 700 mage).

| Pet      | Level 1                         | Level 5                    | Example L1 → L5 (D = 760)          |
| -------- | ------------------------------- | -------------------------- | ---------------------------------- |
| Owlet    | 16.7% D/s                       | 30% D/s                    | 127 → 228 DPS                      |
| Fox      | 10% D/s + Burn 12 per 6 s (2/s) | 18% D/s + 2/s              | 78 → 139 DPS                       |
| Firefly  | 0.25% H/s                       | 0.45% H/s                  | 1.0 → 1.8 HP/s (H = 400)           |
| Hedgehog | barrier 0.5% H/s, +6 resistance | 0.9% H/s, +10.8 resistance | 2.0 → 3.6 barrier/s (H = 400)      |
| Kitten   | +10% coins                      | +18% coins                 | map 40 coin target 450 → +45 / +81 |
| Wolf     | +8 attack speed, +5% movement   | +14.4 attack speed         | AS 130 → 138 / 144.4               |

Measured in the simulation (60 s, archer and mage level 30, stationary dummies): owlet 50 shots,
fox 10 dashes, hedgehog 6 barriers, firefly 7 heals, as the timers predict. The measured damage of
one-shot dummies is capped by their HP, so the table uses the exact formulas (unit-tested).

## 3. Runtime and integration

- `src/pets/runtime.ts` (`PetRunner`, framework-free) is owned by the Skill Engine. Its timed action
  is an engine boundary in the **skill-action** slot (after talent entity actions), so
  GameplayWorld stays the only scheduler; nothing else in the tie order changed. The first action
  comes one interval after the pet appears; the target is chosen when it resolves (no target → the
  action is skipped, the timer keeps running).
- Position: simulation anchor `player − facing × 40` (pure; frame-rate independent). The sprite
  follows it with exponential smoothing in the renderer only.
- Damage: `pet.<id>` attacks with exact base damage (`noCritical`) through Combat Core; the owlet
  uses a projectile (type of the higher stat), the fox an instant magical hit (physical only if the
  player has no magical damage) and applies Burn exactly as listed (no player status modifiers).
- Heal: Combat Core heal (clamped, never revives). Barrier: the one shared barrier slot (Task 09.1
  C2: a stronger barrier is never lowered, only its expiry extended).
- Auras: hedgehog / wolf modifiers join the engine's run modifiers → `composeRunStats` once (caps
  once).
- Kitten: `RunCoins` adds the bonus to each collected pile with a fractional carry (exactly ⌊X% ×
  collected⌋ over the run; offer-skip grants excluded) — so it is part of `coins.collected` and
  enters the run result once. Pickup radius ×1.15 for crystals and coins.
- Run start: `campaignStore.startRun` passes `pet: { id, level }` from `profile.activePet` for any
  class (`activePetOf`). `GameplayOptions.pet` is validated before the world is built.
- Events: world channel `pets` (`pet-action`: shot / dash / heal / barrier / idle) for run stats and
  rendering.

## 4. UI

- «Питомцы» page (hub tile): every pet as a card — procedural SVG portrait, level, effect now and
  at the next level; «Взять в забег» / «Оставить дома»; locked pets show their source.
- Equipment screen: a «Питомец» slot under the paper doll, the same for every class.
- Shop tab «Питомцы» (buy with confirmation). Forge tabs «Предметы» / «Питомцы».
- In the run: procedural sprite (idle bob; fox streak, owlet spark, heal/barrier ring), a small
  light in the darkness (firefly: a bigger warm one), HUD portrait with a cooldown ring for timed
  pets.

## 5. Save v6

`migrateV5toV6`: `ownedPets: []`, `petLevels: {}`, `activePet: null`; nothing else changes.
Validation: known, unique pet ids; levels 1–5 only for owned pets (1 is accepted and not stored);
the active pet must be owned. Export / import, backup and bug reports include pets. Persisted run
summaries accept `pet.<id>` sources.

## 6. Debug (DEV / QA build only)

«DEV · Тестирование» → «Питомцы»: «Открыть всех питомцев», pet + level → «Установить уровень
питомца», «Призвать питомца в забег» / «Убрать питомца из забега» (testing action
`{ type: 'pet', id, level }`).

## 7. Verification and limits

- Tests: `tests/pets/meta.test.ts` (catalogue, levels, costs, buy / activate / upgrade, quest pets
  not purchasable, save v6, store saves, debug), `tests/pets/runtime.test.ts` (lifecycle, follow,
  every pet's timing / range / values at levels, heal never revives, barrier slot rules, auras via
  `composeRunStats`, coin bonus once, no proc chains, pause, debug spawn, same seed ⇒ same results
  at different frame sizes); e2e `tests/mobile-browser.mjs` (shop pets tab, buy, activate from the
  hub tile, forge pet upgrade, run with the pet + HUD icon, at 844×390 and 768×1024).
- Not verified: balance against real play (pets on late maps, the kitten's economy effect); real
  devices.
