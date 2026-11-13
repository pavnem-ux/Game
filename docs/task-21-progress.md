# Task 21 — progress

Spec: [task-21-quests.md](task-21-quests.md) (owner's file). Branch `task-21-quests` from `main` at
`b2d5b3b` (Tasks 16, 19, 20 merged: ore, items, pets exist).

Current: Phase 3

Draft PR: https://github.com/pavnem-ux/Game/pull/19

## Checklist

- [x] 0 Branch, spec, progress file, draft PR
- [x] 1.1 Quest catalog config + validation
- [x] 1.2 Counters from finalized run results (dedup)
- [x] 1.3 Quest evaluation + claim (fallback rewards)
- [x] Phase 1 tests
- [x] 2 Save v7 + retroactive completion
- [ ] 3.1 «Задания» screen
- [ ] 3.2 Hub badge, toasts
- [ ] 4 Full checks, docs, PR

## Decisions

- Module `src/quests/` (framework-free): `config.ts` (50 quests, data), `counters.ts` (lifetime
  counters, run summary validation, `addRunToCounters`), `logic.ts` (evaluation, claim, payout,
  `withLoadoutCounter`, startup validation).
- **Completion is derived, never stored**: every goal reads monotonic profile data — maps won
  (`completedMaps`), class levels, total kills (`stats.enemiesKilled`), lifetime counters, the max
  item level, and `bestTierLoadout`. The only non-monotonic condition («one class wears 7 tier-4+
  items») is kept as a monotonic counter (best ever), updated after every gear action in the same
  save (`withProfileLoadoutCounter` in the store's `gearChange` and the debug `edit`). So a quest
  can never become incomplete, and retroactive completion after migration is automatic.
- Run counters: the UI builds `RunResult.quest` from the world snapshot (kills of swift / brute /
  bombard from run stats, chests opened, synergies at level ≥ 1 / 3 — debug-forced levels never
  count); `applyRunResult` adds it with elites and the boss (distinct map ids) once, in the same
  snapshot and run-ID de-duplication as XP / Gold. Abandoned runs add nothing (like Task 08 kills).
- Claim (`claimQuest`): known, complete, not yet claimed → Gold + ore + item / pet unlock + claim
  mark in one change; an owned item → its shop price in Gold, an owned shop pet → its price, an
  owned quest-only pet → 2000 Gold. Store: `campaignStore.claimQuest(id)` (one validated save).
- **Spec gap:** the bosses group lists 4 Gold values but 3 ore values (20 / 50 / 100). The 40-boss
  quest uses ore 100 (same as the 30-boss one) — provisional, owner to confirm.
- «100 elites → pet Совёнок Угу» also keeps the group's Gold 400 + ore 15 (spec: «Gold 400 + Ore 15
  each»), with the owlet's 1500 Gold fallback if owned.
- Save v7 (`migrateV6toV7`): `questCounters` (per-type kills, elites, bosses, chests, synergies at 0;
  `bestTierLoadout` from the current loadouts) and `questsClaimed: []`. Validation: counters whole
  ≥ 0, known distinct maps / synergies, awakened ⊆ opened; claimed ids known, unique and complete in
  that profile.
- Debug: `completeQuest` (raises the quest's own source data through a validated save),
  `addQuestCounter`, `resetQuests`.

## Verification log
