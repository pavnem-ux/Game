# Task 21 — Quests (Задания)

Repo: pavnem-ux/Game. Base: latest `main` with Task 20 merged (ore, items, pets must exist).
Branch `task-21-quests`. Progress: `docs/task-21-progress.md`.

## Rules

1. Session start: read this file + progress file, `git status`, `git log --oneline -5`. Continue from the
   first unchecked step; resolve uncommitted leftovers first.
2. Per step: test → commit `Task 21: <step> <summary>` → push → tick in progress file.
3. Phases run back-to-back; stop only on a blocker or when done. Follow AGENTS.md (PR to `main`, never
   merge; rewards exactly once). Quest logic is pure; counters update only from finalized run results
   (existing run-ID dedup) and from meta actions (purchase, upgrade, talent buy).
4. Player text in Russian. Quest catalog = data config; numbers provisional.

## 1. Spec

### 1.1 Rules

- Permanent quests (no daily/timed quests). States: в процессе → выполнено (claimable) → награда получена.
- Rewards are claimed manually with «Забрать» (atomic save). Gold, ore, items (unlock), pets (unlock).
  If an item/pet reward is already owned → give its shop price in Gold instead (pet quest-only → 2000 Gold).
- On migration, quests already satisfied by the profile (map wins, class levels, total kills from
  `stats.enemiesKilled`) become claimable. Per-type kill/chest/boss counters start at 0.
- Hub badge with the number of claimable quests; toast when a quest completes after a run.

### 1.2 Catalog (50 quests)

| Group           | Quests                                                                        | Rewards                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Кампания (8)    | win map 5/10/15/20/25/30/35/40                                                | Gold 300/600/900/1200/1500/1800/2100/2500 + Ore 10/20/30/40/50/60/70/100; map 10 also pet Светлячок Лучик; map 20 also «Кольцо точности» tier 3; map 40 also pet Дух-волк |
| Охота (5)       | kill 1 000 / 5 000 / 20 000 / 50 000 / 100 000 enemies                        | Gold 200/500/1000/2000/4000 + Ore 5/15/30/60/100                                                                                                                          |
| Виды врагов (4) | kill 500 swift, 300 brute, 300 bombard, 100 elites                            | Gold 400 + Ore 15 each; 100 elites → pet Совёнок Угу (Gold fallback if owned)                                                                                             |
| Боссы (4)       | defeat 5 / 15 / 30 / 40 different bosses                                      | Ore 20/50/100 + Gold 1000/2000/3000/5000                                                                                                                                  |
| Мастерство (20) | each class reaches level 10/20/30/40/50                                       | Gold 300/600/1000/1500/2500                                                                                                                                               |
| Синергии (3)    | open any synergy; awaken any synergy; awaken 6 different synergies (lifetime) | Gold 200; Ore 30; pet Лисёнок-огонёк                                                                                                                                      |
| Сундуки (3)     | open 25 / 100 / 300 chests                                                    | Gold 300/800/2000                                                                                                                                                         |
| Кузница (3)     | upgrade any item to +5; to +10; one class wears 7 items of tier 4+            | Ore 20; Ore 60; Gold 3000                                                                                                                                                 |

### 1.3 Counters (lifetime, in the profile)

Total kills (existing), kills by enemy type, elite kills, distinct bosses defeated (set of boss ids),
chests opened, synergies opened/awakened (sets of ids). Updated once per finalized run.

### 1.4 UI

«Задания» screen from the hub: group tabs, progress bars (e.g. 1 240 / 5 000), reward icons, «Забрать»
button, filter «только доступные». Uses the Task 13 kit, mobile-friendly.

### 1.5 Save

Schema v7 + migration: counters, `questsClaimed: []`. Validation: known quest ids, counters ≥ 0, no claim
of an incomplete quest. Export/import, backup, bug reports include quests.

### 1.6 Debug

Complete any quest, add to counters, reset quests.

## 2. Phases

- **0 Setup:** branch, progress file, draft PR.
- **1 Logic:** catalog config + validation; counters from run results; quest evaluation; claim with
  fallback rewards. Tests: each group's completion condition; counters update once per run (reload,
  repeated result events); claim once; owned-reward fallback; incomplete quest can't be claimed.
- **2 Save:** v7 migration with retroactive completion. Tests: old profile with map 12 won and a level-30
  class gets exactly the matching quests claimable; nothing else changes.
- **3 UI:** screen, badge, toasts.
- **4 Delivery:** full checks from AGENTS.md §6 (+ e2e incl. mobile); docs `docs/QUESTS.md`, README,
  `docs/playtest.md` (Russian); PR with the reward totals per group. Don't merge.
