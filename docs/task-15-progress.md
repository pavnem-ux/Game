# Task 15 — progress

Spec: [task-15-synergy-awakening.md](task-15-synergy-awakening.md) (owner's file; Prettier only added
blank lines). Source of truth: [synergies-v3.md](synergies-v3.md) — the owner's catalog v3, kept
byte-identical (listed in `.prettierignore`). Engine conflicts: `docs/synergies-v3-gaps.md` (created
when the first gap is found). Branch `task-15-synergies` from `main` at `e40d7a8` (Task 14 merged).
All numbers are **provisional** (alpha balance) and come only from the catalog.

Current: Phase 1 (levels)

Draft PR: (pending)

## Checklist

- [x] 0.1 Catalog saved, branch, progress file, draft PR
- [ ] 1.1 `synergyLevel` + resolver integration (level available at trigger time)
- [ ] 1.2 Level II multipliers for all 12
- [ ] Phase 1 tests
- [ ] 2.1 Mage awakenings (thermal_shock, wildfire, shattered_ice)
- [ ] 2.2 Warrior awakenings (skull_crusher, battle_momentum, seismic_impact)
- [ ] 2.3 Archer awakenings (toxic_barrage, plague_chain, deadly_precision)
- [ ] 2.4 Rogue awakenings (blood_frenzy, deep_wounds, final_cut)
- [ ] Phase 2 tests
- [ ] 3.1 Banners, card hints, panel pips
- [ ] 3.2 VFX + sounds
- [ ] 3.3 Debug controls
- [ ] Phase 3 e2e
- [ ] 4.1 Full checks (AGENTS.md §6 + e2e)
- [ ] 4.2 Docs (synergy doc, README, `playtest.md`)
- [ ] 4.3 PR description

## Code map (starting point)

Earlier maps: `docs/task-14-progress.md`, `docs/SYNERGIES_V2_DAMAGE.md`.

- `src/skills/synergies.ts`: `SYNERGY_RULES` (12 rules, `unlockPairs` in catalog order),
  `pairComplete` / `completedPairs` / `synergyUnlocked`, `validateSynergyRules` (module load),
  `SynergyResolver` (`unlockedIds()` cached by owned-skill count; per-target cooldowns
  `cool(id, target, s)`; trigger branches per synergy; cooldown cleanup for dead targets).
- `src/skills/config.ts`: `SYNERGY_TUNING` (v2 numbers: ×0.55, ×0.45, ×0.5, ×0.6, ×1.2, +15 AS,
  radii 130/90, cooldowns).
- `src/skills/synergy-info.ts`: overview / card hints / QA info from `SYNERGY_RULES`.
- `src/skills/damage-readout.ts`: dynamic damage readout per skill/synergy.
- `src/skills/SkillEngine.ts`, `abilities.ts`: auto abilities, area hits, zones, Slow/Stun.
- `src/skills/RunSkills.ts`: owned skills and ranks (input for `synergyLevel`).

## Decisions

## Verification log
