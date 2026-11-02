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
