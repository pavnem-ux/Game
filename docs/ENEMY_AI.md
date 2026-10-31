# Enemy AI & Combat Behavior — Task 04

`src/enemy-ai/index.ts` — независимая от Phaser/React симуляция врагов. Она не заменяет `src/engine/systems/Enemies.ts`, не регистрирует персонажей вместо Combat Core и не хранит собственные HP, Resistance, crit/Dodge или урон. Нужные сущности сначала создаёт вызывающий код в существующем `CombatCore`.

## Публичный API

```ts
import { EnemyAI } from '../src/enemy-ai';
import type { EnemyConfig, EnemyAIOptions } from '../src/enemy-ai';
import type { CombatCore } from '../src/combat-core';
import type { Point } from '../src/weapon-attacks';

// Параметры приходят от вызывающей конфигурации, не от утверждённого каталога баланса.
function createEnemySimulation(
  core: CombatCore,
  options: EnemyAIOptions,
  enemyId: string,
  config: EnemyConfig,
  position: Point,
) {
  const ai = new EnemyAI(core, options);
  ai.registerEnemy({ entityId: enemyId, config, position });
  const events = ai.update(0.5, { x: 0, y: 0, radius: 10 });
  return { ai, events };
}
```

### EnemyAIOptions

- `playerId`: единственная выбранная игроковая сущность Core, affiliation строго `player`.
- `movementStep`: положительный симуляционный период пересчёта steering/separation. Значение задаёт caller. Интервалы ниже числовой точности часов отвергаются.
- `separation`: `cellSize > 0`, `padding >= 0` в мировых единицах, `strength` в диапазоне `[0,1]` как доля movementSpeed.
- Optional `canResolveDirectDamage(context): boolean`: policy будущего Player Survival. Она не должна выполнять вложенные HP-операции, менять симуляцию или заниматься I/O.

| API                                           | Поведение                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerEnemy({entityId, position, config})` | Подключает существующую enemy-affiliated сущность. ID уникален в AI. Конфигурация, позиция и вложенный projectile config копируются.                                                        |
| `update(deltaSeconds, playerBody, {paused?,shouldPause?})` | Продвигает внутренние симуляционные часы и возвращает readonly EnemyEvent[]. Позиция игрока предоставлена caller, не меняется AI.                                                           |
| `getEnemy(id)`, `getEnemies()`                | Immutable EnemySnapshot: entityId, config, position, velocity, state, alive, nextAttackAt. Alive выводится из Core; HP не дублируются. Мёртвые немедленно отображаются с нулевой скоростью. |
| `getProjectiles()`                            | Immutable снимки выпущенных вражеских снарядов.                                                                                                                                             |
| `getSeparationStats()`                        | Последний steering pass: livingEnemies, occupied cells, число local queries и фактических проверок соседей. Не FPS-бенчмарк.                                                                |
| `consumeCombatEvents(events)`                 | Проверяет пакет direct/periodic Core events и синхронизирует AI с авторитетным alive. Не генерирует Core death повторно. Caller передаёт события на совпадающем симуляционном времени.      |
| `unregisterEnemy(id)`                         | Удаляет только AI state. Core entity/history и уже выпущенные снаряды сохраняются.                                                                                                          |
| `dispose()`                                   | Очищает всю AI-сессию вместе с её снарядами/grid. Core не очищается. Повторное dispose допустимо; дальнейшее использование экземпляра отвергается.                                          |
| `EnemyProjectiles`                            | Отдельный reusable компонент launch/flight/collision, без player-class weapons. См. ниже.                                                                                                   |
| `SpatialGrid`                                 | Переиспользуемый uniform grid с clear/insert/query и стабильными sorted ID результатами.                                                                                                    |

## Конфигурации врагов

`EnemyConfig = MeleeEnemyConfig | RangedEnemyConfig`.

Общие параметры: behavior, movementSpeed, circular radius, attackInterval (секунды), attackCoefficient, damageType (`physical | magical`). Speed/radius/coefficient неотрицательны, interval положителен, все числа конечны.

Melee: только общие параметры.

Ranged дополнительно требует:

- `attackRange > 0`;
- `retreatDistance >= 0`, строго меньше attackRange;
- `hysteresis >= 0`, меньше половины ширины интервала между retreat и attackRange;
- projectile: положительные speed и maxTravelDistance, неотрицательный radius.

Enemy movement speed уже является скоростью в мировых единицах/секунду, а attackInterval — готовым индивидуальным интервалом. К ним не применяется автоматически player Attack Speed, CDR или другое незаданное масштабирование. Damage коэффициент передаётся напрямую в Core. Нет финального каталога/weapon categories для врагов.

В `tests/enemy-ai/fixtures.ts` лежат **только тестовые** NORMAL_MELEE, FAST_MELEE и RANGED и технические параметры AI. HP/боевые значения из test helpers также не являются балансом.

## Движение и sampling игрока

PlayerBody — центр x/y и radius. Новый образец применяется **в начале update** и считается постоянным до его конца. AI не пытается восстановить неприсланный путь игрока, его скорость или будущее положение. Движение врагов интегрируется как `velocity * elapsedSimulationTime`; исходный pursuit вектор нормализован и умножен на movementSpeed.

Steering/separation пересчитываются на фиксированных симуляционных границах `index * movementStep`, при смене образца игрока/состава AI и при достижении значимых motion boundaries. Между ними скорости постоянны. Обновление таймера атаки не меняет скорость и не останавливает melee pursuit. На достижении центра игрока chaser останавливается без overshoot; при нулевой/численно близкой дистанции вектор движения нулевой. Для неразрешимого направления retreat при точно совпадающих центрах используется +X; это детерминированный технический fallback, а не поведение случайного блуждания.

Внутри одной AI-сессии clock никогда не берётся из wall time. При постоянном образце игрока разбиение времени на большие/малые updates сохраняет порядок атак/попаданий и траектории в пределах числовой точности. При разных образцах игрока на разных границах это **разные входные данные** — обещания одинаковой исторической траектории нет.

## Soft separation через spatial grid

В grid вставляются только living enemy centers. Для каждого врага локальный query радиус включает собственный radius, наибольший living neighbor radius и padding. Проверки выполняются только по полученным соседям; обязательного глобального перебора каждой пары нет. Очень большой запрос проходит по занятым ячейкам вместо бесконечного обхода пустых координат.

Influence убывает от максимума при совпадающих центрах до нуля на расстоянии `radiusA + radiusB + padding`. Внутри перекрытия он сильнее, чем у внешнего края. При совпадении позиций пара получает противоположные направления вдоль X по порядку ID. Соседи и actor snapshots обрабатываются в стабильном порядке, скорости вычисляются из общего снимка позиций до их присваивания; insertion order результата не меняет.

Сумма separation нормализуется максимум до длины 1, умножается на `strength * movementSpeed` и складывается с первичным goal velocity. Итоговая скорость ограничивается movementSpeed. Repulsion не накапливает acceleration и не телепортирует позиции. При strength ≤ 1 она не переворачивает первичный pursuit сама по себе; плотные группы допустимы, никакого rigid-body/solid разрешения между врагами нет.

Игрок не входит в grid и не получает separation force. Нет player displacement, collision resolution, movement penalties или блокирования ввода; прохождение через врагов допустимо. Overlap при этом может дать contact attempt.

## Melee контакт

Допустимость — `distance(enemyCenter, playerCenter) <= enemyRadius + playerRadius`, плюс обе сущности alive и индивидуальное readiness. На проходе к overlap определяется swept entry по текущему линейному отрезку движения, поэтому большой update не пропускает первый доступный удар. Пока контакта нет, враг сохраняет readiness и не проигрывает пустые циклы.

При attempt:

1. Повторно проверить актуальный Core alive, overlap и cooldown.
2. Спросить optional direct-damage policy.
3. Если policy разрешает, создать один Core snapshot и вызвать `resolveAttack` против playerId.
4. Установить `nextAttackAt = attemptTime + attackInterval`.
5. С Task 05 немедленно уведомить optional onDirectDamageResolved, затем вернуть `contact-attempt` с реальным result/Core events.

Dodge расходует cooldown. Blocked attempt тоже расходует cooldown, но у него `attack:null`, `result:null`, `blocked:true`: нет RNG Core, поддельного Dodge или damage/death events. Глобального contact cooldown нет — все враги имеют отдельный nextAttackAt. После смерти игрока последующие attempts исключаются сразу, а AI переходит в idle с нулевой скоростью.

## Ranged approach / attack / retreat

Для дистанции используется единая с player targeting конвенция `max(0, centerDistance - playerRadius)` — от центра врага до ближайшего края игрока. Enemy radius участвует в контакте, но повторно из ranged distance не вычитается.

- Снаружи attackRange: approach к текущей позиции игрока.
- Внутри retreatDistance: retreat от неё.
- Между ними: attack, первичный goal velocity нулевой; soft separation всё ещё может мягко сдвигать плотную группу.
- Начатый approach завершается на `attackRange - hysteresis`.
- Начатый retreat завершается на `retreatDistance + hysteresis`.
- Из attack переход наружу происходит только за attackRange, внутрь — ниже retreatDistance. На точной границе остаётся attack.

Положительный hysteresis предотвращает быстрое переключение при небольших колебаниях входной позиции. При 0 правила используют точную границу с небольшой геометрической погрешностью. Motion-boundary события предотвращают overshoot зоны из-за одного большого steering step.

Firing readiness проверяется независимо от движения: если игрок в hard attackRange, жив и cooldown готов, враг может стрелять, в том числе во время retreat или последней части approach внутри range. Дополнительный запрет стрельбы вне состояния attack в ТЗ не задан и не вводился. За пределами hard range выстрела нет.

## EnemyProjectiles

Собственный компонент использует чистые `aimDirection` и `segmentCircleIntersection` из Weapon Attacks, но **не** вызывает equipWeapon и не обходит class restrictions. Единственное дополнение старого weapon API — экспорт уже существующей функции aimDirection через index; scheduler, конфигурации и damage behavior не менялись.

На launch источник должен быть living enemy, target — living player. Фиксируются origin, текущая позиция цели и unit direction (без прогнозирования), projectile speed/radius/max travel и `Core.createAttack` snapshot. При совпадающих центрах AI использует +X fallback; low-level caller может передать другой нормализуемый fallbackDirection.

Flight движется прямолинейно и с постоянной скоростью. Собственное движение проверяется sweep-отрезком против player circle, расширенного на projectile radius. Выбирается первое касание по ходу полёта, включая tangent/начальное перекрытие; tunnel через весь hitbox за update не допускается. Другие enemies вообще не рассматриваются collision blockers/targets.

На impact optional policy проверяется снова на **времени столкновения**, не выстрела. Block или Dodge в любом случае потребляют снаряд; blocked result=null и не считается Dodge. Дистанция ограничена maxTravelDistance; при expiry конечная позиция точно устанавливается на ней. Collision на последней дистанции имеет приоритет над expiry. При смерти источника уже выпущенные snapshots/flight остаются, новые launches запрещены. После смерти игрока существующие flights могут дойти до expiry, но не наносят урон dead target.

Standalone low-level протокол компонента: `launch(time, input)`, затем `nextEvent(now, playerBody)`, `advance(deltaToEvent)`, `resolve(dueEvent, eventTime)`. Caller отвечает за согласованность этих времён и не должен разрешать stale/поддельные due events. Высокоуровневый EnemyAI выполняет эту последовательность сам, хронологически пересчитывая следующий контакт после каждого события.

## Планировщик и пауза

На каждом шаге EnemyAI выбирает ближайшее событие из:

- projectile collision/expiry;
- contact/ranged readiness и входа в допустимую дистанцию;
- прихода к motion goal/дистанционному threshold;
- следующей steering boundary.

Позиции всех living enemies и flights продвигаются до этого времени; событие разрешается, затем авторитетные смерти проверяются заново. Большой delta обрабатывает все истёкшие eligible attempts, не сбрасывая лишние удары. Неготовое/неподходящее состояние не расходует cooldown.

Точный tie order: projectile impacts, projectile expirations, motion boundaries, steering boundaries, attack attempts. Projectile ties — порядковый номер запуска, attempts/motion ties — enemy ID. Поэтому летальное попадание снаряда раньше одновременного нового contact attempt прекращает будущие атаки на мёртвого игрока. Core death остаётся единственным авторитетным событием.

Числовая погрешность времени — machine epsilon, геометрии — 1e-9. Непредставимые времена, позиции/ячейки grid и интервалы отвергаются, а не превращаются в NaN или silent skipped events. Практически чрезмерные catch-up периоды могут быть дорогими: количество действий пропорционально истёкшим steering/attack/flight событиям. Caller должен разбивать время без его потери; лимит «одна атака на frame» не вводится.

`paused:true` не двигает clock, позиции, cooldown или flights и не накапливает delta. Новые attacks/steering не выполняются. Синхронизация уже отражённых в Core смертей допускается без продвижения часов. Player body при следующем unpaused update всё равно поступает от caller, никакой неприсланной траектории за паузу не реконструируется.

## События и future policy

Readonly EnemyEvent union:

- `enemy-state-changed`: time, entityId, previous/state; AI dead state **не** является повторным Combat Core death.
- `contact-attempt`: time, source/target IDs, blocked, optional attack/result.
- `enemy-projectile-launched`: time и полный projectile snapshot.
- `enemy-projectile-impact`: time, projectile snapshot, blocked и Core result либо null.
- `enemy-projectile-expired`: time и финальный snapshot.

Для будущего on-hit выбирайте не заблокированные результаты с `status === 'hit' && appliedDamage > 0` и живой целью. Контекст содержит исходный enemy ID, attack ID, тип/коэффициент через snapshot, projectile ID и time. Никаких effect probabilities, affixes или status formulas внутри AI нет.

`canResolveDirectDamage({time,sourceId,targetId,kind,attack})` предоставляет boundary будущему Player Survival. Для contact snapshot=null до решения policy; для projectile передаётся существующий snapshot. Callback должен вернуть boolean и быть чистым относительно текущей AI/Core симуляции. Он не является таймером: 0.3-секундную защиту после попадания и 3-секундную после revival хранит отдельный Player Survival из Task 05.

## Status Effects и критическая граница Task 06

Poison/Burn/Bleed не мешают AI сами по себе: источник alive читается только из Core. На periodic death живой статус становится dead, velocity обнуляется, separation больше его не учитывает, новые действия исключаются. Уже запущенные projectiles сохраняются.

Передайте вложенные Core death events из контакта/попадания в StatusEffects.consumeCombatEvents для очистки target groups; periodic results наоборот можно передать EnemyAI.consumeCombatEvents. Без forwarding перед следующим действием выполняется authoritative alive fallback. Передача должна происходить на соответствующем общем симуляционном времени; сами Core events не содержат timestamp.

**Здесь нет общей Weapon + Status + Enemy timeline.** Нельзя сначала выполнить AI.update(10), изменить HP будущими impacts, затем задним числом подавать его events модулю StatusEffects. Точно так же нельзя сначала продвинуть periodic damage в будущее, затем симулировать AI по старым HP. Это меняло бы боевые результаты.

Текущий пакетный API возвращает resolved events после update. Для точной межсистемной интеграции Task 06 должен предоставить общий event-order/interruption boundary и передавать результаты на их времени. В частности, future post-hit protection должна узнать о первом успешном direct hit **до** следующего одновременного attempt; одно ретроактивное чтение большого event batch этого не обеспечивает. Policy callback позволяет блокировать по уже известному состоянию, но не подменяет доставку предшествующих результатов. Общий оркестратор не добавлялся. В Task 05 появился синхронный post-resolution observer и локальная точка остановки (см. ниже); они обеспечивают немедленную активацию защиты внутри AI, но не объединяют timeline всех модулей.

Тесты интеграции используют явно согласованные временные границы без скрытого вызова StatusEffects из AI. Новое поведение не включено в Phaser-прототип.

## Тесты и ограничения

```bash
npm run test:enemies
npm test
npm run typecheck
npm run build
npm run test:e2e  # прежний прототип, нужен dev server
```

Тестируются нормальное/быстрое преследование, нулевая и близкая к нулю дистанция, pause/large delta, плотные группы/перестановка ID, local spatial queries, контактная геометрия, независимые cooldown, Core crit/Dodge/Resistance/HP/death, blocked attempts, ranged thresholds/hysteresis, прямолинейные swept projectiles, движения/смерти игрока и источника, unregister/dispose, periodic death compatibility, immutable результаты и invalid input.

Task 04 не добавлял зависимости, Character Stats формулы, статусы, wave/spawn механики, pathfinding, revival, loot/XP, skills, sprites/VFX или UI. Геометрия player motion внутри update остаётся static-sample: sweep не интерполирует неприсланную траекторию игрока. Spatial hashing ускоряет разреженные сцены; в предельно плотной группе фактических соседей всё ещё может быть много. Значения всех профилей — временная тестовая конфигурация. Task 05 описан ниже; Общая интеграция Task 06 описана ниже.

### Результаты проверки Task 04

88 новых тестов Enemy AI прошли. Общий Vitest-набор: 483 теста (88 новых + 395 прежних), также прошли 6 Node-тестов. Пропусков нет. `npm run typecheck`, `npm run build` и браузерный сценарий `npm run test:e2e` успешны: старые movement/combat/XP/upgrades/death/restart/mobile проверки и нагрузочная проверка пула 240 врагов без JS exceptions. Старое информационное предупреждение Vite о размере bundle осталось; новый AI не включён в Phaser-сцену.

### Player Survival Task 05

Optional `onDirectDamageResolved(context, result)` вызывается синхронно после каждого Core direct result и до следующего same-time попадания. Для контакта cooldown уже зафиксирован; для projectile flight уже удалён. Dodge/нулевой урон тоже уведомляют, blocked result=null — нет. EnemyProjectiles принимает observer четвёртым аргументом после pre-policy. Callback может обновлять Survival, но не должен менять текущий AI/Core, reenter update или выбрасывать исключения.

Optional `shouldPause()` в EnemyAI.update проверяется на входе и после каждого локального события. При true в T scheduler завершает уже доступные локальные события на T, затем не продвигается дальше. Остаток delta не накапливается. На паузе сохраняются позиции/cooldown/flights; после authoritative Core revival AI пересчитывает steering и возобновляет поведение без сброса мира. consumeCombatEvents принимает новый Core event `revived`.

`createEnemySurvivalPolicies` связывает pre-policy и observer с PlayerSurvival, `createSurvivalPausePolicy` предоставляет локальный shouldPause. Этого достаточно для синхронной защиты от последовательных/одновременных AI hits. Глобальный владелец мира всё равно обязан согласовать время остальных модулей и остановить их на смерти: [API, протокол времени и граница Task 06](PLAYER_SURVIVAL.md).

### Интеграция Task 06

Добавлены `prepareBoundary(playerBody)`, `peekBoundary(end)`, `advanceToBoundary(time)`, `resolveBoundary()`; прежний update использует тот же single-event resolver. Новый GameplayWorld выбирает глобальную boundary и синхронизирует все часы перед damage, поэтому AI больше не вызывается отдельным большим future batch в playable alpha. Compensated displacement уменьшает накопление погрешности позиции при разбиении updates. После смерти active enemy удаляется из AI, Core attribution и запущенные flights сохраняются. [Приоритеты, player movement sampling и ограничения](PLAYABLE_COMBAT_ALPHA.md).
