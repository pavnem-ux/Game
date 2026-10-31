# Weapon Attacks — Task 02

`src/weapon-attacks/index.ts` — самостоятельный TypeScript-модуль. Он не импортирует Phaser, React, DOM, часы или таймеры. Ему передаются существующий `CombatCore`, геометрия зарегистрированных сущностей, уже выбранный экземпляр оружия и прошедшее **симуляционное** время.

## Публичный API

```ts
import { calculateCharacterStats } from '../src/character-stats';
import { CombatCore } from '../src/combat-core';
import { WeaponAttacks } from '../src/weapon-attacks';
import type { WeaponConfig } from '../src/weapon-attacks';

function example(alreadyEquippedWeapon: WeaponConfig) {
  const core = new CombatCore(() => 0.99); // Injectable RNG принадлежит Combat Core.
  const hero = calculateCharacterStats(alreadyEquippedWeapon.allowedClass, 1);
  core.addEntity({ id: 'hero', affiliation: 'player', stats: hero.combatAttributes });
  // Только демонстрационная цель: финальный баланс врагов здесь не задаётся.
  core.addEntity({ id: 'target', affiliation: 'enemy', stats: hero.combatAttributes });

  const weapons = new WeaponAttacks(core);
  weapons.setBody('hero', { x: 0, y: 0, radius: 10 });
  weapons.setBody('target', { x: 50, y: 0, radius: 10 });
  weapons.equipWeapon({
    entityId: 'hero',
    characterClass: alreadyEquippedWeapon.allowedClass,
    weapon: alreadyEquippedWeapon,
    attackSpeedPercent: hero.combatAttributes.attackSpeed,
    fallbackDirection: { x: 1, y: 0 }, // Направление задаёт вызывающий модуль.
    launchOffset: { x: 0, y: 0 },
  });

  const initial = weapons.update(0); // Готовое оружие может начать атаку сейчас.
  const events = weapons.update(0.5); // Обработать все события следующих 0.5 секунд.
  weapons.update(10, { paused: true }); // Никакого продвижения симуляционного времени.
  return { core, weapons, initial, events };
}
```

| Метод/тип                                                             | Назначение                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WeaponAttacks(core)`                                                 | Одна симуляция поверх предоставленного Combat Core; собственные копии HP/боевых статов не создаются.                                                                                                   |
| `setBody(entityId, CombatBody)`                                       | Позиция центра и радиус в мировых единицах. Entity должна уже существовать в Core. Геометрия копируется и замораживается. Повторный вызов обновляет позицию, не меняя движение или скорость персонажа. |
| `equipWeapon(EquipWeaponInput)`                                       | Однократно привязывает одно основное оружие к сущности. Проверяет класс, ID, геометрию и числовые параметры.                                                                                           |
| `setAttackSpeed(id, percent)`                                         | Принимает актуальную скорость для **следующего** цикла и применяет существующий Character Stats cap. Начатый цикл и второй удар не сдвигаются.                                                         |
| `setFallbackDirection(id, Point)`                                     | Ненулевое направление вызывающей системы; нормализуется. Нужно только при точно совпадающих центрах источника и цели/точки запуска и цели.                                                             |
| `update(deltaSeconds, { paused? })`                                   | Возвращает readonly `WeaponEvent[]`. Время delta конечно и неотрицательно. Нет wall-clock таймеров.                                                                                                    |
| `time`                                                                | Текущее симуляционное время.                                                                                                                                                                           |
| `getWeaponState(id)`                                                  | Неизменяемые конфигурация, скорость, `nextCycleAt`, `secondStrikeAt`.                                                                                                                                  |
| `getProjectiles()`                                                    | Неизменяемые текущие снимки снарядов: позиция, direction, attack, speed, radius, traveled/max distance. Старые снимки не изменяются.                                                                   |
| `validateWeaponConfig(config)`                                        | Проверяет, копирует и замораживает экземпляр, включая вложенный projectile config.                                                                                                                     |
| `circleIntersectsSector`, `segmentCircleIntersection`, `edgeDistance` | Чистые геометрические операции для тестирования/будущего адаптера. В боевой системе направления нормализованы.                                                                                         |

Внутри одного экземпляра `WeaponAttacks` entity и weapon IDs уникальны. Единственное основное оружие менять/снимать нельзя: переключение, инвентарь и persistence вне Task 02. Регистрация даже уже мёртвой сущности не даёт ей возможности атаковать — каждый запуск проверяет `Core.alive`.

## Конфигурации

`WeaponConfig` — discriminated union `SwordWeapon | ProjectileWeapon | DaggerWeapon`.

Общие поля: `id`, `category`, `allowedClass`, `damageType`, `damageCoefficient`, `baseAttackInterval` в секундах, `attackRange` в мировых единицах.

- `sword`: warrior, physical, `pattern: 'melee_arc'`, `arcDegrees`.
- `staff`: mage, magical, `pattern: 'projectile'`.
- `bow`: archer, physical, `pattern: 'projectile'`.
- `dual_daggers`: rogue, physical, `pattern: 'dual_melee'`, `arcDegrees`, `secondStrikeFraction`.
- `ProjectileConfig`: `speed`, `radius`, `maxTravelDistance`.

Категория строго определяет допустимый класс, pattern и фиксированный damage type; нельзя передать магический sword. Числовые свойства экземпляров одной категории могут отличаться. Коэффициент, радиус и дальность могут быть нулевыми; интервал, скорость и max travel должны быть положительными; arc — `(0, 360]`, fraction — `(0, 1)`. Числа должны быть конечными. Attack Speed должен быть положительным и нормализуется через `applyCombatAttributeCaps`, без дублирования лимита 300.

В `EquipWeaponInput` дополнительно находятся исходный `characterClass`, `attackSpeedPercent`, обязательный `fallbackDirection` и необязательный `launchOffset`. Последний — **смещение по мировым осям** относительно актуальной позиции источника, не координаты экрана. По умолчанию смещение нулевое. Для melee origin всегда позиция источника; для projectile — позиция плюс offset, а направление вычисляется от этой точки запуска к зафиксированной позиции цели.

Рабочего каталога/финального баланса в `src` нет. Только `tests/weapon-attacks/fixtures.ts` содержит временные параметры из ТЗ:

| Fixture      |      Coefficient |    Interval | Range |  Arc | Projectile speed/radius/max distance | Second strike |
| ------------ | ---------------: | ----------: | ----: | ---: | ------------------------------------ | ------------- |
| Sword        |             1.20 |         1.0 |    90 | 100° | —                                    | —             |
| Staff        |             1.00 |         1.5 |   300 |    — | 400 / 9 / **450**                    | —             |
| Bow          |             1.00 |         1.2 |   350 |    — | 600 / 5 / **500**                    | —             |
| Dual Daggers | 0.45 каждый удар | 0.9 за цикл |    65 |  70° | —                                    | 35% цикла     |

**450 и 500 — явно временные тестовые max travel distances**, превышающие acquisition range. Это не утверждённые игровые значения. Attack Range и travel distance независимы: конфигурация не требует одного фиксированного соотношения между ними.

## Цели и жизненный цикл атаки

1. Живой источник с готовым оружием ищет ближайшую живую сущность противоположной affiliation среди зарегистрированных тел.
2. Дистанция — `max(0, distance(sourceCenter, targetCenter) - target.radius)`. Радиус самого источника не вычитается: используется условие ТЗ «от персонажа до ближайшего края цели».
3. Допустима дистанция `<= attackRange`. При равных расстояниях выбирается меньший строковый ID (порядок кодовых единиц, без locale).
4. Если цели нет, цикл не начинается, снимок и RNG не расходуются, оружие остаётся готовым. После обновления тел `update(0)` немедленно начинает доступную атаку.
5. При инициации фиксируются origin/direction и вызывается `core.createAttack`. Отдельных crit/damage формул нет.
6. Мelee проверяет сектор один раз; projectile сохраняет flight-данные и живёт независимо от последующего состояния источника.
7. Каждое попадание вызывает `core.resolveAttack(snapshot, targetId)` и возвращает исходный `DamageResult` вместе с событиями Core.

### Правила интеграции v1

- Игрок атакует только enemies; enemy — только players. Self-hit и friendly fire отфильтрованы при выборе цели, melee-попадании и projectile collision.
- Один attack/strike может задеть много **разных** целей, но одну ID не более одного раза. Melee использует уникальный набор ID; снаряд удаляется при первом столкновении. У двух ударов кинжалов разные snapshots, поэтому оба могут ударить одну и ту же цель.
- Уже выпущенный снаряд продолжает лететь после смерти источника. Его damage snapshot, скорость, радиус, direction и travel distance зафиксированы.
- Мёртвый источник не начинает циклы или новые strikes. Ещё не начавшийся второй удар отменяется при следующем вызове `update`/после события смерти внутри update. Даже при `paused: true` можно очистить такую отменённую работу без продвижения часов; возвращается `strike-skipped: source-dead`.
- Старые публичные API, тесты, snapshots и события Combat Core не менялись. `Core.addEntity/getEntity/createAttack/resolveAttack` остаются единственным владельцем сущностей, damage/crit/dodge/resistance/HP/death.
- Negative Resistance по-прежнему отвергается существующей валидацией Core. Character Stats не изменяется.
- Healing остаётся у `core.heal`: дробные значения не получают нового округления, Max HP ограничивает восстановление, мёртвые не возрождаются. Дополнительное округление лечения не определено и не вводилось.

## Время, пауза и большие delta

Полный цикл вычисляется из `baseAttackInterval / scaleAttackFrequency(1, cappedAttackSpeed)`. Это эквивалентно `baseInterval / (AttackSpeed / 100)` и использует существующее преобразование Character Stats. Cooldown Reduction навыков сюда не применяется.

Планировщик событий продвигает часы к ближайшему из событий до конца delta, перемещает все снаряды на пройденное время, разрешает событие, затем пересчитывает следующие события по актуальному состоянию Core. Обрабатываются **все** истёкшие циклы и strikes; скрытого ограничения числа событий или «не более одной атаки за кадр» нет. У цели, погибшей от первого снаряда, сразу исключается возможность принять второй.

Для точно одновременных событий порядок:

1. Попадания снарядов, по порядковому номеру запуска.
2. Истечение travel distance.
3. Вторые удары кинжалов, по source ID.
4. Начало новых циклов, по source ID.

Это позволяет летальному снаряду отменить второй удар, назначенный на тот же момент. Внутри melee цели разрешаются по ID; все получают один crit snapshot и отдельный Dodge Core. При нескольких пересечениях одного снаряда сначала выбирается самое раннее, затем ID цели.

`update(0)` не двигает время, но обрабатывает уже доступную работу. Для настоящей паузы нужно не вызывать update или передавать `{ paused: true }`: атаки, flight и cooldown не двигаются. Delta во время паузы не накапливается. Исключение — очистка pending strikes уже мёртвых источников, без продвижения времени.

Для чисел IEEE-754 используется только машинная погрешность на временной границе (`8 * Number.EPSILON * max(1, |time|)`), а не фиксированный игровой tick. Геометрические касания допускают погрешность `1e-9`. Не представимые конечными числами интервалы/времена вызывают ошибку, а не молчаливый пропуск событий. При неизменной геометрии разбиение времени на большие/маленькие updates даёт одинаковые hits/HP и времена в пределах числовой точности.

## Melee: круг против сектора

Origin и direction блокируются при старте strike. Сектор состоит из круга радиуса Attack Range и углового интервала `±arcDegrees/2`.

Проверяется минимальное расстояние от центра вражеского круга до **заполненного** сектора:

- пересечение круга с origin;
- попадание центра в угловой интервал с учётом радиуса на внешней дуге;
- расстояние до каждого ограничивающего радиального отрезка, включая внешние углы.

Таким образом, центр может быть вне угла или range, но его hitbox всё равно пересекает сектор. Простая проверка центра не используется. Максимального числа melee-целей нет. Полный круг и reflex-сектор тоже поддерживаются.

## Снаряды

Каждый снаряд хранит unit direction, origin, speed, collision radius, traveled distance, max travel и снимок Core. Движение прямолинейное с постоянной скоростью; homing отсутствует. Изменение или смерть исходной цели не меняют траекторию. В update перемещение ограничивается оставшейся travel distance.

Коллизия — первый корень пересечения отрезка движения с кругом цели, расширенным на projectile radius. Проверяются также касание и начальное перекрытие. Это swept collision, поэтому пролёт всей hitbox за один update не приводит к tunneling.

Первое живое противоположное тело по пути потребляет снаряд, **в том числе при Dodge**. Дальше в этом update снаряд не существует. Игнорируются дружественные и мёртвые тела. Цель может находиться за Attack Range, если точка столкновения не дальше max travel. Столкновение ровно на конечной дистанции имеет приоритет над истечением жизни. Пройденная дистанция никогда не превышает configured max.

## Dual Daggers

При старте цикла фиксируется его duration; первый удар — сейчас, второй — `start + duration * secondStrikeFraction` (35% для fixture). `nextCycleAt = start + duration`.

Второй удар получает **текущую** позицию/боевые характеристики источника. Если исходная цель жива и её край в range, она сохраняется, даже если появилась другая более близкая. Иначе идёт новый nearest-target поиск. Если цели нет, второй удар пропускается без досрочного перезапуска цикла. При наличии цели заново фиксируются direction, attack snapshot и независимый crit. Скорость атаки, изменённая посреди цикла, применяется со следующего цикла; начатые timings не пересчитываются.

## События и точки расширения

`WeaponEvent`:

- `attack-started`: time, weapon/source/target IDs, strike 1/2, Core snapshot, origin/direction и optional projectile ID.
- `impact`: time, weapon/projectile ID, target ID, тот же attack и полный `DamageResult` Core. Для будущего on-hit выбирать `result.status === 'hit' && result.appliedDamage > 0`; Dodge не считается успешным hit.
- `projectile-expired`: конечная позиция и travel distance.
- `strike-skipped`: отсутствие цели или смерть источника.

Объекты событий/геометрии/snapshots immutable. Внешний потребитель получает отдельный результат каждого индивидуального удара и может позже подключить Status Effects. Никаких callback со статусами, Poison/Burn/Bleed, piercing или дополнительных снарядов не реализовано. Дискриминированные конфигурации, отдельные геометрия/flight/scheduling и impact-results позволяют добавлять будущие политики в соответствующий слой без замены damage engine. Ширина дуги уже параметризована, но модификаторы экипировки не рассчитываются.

## Ограничения и открытые решения

- Позиции тел задаёт вызывающая система. Внутри одного update они считаются постоянными; скорость/траектория движущейся цели не интегрируется и не интерполируется. При перемещении обновляйте body на соответствующих границах симуляции. Projectile sweep покрывает его собственное движение, не непрерывное движение цели.
- Без AI, спавна, Phaser, skills, inventory, persistence, revive и status effects.
- Один экземпляр WeaponAttacks обслуживает одну сессию; APIs переключения/удаления оружия и тел пока не введены. Для новой сессии создаётся новый модуль вместе с новым Core.
- Catch-up не отбрасывает события; огромная delta при тысячах частых атак может быть дорогой. Caller должен ограничивать объём симуляции обычными чанками без потери времени. Поиск сейчас линейный по телам; spatial index — будущая оптимизация с сохранением tie-breakers.
- Правила применения будущего haste к уже идущему cooldown, дробного округления healing, piercing/multi-projectile и точные не-круговые AoE не утверждены. Сейчас изменение Attack Speed влияет со следующего цикла, конфигурация оружия копируется при equip, healing следует Core.
- Никакие значения test fixtures не объявлены игровым балансом. Боевой интеграции и переключения класса в UI нет.

## Проверки

```bash
npm run test:weapons
npm run test:combat
npm run test:stats
npm test
npm run typecheck
npm run build
```

Vitest/TypeScript включают новый модуль и тесты; проверка чистых систем не требует DOM-типов. Выполнено 107 новых тестов Weapon Attacks; общий Vitest-набор: 283 (107 + 86 Combat Core + 90 Character Stats), плюс 6 прежних Node-тестов. Все прошли, пропущенных нет. Typecheck и build прошли. Информационное предупреждение Vite о размере старого игрового bundle осталось; этот модуль не подключён к нему.

### On-hit контракт Task 03

WeaponStatusAdapter принимает отдельные успешные WeaponImpactEvent без изменения WeaponConfig или поведения WeaponAttacks. Каждый удар кинжалов/цель меча проверяет probability отдельно. Требуется хронологическая передача на совпадающем StatusEffects.time; replay больших уже завершённых weapon batches задним числом не поддерживается. Общий timeline orchestrator не добавлен. [Подробности](STATUS_EFFECTS.md).

### Геометрия для Task 04

Уже существующая функция `aimDirection` дополнительно экспортирована через публичный index вместе с `segmentCircleIntersection`/`edgeDistance`. Enemy AI использует эти чистые helpers, не экипируя player-class weapons и не меняя WeaponAttacks scheduler. [Enemy AI](ENEMY_AI.md).

### Интеграция Task 06

Добавлены `peekBoundary(end)`, `advanceToBoundary(time)`, `resolveBoundary()` для одного общего scheduler; они вызывают те же расчёты/strike/flight resolvers, что прежний update. `setBody` принимает optional velocity для swept relative-motion collision при интеграции, `removeBody` убирает target geometry, не отменяя старые flights. При ненулевой velocity caller обязан обновлять тела на границах через stepping API; standalone fixed-body update не управляет внешним движением. Новая альфа использует отдельный provisional catalog, Character Stats и существующий WeaponStatusAdapter. [Полный контракт общей хронологии](PLAYABLE_COMBAT_ALPHA.md).
