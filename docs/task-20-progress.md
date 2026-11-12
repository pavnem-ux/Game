# Task 20 — progress

Spec: [task-20-pets.md](task-20-pets.md) (owner's file). Branch `task-20-pets` stacked on
`task-19-gear` (PR #17, itself stacked on #16): neither was merged into `main` when this task
started, and pets need Task 19's ore and forge. Rebase onto `main` once #16 and #17 are merged.

Current: Phase 4

Draft PR: https://github.com/pavnem-ux/Game/pull/18

## Checklist

- [x] 0 Branch, spec, progress file, draft PR
- [x] 1.1 Pet config, ownership, active pet, levels (pure)
- [x] 1.2 Shop / forge pet logic + store actions
- [x] 1.3 Save v6 (migration, validation)
- [x] Phase 1 tests
- [x] 2.1 Pet runtime: follow, lifecycle, boundaries
- [x] 2.2 Six effects
- [x] Phase 2 tests
- [x] 3.1 Pet selection (hub + equipment slot)
- [x] 3.2 Shop tab, forge tab
- [x] 3.3 HUD icon + cooldown ring; sprites, light
- [ ] 4 Full checks, docs, PR

## Decisions

- New framework-free module `src/pets/` (`config.ts`: `PET_CONFIG`, `PET_LEVEL_RULES`,
  `PET_FOLLOW`; `logic.ts`: pure buy / activate / upgrade with reasons `unknown`, `quest`, `owned`,
  `not-owned`, `max`, `gold`, `ore`). Profile actions in `src/profile/pets.ts`; store actions
  `buyPet`, `setActivePet`, `upgradePet` (one validated save each).
- Main numbers scaled per level (×1 … ×1.8): firefly heal %, owlet damage %, fox damage % (Burn
  per tick stays 3), hedgehog resistance **and** barrier %, kitten coin % (radius stays), wolf
  attack speed (movement stays).
- Levels: `petLevels` stores 2–5; level 1 is the default and not stored (save validation accepts 1
  and drops it, like item level 0).
- Save v6 (`migrateV5toV6`): `ownedPets: []`, `petLevels: {}`, `activePet: null`. Validation: known
  unique pet ids; levels only for owned pets; the active pet must be owned.
- Debug: `unlockAllPets`, `setPetLevel` (campaign debug, DEV/QA only).
- Runtime `src/pets/runtime.ts` (`PetRunner`, framework-free) owned by the Skill Engine:
  - The pet's timed action is an engine boundary in the **skill-action** slot (order after talent
    entity actions), so GameplayWorld stays the only scheduler; tie order unchanged otherwise.
    First action one interval after spawn; the target is chosen when the action resolves.
  - Position: simulation anchor = player − facing × 40 (pure, like the ballista's «behind the
    player»; frame-independent). Smooth follow is rendering only (Phase 3).
  - Not a Combat Core entity (can't be targeted/damaged/collided). Survives death/revival (frozen
    with the world); removed when the run ends (survival ended or campaign resolved).
  - Damage: exact pre-resistance base = % × max(player physical, magical), `noCritical`, `procs=false`,
    tags `pet` + `secondary`, attributed to `pet.<id>` (run stats / DPS, Russian label «Питомец
    «…»»). Owlet: projectile (type of the higher stat; speed 520, travel 1.25 × range); fox: instant
    magical hit (falls back to physical only if magical damage is 0) + Burn applied exactly as
    listed (no player status modifiers), origin `pet.fox`. Talent direct bonuses, passives and
    synergies never see pet hits.
  - Heal: Combat Core heal (never revives). Barrier: the shared slot (`grantBarrier`, C2 rules).
  - Auras (hedgehog resistance; wolf attack speed + movement %) join the engine's `modifiers()` →
    `composeRunStats` once (caps once).
  - Kitten: `RunCoins` credits +X% of each collected pile with a fractional carry (exactly ⌊X% ×
    collected⌋ over the run; skip grants excluded); pickup radius ×1.15 for crystals and coins.
    Coins enter the run result once via `coins.collected` (snapshot `coins.petBonus` when > 0).
  - Events: channel `pets` (`pet-action`: shot / dash / heal / barrier / idle); run stats
    `petSupport` (healing, barrier, actions). Persisted top sources accept `pet.<id>`.
  - Debug: testing action `{ type: 'pet', id, level }` → `world.spawnPet` (DEV/QA controller).
- UI: page «Питомцы» (hub tile; not in the top nav to keep it short) — every pet as a card
  (procedural SVG portrait, level, effect now / at the next level, source when not owned), «Взять
  в забег» / «Оставить дома», links to the forge / shop. Equipment screen: a «Питомец» slot under
  the paper doll (same for every class) that opens the page. Shop tab «Питомцы» (buy with
  confirmation; quest pets read «Награда за задание»). Forge tabs «Предметы» / «Питомцы» (effect now
  vs next, Gold + ore cost, «Улучшить до уровня N»). Presentation-only store state: `shopTab`,
  `forgeItem = 'pet:<id>'`.
- Visuals: six procedural pet textures (`pet-<id>`, Task 18 art/factory, pooled item sprites).
  The sprite follows the simulation anchor with exponential smoothing (`PET_FOLLOW.rate`, frame
  time; rendering only), idle bob, action animation (fox streak through the target, owlet spark,
  heal / barrier ring on the player). Light: a small light + tinted glow per pet (firefly bigger).
- HUD: pet portrait in the skill bar; timed pets fill a conic cooldown ring until the next action.
- DEV panel «Питомцы»: «Открыть всех питомцев», pet + level → «Установить уровень питомца»,
  «Призвать питомца в забег» / «Убрать питомца из забега» (testing action `pet`).
- `tests/pets/` added to the Vitest include list; `npm run test:pets`.

## Verification log
