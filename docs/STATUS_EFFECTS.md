# Status Effects — Task 03

`src/status-effects/index.ts` — самостоятельная симуляция Poison, Burn и Bleed. Она не зависит от Phaser/React/DOM, не содержит игровых таймеров, не хранит отдельные HP и не задаёт постоянный баланс эффектов. Одна StatusEffects-сессия предназначена для одного CombatCore.

## Публичный API

```ts
import { StatusEffects, WeaponStatusAdapter } from '../src/status-effects';

// core — существующий CombatCore с уже зарегистрированными source/target.
const statuses = new StatusEffects(core, {
  random: () => 0.4,
  // Необязательные чистые hooks будущего Player Survival:
  canApply: ({ application, time }) => true,
  canDamage: ({ group, rawDamage, time }) => true,
});

// Только пример вызывающей конфигурации, не утверждённый игровой баланс.
statuses.apply({
  sourceId: 'source',
  targetId: 'target',
  effectType: 'poison',
  originId: 'example-skill',
  rawDamagePerTick: 8.5,
  duration: 4,
  probabilityPercent: 50,
});
const events = statuses.update(1); // Первый тик в t=1, непосредственного тика при apply нет.
statuses.update(10, { paused: true }); // Симуляционное время не двигается.
```

| API                                      | Контракт                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatusEffects(core, options?)`          | Использует авторитетные сущности Core; RNG относится только к вероятности приложения.                                                                    |
| `apply(EffectApplication)`               | Валидирует, проверяет liveness/hook/вероятность, добавляет или заменяет стак, возвращает immutable `ApplicationResult`.                                  |
| `applyBatch(applications)`               | Применяет список последовательно; при ошибке откатывает всю статусную часть пакета и счётчики ID.                                                        |
| `update(delta, { paused?, shouldPause? })`             | Обрабатывает все тики/истечения до конца delta. Ноль не повторяет уже выполненные тики.                                                                  |
| `advanceTo(time, options?)`              | Альтернативный абсолютный **симуляционный** timestamp; назад двигаться нельзя. Это не wall-clock время.                                                  |
| `getGroup(targetId, effectType)`         | Immutable snapshot или null.                                                                                                                             |
| `getGroups(targetId?)`                   | Immutable snapshots в стабильном порядке целей и типов.                                                                                                  |
| `consumeCombatEvents(events)`            | Принимает direct/periodic Core events, очищает мёртвые цели, возвращает события удаления. Также проверяет актуальное состояние остальных активных целей. |
| `validateCombatEvents(events)`           | Проверяет весь пакет без изменения состояния; используется адаптером перед несколькими приложениями.                                                     |
| `isAlive(entityId)`                      | Читает авторитетный `Core.alive`; неизвестный ID — ошибка.                                                                                               |
| `assertTime(time)`                       | Проверяет синхронизацию on-hit с текущим временем модуля.                                                                                                |
| `WeaponStatusAdapter(statuses, mapping)` | Копирует/валидирует отдельный mapping weapon instance ID → readonly EffectDefinition[]. WeaponConfig не меняется.                                        |
| `adapter.consumeImpact(event)`           | Принимает один уже разрешённый WeaponImpactEvent; применяет настроенные эффекты только после реальной потери HP у живой цели.                            |

`EffectDefinition`: `effectType`, `rawDamagePerTick`, `duration`, `probabilityPercent`, optional `originId`. `EffectApplication` добавляет `targetId/sourceId`. Разрешены только `poison/burn/bleed`; числа конечны, raw damage ≥ 0, duration > 0, probability от 0 до 100 включительно. Origin и entity IDs — непустые строки. Source и target должны существовать в Core; source может быть уже мёртв, например после запуска снаряда.

## Структура и стаки

- `StatusStack`: `id`, `sequence`, `effectType`, исходный `sourceId`, optional `originId`, неизменяемый `rawDamagePerTick`.
- `StatusGroupSnapshot`: `id`, `targetId`, `effectType`, `createdAt`, `expiresAt`, `nextTickAt`, массив стаков.
- Внутренний ключ группы — target + type; источники, способности и оружие не разделяют группы.
- На цель не больше трёх групп, до 10 стаков в каждой. Лимит и секундный интервал централизованы в `config.ts`.
- Порядок — глобальная последовательность успешных приложений этой сессии. При 10 стаках новый **заменяет старейший**, даже если слабее или равен нулю. ID повторно не используется.
- Все стеки одной группы имеют общий expiration; у стека нет собственного таймера. Снимок не ссылается на актуальные характеристики источника.
- Публичные данные, массивы, результаты и вложенные события заморожены; старые snapshots сохраняют значения после дальнейших операций.

## Длительность, тики и пауза

Первое успешное приложение создаёт `nextTickAt = applicationTime + 1`. Каждый следующий тик — `createdAt + tickIndex * 1`. Добавление/замена стака не сдвигает фазу тиков.

Новое истечение — `max(oldExpiresAt, currentTime + applicationDuration)`. Это точно соответствует `max(remainingDuration, applicationDuration)`: более короткое приложение не укорачивает группу, его новый стак всё равно участвует до общего истечения. Ошибка вероятности ничего не добавляет и не обновляет срок.

Для каждого update обрабатывается ближайшее запланированное событие; все due ticks сохраняются даже при большой delta. На границе expiration ровно в момент тика **сначала тик, затем удаление**. При duration < 1 группа может истечь без единого тика. При дробном сроке после последнего полного тика дополнительный не добавляется.

Порядок одновременных событий:

1. Тики, по ID цели в порядке кодовых единиц, затем `poison`, `burn`, `bleed`.
2. Истечения, в том же порядке.
3. Внутри тика: Core periodic-damage, затем Core death; очистка всех групп погибшей цели происходит немедленно, до следующего запланированного тика.

Если первый эффект убивает цель, остальные уже не причиняют ей урон. Это не останавливает обработку других целей: одновременные смерти разных сущностей представлены отдельными событиями. Такой порядок — техническая конвенция симуляции, не бонус одного эффекта.

Время IEEE-754 сравнивается с машинной погрешностью `8 * Number.EPSILON * max(1, |time|)`. Разбиение delta не меняет число тиков/HP; timestamps могут отличаться последними битами. Сроки/тики, не представимые конечным числом после текущего времени, отвергаются. Нет скрытого лимита catch-up или выбрасывания истёкших тиков.

При `{paused:true}` время, expiration и next tick не продвигаются, delta не накапливается. При этом уже умершие в Core цели могут быть очищены без продвижения времени. `update(0)` выполняет такую проверку, но не повторяет выполненный тик.

## Периодический урон и расширение Combat Core

Добавлен **`CombatCore.applyPeriodicDamage(PeriodicDamageRequest)`**. Это отдельная операция, а не fake AttackSnapshot и не вызов resolveAttack. Она:

1. Валидирует operation/target/effect IDs, source attribution и aggregate raw damage. Источники должны существовать; живыми быть не обязаны.
2. Для мёртвой цели возвращает `inactive`, нулевую потерю HP и пустые события.
3. Использует `calculateSuccessfulDamage(rawDamage, target.resistance)` с **текущим** Resistance.
4. Через общий внутренний `reduceHp` меняет авторитетные HP, ограничивая снизу нулём и фактическую потерю оставшимися HP.
5. Возвращает periodic-damage и при летальном исходе единственный death. RNG не вызывается.

За тик Status Effects суммирует raw вклады всех стаков и передаёт в Core **одну агрегированную операцию**. Сопротивление/округление применяются к общей сумме, не по каждому стакy. Положительный raw даёт минимум 1 по прежнему `Math.max(1, Math.round(...))`; нулевой raw — 0. Crit и Dodge на тиках отсутствуют. Overkill не переносится.

`PeriodicDamageRequest`:

```ts
{
  operationId: 'status-group-1:tick-1',
  targetId: 'target', effectId: 'poison', rawDamage: 17,
  sources: [
    { applicationId: 'status-stack-1', sourceId: 'source', originId: 'weapon-a', rawDamage: 8.5 },
    { applicationId: 'status-stack-2', sourceId: 'other', originId: 'skill-b', rawDamage: 8.5 },
  ],
}
```

Сумма source contributions проверяется на совпадение с raw damage с float tolerance. Core копирует и замораживает metadata до изменения HP.

Совместимые дополнения:

- Новые типы `PeriodicDamageSource/Metadata/Request/Event/Result` и метод выше.
- `CombatEvent` дополнен вариантом `type: 'periodic-damage'`. Потребителям с исчерпывающим switch нужно обработать новый вариант.
- У `DeathEvent` добавлено **optional** `periodic` с полным списком вкладов. Старые direct события, поля и методы остаются прежними.
- Для совместимости обязательного `DeathEvent.sourceId` первым представительным источником является первый активный стак группы; `attackId` хранит ID periodic operation. **Это не правило наград/kill credit**: для будущего решения сохраняются все `periodic.sources` с application/origin IDs и raw вкладами.
- HP-переход вынесен в один приватный helper, общий direct/periodic. Старое direct поведение, crit, Dodge, округление и healing не менялись; все прежние тесты сохранены.

Никаких per-effect formulas, damage type бонусов или постоянных duration/damage значений нет. Модуль не изменяет Character Stats или коэффициенты оружия.

## События Status Effects

`StatusEvent` — union:

- `status-applied`: time, immutable group/stack, optional replacedStackId.
- `status-tick`: time, group snapshot, aggregate rawDamage, outcome `resolved|blocked`, `result: PeriodicDamageResult | null`.
- `status-removed`: time, group snapshot, reason `expired|target-dead|cleansed` (cleansed добавлен в Task 05).

Core damage/death events находятся в `tick.result.events`, остаются авторитетными и не генерируются второй раз модулем. История событий не хранится бесконечно внутри симуляции; результаты принадлежат вызывающему коду. Сохранённая в событии копия удалённой группы нужна для аудита и не является активным состоянием.

## WeaponImpactEvent adapter

```ts
const adapter = new WeaponStatusAdapter(statuses, {
  // Только пример внешнего on-hit правила, не баланс и не новый WeaponConfig.
  'configured-weapon-id': [
    { effectType: 'poison', rawDamagePerTick: 8.5, duration: 4, probabilityPercent: 50 },
  ],
});
const result = adapter.consumeImpact(impact);
```

Принимается только `type:'impact'`. Требуются `result.status === 'hit'`, `result.appliedDamage > 0` и актуальное `Core.alive` цели. Killing hit, inactive, Dodge и нулевая реальная потеря не получают новые стаки. Origin по умолчанию weapon instance ID; optional definition.originId позволяет сохранить ID способности.

Каждое настроенное правило для каждого независимого eligible hit имеет свою probability-проверку; два dagger strikes получают два отдельных приложения, каждый sword target — своё. Крит не меняет probability. 0% никогда не проходит, 100% проходит для всех валидных RNG `[0,1)`; ровно на границе вероятности — неуспех. Одна проверка использует один draw, включая 0/100%. Ineligible hits и запрещённые eligibility hook приложения RNG не расходуют. Неизвестное в mapping оружие не получает эффектов. На start/launch ничего не применяется.

### Хронологическая граница

`impact.time` должен совпадать с `statuses.time`. Поздние/будущие/нечисловые timestamps отклоняются до изменения статусного состояния. Вызывающая симуляция должна:

1. Продвинуть статусы до времени операции прямого урона, обработать полученные события/смерти.
2. Разрешить прямой hit и сразу передать его адаптеру на том же времени.
3. Затем продвигаться к следующему событию.

**Нельзя** сначала выполнить большой WeaponAttacks.update, завершив все будущие прямые удары, а потом задним числом воспроизвести его impact-массив в Status Effects. Core уже потерял бы исторические HP; адаптер не подделывает этот порядок и не меняет время автоматически.

Task 03 реализует и тестирует этот narrow integration contract на synthetic и настоящих sword/dagger/projectile impacts. Общего Weapon+Status timeline orchestrator и изменения WeaponAttacks scheduler здесь нет; это отдельная будущая интеграция. Подавайте каждый WeaponImpactEvent один раз; адаптер не является журналом идемпотентного воспроизведения или anti-cheat проверкой.

Все определения mapping валидируются/копируются при создании. Несколько приложений одного hit выполняются через `applyBatch`: при ошибке статусы и ID-счётчики пакета откатываются, уже разрешённый вне адаптера прямой урон не откатывается. RNG/внешние side effects откатить невозможно, поэтому callbacks должны быть чистыми и валидными.

## Смерть и очистка

Смерть источника не удаляет и не ослабляет его стаки, не сбрасывает расписание/сроки. Постфактум on-hit от ранее выпущенного снаряда допустим, даже если source уже мёртв; новую атаку должен запрещать Weapon/Core слой, как прежде.

При смерти цели передайте `coreResult.events` в `consumeCombatEvents`. Пакет проверяется полностью до очистки. Только Core решает, жива ли сущность; fake death для живой цели отвергается. Все три её группы и pending ticks/expiration удаляются сразу. Повторное forwarding не повторяет удаление или смерть.

Без forwarding следующий update, tick или попытка приложения проверит авторитетный alive. Getter snapshots не потребляет события и сам не меняет состояние; для синхронной очистки используйте consumeCombatEvents. Ни после direct, ни после periodic смерти нельзя повредить цель повторно или автоматически возродить её.

## Будущий Player Survival

Optional `canApply({application,time})` и `canDamage({group,rawDamage,time})` возвращают boolean. Они должны быть чистыми, синхронными и не менять Core/StatusEffects рекурсивно.

- canApply=false: стака/refresh нет, probability RNG не расходуется.
- canDamage=false: данный тик отмечается blocked, Core HP operation не вызывается; next tick и expiration идут дальше, пропущенный урон не превращается в поздний burst.

В Task 05 эти hooks подключает отдельный Player Survival; он владеет таймерами, direct protection и решением revival. StatusEffects не хранит собственную копию immunity. Ниже описаны дополнительные cleanse/notification API; shield не добавлялся.

## Валидация, ограничения и вопросы

- Все внешние поля, ссылки на сущности, timing, probabilities и числовая представимость проверяются; неверное приложение не оставляет полустак или частично обновлённую длительность. Batch возвращает весь статусный state к исходному при ошибке.
- Случайные/пользовательские hooks не транзакционны во внешнем мире. Не выполняйте в них HP операции, I/O или вложенное продвижение симуляции.
- Очень большие catch-up периоды могут быть дорогими: все due ticks обязаны выполниться. Нельзя решать это молчаливым пропуском времени; caller может разбивать виртуальное время на чанки.
- Snapshot raw вклада задаёт caller; формулы навыков/affix generation и мгновенный выбор характеристик источника не изобретаются.
- Kill/reward attribution смешанных источников и общий межсистемный порядок direct vs periodic событий требуют будущего оркестратора/дизайна. Этот модуль фиксирует только детерминированный порядок своих событий.
- Сам StatusEffects не реализует weapons, AI, волны, loot/XP, player revival lifecycle, UI, VFX или Phaser integration. Все значения эффектов вне лимита 10 и интервала 1 секунду поступают извне.

## Проверки

```bash
npm run test:status
npm test
npm run typecheck
npm run build
npm run test:e2e # при работающем dev-сервере; проверяет прежний прототип
```

Добавлены 112 Vitest-тестов: новая periodic Core операция, стакование/замены, duration/tick boundaries, сопротивление и округление, отсутствие crit/dodge, смерти/события, hooks, probability, валидация/rollback и adapter с настоящими weapon impacts. Общий набор — 395 Vitest-тестов плюс 6 прежних Node-тестов. Строгая проверка типов охватывает независимые модули/тесты без DOM. Сборка проходит; старое информационное предупреждение Phaser bundle size не связано с Task 03.

Браузерная регрессия прежнего прототипа также прошла: движение, бой, подбор опыта, выбор улучшений, смерть/рестарт, локальный рекорд, мобильный джойстик и проверка пула 240 врагов; ошибок JavaScript нет. Status Effects в игровую сцену не подключались.

### Enemy AI Task 04

Enemy AI читает authoritative Core alive и может принять те же death events через consumeCombatEvents. Timestamped direct results идут из EnemyEvent. Общий Status/Weapon/Enemy orchestrator не реализован; backward replay resolved batches запрещён прежним контрактом. [Ограничения и ответственность Task 06](ENEMY_AI.md).

### Player Survival Task 05

Добавлен `clearNegativeEffects(targetId): readonly StatusRemovedEvent[]`: удаляет только Poison/Burn/Bleed указанной зарегистрированной цели, возвращая immutable events с reason `cleansed` и текущим временем StatusEffects. Не продвигает часы, не сбрасывает сессию, не меняет другие группы. После прежней death cleanup возвращает пустой массив. Consumers с exhaustive reason-switch должны принять новый вариант. `usesCombatCore(core)` позволяет проверить принадлежность сессии до revival.

Optional `onPeriodicDamageResolved(context, result)` вызывается синхронно после каждого разрешённого тика и его death cleanup, до следующего тика. Blocked ticks его не вызывают. Optional `shouldPause()` в update проверяется на входе/после событий: при true завершает уже доступные локальные события на текущем timestamp, останавливает время до последующих событий и не накапливает остаток delta. Это сохраняет одновременно допустимые player/enemy deaths. Без этих options прежнее поведение сохраняется.

`createStatusSurvivalPolicies` соединяет canApply/canDamage с полной защитой и немедленно передаёт periodic death в Survival; обычная 0.3-секундная защита DoT не блокирует. Observers не должны reenter/mutate StatusEffects/Core или выбрасывать исключения. Модуль принимает новый Core event `revived`. Общая timeline по-прежнему не реализована: [контракт паузы, event delivery и граница Task 06](PLAYER_SURVIVAL.md).

### Интеграция Task 06

Общий GameplayWorld использует additive `peekBoundary(end)`, `advanceToBoundary(time)`, `resolveBoundary()` вместо последовательного большого update нескольких модулей. Эти методы разделяют прежний scheduler/resolver; на каждой операции все clocks уже согласованы. WeaponStatusAdapter получает actual impact на том же Status time, periodic deaths доставляются Survival немедленно. Сам StatusEffects не стал глобальным оркестратором. [Порядок событий, pause/revival и playable alpha](PLAYABLE_COMBAT_ALPHA.md).
