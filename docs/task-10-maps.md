# Task 10 — Campaign Acts II–IV (maps 11–40) + reward/ranged rebalance

Repo: pavnem-ux/Game. Base: latest `main` (must contain Tasks 08–09.1; if `src/campaign` or
`src/talents` is missing, stop and report). Branch `task-10-maps`. Progress: `docs/task-10-progress.md`.
Goal: enough hard content to test talents and superpowers at levels 30–50.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from
   the first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 10: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md (PR to `main`,
   never merge).
4. Reuse code maps in `docs/task-0*-progress.md`; don't re-explore.
5. Only existing mechanics: enemies, elite profiles, boss ability library, spawner, scheduler.
   No new abilities, enemy types, AI behaviours or second boss. All values in campaign config.
6. Maps 1–10 keep everything except the intended changes in 1.3. A snapshot test pins them.
7. Player text in Russian. Mark all new numbers provisional in docs.

## 1. Spec

### 1.1 Structure

- 40 maps in 4 acts of 10. Act I = existing maps 1–10. Map 10 victory unlocks map 11, and so on.
- Act names: I «Забытые сказки» (existing), II–IV: write short Russian fairy-tale names in the existing
  style; each new map gets a Russian name and a boss with a Russian name. List them all in the PR.
- Maps 11–40: duration 15 min, boss at 10:00 (existing rule), same arena/assets.

### 1.2 Difficulty (k = mapId − 1)

- Maps 1–10: existing formula unchanged.
- Maps 11–40: spawn rate stays at map 10's value (enemy cap 120 makes higher rates meaningless);
  enemy HP ×(m10HP + 0.15·(mapId−10)), damage ×(m10Dmg + 0.10·(mapId−10)).
  Map 40 ≈ HP ×6.6, damage ×4.7.
- Per act (config): elite interval II 1:45, III 1:30, IV 1:15 (still strictly before map end; boss
  replaces the event at 10:00). Elite count per event: 1, but 2 on maps 25–30 and 35–40.
- Per-map modifiers from existing config levers only: enemy movement speed ×1.1 (some maps), higher
  ranged share (some maps, max 0.18), stronger elites (HP/dmg multiplier). At most 2 per map; shown on
  the map card in Russian.
- Bosses 11–40: new configs from the existing ability library. Acts II–III: 2–3 abilities; Act IV:
  3 abilities, shorter cooldowns. No two bosses with identical ability set + parameters.
- Respect reserved enemy slots for elites/boss with up to 2 elites per event.

### 1.3 Rebalance (applies to all maps)

- Permanent victory XP unchanged: 100 + 50·mapId (map 40: 2100).
- Run XP (crystals, `XP_RULES` in `src/gameplay/experience.ts`): −20% — meleeReward 10 → 8,
  rangedReward 15 → 12. Elite extra XP −20% too. Level cost formula unchanged. No XP is lost at the
  crystal cap (invariant).
- Victory Gold decoupled from XP (own config table): maps 1–10 keep current values (75…300);
  maps 11–40: 300 + 15·(mapId−10) (map 40: 750). Task 11 later splits it into coins + bonus.
- Ranged share of normal spawns: 0.18 → 0.12 baseline; per-map overrides above may raise it to 0.18.

### 1.4 Recommended level

- Each map card shows «Рекомендуемый уровень N»: the permanent level reached by clearing maps
  1..(mapId−1) once each with victory XP, computed from the existing XP curve (pure function, tested).
  Expected: superpower level 30 around map 29, level ~43 after map 40.

### 1.5 Save & UI

- Save validation accepts maps 1–40 (`highestUnlockedMap`, completed maps, best results). Old saves
  load unchanged; no data loss; schema bump only if required, with migration + test.
- Map selection: act tabs or act headers, scrolling list, recommended level, modifiers, boss name if
  unlocked, lock reason «Победите на карте N».
- Debug: unlock all 40 maps, jump to any map.

## 2. Phases

### Phase 0 — Setup

- 0.1 Branch from `main`, progress file with the checklist, draft PR to `main`.

### Phase 1 — Config & rebalance

- 1.1 Extend campaign config to 40 maps (acts, names, durations, difficulty curve, elite settings,
  modifiers, boss refs). Config validation.
- 1.2 Run XP, Gold and ranged changes (1.3).
- Tests: 40 maps; maps 1–10 snapshot (only Gold source and ranged share differ, as specified);
  difficulty values for maps 11, 20, 40; crystal/elite XP values; Gold formula; unlock chain 10→11→…→40.

### Phase 2 — Bosses & elites

- 2.1 30 boss configs (11–40). 2.2 Elite interval per act, 2 elites per event where configured.
- Tests: boss uniqueness; ability counts per act; elite times per act (no event at/after map end,
  boss at 10:00 only once); 2-elite events fit the reserved slots, nothing skipped.

### Phase 3 — Modifiers

- 3.1 Apply per-map modifiers through existing levers. Tests: each modifier changes only its lever.

### Phase 4 — Save & UI

- 4.1 Validation/migration (1.5). 4.2 Recommended level function. 4.3 Map selection UI. 4.4 Debug.
- Tests: old save loads; maps 11–40 persist; recommended level for maps 1, 11, 30, 40.

### Phase 5 — Verification & delivery

- 5.1 Accelerated-mode check that maps 20 and 40 are completable via the normal pipeline
  (debug level 50, all talents) — record survival time and boss kill time in the PR.
- 5.2 Full checks from AGENTS.md §6 (+ e2e for UI). Update `docs/CAMPAIGN_ALPHA.md`, README, and add
  Act II–IV checks to `docs/playtest.md` (Russian).
- 5.3 PR description: map/boss name list, difficulty table (maps 10, 11, 20, 30, 40), run XP/Gold/ranged
  changes, test/build results, known limitations. Don't merge.
