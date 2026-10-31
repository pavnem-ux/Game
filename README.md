# Fantasy Survivors — Последний свет

Браузерный 2D action roguelite. **Combat Alpha — Task 06:** четыре класса, своё оружие у каждого, melee/ranged враги, Poison/Burn/Bleed, защита после попадания, одно ручное воскрешение и DEV-панель для проверки механик. Игра использует все самостоятельные боевые модули на общей хронологии.

## Запуск

Нужен Node.js **24+** и npm. Из каталога проекта:

```bash
npm ci
npm run dev
```

Откройте адрес, который выведет Vite. По умолчанию используется порт 5173. Интернет нужен только для установки пакетов: игровой контент работает локально, без CDN, внешних API и ключей.

```bash
npm run typecheck  # строгая проверка TypeScript
npm test           # тесты прототипа + Vitest Stats, Combat, Weapons, Status, Enemy AI и Survival
npm run build      # TypeScript + production-сборка в dist/
npm run preview    # проверить собранную игру
```

## Публикация в Cloudflare Pages

Проект подготовлен для статического хостинга из **приватного** `pavnem-ux/Game`: production branch `main`, build command `npm run build`, output `dist`, root directory — корень репозитория. Node.js закреплён в `.node-version` (`24.19.0`). Pages предоставляет SPA fallback без дополнительных rewrites. Developer Testing Mode исключён из production, включая `?debug`.

[Точные шаги подключения GitHub, авторизации и публикации](docs/DEPLOY_CLOUDFLARE_PAGES.md). Потребуется войти в свой Cloudflare и разрешить GitHub App доступ только к Game. Публичный URL появится после успешного deployment; до проверки реального URL сайт не считается опубликованным и проверенным. Игровая логика и баланс не менялись; Task 07 не начат.

## Как играть

- Выберите Воина, Мага, Лучника или Разбойника и нажмите «Начать забег».
- WASD / стрелки — движение; атака автоматически выбирает ближайшего допустимого врага. На touchscreen потяните в нижней левой части Canvas.
- P / Esc или `Ⅱ` — пауза. Сворачивание вкладки также ставит игру на паузу.
- При первой смерти доступны Revive и End Run. Revival продолжает тот же мир с половиной Max HP и 3 секундами полной защиты; повторная смерть завершает забег.
- Это ограниченная тестовая арена с 12 врагами, без последующих волн. После зачистки можно начать новый забег.

Для **Developer Testing Mode** запустите dev server и откройте `/?debug`, затем кнопку **DEV · Тестирование**. Панель позволяет выбрать класс/уровень 1–50, повторить тестовую конфигурацию, менять HP, вызывать смерть, добавлять/убирать врагов, проверять стаки/таймеры всех трёх эффектов, настраивать on-hit, защиту и паузу. В production этих UI/команд/глобальных debug API нет.

[Полная инструкция альфы, общая timeline, provisional values и тестовый checklist](docs/PLAYABLE_COMBAT_ALPHA.md).

Первый прототип сохранён отдельно по **`/?prototype`**: один маг, XP-кристаллы, mid-run upgrades и прежняя система временных характеристик. XP/upgrades не подключены к альфе, чтобы не смешивать две модели combat stats. Его debug route — `/?prototype&debug` в development.

## Браузерная проверка

При запущенном **dev-сервере** в другом терминале:

```bash
npm run test:e2e
```

По умолчанию тест использует системный `/usr/bin/chromium`. Можно задать `CHROMIUM_PATH` и `GAME_URL`. Команда проверяет и сохранённый прототип, и новую альфу: четыре класса/оружия, реальный урон, interactive DEV, статусы, смерть/Revive в том же мире, вторую смерть, паузу и touchscreen joystick. Старый сценарий XP/upgrades/save также выполняется. Скриншоты сохраняются в игнорируемом `artifacts/`.

В dev-альфе с `?debug` доступен `window.__alpha`; старый `__survivors` остаётся только в dev-прототипе. Production проверяется отдельно после сборки: `npm run test:production` сам запускает локальный preview на порту 4179 и проверяет отсутствие debug UI/API/controller code.

## Устройство проекта

- `src/gameplay/` — общий authoritative combat world и provisional alpha config.
- `src/gameplay-ui/`, `src/engine/AlphaScene.ts` — React screens/DEV-панель и Phaser renderer/input для альфы.
- Следующие каталоги относятся к сохранённому первому прототипу.
- `src/config/` — данные класса, оружия, врага, улучшений и баланс.
- `src/core/` — типы, формулы опыта/характеристик/урона, мост UI ↔ движок.
- `src/engine/` — арена, Phaser Scene и отдельные системы игрока, врагов, боя, опыта.
- `src/ui/` — React-меню, HUD, улучшения, пауза, итоги и оригинальная SVG-иллюстрация.
- `src/progression/` — валидируемое сохранение рекорда, числа забегов и убийств (схема v1).
- [Архитектура, этапы и риски](docs/ARCHITECTURE.md).

## Ограничения альфы и сохранённого прототипа

Экипировка, инвентарь, деревья талантов, классы сверх четырёх и дополнительные навыки, питомцы и звук пока не реализованы. Текущий рекорд сохраняется в localStorage этого браузера; сохранение самого забега и синхронизация между устройствами не предусмотрены. Никакой внешний аккаунт не требуется.

В новой альфе максимум 120 активных врагов, нет wave progression или victory. У сохранённого прототипа прежние ограничения: 240 врагов, 120 снарядов, 300 кристаллов; его сложность растёт со временем. Финальный 15–20-минутный баланс ещё не проверен. Препятствия декоративные.

Vite предупреждает о крупном bundle из-за Phaser; это не ошибка сборки. Графика процедурная и оригинальная, без ассетов Vampire Survivors. Дальнейшие задачи начинаются только по отдельному запросу.

## Character Stats System v1.0

Добавлен самостоятельный модуль постоянных характеристик четырёх классов на уровнях 1–50, с последующим подключением к альфе в Task 06. Точные формулы, независимый прогресс классов, финальные лимиты и чистые функции проверяются через `npm run test:stats`. [API, структура и будущая интеграция](docs/CHARACTER_STATS.md).

## Combat Core — Task 01

Добавлено независимое ядро боя `src/combat-core/`: сущности с HP, снимки физических/магических атак, один крит на атаку и отдельный Dodge на цель, сопротивление, округление урона, лечение, изменение Max HP и однократные события смерти. Тесты: `npm run test:combat`. [API, порядок расчёта и вопросы интеграции](docs/COMBAT_CORE.md). Подключение к альфе выполнено в Task 06.

## Weapon Attacks — Task 02

`src/weapon-attacks/` добавляет независимые от Phaser выбор целей, циклы sword/staff/bow/dual daggers, секторное melee и swept-коллизии прямолинейных снарядов. Урон делегируется существующему Combat Core. `npm run test:weapons` запускает 107 тестов. [API и модель времени](docs/WEAPON_ATTACKS.md). В Task 02 числа оружия оставались в тестовых fixtures; в Task 06 появился отдельный provisional alpha config и интеграция.

## Status Effects — Task 03

`src/status-effects/` реализует Poison/Burn/Bleed: до 10 стаков на цель/тип, общую длительность, секундные тики, замену старейшего стака и детерминированную очистку. Combat Core расширен методом `applyPeriodicDamage` без crit/Dodge. Для weapon impacts есть отдельный адаптер с явной синхронизацией симуляционного времени. Тесты: `npm run test:status`. [API, контракты времени, события и ограничения](docs/STATUS_EFFECTS.md). Phaser-интеграция не добавлялась; revival реализован отдельно в Task 05.

## Enemy AI — Task 04

`src/enemy-ai/` добавляет framework-independent melee pursuit/contact attacks, ranged approach/attack/retreat, soft separation через spatial grid и собственные вражеские снаряды. Core остаётся владельцем HP. `npm run test:enemies` запускает новый набор. [API, sampling игрока, timing и общая интеграция](docs/ENEMY_AI.md). Старый Phaser-прототип сохранён по `/?prototype`; новая альфа подключает AI через GameplayWorld.

## Player Survival & Revival — Task 05

`src/player-survival/` добавляет 0.3 секунды защиты от прямых попаданий, состояние смерти/решения, одно ручное воскрешение с 50% текущего Max HP, очистку отрицательных эффектов игрока и 3 секунды полной защиты. Есть синхронные policies/notifications для Enemy AI и Status Effects и контракт паузы мира. `npm run test:survival` запускает 65 новых тестов. [API, lifecycle, совместимые расширения и обязательный порядок событий](docs/PLAYER_SURVIVAL.md). Task 05 ограничивался правилами и policies; playable Phaser/UI-интеграция добавлена в Task 06.

## Playable Combat Alpha — Task 06

`src/gameplay/` объединяет все модули через точные event boundaries: сначала общее время без damage, затем одно событие и немедленная доставка результата. Смерть замораживает все часы на одном timestamp; revival не пересоздаёт мир. Добавлены class selection, responsive HUD, pause/revival/end screens, procedural attack/status feedback и development-only testing panel. `npm run test:alpha` проверяет интеграцию независимо от Phaser. [Архитектура, API stepping, управление и ограничения](docs/PLAYABLE_COMBAT_ALPHA.md). Task 07 не начат.
