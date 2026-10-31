# Character Stats System v1.0

Самостоятельный детерминированный модуль: `src/character-stats/index.ts`. Он не импортирует Phaser, React, глобальное игровое состояние или localStorage. Существующий прототип забега использует свои временные характеристики в `src/core/progression.ts`; подключение новой постоянной модели к бою в эту задачу не входит.

## Файлы и контракт

- `types.ts` — CharacterClass, PrimaryAttributes, CombatAttributes, ClassStatsConfig, CharacterStatsSnapshot и версия данных прогрессии.
- `config.ts` — четыре утверждённых класса, начальные атрибуты, приросты, базовые боевые значения, таблица конверсий и пять hard caps. Данные readonly и заморожены вместе с вложенными объектами.
- `validation.ts` — ошибки неизвестного класса и постоянного уровня вне целого диапазона 1–50; недопустимые значения не округляются и не ограничиваются автоматически.
- `calculations.ts` — первичные атрибуты, производные значения и отдельная финализация лимитов.
- `utilities.ts` — чистые функции сопротивления, критического урона, частоты атаки, скорости движения, cooldown и радиуса кругового AoE. Случайных проверок, событий урона и таймеров нет.
- `progression.ts` — независимые уровни классов, переключение выбранного класса, получение его снимка. Никаких XP-требований, наград или обращения к хранилищу.

```ts
import {
  calculateCharacterStats,
  createCharacterProgression,
  setPermanentCharacterLevel,
  selectCharacterClass,
  getSelectedCharacterStats,
} from '../src/character-stats';

const snapshot = calculateCharacterStats('mage', 50);
// INT 250; DEX 99; HP 1100; magicalDamage 1260;
// attackSpeed 149.5; criticalChance 29.8; areaSize 175.

let progression = createCharacterProgression('mage');
progression = setPermanentCharacterLevel(progression, 'warrior', 20);
progression = setPermanentCharacterLevel(progression, 'mage', 5);
progression = selectCharacterClass(progression, 'warrior');
const warrior = getSelectedCharacterStats(progression); // постоянный уровень 20
// У мага по-прежнему уровень 5; archer и rogue остаются на уровне 1.
```

Снимки и данные прогрессии неизменяемы; операции возвращают новые объекты. Подготовленный JSON имеет `version: 1`, `selectedClass` и `classes.<id>.permanentLevel`. В нём нет рассчитанных первичных/боевых характеристик. Прогрессия относится только к постоянному уровню, а не уровню текущего забега. Новые данные не записываются в существующий ключ сохранения рекордов.

## Будущая интеграция

Без внешних модификаторов достаточно `calculateCharacterStats(classId, level)`: это завершённый снимок с лимитами и базами, учтёнными один раз.

Для будущих Equipment/Talents/Pets/Run/Status систем предусмотрена граница:

1. `calculatePrimaryAttributes(classId, permanentLevel)`.
2. `deriveUncappedCombatAttributes(primary)` — первичные конверсии и база уже включены.
3. Будущая система комбинирует свои бонусы с этими **неограниченными** значениями по отдельно утверждённым правилам.
4. `applyCombatAttributeCaps(combined)` — финальная операция после всех источников бонусов.

Порядок ограничений важен: нельзя сначала урезать базу лимитом, затем применять отрицательные/положительные бонусы. Функция финализации не вводит нижних лимитов или ограничений для HP, урона, Resistance, Critical Damage и Area Size. Политика сложения модификаторов сейчас не реализована и не подразумевается.

Будущий Combat System потребляет **итоговые** CombatAttributes и передаёт их чистым функциям на границе использования:

```ts
scaleAttackFrequency(weaponBaseFrequency, stats.attackSpeed);
scaleMovementSpeed(baseMovementSpeed, stats.movementSpeed);
scaleCooldown(baseCooldown, stats.cooldownReduction);
calculateCriticalDamage(ordinaryDamage, stats.criticalDamage);
applyResistance(incomingDamage, stats.resistance);
scaleCircularAoeRadius(skillBaseRadius, stats.areaSize);
```

Во всём модуле проценты хранятся как `150`, а не `1.5` или `0.15`. Преобразование выполняется внутри этих функций, без повторного добавления баз. Их аргументы — финализированные значения; они не выбирают частоту оружия, базовую скорость в пикселях или радиус навыка. Critical Damage 250 даёт 2.5×, дополнительного +100 нет. Area Size масштабирует радиус кругового урона; дальность оружия, полёта и обнаружения целей не изменяется. Resistance использует единую формулу `incomingDamage * 100 / (100 + resistance)`, без старой формулы брони прототипа и без минимального порога урона.

## Проверка

```bash
npm run test:stats  # Vitest, только Character Stats System
npm test           # также существующие тесты прототипа
npm run typecheck  # приложение + модуль и его тесты
npm run build
```

`vitest.config.ts` выбирает тесты Character Stats и Combat Core в Node; `npm run test:stats` запускает только Character Stats. Отдельная конфигурация TypeScript `tsconfig.stats.json` проверяет модуль и тесты без DOM-типов: рендеринг для расчётов не требуется. Фикстуры содержат все пять первичных и все одиннадцать боевых атрибутов на уровнях 1, 10, 25 и 50 для каждого класса. Эталонная таблица уровня 50 проверяется отдельно. Дополнительно проверяются приросты на каждом переходе 1–50, все пять лимитов, отсутствие лишних caps/конверсий, дробная точность, неверные входы, независимость уровней и детерминизм.

## Границы следующего этапа

Формулы и значения этой спецификации реализованы без изменения баланса. Решений для текущего модуля не требуется. Для дальнейшей интеграции остаются отдельные правила: композиция внешних бонусов; XP/награды постоянного прогресса; миграции сохранений; случайные критические проверки; периодичность критов DoT и взаимодействие dodge с периодическим уроном. Здесь эти правила не вводились, новые игровые системы не реализованы.

### Playable Combat Alpha — Task 06

Новая альфа использует calculateCharacterStats для выбранного класса/уровня, передаёт боевые значения в единственный Core, attackSpeed в Weapon Attacks и movementSpeed в movement utility. Прежние временные XP/upgrades stats из первого прототипа остаются отдельно по `/?prototype`. Формулы, class growth и caps не менялись; постоянные уровни в альфе пока не сохраняются. [Архитектура и тестовое управление уровнем](PLAYABLE_COMBAT_ALPHA.md).
