# Quests (Задания) — Task 21

Spec: [task-21-quests.md](task-21-quests.md) · progress: [task-21-progress.md](task-21-progress.md).
The catalogue is data (`src/quests/config.ts`); every number is **provisional** (owner-controlled).

## 1. Rules

- 50 permanent quests (no daily / timed ones). States: «В процессе» → «Выполнено» (claimable) →
  «Получено».
- Rewards are claimed manually with «Забрать»: Gold, ore, an item unlock, a pet unlock and the claim
  mark change in **one** validated save (a failed write changes nothing). Each quest is claimed once.
- An item / pet reward that is already owned gives Gold instead: an item → its shop price, a shop
  pet → its price, a quest-only pet → 2000 Gold.
- Completion is **evaluated** from the profile, never stored. Every goal reads monotonic data, so a
  completed quest never becomes incomplete:
  - maps won (`completedMaps`), class levels, total kills (`stats.enemiesKilled`, Task 08);
  - lifetime counters (`profile.questCounters`): kills of swift / brute / bombard enemies, elite
    kills, distinct bosses (map ids), chests opened, synergies opened (level ≥ 1) and awakened
    (level 3);
  - the highest item level (forge) and `bestTierLoadout` — the most tier-4+ items one class has
    worn at once (updated after every gear action in the same save; it never decreases).
- Run counters update **once per finalized run** inside `applyRunResult` (same snapshot and run-ID
  de-duplication as XP / Gold): a reload or a repeated result event never counts twice. Abandoned
  runs add nothing (like the Task 08 kill statistics). Debug-forced synergy levels never count.

## 2. Catalogue and rewards

| Group (quests)  | Goals                                                         | Rewards                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Кампания (8)    | win map 5 / 10 / 15 / 20 / 25 / 30 / 35 / 40                  | Gold 300 / 600 / 900 / 1200 / 1500 / 1800 / 2100 / 2500 + ore 10 / 20 / 30 / 40 / 50 / 60 / 70 / 100; map 10 + Светлячок Лучик, map 20 + «Редкое кольцо точности», map 40 + Дух-волк |
| Охота (5)       | kill 1 000 / 5 000 / 20 000 / 50 000 / 100 000 enemies        | Gold 200 / 500 / 1000 / 2000 / 4000 + ore 5 / 15 / 30 / 60 / 100                                                                                                                     |
| Виды врагов (4) | 500 swift, 300 brute, 300 bombard, 100 elites                 | Gold 400 + ore 15 each; 100 elites also Совёнок Угу                                                                                                                                  |
| Боссы (4)       | 5 / 15 / 30 / 40 different bosses                             | Gold 1000 / 2000 / 3000 / 5000 + ore 20 / 50 / 100 / 100\*                                                                                                                           |
| Мастерство (20) | each class reaches level 10 / 20 / 30 / 40 / 50               | Gold 300 / 600 / 1000 / 1500 / 2500                                                                                                                                                  |
| Синергии (3)    | open any synergy; awaken any; awaken 6 different (lifetime)   | Gold 200; ore 30; Лисёнок-огонёк                                                                                                                                                     |
| Сундуки (3)     | open 25 / 100 / 300 chests                                    | Gold 300 / 800 / 2000                                                                                                                                                                |
| Кузница (3)     | any item +5; any item +10; one class wears 7 items of tier 4+ | ore 20; ore 60; Gold 3000                                                                                                                                                            |

\* The spec lists three ore values for four boss quests; the 40-boss quest uses 100 (owner to confirm).

### Totals per group

| Group       | Gold       | Ore       | Unlocks                                           |
| ----------- | ---------- | --------- | ------------------------------------------------- |
| Кампания    | 10 900     | 380       | Светлячок, Редкое кольцо точности (700), Дух-волк |
| Охота       | 7 700      | 210       | —                                                 |
| Виды врагов | 1 600      | 60        | Совёнок (1500 if owned)                           |
| Боссы       | 11 000     | 270       | —                                                 |
| Мастерство  | 23 600     | 0         | —                                                 |
| Синергии    | 200        | 30        | Лисёнок                                           |
| Сундуки     | 3 100      | 0         | —                                                 |
| Кузница     | 3 000      | 80        | —                                                 |
| **All 50**  | **61 100** | **1 030** | 4 pets, 1 item                                    |

## 3. API

- `src/quests/config.ts`: `QUESTS`, `QUEST_BY_ID`, `QUEST_GROUPS`, `QUEST_GROUP_LABELS`, goal and
  reward types, `QUEST_PET_FALLBACK_GOLD`.
- `src/quests/counters.ts`: `QuestCounters`, `NO_QUEST_COUNTERS`, `RunQuestSummary`,
  `validateRunQuestSummary`, `addRunToCounters`.
- `src/quests/logic.ts`: `questProgress`, `allQuestProgress`, `claimableQuests`, `questPayout`,
  `claimQuest` (throws `QuestError`: `unknown`, `incomplete`, `claimed`), `withLoadoutCounter`,
  `tierItemsWorn`, `validateQuestConfig` (runs at startup).
- Profile / store: `RunResult.quest` (built by `runQuestSummary(world)`), `claimProfileQuest`,
  `campaignStore.claimQuest(id)`; `lastResult.newQuests` lists the quests a run completed.

## 4. UI

- «Задания» page (hub tile with a gold badge = rewards waiting): group tabs with the claimable
  count, «Только доступные», rows sorted claimable → in progress → claimed, progress bars
  («1 240 / 5 000»), reward chips (Gold, ore, item, pet portrait), the Gold fallback note for owned
  rewards, «Забрать». Phones: one column, full-width button.
- Results screen: «Выполнено задание!» with the quests that run completed.

## 5. Save v7

`migrateV6toV7`: `questCounters` (per-type kills, elites, bosses, chests and synergies at 0;
`bestTierLoadout` read from the current loadouts) and `questsClaimed: []`. Quests the profile already
satisfies (maps won, class levels, total kills, item levels, worn tier-4 gear) are claimable right
away. Validation: counters whole numbers ≥ 0, known distinct maps / synergies, awakened ⊆ opened;
claimed ids known, unique and complete in that profile. Export / import, backup and bug reports
include quests; an invalid import never overwrites a valid save.

## 6. Debug (DEV / QA only)

«DEV · Тестирование» → «Задания»: «Выполнить задание» (raises the quest's own data through a
validated save: map won, class level, kills, a counter, an item level or the tier counter; nothing
is claimed), «Прибавить к счётчику», «Сбросить задания».

## 7. Verification and limits

- Tests: `tests/quests/logic.test.ts` (catalogue and rewards, each group's condition, counters once
  per run incl. reload / repeated events, claim once, fallbacks, incomplete / unknown refused, store
  save and failed write, debug), `tests/quests/save-v7.test.ts` (map 12 + level-30 class → exactly
  the matching quests; nothing else changes; validation; round-trip). e2e `mobile-browser.mjs`: win
  map 5 → results toast → hub badge → claim by touch (844×390, 768×1024).
- Not verified: pacing in real play (how fast the hunt / chest quests complete), the total economy
  with quests (61 100 Gold, 1 030 ore over the whole campaign).
