# Player Survival & Revival — Task 05

`src/player-survival/index.ts` — независимые от Phaser/React/DOM правила одной жизни игрока и одного забега. HP хранится только в Combat Core. Модуль не запускает игровой цикл, не управляет позициями и не создаёт экран решения. Константы из утверждённого задания: 0.3 секунды обычной защиты, одна ручная попытка revival, 50% текущего Max HP и 3 секунды полной защиты.

## Состояние и API

Создайте `new PlayerSurvival(core, playerId)` для зарегистрированного живого игрока с affiliation `player`. Для нового забега создайте новый Core/мировой контекст и новый экземпляр Survival; повторное использование завершённой сессии не предусмотрено.

| API | Контракт |
| --- | --- |
| `getState(): PlayerSurvivalState` | Неизменяемый снимок: playerId, runState, revivalUsed, time, directInvulnerableUntil, fullInvulnerableUntil, directProtected, fullyProtected, requiresWorldPause, canPlayerAct, canRevive, availableDecisions. HP читается из Core, копии авторитетного HP нет. |
| `time` | Текущее симуляционное время в секундах. |
| `advanceTo(time, {paused?})` | Продвигает только часы Survival до абсолютного времени. При паузе, смерти или неактивном runState время сохраняется. Возвращает `SurvivalResult`. |
| `update(deltaSeconds, {paused?})` | Относительный вариант advanceTo; не обновляет другие модули. |
| `canReceiveHostileDirectDamage({time,sourceId,targetId})` | Синхронная проверка перед враждебным direct damage. Для своего игрока требует active/alive и отсутствие любой direct-защиты. |
| `recordDirectResult(time, DamageResult)` | Немедленное сообщение фактического результата Core; положительная потеря HP живым игроком запускает 0.3 секунды защиты. Летальный результат сразу переводит lifecycle по его death event. |
| `consumeCombatEvents(time, CombatEvent[])` | Принимает настоящие смерти игрока, в том числе periodic. Не создаёт новый Combat Core death и не отфильтровывает чужие события. |
| `canReceivePeriodicDamage({time,targetId})` | Запрещает урон игроку только при полной защите либо неактивной/мёртвой сессии. Обычная защита не мешает DoT. |
| `canApplyNegativeEffect({time,targetId})` | Та же eligibility для нового Poison/Burn/Bleed. |
| `decide('revive', statuses)` | Только awaiting-revival-choice, unused revival и dead Core player. Требует StatusEffects того же Core на том же времени, даже если эффектов нет. Возвращает lifecycle, Core revival и removal events. |
| `decide('finish-run')` | Завершает ожидающий забег без расходования revival. Повтор после ended не создаёт событий. |

Политики для других целей возвращают `true`: Survival не регулирует исходящий урон игрока и не подавляет уже допустимые смерти врагов. Проверка affiliation/допустимых целей остаётся в attack-модулях. Источник уже выпущенного снаряда может быть мёртв.

`SurvivalResult` содержит frozen `state` и `events`; результат revival дополнительно содержит `revival: RevivalResult` и `removedEffects: readonly StatusRemovedEvent[]`. Все вложенные lifecycle events и скопированные death metadata неизменяемы. Снимки, полученные ранее, не обновляются.

## Порядок прямого попадания

Для каждого фактического события на времени T:

1. Пока мир active, вызвать `survival.advanceTo(T)` **до** разрешения урона.
2. Спросить `canReceiveHostileDirectDamage(context)`.
3. При разрешении вызвать существующий Core resolve; немедленно вызвать `recordDirectResult(T, result)`.
4. Доставить lifecycle/Core events потребителям, затем обрабатывать следующее событие, включая событие на том же T.
5. При блокировке не вызывать Core resolve и не создавать фальшивый Dodge/damage/death. Атакующий расходует попытку/cooldown, снаряд расходуется при столкновении.

```ts
survival.advanceTo(hitTime);
if (survival.canReceiveHostileDirectDamage({ time: hitTime, sourceId, targetId })) {
  const result = core.resolveAttack(attackSnapshot, targetId);
  const lifecycle = survival.recordDirectResult(hitTime, result);
  // Передать lifecycle.events и result.events потребителям до следующего попадания.
}
// Расход попытки/снаряда принадлежит вызывающему attack-модулю независимо от block.
```

Нельзя сначала применить несколько попаданий Core, затем передать весь batch Survival: последующий урон уже будет нанесён. Несвоевременный результат с HP, отличным от текущего Core, и урон, проведённый через действующую защиту, отвергаются; Survival не исправляет HP задним числом. Для обычного сообщения нужен настоящий прямой `DamageResult`, а не periodic result.

После положительного nonlethal direct loss защита заканчивается в T + 0.3. Dodge, нулевая потеря HP, block и DoT её не запускают и не продлевают. Летальный hit создаёт состояние смерти без бесполезного таймера на мёртвом игроке. На самой границе защита уже не действует. Как в соседних модулях, сравнение времён учитывает восемь machine epsilon с масштабом времени, чтобы арифметика десятичных интервалов не меняла результаты при разбиении update. Не представимые времена таймеров отвергаются.

## Death, решения и revival

При реальном death игрока первый переход — `active → awaiting-revival-choice`, решения `revive`/`finish-run`, `requiresWorldPause: true`, `canPlayerAct: false`. Повторная доставка death не повторяет переход. Без actual death event Core-dead уже выставляет безопасный requiresWorldPause, но lifecycle всё ещё требует доставить событие на корректном времени. Нельзя восстанавливать неизвестный timestamp задним числом.

`decide('revive', statuses)` на замороженном времени T выполняет отдельную Core revival-операцию с `currentMaxHp * 0.5`, очищает только отрицательные группы игрока, расходует одну попытку, возвращает active и полную защиту до T + 3. HP сохраняет дробную точность: Max HP 1001 → 500.5 HP, Max HP 1 → 0.5 HP. Healing и Max HP changes по-прежнему не оживляют.

Другие сущности, их HP, позиции, снаряды, cooldown, оружие, XP, уровень и прогресс не сбрасываются. Старые эффекты игрока удалены, группы других целей остаются. Revival не вызывает update, поэтому его разрешено выполнить во время экрана решения. `decide('finish-run')` переводит в ended без revival. Смерть после использованного revival сразу даёт ended; повторная смерть/finish не дублирует lifecycle.

В полной защите запрещены direct, periodic и новые отрицательные эффекты. Блокировки не сдвигают T + 3; на точной границе все эти действия снова разрешены. Старые вражеские снаряды сохраняются при паузе и продолжают полёт после resume; столкновение во время полной защиты потребляет снаряд. Периодический scheduler при blocked tick продолжает свой обычный график, не начисляя «долг» урона.

## Адаптеры и локальные точки остановки

```ts
import { PlayerSurvival, createEnemySurvivalPolicies,
  createStatusSurvivalPolicies, createSurvivalPausePolicy } from '../src/player-survival';

const survival = new PlayerSurvival(core, playerId);
const onEvents = (events: readonly import('../src/player-survival').SurvivalEvent[]) => {
  // Передать события будущему UI/потребителю; не выполнять здесь решение или world update.
};
const statuses = new StatusEffects(core, {
  ...createStatusSurvivalPolicies(survival, onEvents),
});
const enemies = new EnemyAI(core, {
  playerId, movementStep, separation,
  ...createEnemySurvivalPolicies(survival, onEvents),
});
const pausePolicy = createSurvivalPausePolicy(survival);
// В согласованном окне локальной AI-симуляции:
enemies.update(delta, playerBody, pausePolicy);
// StatusEffects.update(delta, pausePolicy) применяется в своём согласованном окне.
// Эти два вызова НЕ образуют общую хронологическую симуляцию нескольких модулей.
```

`createEnemySurvivalPolicies` соединяет существующий pre-policy с новым `onDirectDamageResolved(context,result)`: Survival узнаёт о каждом разрешённом hit/Dodge сразу после Core, до следующего одновременного попадания. У контактной атаки cooldown уже зафиксирован, у projectile уже удалён flight. Block имеет result=null и не вызывает observer. Для standalone EnemyProjectiles эти два callback передаются третьим и четвёртым аргументами конструктора.

`createStatusSurvivalPolicies` использует существующие canApply/canDamage и новый `onPeriodicDamageResolved(context,result)`, который передаёт настоящие periodic death events сразу после тика/очистки умерших групп, до следующего тика. DoT не вызывает recordDirectResult. Адаптеры продвигают только часы Survival и только для его игрока; они не запускают другой мировой модуль. Optional onEvents получает только непустые lifecycle emissions, собственного глобального event bus/хранилища нет. Результаты прямых вызовов decide/consume нужно доставлять самостоятельно.

Observers должны быть синхронными, не выбрасывать исключения и не менять Core/текущий scheduler: нельзя reenter update или revive из callback. Survival policy может обновлять только Survival. Передача уже обработанных событий допустима без новых переходов, но это не замена корректному порядку доставки.

Новый optional `shouldPause()` в EnemyAI.update и StatusEffects.update проверяется на входе и после каждого локального события. Если флаг поднялся в T, module завершает уже доступные локальные события на T и останавливает часы до будущего события, а не до конца большого delta. Это сохраняет допустимые одновременные смерти player/enemy; последующие атаки по мёртвому player уже исключены. При true на входе применяется обычная пауза. Неиспользованная часть delta отбрасывается, не накапливается для автоматического resume.

## Пауза мира и граница Task 06

`requiresWorldPause` — контракт для будущего владельца общего мира, а не автоматическое замораживание всех компонентов. Пока игрок ждёт решения либо run ended, caller не двигает ни Survival, ни AI, ни Weapon Attacks, ни StatusEffects, ни другие cooldown. Существующее `paused:true` для каждого модуля сохраняет часы, позиции, flight и timers; authoritative death cleanup допускается без времени. Пользовательская пауза также должна поступать всем модулям, включая Survival. Wall time экрана решения не конвертируется в игровой delta.

**Единой timeline Weapon + Enemy + Status здесь нет.** Нельзя независимо продвинуть AI на 10 секунд, затем StatusEffects на те же 10 секунд: их результаты меняют общий Core в неправильном порядке. Optional локальный shouldPause прекращает только текущий scheduler. Task 06 должен синхронизировать все системы на настоящих временах событий, доставлять Core/lifecycle результаты до следующего шага и после revival согласовать их часы. Если смерть от AI произошла на T, остальные часы нужно согласовать с T прежде, чем вызывать decide со StatusEffects. Нельзя догонять отставший модуль поверх уже изменённого будущими событиями Core.

Survival не отменяет уже допустимую смерть врага при смерти игрока на том же игровом frame. В локальном Status batch тестируются обе одновременные смерти; правила глобального tie-order/frame и завершение волн/победа остаются у будущего оркестратора. Здесь нет victory-логики или полного игрового цикла.

## Lifecycle events и расширения совместимости

События имеют playerId, simulation time и монотонный sequence (с 1):

- `direct-protection-granted`: attackId, expiresAt.
- `revival-choice-required`: исходный immutable death.
- `player-revived`: restoredHp, fullInvulnerableUntil.
- `run-ended`: reason `finish-run` или `revival-already-used`, во втором случае death.

Отдельного события expiration нет: флаги вычисляются из времени. Новых переходов при повторных timestamp без действия нет. Direct duplicate notifications дедуплицируются по attack/target на текущем времени; новые корректные попадания позже могут использовать тот же универсальный Core snapshot. Старые известные death при replay после revival игнорируются, новая реальная смерть остаётся допустимой.

Совместимые дополнения существующих модулей:

- Core: `reviveEntity(entityId, restoredHp): RevivalResult`, `RevivalEvent` с type `revived`, previousHp=0, currentHp, maxHp. Только dead, конечный положительный HP не выше Max HP, один typed event. Общий Core не считает попытки; игрока в забеге восстанавливают только через Survival.decide.
- StatusEffects: `clearNegativeEffects(targetId)` возвращает frozen удаления с reason `cleansed` на текущем Status time, только для указанной цели, без искусственного expired/death. Если смерть уже очистила группы, массив пуст. `usesCombatCore(core)` проверяет принадлежность сессии для безопасного revival; `onPeriodicDamageResolved` и локальный shouldPause — optional.
- EnemyAI/EnemyProjectiles: optional post-resolution observer; EnemyAI optional локальный shouldPause. AI снова вычисляет steering после авторитетного revival, не сбрасывая позиции/cooldown/flights.
- Consumers с exhaustive switch по CombatEvent должны обработать новый `revived`, а по причине StatusRemovedEvent — `cleansed`. Существующие обязательные поля/методы не удалены; consumeCombatEvents в Status/AI принимает revived. Weapon scheduler, Character Stats, damage formulas/caps и Phaser-прототип не изменены.

Эти policies работают при их подключении: универсальные Core damage API сами по себе не знают об immunity. Будущие hostile skills обязаны использовать тот же pre-policy/post-notification протокол. Нельзя обходить его прямым вызовом Core и рассчитывать на ретроактивную защиту.

## Проверки и ограничения

```bash
npm run test:survival
npm test
npm run typecheck
npm run build
npm run test:e2e  # существующий прототип при работающем dev server
```

65 новых deterministic Vitest-тестов: обычная/полная защита и точные границы, Dodge/нулевой урон/block/DoT, синхронные same-time попадания, direct и все три periodic deaths, pause, дробное revival и current Max HP, один charge, сохранение мира, сохранённые снаряды, target-only cleanse, повторная доставка событий, finish/second death/new session, simultaneous deaths, Core/AI/Status policies, immutable результаты и invalid input/session/time.

Результат Task 05: 548 Vitest-тестов (65 новых + 483 прежних) и 6 Node-тестов прошли без пропусков; test:survival, строгий typecheck и production build успешны. Browser regression прошёл: desktop/mobile movement, combat, real XP pickup, pause/upgrades, death/restart, сохранённый рекорд и pool 240 enemies без JavaScript exceptions. Прежнее предупреждение Vite о размере Phaser bundle сохраняется; оно не связано с новым модулем.

Phaser-интеграция, UI, глобальный scheduler, new run persistence, дополнительные charges, новые классы/враги/эффекты, loot и rewards не добавлены. Следующий шаг — отдельно запрошенный Task 06: единая хронология, pause/resume, доставка событий и затем подключение к сцене/UI.
