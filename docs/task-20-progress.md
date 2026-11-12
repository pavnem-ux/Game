# Task 20 — progress

Spec: [task-20-pets.md](task-20-pets.md) (owner's file). Branch `task-20-pets` stacked on
`task-19-gear` (PR #17, itself stacked on #16): neither was merged into `main` when this task
started, and pets need Task 19's ore and forge. Rebase onto `main` once #16 and #17 are merged.

Current: Phase 2

Draft PR: https://github.com/pavnem-ux/Game/pull/18

## Checklist

- [x] 0 Branch, spec, progress file, draft PR
- [x] 1.1 Pet config, ownership, active pet, levels (pure)
- [x] 1.2 Shop / forge pet logic + store actions
- [x] 1.3 Save v6 (migration, validation)
- [x] Phase 1 tests
- [ ] 2.1 Pet runtime: follow, lifecycle, boundaries
- [ ] 2.2 Six effects
- [ ] Phase 2 tests
- [ ] 3.1 Pet selection (hub + equipment slot)
- [ ] 3.2 Shop tab, forge tab
- [ ] 3.3 HUD icon + cooldown ring; sprites, light
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
- `tests/pets/` added to the Vitest include list; `npm run test:pets`.

## Verification log
