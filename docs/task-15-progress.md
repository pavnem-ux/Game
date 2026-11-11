# Task 15 — progress

Spec: [task-15-synergy-awakening.md](task-15-synergy-awakening.md) (owner's file; Prettier only added
blank lines). Source of truth: [synergies-v3.md](synergies-v3.md) — the owner's catalog v3, kept
byte-identical (listed in `.prettierignore`). Engine conflicts: `docs/synergies-v3-gaps.md` (created
when the first gap is found). Branch `task-15-synergies` from `main` at `e40d7a8` (Task 14 merged).
All numbers are **provisional** (alpha balance) and come only from the catalog.

Current: Phase 4 (delivery)

Draft PR: https://github.com/pavnem-ux/Game/pull/14

## Checklist

- [x] 0.1 Catalog saved, branch, progress file, draft PR
- [x] 1.1 `synergyLevel` + resolver integration (level available at trigger time)
- [x] 1.2 Level II multipliers for all 12
- [x] Phase 1 tests
- [x] 2.1 Mage awakenings (thermal_shock, wildfire, shattered_ice)
- [x] 2.2 Warrior awakenings (skull_crusher, battle_momentum, seismic_impact)
- [x] 2.3 Archer awakenings (toxic_barrage, plague_chain, deadly_precision)
- [x] 2.4 Rogue awakenings (blood_frenzy, deep_wounds, final_cut)
- [x] Phase 2 tests
- [x] 3.1 Banners, card hints, panel pips
- [x] 3.2 VFX + sounds
- [x] 3.3 Debug controls
- [x] Phase 3 e2e
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

- Levels (1.1–1.2): `pairLevel` / `bestSynergyPair` / `synergyLevel` (pure, `src/skills/synergies.ts`;
  weakest rank of the best completed pair; ties keep workbook order). `SYNERGY_LEVEL_RULES`
  (3 / 5 / ×1.5), `SYNERGY_MAIN_NUMBER`, `SYNERGY_TUNING_LEVEL_II` (frozen; only the main number
  ×1.5, rounded to 4 decimals) in `config.ts`. `RunSkills.rankTotal()` / `rankMap()`.
  `SynergyResolver.levels()` (cached by rank total; ranks only rise; new run = new resolver),
  `level(id)`, private `tuning(id)` (II/III → Level II table) used by every trigger branch,
  `setLevelOverride(id, level|null)` + `hasLevelOverride`; world `setTestSynergyLevel`.
- Tests: `tests/skills/synergy-levels.test.ts`.
- Awakenings (2.1–2.4): `SYNERGY_AWAKENING` (config.ts; default Slow 30% / 2 s and each III
  property). Resolver helpers: `awake(id)`, `burst()` (one shared attack snapshot, one hit per
  living enemy in the circle, `procs=false`, `recordArea`), `nearestAround()` (nearest first, ties by
  id), `defaultSlow()`, `rift()` (Seismic zone: `SkillEngine.zone`, 0.5 s ticks), `spread(…, stacks)`,
  `onDeath()` (Deadly Precision transfer, called from `SkillEngine.onKill` before the procs guard).
  Engine (additive): `PreHit.stacks` (stack counts; world passes them for Poison-tick kills),
  `extendStun(id, s)` (once per Stun via `stunStartedAt` / `stunExtendedFor`, total ≤ 1.5 s ×
  stun scale, immunity moves), `setBuff(…, {movementSpeedPercent})`, Battle Momentum attack speed ×
  stacks. Event `synergy-triggered` gains `level` and `awakened`. Blood Feast heals through
  `healPlayer` (Combat Core, never revives) with a resolver cooldown key `@heal`.
- Tests: `tests/skills/synergy-awakening.test.ts` (14).
- Feedback (3.1): event `synergy-level-up {synergyId, level 2|3, pair, skillId}` from
  `chooseSkill` / `grantTestSkill` (`recordSynergyLevelUps`, rank levels only; QA overrides emit
  nothing). Snapshot `synergyLevels [{id, level, pair, forced}]`. `synergy-info.ts`:
  `SYNERGY_LEVEL_TEXT` (II text, awakened name + effect, Russian), `LEVEL_ROMAN`, `ranksOf`,
  `cardLevelRaises` (▲ hint only when the pick raises the level to II/III), overview `level` /
  `bestPair`. UI: `SynergyBanners.tsx` (unlock I / II / gold III «Пробуждение»; queued, 3 visible,
  shown and timed only while playing), `SynergyPips` + II/III texts in the Skills panel,
  `CardLevelHint` «▲ <name> II/III» on offer cards (+ aria-label).
- VFX + sound (3.2): scene flash per synergy colour (`SYNERGY_COLORS`), awakened = larger gold
  double ring, label «… II/III ✦»; synergy areas/rift coloured by synergy. Audio cues
  `synergy-fire/ice/impact/poison/blood` (family per synergy, `SYNERGY_FAMILY`), `synergy-awaken`
  layer for awakened triggers, `synergy-level` (II) and `synergy-awakening` (III) jingles.
- Debug (3.3): QA diagnostics `level`, `bestPair`, `forced`; DEV panel select «Задать уровень»
  (по рангам / закрыта / I / II / III) → controller `synergy-level {id, level|null}`.
- Tests: `tests/skills/synergy-feedback.test.ts`, `tests/ui-kit/synergy-banners.test.ts`; alpha e2e
  (unlock banner, ▲ hint only on the raising card, II banner after the pick, gold III banner, DEV
  level select).
- Gaps: [synergies-v3-gaps.md](synergies-v3-gaps.md) (4 interpretation rows, none blocking).

## Decisions

- Banners are a React HUD element over the arena, shown only while playing: a level-up from a
  card pick appears right after the dialog closes, and pauses/offers never hide cards behind it.
  They queue (nothing dropped when several arrive together; 3 visible).
- Trigger sounds are per element family (5 sounds for 12 synergies) with the awakened layer on
  top; the flash colour is per synergy.

- The level is read when a synergy fires (`tuning(id)` per trigger); since ranks only rise, a level
  never drops in a run. Deadly Precision's bonus reads the current level when damage is computed.
- QA override: level 0 locks a synergy, 1–3 open it at that level (overrides the pair check), null
  returns to the ranks. Only tests and the DEV/QA controller use it.

## Verification log

- Phase 3: typecheck ✓, format ✓, `npm test` 1306 ✓, build ✓, `test:production` 2 PASS, QA + `test:qa` PASS, `test:e2e` 3 PASS.

- Phase 2: typecheck ✓, format ✓, `npm test` 1300 ✓.

- Phase 1: typecheck ✓, format ✓, `npm test` 1286 ✓.
