# Task 08 — Playable Campaign Alpha

Spec: [task-08.md](task-08.md) (owner's text). Step log, code map and decisions:
[task-08-progress.md](task-08-progress.md). **All numbers below are provisional** and live in
`src/campaign/config.ts` (campaign, elites, rewards) and `src/campaign/bosses.ts` (bosses).

## What the player gets

- Main menu: Играть / Персонаж / Карты / Прогресс / Настройки, Gold always visible.
- 10 maps in sequence; a map unlocks only after a victory on the previous one.
- A victory needs **both**: survive to the map's end and kill its boss (boss spawns at 10:00).
  Death (after the one revival) = defeat; quitting or reloading during a run = abandoned.
- Elites every 2 minutes (melee «Свирепый громила» / ranged, alternating), 10 distinct bosses.
- Results screen: outcome, time, kills, elites, boss, class XP/levels/talent points, Gold,
  unlocked map, and whether the progress was saved.
- Permanent progress per class (levels 1–50), shared Gold, saved in `localStorage`, with
  backup, quarantine of unusable saves, export/import of a JSON file.

## Architecture

| Module             | Owns                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/campaign/`    | Map config, difficulty, stages, run clock, elite/boss schedule (`CampaignDirector`), run state machine, elite profiles, boss abilities and configs |
| `src/profile/`     | `PlayerProfile` v1, class XP curve, talent points, run rewards, pure idempotent `applyRunResult`                                                   |
| `src/persistence/` | Save schema/validation/migrations, save store (main/backup/quarantine), progression service, export/import                                         |
| `src/gameplay/`    | `GameplayWorld` integration: campaign boundary (rank 9.5), boss actions (rank 6.5), scaled enemy stats, campaign snapshot                          |
| `src/gameplay-ui/` | `campaign-state.ts` (UI state, commits each run once), menu pages, HUD, results, Save Management                                                   |
| `src/engine/`      | Elite/boss visuals, telegraphs, boss FX, results screen switch, DEV/QA time scale                                                                  |

Invariants kept: `GameplayWorld` is still the only scheduler (campaign and boss events are new
boundary kinds with stable ranks, added after the existing ones at equal time); HP/damage only
in Combat Core (boss abilities, summons and debug HP cuts go through it); seeded RNG only — run
ids and timestamps come from the UI, never from the simulation; rewards are applied once per
`runId` (state, not event history); run XP/level never changes permanent level.

## Provisional balance

- Durations (min): 10, 10, 11, 11, 12, 12, 13, 13, 14, 15. Difficulty for map k+1: enemy HP
  ×(1+0.12k), damage ×(1+0.08k), spawn rate ×(1+0.08k).
- Stages at 0 / 15% / 40% / 65% / 90% of the duration. 8 enemy slots reserved for elites/boss.
- Elites: every 120 s, HP ×2.5, damage ×1.4 on top of the map, +40 run XP.
- Boss at 600 s; telegraphs ≥ 0.8 s, 1.2 s gap between casts; boss CC limits only tighten the
  global Slow/Stun rules.
- Rewards: victory XP = 100 + 50 × mapId, Gold = XP × 0.5. Defeat: 25% × fraction of the map
  survived. Abandoned: nothing. Class XP to next level: 100 + 50 × (level − 1); talent points =
  ⌊level / 2⌋ (+1 at level 30); not spendable yet.

## Debug tools (`/?debug`, DEV or explicit QA build only)

Developer panel → «Кампания · профиль»: unlock all maps, set class level, grant class XP / Gold,
show the save, reset test progress (with confirmation). «Кампания · забег»: skip to the next
scheduled event, summon the boss now, boss HP → 10%, force victory / defeat, acceleration ×1–20.
All of them use the normal pipelines (director, Combat Core, results commit, validated
`replaceProfile`); acceleration only multiplies the frame delta of the same simulation.
`npm run test:production` asserts these tools are absent from the production bundle.

## How to playtest

1. `npm ci && npm run dev`, open `http://127.0.0.1:5173/` (add `?debug` for the tools).
2. Choose a class, Play → Map 1. Survive, pick skills, watch elite alerts, kill the boss.
3. Results → menu: Gold, class level, Map 2 unlocked. Reload: progress is kept.
4. Map 2 with another class: its own level/XP, the same Gold.
5. Настройки → export the save, import it back (confirmation; invalid files change nothing).

## Verification

- Unit: `npm run test:campaign`, `test:profile`, `test:persistence` (part of `npm test`), incl.
  `tests/campaign/walkthrough.test.ts` (Maps 1–10 won through the normal simulation, reload,
  export/import) and `tests/campaign/debug.test.ts`.
- Browser: `tests/campaign-browser.mjs` (in `npm run test:e2e`).
- Production: `npm run test:production`; QA: `GAME_LOCAL_QA=1 npm run build:qa && npm run test:qa`.

## Known limitations / not verified

- No in-run save: leaving a run forfeits it (by design, shown on the Play page and in Pause).
- Talents, equipment and Gold spending are placeholders («скоро»).
- Map 10 is proven completable with a protected, idle player (logic level); an unprotected human
  playthrough and the overall difficulty curve need the owner's Cloudflare Preview playtest.
- Map/boss names and visuals are original placeholders; boss art is procedural.
- The agent cannot open `*.workers.dev`; the Preview deployment was not checked by the agent.

## Task 10 — Acts II–IV (maps 11–40)

Spec: [task-10-maps.md](task-10-maps.md); log: [task-10-progress.md](task-10-progress.md). Built
only from existing mechanics (enemies, elite profiles, boss ability library, spawner, scheduler).
**All new numbers are provisional.**

- 40 maps in 4 acts: I «Забытые сказки» (1–10), II «Заколдованные земли» (11–20), III «Мёртвое
  царство» (21–30), IV «Последняя сказка» (31–40). Map 10 → 11 → … → 40 unlock chain.
- Maps 11–40: 15 min, boss at 10:00. Spawn rate stays at map 10's; HP ×(2.08 + 0.15·(id − 10)),
  damage ×(1.72 + 0.10·(id − 10)).
- Elites: every 2:00 / 1:45 / 1:30 / 1:15 (acts I–IV), strictly before the end; 2 per event on
  maps 25–30 and 35–40. The boss is its own 10:00 event. Reserved enemy slots per map =
  max(8, all scheduled elites + boss).
- Per-map modifiers (≤ 2, maps 11–40): «Быстрые враги» (enemy speed ×1.1), «Больше / Много
  стрелков» (ranged share 0.15 / 0.18), «Сильные элиты» (elite HP ×1.25, damage ×1.15).
- Bosses 11–40: acts II–III 2–3 abilities, act IV 3 with shorter cooldowns; no two of the 40 share
  an ability set + parameters.
- Rebalance (all maps): crystals 8 / 12 (was 10 / 15), elite extra XP 32 (was 40), ranged share
  0.12 (was 0.18), victory Gold from its own table (maps 1–10 unchanged; 11–40: 300 + 15·(id − 10)).
- «Рекомендуемый уровень» = the permanent level after clearing maps 1 … id − 1 once (equals the map
  number; level 30 at map 30; all 40 maps → level 41).
- Save schema v3 (`migrateV2toV3`: a save that cleared map 10 gets map 11 unlocked).
- Debug: «Открыть все карты» (40), «Debug карта» + «Перейти к карте».

| Map | Enemy HP | Enemy dmg | Spawn rate | Elites               | Reserved | Victory XP | Victory Gold | Rec. level |
| --- | -------- | --------- | ---------- | -------------------- | -------- | ---------- | ------------ | ---------- |
| 10  | ×2.08    | ×1.72     | ×1.72      | 120 s × 1 (6 events) | 8        | 600        | 300          | 10         |
| 11  | ×2.23    | ×1.82     | ×1.72      | 105 s × 1 (8 events) | 9        | 650        | 315          | 11         |
| 20  | ×3.58    | ×2.72     | ×1.72      | 105 s × 1 (8 events) | 9        | 1100       | 450          | 20         |
| 30  | ×5.08    | ×3.72     | ×1.72      | 90 s × 2 (9 events)  | 19       | 1600       | 600          | 30         |
| 40  | ×6.58    | ×4.72     | ×1.72      | 75 s × 2 (10 events) | 21       | 2100       | 750          | 40         |

### Maps and bosses 11–40

| #   | Map                  | Boss                | Abilities                            | Modifiers                                                               | Rec. level |
| --- | -------------------- | ------------------- | ------------------------------------ | ----------------------------------------------------------------------- | ---------- |
| 11  | Шепчущий бор         | Леший-старожил      | circle_aoe, summon                   | —                                                                       | 11         |
| 12  | Медвежий лог         | Шатун-великан       | charge, circle_aoe                   | Быстрые враги: скорость ×1,1                                            | 12         |
| 13  | Ключевая пустошь     | Хранитель ключей    | radial_burst, speed_buff             | Больше стрелков: 15% врагов                                             | 13         |
| 14  | Кривое озеро         | Водяной царь        | radial_burst, summon                 | —                                                                       | 14         |
| 15  | Совиная чаща         | Сова-вещунья        | radial_burst, charge, speed_buff     | Сильные элиты: здоровье ×1,25, урон ×1,15                               | 15         |
| 16  | Пряничная деревня    | Пряничный исполин   | circle_aoe, summon                   | Быстрые враги: скорость ×1,1                                            | 16         |
| 17  | Медные холмы         | Медный змей         | charge, radial_burst, circle_aoe     | Больше стрелков: 15% врагов; Сильные элиты: здоровье ×1,25, урон ×1,15  | 17         |
| 18  | Заброшенная мельница | Мельник-полуночник  | circle_aoe, speed_buff, summon       | —                                                                       | 18         |
| 19  | Вороньи скалы        | Вороний князь       | radial_burst, charge                 | Быстрые враги: скорость ×1,1; Больше стрелков: 15% врагов               | 19         |
| 20  | Терем вечной зимы    | Ледяной воевода     | circle_aoe, radial_burst, charge     | Сильные элиты: здоровье ×1,25, урон ×1,15                               | 20         |
| 21  | Костяной мост        | Костяной сторож     | circle_aoe, summon, radial_burst     | Больше стрелков: 15% врагов                                             | 21         |
| 22  | Чёрная река          | Перевозчик теней    | radial_burst, summon                 | Быстрые враги: скорость ×1,1                                            | 22         |
| 23  | Серые поля           | Полуденница         | charge, speed_buff                   | —                                                                       | 23         |
| 24  | Безлунный погост     | Хозяин погоста      | circle_aoe, summon, speed_buff       | Сильные элиты: здоровье ×1,25, урон ×1,15                               | 24         |
| 25  | Ржавые врата         | Ржавый привратник   | circle_aoe, charge                   | Много стрелков: 18% врагов                                              | 25         |
| 26  | Пепельный тракт      | Огненный всадник    | charge, radial_burst, speed_buff     | Быстрые враги: скорость ×1,1; Сильные элиты: здоровье ×1,25, урон ×1,15 | 26         |
| 27  | Плачущий лес         | Плакальщица         | radial_burst, speed_buff, summon     | —                                                                       | 27         |
| 28  | Обсидиановые копи    | Подгорный кузнец    | circle_aoe, radial_burst             | Больше стрелков: 15% врагов; Быстрые враги: скорость ×1,1               | 28         |
| 29  | Сад увядших роз      | Увядшая царевна     | radial_burst, charge, summon         | Сильные элиты: здоровье ×1,25, урон ×1,15                               | 29         |
| 30  | Чертоги Бессмертного | Страж Бессмертного  | circle_aoe, charge, speed_buff       | Быстрые враги: скорость ×1,1; Сильные элиты: здоровье ×1,25, урон ×1,15 | 30         |
| 31  | Расколотое небо      | Громовой коршун     | radial_burst, charge, speed_buff     | Много стрелков: 18% врагов                                              | 31         |
| 32  | Звёздная пыль        | Звездочёт-отступник | radial_burst, summon, circle_aoe     | —                                                                       | 32         |
| 33  | Зеркальные топи      | Зеркальная кикимора | charge, summon, radial_burst         | Быстрые враги: скорость ×1,1                                            | 33         |
| 34  | Обитель бурь         | Повелитель бурь     | radial_burst, circle_aoe, speed_buff | Сильные элиты: здоровье ×1,25, урон ×1,15; Больше стрелков: 15% врагов  | 34         |
| 35  | Лабиринт снов        | Дрёма               | circle_aoe, speed_buff, summon       | Быстрые враги: скорость ×1,1                                            | 35         |
| 36  | Остров у края моря   | Морской змей        | charge, radial_burst, circle_aoe     | Много стрелков: 18% врагов; Сильные элиты: здоровье ×1,25, урон ×1,15   | 36         |
| 37  | Кровавая заря        | Алый витязь         | charge, speed_buff, circle_aoe       | Быстрые враги: скорость ×1,1; Сильные элиты: здоровье ×1,25, урон ×1,15 | 37         |
| 38  | Безмолвный город     | Безликий царь       | radial_burst, summon, speed_buff     | —                                                                       | 38         |
| 39  | Край мира            | Стражник края       | circle_aoe, charge, summon           | Много стрелков: 18% врагов; Быстрые враги: скорость ×1,1                | 39         |
| 40  | Последняя страница   | Сказочник тьмы      | radial_burst, circle_aoe, charge     | Быстрые враги: скорость ×1,1; Сильные элиты: здоровье ×1,25, урон ×1,15 | 40         |

### 5.1 Completability check (accelerated, normal pipeline)

Headless simulation of the normal campaign world (no God Mode, no debug kills): class level 50 with
a full 26-point build (branch 3 I–IV at III, branch 2 III/III/III/II, branch 1 n01 III), seed 1,
level-up offers resolved by the first card, the Mage's enhanced choice = first card. Input bot:
circle before the boss; after the boss spawns, melee classes walk to it, ranged classes keep
~280 units and strafe (the Mage 40 run needed this; a pure circling bot never brought the boss into
staff range).

| Map | Class   | Outcome | Survival | Deaths | Boss HP | Boss killed at | Kills |
| --- | ------- | ------- | -------- | ------ | ------- | -------------- | ----- |
| 20  | Warrior | Victory | 15:00    | 0      | 8 055   | 10:03.7        | 18    |
| 20  | Mage    | Victory | 15:00    | 0      | 8 055   | 10:02.5        | 293   |
| 20  | Archer  | Victory | 15:00    | 0      | 8 055   | 10:01.2        | 105   |
| 20  | Rogue   | Victory | 15:00    | 0      | 8 055   | 10:02.5        | 11    |
| 40  | Warrior | Victory | 15:00    | 0      | 20 135  | 10:07.6        | 17    |
| 40  | Mage    | Victory | 15:00    | 0      | 20 135  | 10:04.5        | 611   |
| 40  | Archer  | Victory | 15:00    | 0      | 20 135  | 10:02.9        | 99    |
| 40  | Rogue   | Victory | 15:00    | 0      | 20 135  | 10:03.7        | 11    |

**Finding for the owner:** at level 50 with talents both maps are far from hard — player damage
(e.g. Archer 1 260 physical, Mage 1 399 magical) kills even the map 40 boss within seconds, and no
run lost HP to death. The task's goal is «enough hard content for levels 30–50»; the provisional
boss/enemy multipliers likely need raising after a human playtest (not tuned here: numbers are
owner-controlled). A standing-still bot (no crystal pickup) died on map 20 around 1:30 for every
class, so movement and crystal collection matter. Bot-driven, one seed: not a human playtest.
