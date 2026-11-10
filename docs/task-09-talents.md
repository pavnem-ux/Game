# Task 09 — Permanent Talent Trees v1.0

Repo: pavnem-ux/Game. Builds on Task 08 + 08.5. Progress: `docs/task-09-progress.md`.
Talent content source: `docs/talents.md` (approved catalog of nodes, ranks, coefficients).

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`.
   Continue from the first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `task09: <step> <summary>` → push → tick in progress file.
3. End of phase: full test suite, note results in progress file, continue. Stop only on a
   blocker or the content gate (Phase 0.3), or when done.
4. Reuse the code map from `docs/task-08-progress.md`; update it, don't re-explore.
5. Player-facing text in Russian, in the localization file. Code/commits: English.
6. **Never invent content.** No new talents, effects, coefficients, statuses, items, skills
   or rules. Undefined rank → list it as missing; never fill with a guessed % bonus.
7. Don't redesign Task 07.2, don't delete or weaken existing tests.

## 1. Spec

### 1.1 Structure & rules

- Per class: 3 branches. Branches 1–2: 5 nodes, open from level 1. Branch 3 (superpower):
  4 nodes, open at permanent level 30. Each node has ranks I–III (each rank as defined in
  the catalog, not auto-scaled). Totals: 12 branches, 56 nodes, 168 rank effects.
- Next node in a branch requires the previous node at rank II (rank III optional).
- Points: derived from level (Task 08 function: even levels + bonus at 30, max 26).
  Available = earned − spent ranks. Never stored as a counter, never negative. Gold not used.
- Trees independent per class. No refunds/respec unless defined in the catalog.
- Superpower activates only when rank I of the branch 3 first node is bought (level 30
  alone doesn't activate it).
- Talents live in a data config (ids, branch, order, rank effect descriptors); values tunable.

### 1.2 Combat integration

- One modifier pipeline into existing Character Stats / Combat Core / Skill Engine /
  Status Effects / Weapon Attacks. Each talent effect applied exactly once; caps applied
  at the existing finalization stage.
- Must not alter: crit/dodge/resistance rules, DoT tick interval, 10-stack DoT limit and
  shared timers, invulnerability windows, revival, projectile collision/hit limits,
  cooldown rules.
- Secondary attacks from talents (shadow duplicates, off-hand weapon, ballistae) have a
  source id, respect anti-recursion safeguards, and appear separately in 08.5 run stats/DPS.
- Talents never unlock synergies or count as acquired run skills. Keep separate: talent
  ownership, run skill ownership, synergy unlock state, combat triggers. All 12 synergies
  unchanged; talents may only improve already-unlocked ones where the catalog says so.
- New randomness (procs, targeting, off-hand crits) uses the 08.5 seeded RNG.
- Talents apply at run start for the selected class; run reset keeps talents; allocation
  changes affect the next run.

### 1.3 Classes (focus + constraints; effects come from the catalog)

- **Разбойник.** Ассасин: crits, dagger damage, bleed, finishing low-HP targets — don't
  duplicate Deep Wounds, Final Cut, Blood Frenzy, Lacerate, Serrated Blades.
  Теневой охотник: dodge (existing rules/caps), counterattacks, shadow attacks, shadow
  duplicates (controlled secondary attack, no recursive triggers).
  Алхимик смерти (superpower): adds Poison and Burn to Rogue, keeps Bleed; combined
  3-DoT interactions per catalog. Keep status architecture (10 stacks/type, shared
  timers, existing refresh, no per-stack durations, no recursive chains).
- **Маг.** Повелитель стихий: fire/ice, existing reactions and Mage synergies — no copies
  of Thermal Shock, Wildfire, Shattered Ice, Elemental Mastery. Арканист: cooldown
  reduction, crit, efficiency, barriers (existing stats/caps).
  Верховный маг (superpower): real 5th automatic active slot (4→5 active, 6 passive).
  Filled from the existing Mage active pool via normal in-run selection; unique skill id,
  ranks I–V, own cooldown, eligible for synergies. Variant B: the enhanced-slot designation
  may be assigned/reassigned when gaining a new eligible active skill; no deleting acquired
  skills, no free swapping; respects Task 07 skill-choice rules.
- **Воин.** Берсерк: physical/melee damage, aggression, fury — no copies of Battle Fury,
  Battle Momentum. Страж: Max HP, Resistance (no Armor stat), survival, stun/defense
  (existing stun limits/immunity).
  Мастер двух клинков (superpower): second one-handed weapon as a real weapon instance —
  own attack events and timing, independent crits, existing hit detection and status
  rules, works with melee skills/synergies, no double-applied stats/modifiers. Built to fit
  future equipment slots; no store/equipment progression. Shield Bash keeps working
  without a shield requirement.
- **Лучник.** Снайпер: crits, precision, penetration, marks, single target.
  Следопыт: extra projectiles, mobility, AoE, multi-target — no Multishot copy.
  Осадный инженер (superpower): up to 2 stationary ballistae with own HP/lifetime, attack
  timing, targeting, attack events; damage from a defined share of Archer offense;
  inherit only explicitly listed properties. No recursive synergy triggers; Toxic Barrage
  and Deadly Precision must not gain extra triggers from ballistae.

### 1.4 Persistence

- Bump save schema; migration adds `classes.<id>.talents: { nodeId: rank }` (empty) and
  drops the `talentsSpent` placeholder. Gold, XP, levels, maps, runs untouched.
- Validation: known node ids, rank 0–3, prerequisites met, branch 3 only at level ≥30,
  spent ≤ earned. Invalid talent data → reject import / don't overwrite the valid save.
- Store only ranks; derive stats at run start. Export/import, reports, backup work as-is.

### 1.5 UI

- Talent screen in Progression for the selected class, class switcher.
- 3 branches with names, nodes in order, rank 0–III, description, per-rank effects,
  prerequisite and level requirement, available points, locked/unlocked state with the
  reason, branch 3 shows "доступно с 30 уровня" before then, superpower status.
- Only valid purchases are clickable; tree and points update immediately (autosave).
- Remove the "Talents — Coming Soon" placeholder.

### 1.6 Debug (`/?debug`)

Grant/remove talent points (via level), set any node rank, reset a class tree, toggle
superpower test preset per class.

## 2. Phases

### Phase 0 — Setup & content audit

- 0.1 Branch `task-09-talents` from `main` (if 08.5 isn't merged, from
  `task-08.5-playtest` and note it). Progress file, draft PR.
- 0.2 Check that saveStore/saveSchema, seeded RNG and run stats from 08/08.5 exist;
  record their APIs in the code map.
- 0.3 **Content gate:** compare `docs/talents.md` against the 56×3 required effects.
  Write `docs/talents-gaps.md` listing every missing node/rank/coefficient. If anything
  is missing: complete Phases 1–4 (infrastructure), then stop and report the gaps.

### Phase 1 — Data model & rules (pure logic)

- 1.1 Talent config schema + loader from the catalog (missing entries marked, inert).
- 1.2 Purchase/validation logic, points derivation, prerequisites, level-30 gate.
- Tests: 4 classes × 3 branches × 14 nodes × 3 ranks; prerequisite rank II; rank III
  optional; no rank >III; points never negative; level-30 gate; superpower inactive
  before branch-3 node 1 rank I; class trees independent.

### Phase 2 — Persistence

- 2.1 Schema bump, migration, validation rules (1.4).
- Tests: ranks survive reload; class switch keeps trees; export/import keeps talents;
  old profile migrates without loss; invalid talent data can't overwrite a valid save.

### Phase 3 — Modifier pipeline

- 3.1 Talent effects → existing stat/combat hooks; apply-once guarantee; source ids for
  secondary attacks; anti-recursion.
- Tests: modifiers applied once; caps respected; synergies not unlocked by talents;
  run reset keeps talents.

### Phase 4 — UI & debug

- 4.1 Talent screen (1.5). 4.2 Debug controls (1.6).

### Phase 5 — Standard branches

- 5.1–5.4 Branches 1–2 for Rogue, Mage, Warrior, Archer (catalog effects only).
- Tests per class for defined effects.

### Phase 6 — Superpowers

- 6.1 Rogue: Poison/Burn + 3-DoT interactions. Tests: stack/timer limits hold.
- 6.2 Mage: 5th slot, variant B. Tests: slot count, selection, synergy eligibility.
- 6.3 Warrior: off-hand weapon. Tests: separate events, independent crits, no double stats,
  Shield Bash works.
- 6.4 Archer: ballistae. Tests: max 2, targeting, damage share, no extra Toxic Barrage /
  Deadly Precision triggers.

### Phase 7 — Delivery

- 7.1 Full regression + production build.
- 7.2 Add talent checks to `docs/playtest.md` (Russian).
- 7.3 PR description: summary, changed files, config overview, points/unlock logic,
  superpower notes, Task 07.2 integration, migration, test/build results, missing
  definitions. Mark ready only if no gaps remain. Don't merge.
