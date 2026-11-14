# Task 23 — progress

Spec: [task-23-english.md](task-23-english.md) (owner's file). Branch `task-23-english` stacked on
`task-22-hud` (PR #20, not merged yet when this task started; the spec's base is "main with Task
22 merged"). Rebase onto `main` once #20 is merged. Text only: no gameplay, balance, layout or
save-semantics changes.

Current: Phase 2

Draft PR: https://github.com/pavnem-ux/Game/pull/21

## Inventory (before)

Cyrillic in `src/` (+ `index.html`): **89 files, 1,944 lines, ~1,513 string literals**. Largest:
`gameplay-ui/strings-ru.ts` (282 literals), `talents/catalog.ts` (234), `skills/damage-readout.ts`
(107), `campaign/config.ts` (95), `equipment/config.ts` (77), `gameplay-ui/DeveloperPanel.tsx` (69),
`gameplay-ui/SkillPanels.tsx` (67), skill catalogs (4 × 49 + 22), `skills/synergies.ts` (48),
`skills/synergy-info.ts` (39), `quests/config.ts` (27), `config/game.ts` (23, prototype).
Comments with Cyrillic (e.g. talent handlers) are translated too.

## Checklist

- [x] 0 Branch, spec, progress file, draft PR, inventory
- [x] 1 Glossary `docs/glossary-en.md`
- [ ] 2.1 UI / locale (`strings-en.ts`, components, number format, `index.html`)
- [ ] 2.2 Content catalogs (maps, bosses, enemies, items, talents, synergies, skills, pets, quests,
      chests / buffs)
- [ ] 2.3 Notifications, errors, debug / QA, prototype
- [ ] 3 Checks: no-Cyrillic test, screen snapshots (1280×720 + 844×390), old save / export
- [ ] 4 Full checks, AGENTS.md §5, README, PR

## Decisions

## Verification log
