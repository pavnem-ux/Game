# Task 19 — progress

Spec: [task-19-gear-upgrades-ore.md](task-19-gear-upgrades-ore.md) (owner's file). Branch
`task-19-gear` stacked on `task-16-mobile` (PR #16 was not merged into `main` yet when this task
started; the spec's base is "main with Task 16 merged"). Rebase onto `main` once #16 is merged.

Current: Phase 1

Draft PR: https://github.com/pavnem-ux/Game/pull/17

## Checklist

- [x] 0 Branch, spec, progress file, draft PR
- [x] 1.1 Helmet / gloves / pants templates, items, config
- [x] 1.2 Loadout + stats pipeline
- [ ] 1.3 Shop / equipment UI
- [ ] Phase 1 tests
- [ ] 2.1 Ore rewards, first-victory bonus, dedup
- [ ] 2.2 Ore UI
- [ ] 3.1 Upgrade logic (pure)
- [ ] 3.2 Stats with upgrade levels
- [ ] 3.3 Forge UI
- [ ] 4 Save v5 migration / validation
- [ ] 5 Full checks, docs, PR

## Decisions

- Slot order: Оружие, Шлем, Броня, Перчатки, Штаны, Амулет, Кольцо (`GEAR_SLOTS`).
- New template ids: `guard_helm`, `hunter_hood`, `mage_circlet`, `plate_gauntlets`,
  `trickster_gloves`, `sorcerer_gloves`, `plate_greaves`, `leather_pants`, `mystic_trousers`.
- "First stat ×1.0, second ×0.6" is applied to the new slots via `SECOND_STAT_REDUCED_SLOTS`
  (weapon + the 3 new slots). Task 11 armor keeps ×1.0 / ×1.0 (unchanged). New items cost the
  non-weapon tier price (80 / 300 / 700 / 1400 / 2500).
- The loadout and stats pipeline already iterates `GEAR_SLOTS`, so the new slots flow through
  `gearModifiers` → `composeRunStats` (caps once) with no new code path. Save validation fills a
  missing slot with `null`.
- Debug «Лучшее снаряжение»: the Mage gets the magic helmet / gloves / pants.

## Verification log
