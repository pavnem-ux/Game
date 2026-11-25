# Playable Combat Alpha — Task 06

Новая игра по умолчанию соединяет Character Stats, Combat Core, Weapon Attacks, Status Effects, Enemy AI и Player Survival. Phaser рисует снимки одного `GameplayWorld`, React показывает меню/HUD/решения. Все четыре класса, melee/ranged враги, эффекты, защита и одно воскрешение работают в браузере. Это небольшая арена для проверки боя, без финального баланса и волн.

## Запуск и управление

Нужны Node.js 24+ и npm:

```bash
cd /workspace/Game
npm ci
npm run dev
```

Откройте адрес Vite (обычно `http://localhost:5173/` или Preview порта 5173 в облачной среде). Выберите **Воин**, **Маг**, **Лучник** или **Разбойник**, нажмите «Начать забег». Оружие назначается соответственно: Sword, Staff, Bow, Dual Daggers. Никакого аккаунта или внешних ассетов не требуется.

- WASD / стрелки — движение с нормализованной диагональю; скорость берётся из Character Stats. Автоатака не замедляет движение, враги не блокируют путь.
- На touchscreen потяните в нижней левой части Canvas — джойстик.
- P / Esc или `Ⅱ` — пауза/продолжение. Потеря видимости вкладки ставит игру на паузу.
  Переключатель паузы срабатывает ровно один раз на нажатие (`oncePerKeyEvent`,
  `src/engine/key-event-once.ts`, также в прототипе): Phaser повторно перебирает очередь клавиш
  на каждом событии до следующего игрового шага, и без защиты клавиши, нажатые в том же кадре,
  снова переключали паузу.
- При первой смерти выберите **Воскреснуть · Revive** либо **Завершить забег · End Run**.
- Revival восстанавливает 50% текущего Max HP, очищает эффекты игрока и даёт 3 секунды полной защиты. Золотое кольцо и HUD показывают защиту. Мир и run ID остаются прежними.
- После второй смерти — итог и новый забег/выбор класса. Новый забег создаёт все пять модулей заново.

HUD показывает класс, уровень, HP/Max HP, время, число убийств, оружие, доступность revival и статусы игрока. Над врагами видны HP и `PO/BU/BL × stacks`; melee и ranged различаются формой/цветом. Меч/кинжалы показывают реальные attack sectors, снаряды — реальные snapshots, damage/Dodge/crit feedback берётся из Core events.

Стартовая арена содержит 8 melee и 4 ranged врага. Task 06.1 добавил непрерывные off-screen подкрепления и рост давления; теперь после зачистки приходят новые группы. Существующие XP pickup и mid-run upgrades из первого прототипа оставлены отдельно по адресу **`/?prototype`**. Их старые формулы не участвуют в альфе. Постоянный уровень задаётся тестовым контролем; XP и уровень текущего забега теперь ведутся отдельно без автоматических stat gains. Постоянное сохранение XP не реализовано. Прежнее optional localStorage-сохранение рекорда времени/убийств используется один раз при окончательном завершении забега, а не на экране revival; уровни классов оно не сохраняет.

## Developer Testing Mode

Откройте **`http://localhost:5173/?debug`** при `npm run dev`, затем нажмите **DEV · Тестирование**. Панель доступна и в меню, и во время боя/паузы/решения. Горячие клавиши движения не перехватывают ввод чисел и select.

| Контрол                                                | Действие                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Класс, уровень 1–50, «Начать / повторить конфигурацию» | Создать новый валидированный мир. Сохраняются выбранные в панели class/level, размер/дистанция группы и параметры on-hit; default seed 1337 воспроизводит RNG. Это явный restart, не revival.                                                                                           |
| Character Stats                                        | Раскрыть primary/combat attributes текущего героя, полученные из существующего модуля.                                                                                                                                                                                                  |
| Установить HP / восстановить HP                        | Healing повышает HP до Max HP с дробной точностью. Снижение допускает целую потерю HP; raw input находится через существующий Core calculator и применяется Core periodic operation, без нового damage formula. Недопустимое дробное снижение отклоняется. Мёртвого так оживить нельзя. |
| Контролируемая смерть                                  | Валидированная летальная Core operation на текущем времени, с настоящими death/lifecycle events. Намеренно работает даже при тестовой защите для воспроизведения решения.                                                                                                               |
| Melee / ranged, дистанция                              | Добавить врага на выбранном расстоянии 0–1500 и детерминированном случайном угле; текущая геометрия игрока — origin.                                                                                                                                                                    |
| Размер группы / добавить группу                        | 1–24 врага, каждый третий ranged. Радиус каждого второго enemy увеличен на 45, весь запрос проверяется до спавна. Общий active cap 120.                                                                                                                                                 |
| Убрать врагов                                          | Летальные Core operations для активных врагов и обычная cleanup. Каждая смерть учитывается один раз; счётчик убийств увеличивается. Уже запущенные вражеские снаряды сохраняются по штатному правилу и могут попасть позже.                                                             |
| Цель                                                   | Игрок или выбранный живой enemy ID. При исчезновении цели выбор возвращается к игроку.                                                                                                                                                                                                  |
| Poison / Burn / Bleed, стаки, raw/tick, длительность   | Применить 1–20 последовательных applications через StatusEffects. Группа всё равно ограничена 10 стаками; превышение заменяет старейшие. Показаны stack count, оставшаяся длительность и время до следующего тика.                                                                      |
| Очистить эффекты                                       | Existing target-only `clearNegativeEffects`, причина `cleansed`.                                                                                                                                                                                                                        |
| On-hit шанс и назначение оружию                        | Выбранные тип/raw/duration/chance становятся mapping для WeaponStatusAdapter; 0% отключает новые applications. Уже существующие группы не сбрасываются.                                                                                                                                 |
| Тестовая полная защита                                 | Дополнительная eligibility policy блокирует direct/periodic/new negative effects. Она не изменяет штатные таймеры Survival, не продлевает revival и сбрасывается при новом мире.                                                                                                        |
| Пауза / продолжить                                     | Тот же authoritative pause, что и обычная игра; не обходит revival/ended состояние.                                                                                                                                                                                                     |
| Боевые события                                         | Последние 20 combat/lifecycle записей: время, damage/appliedDamage, crit, Dodge, periodic attribution, death и revival. Общий world history ограничен 160 событиями.                                                                                                                    |

Ошибки команд показываются в UI и не позволяют записать NaN/отрицательный HP/неизвестный класс/уровень вне диапазона. Новая конфигурация полностью конструируется и валидируется **до** замены текущей сессии. Debug HP changes/очистка врагов — явно тестовые операции, не новые игровые навыки. Приостановленный мир разрешает такие явные действия для воспроизведения ошибок; время они не двигают.

В development `?debug` также предоставляет `window.__alpha.state()`, `.command(action)` и `.advance(seconds)` для автоматизации тестов. В **production** `?debug` не включает панель, команды или глобальные debug API. Vite удаляет DEV-ветви и отдельные dynamic imports DeveloperPanel/testing controller. Production regression проверяет и DOM/globals, и отсутствие этих модулей/маркеров в JS. Старый `__survivors` также отсутствует в production.

## Владельцы состояния и публичный слой

- `src/gameplay/GameplayWorld.ts`: одна сессия, единственный общий scheduler, player geometry/input, активные enemy IDs, bounded events, deduplicated kill count.
- `config.ts`: явно provisional arena/weapon/enemy/on-hit параметры; постоянные class formulas не меняются.
- `types.ts`, `index.ts`: `GameplayOptions`, immutable `GameplaySnapshot`, `WorldEvent`, публичный `GameplayWorld`.
- `src/gameplay-ui/`: React screens, HUD, отдельный command/snapshot bridge, лениво загружаемая DEV-панель. Публикация HUD — примерно 10 раз в секунду. Нет React-компонента на каждого врага.
- `src/engine/AlphaScene.ts`: клавиатура/touch, камера, procedural graphics и ограниченные pools текстовых labels/FX. Сцена не хранит свой HP, damage, cooldown или копию attack logic.

Основные методы мира: `update(delta)`, `setMovement(x,y)`, `setPaused(bool)`, `getSnapshot()`, `getEvents(afterSequence?)`, `decide('revive'|'finish-run')`, `spawnEnemy`, `spawnGroup`, `applyEffect`, `cleanse`, `setOnHit`. Контролируемые `setPlayerHp`, `healPlayer`, `setTestProtection`, `clearEnemies` доступны UI только через DEV controller. Ссылки `core/weapons/statuses/enemies/survival` служат интеграции и тестам: внешний consumer не должен самостоятельно запускать их update или менять Core в обход forwarding мира.

Combat Core — единственный владелец HP/Resistance/damage/death; Character Stats — class attributes; Weapon Attacks — targeting/cycles/strikes/player projectiles; EnemyAI — движение/контакты/ranged flights; StatusEffects — группы/стакование/тики; PlayerSurvival — protection/lifecycle/revival. На смерти enemy удаляется из активного AI и weapon target geometry, но Core ID остаётся зарегистрированным для attribution уже запущенных снарядов/эффектов.

## Общая хронология

Интеграция **не** вызывает Weapon.update(dt), Enemy.update(dt), Status.update(dt) последовательно. Все три движка получили additive API, использующий их прежние private scheduler/resolvers:

| Метод                                        | Гарантия                                                                                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `peekBoundary(end): SimulationBoundary       | null`                                                                                                                                                                                                            | Frozen `{time,priority}` ближайшего события до end; не наносит урон и не расходует RNG. Hint пересчитывается после изменения Core/геометрии, его нельзя кэшировать как команду. |
| `advanceToBoundary(time)`                    | Только позиции/flight/часы. Отвергает переход через неразрешённое более раннее событие и backward/non-finite time. Не вызывает damage.                                                                           |
| `resolveBoundary()`                          | Разрешить ровно одно due scheduled event на текущем clock, вернуть прежние typed events. Для weapon melee strike это одна атака по всем подходящим целям с одним критом. Повтор без due event ничего не наносит. |
| `EnemyAI.prepareBoundary(playerBody)`        | Согласовать Core liveness и sample игрока, подготовить piecewise-linear velocities; без damage/новых атак.                                                                                                       |
| `WeaponAttacks.setBody(id, body, velocity?)` | Старый двухаргументный вызов сохраняет static-body поведение. Optional velocity нужен общему миру для относительного swept collision с движущимся enemy.                                                         |
| `WeaponAttacks.removeBody(id)`               | Удалить target geometry, сохранив существующие snapshots/flights.                                                                                                                                                |

`SimulationBoundary` и общая проверка времени находятся в `src/simulation-boundary.ts`. Старые update signatures и standalone поведение сохранены; resolver logic не продублирована. Добавлено compensated суммирование enemy displacement и world frame deltas: погрешность разбиения кадра не должна переставлять геометрический контакт относительно математически одновременного тика.

На каждом шаге World:

1. Подготавливает текущую AI/weapon геометрию и узнаёт ближайшие границы всех модулей и input tick.
2. Выбирает глобально самое раннее время T. **До любого урона** продвигает все часы/flight/AI positions к T без разрешения событий, синхронизирует moving hitboxes.
3. Разрешает одно событие соответствующего движка и сразу доставляет результат/смерти зависимым системам.
4. Enemy pre-policy и synchronous post-resolution observer обеспечивают защиту Survival **до** следующего same-time incoming hit. Status observer немедленно доставляет periodic смерть; обычная защита не блокирует DoT.
5. Weapon impacts и допустимые enemy impacts проходят через существующий WeaponStatusAdapter на том же Status time. Killing hits не накладывают эффект. Core deaths очищают группы, удаляют combat-inactive enemies и отменяют pending strikes. Крит/уклонение/Resistance остаются в Core.
6. Пересчитывает ближайшие события по уже изменённому состоянию. Нет очереди старых команд, разрешающих атаки по будущему HP.

Enemy projectile и weapon projectile движутся по snapshot direction. Weapon collision с движущимся enemy использует относительный swept segment (`projectileVelocity - targetVelocity`), а не старую неподвижную позицию цели. Прогноз действителен только до следующей общей boundary; при смене steering/цели он пересчитывается. Caller, передающий ненулевые velocities, обязан использовать boundary API и обновлять bodies на каждой границе, как World; обычный standalone update с fixed bodies не реконструирует внешний motion.

### Стабильный tie-order

Для равных timestamps (с прежней machine-epsilon погрешностью) приоритеты следующие:

1. Input/movement sample.
2. Уже летящие enemy projectiles: impact, затем expiry.
3. Уже летящие player projectiles: collision, затем expiry.
4. Status ticks.
5. AI motion/steering boundaries.
6. Player strikes: pending dagger second strike, затем cycle.
7. Enemy contact/fire attempts.
8. Status expirations; тик на точной границе duration выполняется до удаления.

Позже утверждённые владельцем слоты (дробные ранги между существующими): skill actions 5.5,
boss abilities 6.5, skill expirations 8.5, chest/buff expiry 8.6 ([CHESTS.md](CHESTS.md)),
**activity completion/failure/fade 8.7**, reinforcement spawning 9, **extra activity spawns 9.1**,
chest spawn 9.25, **activity spawn 9.3** ([ACTIVITIES.md](ACTIVITIES.md)), campaign events 9.5.

Внутри модулей сохраняются их старые tie rules: projectile launch sequence, enemy/source ID; status target ID, затем poison/burn/bleed. После каждого события выбор повторяется. Поэтому новый projectile с нулевой дистанцией может тут же дать impact до следующего более низкоприоритетного события. Мёртвый враг не начинает новую атаку, уже запущенный snapshot не отменяется.

При player death все часы уже находятся на T. World завершает **только уже допустимые события на T**, включая outgoing projectile/periodic смерть последнего врага, и останавливается до любого времени > T. Eligibility по чужим целям не подавляется смертью игрока. Новые атаки мёртвого источника запрещены. Результат двух допустимых смертей сохраняется; victory/wave outcome здесь нет. Неизрасходованный frame delta отбрасывается. Пока ожидается решение/ended/manual pause, update ничего не двигает и не копит «долг».

На revival используется тот же Core и согласованный StatusEffects на T. Все системы возобновляются с T; старые projectiles/таймеры продолжают существовать. Эффекты игрока уже очищены, эффекты других целей и их nextTickAt сохранены. Повторный death автоматически завершает run. Ordinary healing и Max HP changes не оживляют.

### Модель движения и её пределы

Ввод удерживается постоянным между вызовами мира. Player position меняется на фиксированных симуляционных control ticks `index / 60`; это выбранная дискретная модель движения, не попытка доказать хронологию маленьким dt. Внутри интервала player hitbox — static sample, enemy velocity — piecewise-linear от EnemyAI. Все атаки/коллизии/тики при этом разрешаются на собственных точных временах между control ticks. Нет интерполяции неприсланной player trajectory или homing. Тест large vs 240 small updates при одинаковом seed/input сравнивает HP/events/positions; разные временные последовательности ввода закономерно дают другие траектории.

Phaser ограничивает один визуальный dt до 50 ms, чтобы background/browser stall не выдавал большой catch-up; потеря видимости дополнительно ставит паузу. Task 36: сцена подаёт миру только целые фиксированные шаги `SIM_STEP` = 1/120 s (накопитель `SimStepper` в `src/engine/time-scale.ts`); «Скорость игры» игрока (×1 / ×1.5 / ×2 / ×3 / ×4 / ×5 — Task 38, настройка `gameSpeed`) и QA time scale умножают время кадра до накопителя (не больше 240 шагов за кадр: ×5 × QA ×8; время сверх лимита отбрасывается, а не копится), поэтому при любой скорости и частоте кадров мир видит одинаковые шаги и даёт побитово одинаковый результат для того же seed и ввода. Сам framework-independent World поддерживает большие delta и обрабатывает все границы до смерти/end, без лимита «одна атака за кадр».

## Предварительные параметры альфы

Все числа находятся в `src/gameplay/config.ts`, отдельно от permanent progression и weapon engine.

| Класс / оружие       | Coefficient | Base interval | Range | Дополнительно                                                 |
| -------------------- | ----------: | ------------: | ----: | ------------------------------------------------------------- |
| Warrior / Sword      |         1.3 |         0.8 s |   115 | Physical sector 130°                                          |
| Mage / Staff         |           1 |        0.65 s |   520 | Magical projectile: speed 470, radius 6, max travel 650       |
| Archer / Bow         |           1 |         0.6 s |   580 | Physical projectile: speed 650, radius 4, max travel 720      |
| Rogue / Dual Daggers |        0.85 |         0.8 s |    90 | Physical sector 100°, second strike at 0.4 of effective cycle |

Существующий attackSpeed масштабирует interval. Circular Area Size не применяется самовольно к sector range или projectile travel: circular abilities здесь отсутствуют. Ни class growth, ни caps не изменены.

Арена 3600×3600, player radius 13, base movement speed 185 × Character Stats movement multiplier. Soft separation: cell 64, padding 8, strength 0.8, AI movement step 1/30 s. Active enemy cap 120; manual test group radius 260/305; normal Task 06.1 starts use off-screen placement.

Enemy stats: Max HP 90, physical 18, magical 22, Resistance 5, Crit Chance 8%, Critical Damage 200%, Dodge 0. Melee: speed 80, radius 14, physical coefficient 1, interval 1.17 s. Ranged: speed 65.6, radius 15, magical coefficient 1, interval 2.21 s, range 360, retreat 150, hysteresis 18, projectile speed 240/radius 6/max travel 700.

Default player on-hit: 100%, raw 3/tick, duration 4 s; Rogue — Bleed, Mage — Burn, Archer — Poison; Warrior — no built-in DoT (Task 07.1). Enemy successful positive impacts: Poison 25%, raw 2/tick, duration 4 s. Эти raw values — тестовый контент; никаких новых формул статусов нет. Все группы используют существующие cap 10, interval 1 s, Resistance и death cleanup. Летальные/direct-blocked/Dodge hits не создают статус.

## Проверки

```bash
npm run test:alpha       # framework-independent integration/boundary tests
npm test                # весь прежний и новый Vitest + Node
npm run typecheck
npm run build
npm run test:e2e         # dev server обязателен; старый prototype + новая alpha
npm run test:production  # после build; сам запускает локальный preview на 4179
```

Новый набор содержит 28 integration/boundary тестов. Проверяются четыре класса/оружия, Core HP authority, same-time protection/cooldowns, ранний DoT против позднего contact и exact tie, непосредственная enemy death, moving-hitbox sweep, глобальная остановка всех пяти часов, сохранение мира и flight при revival, full immunity/граница T+3, эффекты/next tick через паузу, source death, отмена второго dagger strike, simultaneous deaths, large/small delta equivalence, повторный update(0), normalized movement/bounds, fresh sessions, invalid DEV inputs, no duplicate kill и bounded event history.

Browser regression новой alpha проверяет выбор класса/WASD, настоящий sword damage, интерактивную DEV-смену на Mage/уровень 7, projectiles, Archer/Rogue attacks, оба enemy types, stack cap, pause, controlled death, frozen world, UI Revive в том же run, вторую смерть, touchscreen joystick и JS exceptions. Production regression отдельно запускает собранную игру с `?debug`: gameplay/pause работают, debug UI/API/controller code отсутствуют. Прежний browser regression продолжает проверять legacy XP/upgrades/save/death/restart/mobile по `/?prototype&debug`.

Скриншоты сохраняются в игнорируемом `artifacts/alpha-01-selection.png` … `alpha-09-production.png`; старые prototype screenshots сохранены отдельно.

### Итог автоматической проверки Task 06

- `npm run test:alpha`: 28 новых integration/boundary тестов прошли.
- `npm test`: 576 Vitest-тестов (548 прежних + 28 новых) и 6 Node-тестов, без failures/skips.
- `npm run typecheck`, `npm run build`: успешно; сохранено прежнее предупреждение Vite о крупном Phaser bundle.
- `npm run test:e2e`: оба браузерных сценария прошли, без JS exceptions; сохранены desktop/mobile/decision/revival/DEV screenshots. Alpha group check: 120 enemies, 74 animation frames за 1.215 s; legacy pool check: 240 enemies, 61 frames примерно за секунду.
- `npm run test:production`: gameplay/pause успешны; production `?debug` не раскрывает панель, globals или testing controller code.

При первом финальном browser-запуске локальный dev server уже не слушал порт (ERR_CONNECTION_REFUSED). После его перезапуска полный неизменённый сценарий прошёл; production regression также успешен.

### Ручной checklist

1. Пройти выбор каждого класса, посмотреть разные melee/projectile visuals и HP врагов.
2. Двигаться по диагонали и у границы арены, свободно проходить сквозь группу во время автоатаки.
3. В DEV спавнить melee у игрока и ranged дальше, выключить тестовую защиту: проверить contact cooldown, projectiles и HP.
4. Применить по 12 стаков каждого типа на выбранную цель: cap 10, независимые группы, секундные тики, duration refresh и cleanse.
5. Поставить паузу: позиции/projectiles/таймеры эффектов сохраняются. Возобновить.
6. Сделать controlled death: ждать на экране решения; время не меняется. Нажать Revive: те же enemies/projectiles/run ID, половина HP, пустые player effects, 3 секунды защиты.
7. Проверить вторую смерть и End Run отдельно; новый run не наследует charges/HP/statuses.
8. Повторить на узком экране, проверить joystick. Собрать production и убедиться, что `?debug` ничего не открывает.

## Производительность и ограничения

Enemy separation использует прежний spatial grid. Активные мёртвые targets удаляются из AI/weapon geometry; attribution остаётся в Core. HUD публикуется около 10 Hz; Phaser Graphics/текстовые labels переиспользуются, FX ограничены 64, history — 160. Короткая headless Chromium проверка с 120 живыми врагами дала 74 animation frames за 1.215 s (около 61 FPS) без exceptions; это не профиль длительного реального боя на мобильном GPU.

Оставшиеся источники нагрузки: boundary selection сканирует активные entities/flights, player projectile targeting/collision проверяет подходящих enemies; scene строит snapshots и status labels. Глобальный broadphase для player projectiles не добавлен. Предельно плотная separation группа всё ещё содержит много реальных соседей. Большие delta стоят пропорционально событиям. Core хранит уникальные ID умерших до конца run ради attribution; бесконечное ручное создание/удаление врагов растит эту сессионную таблицу, хотя active world/history ограничены.

Победа, skills/upgrades, currency/inventory, permanent progression, accounts и финальный баланс/арт отсутствуют. Task 06.1 добавил run XP и подкрепления; Cloudflare deployment (Workers Builds) настроен отдельно. Непрерывные подкрепления Task 06.1 приходят автоматически по общему расписанию. Input sampling дискретный, visuals простые, clocks/RNG детерминированы для одинакового input, а не для любых fps/input samples. Прежнее предупреждение Vite о большом Phaser bundle сохраняется. Навыки забега добавлены в Task 07: [IN_RUN_SKILLS.md](IN_RUN_SKILLS.md); там же обновлённый порядок событий при равном времени.

### Task 06.1 update

[Experience & Enemy Waves](EXPERIENCE_WAVES.md) описывает текущие defaults, collectible crystals, provisional XP curve, отдельные run/permanent levels, off-screen placement, schedule/pressure/caps и новые DEV controls. Порядок общей timeline сохранён, spawn стоит после combat events на равном timestamp. Приведённые выше результаты 576 тестов и параметры стартового сценария относятся к завершённому Task 06; актуальные проверки Task 06.1 описаны в новом документе.

Task 07.1: обзор навыков без паузы, целые HP в HUD, лечение 15% Max HP за уровень забега, 18% ranged в обычных волнах и отдельная QA-сборка Preview описаны в [GAMEPLAY_BALANCE_QA.md](GAMEPLAY_BALANCE_QA.md).

Task 07.2 добавляет безопасный обзор навыков поверх paused/level-up диалогов, pooled-бейдж Stun,
QA-only God Mode и диагностику реальных синергий. Второй optional аргумент GameplayWorld —
фабрика Core для специализированной интеграции; protected factories/record сохраняют default
поведение и прежние API. [Описание изменений и QA checklist](SKILLS_PAUSE_QA.md).

## Меню и мета-экраны (Task 13)

Оформление «Последний свет» для всех экранов вне забега. Только представление: правила покупки,
надевания, талантов и открытия карт остаются в прежних чистых модулях (`equipment`, `profile`,
`talents`, `campaign`), React лишь показывает состояние и вызывает действия `campaignStore`.
HUD забега и сцена Phaser не менялись. Спецификация: [task-13-ui-redesign.md](task-13-ui-redesign.md),
журнал: [task-13-progress.md](task-13-progress.md).

- **Набор UI** — `src/gameplay-ui/kit/`: токены (`tokens.css`: ночная синева, свечное золото,
  пергамент; цвета уровней предметов: Обычный серый, Добротный зелёный, Редкий синий, Эпический
  фиолетовый, Легендарный оранжевый; отступы, радиусы, тени, длительности 150/200/250 мс),
  фон с виньеткой и огоньками, `Button` (primary/secondary/danger/ghost, причина недоступности
  как подсказка), `Panel`, `Tabs`, `ConfirmModal`, `Tooltip` + `CompareList` (сравнение
  характеристик +/−), `ProgressBar`, `CurrencyBadge`, `TierFrame`, `ClassEmblem` (свои SVG-гербы
  классов). Логика сравнения и недоступности — `kit/logic.ts` (тесты `tests/ui-kit/`). Всё под
  классом `.meta-ui`, внешних шрифтов, картинок и CDN нет.
- **Экраны** — `src/gameplay-ui/meta/`: «Главная» (название, выбранный герой, быстрый выбор класса,
  «В бой» → карта похода, быстрый старт), «Персонаж» (4 карточки классов, характеристики полосами
  с учётом снаряжения и талантов, очки талантов, ссылки «Экипировка/Таланты» этого класса),
  «Экипировка» (кукла героя с 4 слотами, сетка своих предметов с фильтром, сравнение при наведении и
  выборе, «Надеть»/«Снять», итоговые характеристики), «Таланты» (3 ветви кругами с линиями, ранги
  I–III, состояния, печать «доступно с 30 уровня», панель описания с «Изучить»), «Магазин» (рамки
  уровней, цена, отметки «Куплено/Надето», замок «откроется после карты N», подтверждение в окне),
  «Карта похода» (40 узлов на извилистом пути через 4 акта, панель карты с «В бой»), «Прогресс»,
  «Настройки».
- **Управление** — Tab с видимым фокусом, Enter подтверждает окно, Esc закрывает окно или
  возвращает на «Главную»; `prefers-reduced-motion` выключает анимации. Ширина 1024–1920 без
  горизонтальной прокрутки (и телефон 390 px). Проверки — `tests/campaign-browser.mjs`.
- **Скриншоты** — `tests/ui-screenshots.mjs` с сохранением-витриной
  `tests/fixtures/ui-showcase-profile.json`; «до/после» в `docs/ui/`.
