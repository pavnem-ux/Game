# Task 09.1 — Talent Combat Effects (catalog v1.2, alpha-approved)

Repo: pavnem-ux/Game. Branch: `task-09-talents` (continue it; Phases 1–4 of Task 09 are done:
data model, purchase rules, persistence, UI/debug — preserve them).
Source of truth: `docs/talents.md` = catalog v1.2 (56 nodes, 168 ranks + G0–G12, C1–C8).
Where a G/C entry covers a node, it overrides the node text. Progress: `docs/task-09-progress.md`
(add a "09.1" section with the step checklist below).

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`.
   Continue from the first unchecked step; resolve uncommitted leftovers first.
2. Per node (or small node group): implement → test → commit `task09.1: <node ids>` → push →
   tick in progress file.
3. Phases run back-to-back. Stop only when done or on a blocker that affects everything.
4. Token economy: per phase read only the catalog section of that class and the G/C entries
   listed for the phase. Use the code map; don't re-explore.
5. Numbers come only from the catalog. No new talents, mechanics, stats, items, currencies,
   synergies, respec. Exception: G11 (Piercing Arrow falloff) is the one approved new mechanic.
6. **Engine conflict** (e.g. a referenced mechanic like marks/Slow/own Stun doesn't exist, or
   the spec can't be implemented faithfully): don't invent a workaround. Add a row to
   `docs/talents-gaps.md` (node id, path:line, problem, proposed narrow fix), leave that rank
   flagged `blocked`, continue with other nodes.
7. Remove a node's `missing`/inert flag only when its effect works in combat and is tested.
8. Player text in Russian (localization file). Don't weaken or delete existing tests.

## Shared combat rules (apply to every phase)

- Stats compose once from the combat snapshot; caps finalize once at the existing stage.
- Direct-damage modifiers don't apply to DoT, reflected or secondary damage unless stated.
- Every talent-created hit (counterattack, shadow copy, off-hand, cross-strike, explosion,
  ballista) has a source id, `procs=false` unless the catalog says otherwise, never triggers
  itself or other talent procs, never unlocks/triggers Task 07.2 synergies, appears as its
  own source in 08.5 run stats.
- Per-target and per-talent cooldowns run on simulation time (frozen on pause).
- Talent randomness uses the 08.5 seeded RNG.
- AoE/extra projectiles obey existing collision, hit limits, combat log.
- DoT: 10 stacks per type, shared group timer, existing refresh, no per-stack durations.

## Phases

### Phase 0 — Setup & audit

- 0.1 Confirm `docs/talents.md` is catalog v1.2 (already contradiction-free).
- 0.2 List current inert/missing ranks by node id in the progress file.
- 0.3 In `docs/talents-gaps.md` add a resolution table: G0–G12, C1–C8 → node → status
  (filled in as phases complete). Keep the original audit.

### Phase 1 — Shared effect infrastructure

- 1.1 Condition helpers: target DoT stacks by type / distinct DoT types, target HP %,
  player HP %, target stunned/slowed/marked, player moving.
- 1.2 Per-target cooldown + talent internal cooldown utility; buff "refresh, don't stack".
- 1.3 Secondary-source framework: source ids, procs flag, anti-recursion guard, run-stats hook.
- 1.4 Talent-spawned entity base (lifetime, HP, simulation-time timers, cleanup on run end).
- Tests: guards block recursion; cooldowns freeze on pause; entities cleaned on run end/death.

### Phase 2 — Rogue b1–b2 (G3, G4, C8)

- Assassin n01–n05; Shadow Hunter n01–n05 (counterattack, shadow copy, Elusive).
- Tests: copy geometry (45 behind, radius 180, max 1, interval 1.2/speed), copy can't crit,
  apply DoT, trigger synergies or counterattacks; counter doesn't trigger counter; C8 ×1.15
  only on counterattack.

### Phase 3 — Rogue b3 (G1, G2, G5, C5)

- Superpower Poison/Burn procs; n02–n04.
- Tests: tick values per rank, 4 s group duration, 10-stack cap with oldest replaced, C5
  tie-break Poison→Burn→Bleed (Bleed excluded without `serrated_blades`), simultaneous 10/10/10 explosion (radius 80/100/130, one hit
  per target, per-target CD 8 s, no chains).

### Phase 4 — Mage b1–b2 (C2)

- Elementalist n01–n05 (only already-unlocked synergies); Arcanist n01–n05.
- Tests: n04/n05 have no effect without the synergy and never unlock it; barrier replace /
  extend-expiry rules (C2), triggering hit not absorbed; crit CD reduction internal CD.

### Phase 5 — Mage b3 (C1)

- 5th active slot, enhanced designation (Variant B at acquisition only), n01–n04 bonuses.
- Tests: 4 vs 5 slots; enhancedSkillId null until 5th active; vary acquisition order; one-time
  choice among five; no reassign without acquisition; bonuses only on the enhanced skill.

### Phase 6 — Warrior b1–b2 (C3, C6, G12)

- Berserker n01–n05; Guardian n01–n05.
- Tests: C6 cap per rank and 0 without Battle Fury; G12 order (resistance → ×0.98/0.96 →
  round once, min 1), not on DoT/scripted damage; C3 heal only on crossing ≥30%→<30% from
  damage, 30 s CD; reflect doesn't reflect.

### Phase 7 — Warrior b3 (G6, G7, C4)

- Off-hand virtual sword (alpha, no loot, fits future equipment slot), n02–n04.
- Tests: period 1.4 s, range 100, arc 100°, independent timer/crit/dodge, stats applied once,
  G7 interval formula; cross-strike window 2 s any order, per-target CD, no recursion;
  Shield Bash still works.

### Phase 8 — Archer b1–b2 (G11)

- Sniper n01–n05; Pathfinder n01–n05.
- Tests: G11 Piercing Arrow damage for targets 1–4 at ranks I–III; all other projectiles
  unchanged; Cold Blood never unlocks Deadly Precision; Multishot hit limits kept.

### Phase 9 — Archer b3 (G8, G9, G10, C7)

- Ballista entity, auto-summon, n02–n04.
- Tests: invulnerable and never targeted by enemies, interval/range per rank, nearest target
  (tie id asc), placement, projectile
  (600 u/s, pierce 0, 1 hit), damage formula before resistance; C7 shared 30 s CD, max 2,
  CD not spent when full, frozen on pause; G10 Poison only from acquired `toxic_volley`
  (none without it); no Toxic Barrage / Deadly Precision triggers; removed at expiry/run end.

### Phase 10 — Verification & delivery

- 10.1 Coverage test: all 56×3 ranks resolve to a real effect handler (none inert unless
  `blocked` in gaps file).
- 10.2 Regression: all 12 synergies unlock only via skill pairs; caps (crit/dodge/CDR/
  resistance); damage preview = combat; old-save migration, export/import, per-class
  allocations, no duplicate points. Run all scripts actually present in package.json +
  `npm run build`.
- 10.3 Add to `docs/playtest.md` (Russian): smoke checks for the 4 superpowers at level ≥30
  (live play, pause, revive, run end, reload, class switch).
- 10.4 Docs: finish the G/C resolution table (code + test refs); G11 note with balance impact;
  short changelog.
- 10.5 PR description: implemented ranks count, blocked ranks with reasons, changed files,
  test/build results. Don't merge.

Done = all 168 ranks work in combat (not only in UI), or every exception is listed as
`blocked` with cause and proposed fix.
