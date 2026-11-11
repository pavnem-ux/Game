# Task 15 — Synergy Levels & Awakening (catalog v3)

Repo: pavnem-ux/Game. Base: latest `main` with Task 14 merged. Branch `task-15-synergies`.
Progress: `docs/task-15-progress.md`. Source of truth: `docs/synergies-v3.md` (= attached
Skazki_Synergy_Catalog_v3; save it there unchanged in Phase 0).

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from
   the first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 15: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md: PR to `main`, never
   merge; invariants §4 (no proc chains, Combat Core owns damage/heal, GameplayWorld schedules zones and
   timers, seeded RNG).
4. Reuse code maps; read `docs/SYNERGIES_V2_DAMAGE.md` and `src/skills/synergies.ts` before changing.
5. Numbers only from the catalog. Unlock pairs, conditions, per-target cooldowns stay as in v2.
6. Engine conflict → row in `docs/synergies-v3-gaps.md` (synergy, path:line, problem, narrow fix),
   continue with others.
7. Player text in Russian; UI uses the Task 13 kit; sounds via the Task 14 audio module.

## 1. Spec (summary — details in the catalog)

- `synergyLevel(rule, ownedRanks)`: best completed pair, min rank of the pair → I (both owned), II (both
  ≥3), III (both 5). Pure, tested. Levels only rise during a run; reset per run. Cached like `unlockedIds`.
- Level II: the catalog's "main number" ×1.5. Level III: II + awakened property.
- Awakened effects reuse existing building blocks: area hits (`inCircle`), status application, zones,
  run buffs via `composeRunStats`, Combat Core healing, stun extension within existing limits.
- All synergy damage/effects are secondary (no synergy/talent proc triggers), have per-synergy source ids
  and show separately in run stats/DPS.
- Wildfire target cap 7 total (awakening + `mage.b1.n05`), replacing the talent's own 4/5 caps.
- Feedback: unlock/level-up banners (gold for awakening), card hint «▲ <name> II/III», 3-pip level on
  the skills panel, per-synergy VFX + sound on trigger (stronger for III).
- QA/debug: show level and best pair per synergy; set any synergy level for testing.

## 2. Phases

### Phase 0 — Setup

- 0.1 Save catalog to `docs/synergies-v3.md`. Branch, progress file, draft PR.

### Phase 1 — Levels

- 1.1 `synergyLevel` + resolver integration (level available at trigger time).
- 1.2 Level II multipliers for all 12.
- Tests: level from best pair and weakest rank; levels across different pairs of one synergy; reset per
  run; II values for all 12; talents still don't unlock or raise levels.

### Phase 2 — Awakening by class

- 2.1 Mage (thermal_shock, wildfire, shattered_ice). 2.2 Warrior (skull_crusher, battle_momentum,
  seismic_impact). 2.3 Archer (toxic_barrage, plague_chain, deadly_precision). 2.4 Rogue (blood_frenzy,
  deep_wounds, final_cut).
- Tests per synergy: III effect exactly as the catalog (radius, targets, stacks, durations, caps); one hit
  per enemy per explosion; no chain triggers; pause freezes zones/buffs; stun extension once per stun and
  within limits; heal never revives; Wildfire cap 7 with talents; Deadly Precision max 3 transfers;
  Plague stacks rounding; determinism with fixed seed.

### Phase 3 — Feedback & QA

- 3.1 Banners, card hints, panel pips. 3.2 VFX + sounds. 3.3 Debug controls.
- e2e: reaching II and III shows banners; card hint appears only when the pick raises the level.

### Phase 4 — Delivery

- 4.1 Full checks from AGENTS.md §6 (+ e2e). 4.2 Docs: update `docs/SYNERGIES_V2_DAMAGE.md` (or new
  `docs/SYNERGIES_V3.md`), README, synergy checks in `docs/playtest.md` (Russian).
- 4.3 PR description: implemented levels/awakenings, gaps file summary, test/build results. Don't merge.
