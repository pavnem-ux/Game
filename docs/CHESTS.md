# Chests and temporary buffs (Task 12)

Spec: [task-12-enemies-chests.md](task-12-enemies-chests.md) §1.4 · progress:
[task-12-progress.md](task-12-progress.md). All numbers are **provisional** and live in
`CHEST_RULES` / `BUFFS` (`src/gameplay/chests.ts`).

## 1. Rules

| Rule     | Value                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Where    | campaign runs only (their gold uses the map's victory Gold and the coin rules)                                                         |
| Spawn    | every 45 s of simulation time (first at 0:45) while the run is active                                                                  |
| Position | seeded, 250–450 units from the player, inside the arena (40-unit margin), not overlapping another chest (up to 12 tries, else skipped) |
| Limit    | 3 chests on the map; at the limit the spawn is skipped, the timer keeps running                                                        |
| Lifetime | 60 s, blinking for the last 5 s                                                                                                        |
| Type     | 75% «Деревянный сундук», 25% «Зачарованный сундук» (rolled at spawn; different look)                                                   |
| Opening  | the player's body touches it (player radius + chest radius 16); the pickup magnet does not open chests                                 |
| Frozen   | pause, level-up choice, revival prompt (they are world boundaries)                                                                     |

Contents are rolled when the chest is opened (seeded stream `chests`):

- **Wooden.** If HP < Max HP: 50% heal 15% Max HP through Combat Core (`core.heal`, never revives),
  50% gold. At full HP: always gold. Gold = a coin pile worth `max(5, round(2% × map victory Gold))`
  dropped at the chest (map 1: 5, map 40: 15), then picked up and paid by the normal coin rules
  (victory: all coins + bonus, defeat: 50%, abandon: nothing).
- **Enchanted**, 25% each:
  - «Магнит»: collects every XP crystal and coin pile on the map through the normal collection
    path (`RunExperience.collectAll`, `RunCoins.collectAll`): each pile once, no XP lost, level-ups
    resolve normally (healing, skill choices).
  - «Ярость»: damage dealt +20% (physical and magical; `damagePercent` +20), 20 s.
  - «Быстрые руки»: attack speed +25% (`attackSpeed` +25 points on the base 100), 20 s.
  - «Лёгкий шаг»: movement speed +20% (`movementSpeedPercent` +20), 20 s.

Buffs are temporary run modifiers: the world passes their sum to `SkillEngine.setExternalModifiers`
(additive API), which joins the same `composeRunStats` composition as passives and talents, so the
central caps apply once. The same buff refreshes its duration (no stack); different buffs stack.
Buffs survive revival and are removed when the run resolves (victory, defeat, abandon).

## 2. Scheduling (owner-approved tie slots)

`GameplayWorld` drives `RunChests` like its other modules (peek → advance → resolve):

| Boundary            | Rank | Position in the tie order                                                        |
| ------------------- | ---- | -------------------------------------------------------------------------------- |
| chest / buff expiry | 8.6  | with the skill expirations (8.5), right after them                               |
| chest spawn         | 9.25 | right after reinforcement spawning (9), before the Task 08 campaign events (9.5) |
| chest opening       | —    | a pickup of the player-input/collision step (after crystals and coins)           |

Both boundaries exist only while the campaign run is active and the player can act, so pause,
level-up choices, death and the revival prompt freeze them. No other ordering changed.

## 3. API and data

- `RunChests`: `spawnDue(now, player)`, `spawnAt(now, player, type?)`, `expireDue(now)`,
  `touched(body)`, `open(chest, belowMaxHp, forced?)`, `grantBuff(id, now)`, `endRun(now)`,
  `getChests()`, `getBuffs()`, `nextSpawnAt`, `nextExpiryAt()`; `buffModifiers(ids)`,
  `chestGold(victoryGold)`.
- World events (channel `chests`): `chest-spawned`, `chest-spawn-skipped` (`limit` / `no-space`),
  `chest-expired`, `chest-opened` (`content`, `amount`: healed HP / gold / XP + coins pulled),
  `buff-started` (`refreshed`), `buff-ended` (`uptime`, `expired` / `run-ended`).
- Snapshot `chests`: `items` (+ `blinking`), `buffs` (`name`, `remaining`), `nextSpawnAt`,
  `lastOpened` (popup). Null outside campaign runs.
- Run stats `chests`: spawned / opened by type, expired, contents, buff uptime (s). Bug reports:
  `run.activeBuffs`.
- HUD: buff bar (icon, name, seconds left) and a pickup popup for 2.5 s («+15% HP», «+N золота»,
  «Магнит: всё собрано», buff name and effect).

## 4. Debug (DEV / QA builds only)

«DEV · Тестирование» → «Сундуки и усиления»: create a chest of a given type and content, grant any
buff, «Автосбор опыта и монет» (pulls all XP and coins once per second; pacing measurement). The
enemy fieldset spawns N enemies of any type. «Отладка забега» shows «Уровень забега · 5/10/15 мин».
None of it is in the production build (`test:production` checks the markers).

## 5. Verification and limits

- Tests: `tests/gameplay/chests.test.ts` (spawn times 45/90/135, skip at 3, expiry at 60 s,
  blinking, frozen on pause, deterministic rolls, heal ≤ Max HP, gold by the coin rules, magnet once,
  buff refresh vs stack, caps once, kept on revive, removed at run end, run stats),
  `tests/persistence/task12-debug.test.ts` (debug tools, popups, bug report).
- Not verified: how chests feel in human play (frequency, value of each buff); chest income is
  measured with bots only (see the PR).
