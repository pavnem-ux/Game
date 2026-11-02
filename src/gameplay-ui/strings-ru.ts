import { CHARACTER_CLASSES } from '../character-stats';
import { ALPHA_WEAPONS, WEAPON_LABELS } from '../gameplay';
import type { EnemyType } from '../gameplay';
import { SKILL_CATALOG, SYNERGY_RULES } from '../skills';
import { TALENT_CONFIG } from '../talents';

/**
 * Task 08.5 player-facing Russian text (one module for all new 08.5 strings; older screens keep
 * their inline text). Presentation only.
 */
export const RU = Object.freeze({
  build: Object.freeze({ label: 'Версия сборки' }),
  talents: Object.freeze({
    title: 'Таланты',
    classSwitch: 'Класс дерева талантов',
    points: (available: number, earned: number) => `Свободно очков: ${available} из ${earned}`,
    level: (level: number) => `Уровень класса ${level}`,
    superpower: 'Сверхспособность',
    superpowerActive: 'Сверхспособность изучена',
    superpowerReady: 'Сверхспособность доступна: изучите I ранг первого таланта ветки',
    superpowerLocked: 'Сверхспособность доступна с 30 уровня',
    branchLocked: 'доступно с 30 уровня',
    rank: (rank: number) => `Ранг ${['0', 'I', 'II', 'III'][rank]}`,
    rankOf: (rank: number) => `${['0', 'I', 'II', 'III'][rank]} / III`,
    learn: (rank: number) => `Изучить ранг ${['', 'I', 'II', 'III'][rank]}`,
    requires: (name: string) => `Требуется: «${name}» ранг II`,
    reasons: Object.freeze({
      'unknown-node': 'Неизвестный талант',
      'wrong-class': 'Талант другого класса',
      'max-rank': 'Максимальный ранг',
      level: 'Доступно с 30 уровня',
      prerequisite: 'Сначала изучите предыдущий талант до ранга II',
      'no-points': 'Нет свободных очков',
    } as Record<string, string>),
    inert:
      'Каталог талантов ещё не утверждён: изученные ранги сохраняются, но пока не влияют на бой.',
    rankMissing: 'Параметр не определён в каталоге',
    rankUnclear: 'Правило ждёт уточнения',
    noRefund: 'Сброса талантов нет: выбор окончательный.',
  }),
  seed: Object.freeze({ label: 'Сид забега' }),
  settings: Object.freeze({
    title: 'Игра',
    screenShake: 'Тряска экрана',
    screenShakeHint: 'Лёгкая тряска при получении урона и тяжёлых атаках босса.',
  }),
  report: Object.freeze({
    button: 'Сообщить о проблеме',
    done: (file: string) => `Отчёт сохранён: ${file}. Отправьте этот файл разработчику.`,
    failed: 'Не удалось скачать отчёт.',
  }),
  crash: Object.freeze({
    eyebrow: 'НЕПРЕДВИДЕННАЯ ОШИБКА',
    title: 'Что-то пошло не так.',
    body: 'Игра столкнулась с ошибкой. Ваше сохранение не изменено, а текущий забег прерван без записи.',
    hint: 'Если ошибка повторяется, отправьте отчёт через «Сообщить о проблеме».',
    back: 'Вернуться в меню',
  }),
  stats: Object.freeze({
    title: 'Статистика забега',
    topSources: 'Главные источники урона',
    damageDealt: 'Нанесено урона',
    damageTaken: 'Получено урона',
    takenFrom: 'Больше всего от',
    deathTime: 'Гибель',
    noDeath: 'не погибали',
    revive: 'Воскрешение',
    reviveUsed: (time: string) => `использовано в ${time}`,
    reviveUnused: 'не использовано',
    lowHp: 'На грани (< 20% HP)',
    noDamage: 'Урон ещё не нанесён.',
  }),
});

const EFFECT_LABELS: Record<string, string> = {
  poison: 'Яд',
  burn: 'Горение',
  bleed: 'Кровотечение',
};
const ENEMY_TYPE_LABELS: Record<EnemyType | 'unknown', string> = {
  melee: 'Ближний бой',
  ranged: 'Стрелки',
  'elite-melee': 'Элита · ближний бой',
  'elite-ranged': 'Элита · стрелок',
  boss: 'Босс',
  unknown: 'Прочее',
};
const WEAPON_BY_ID = new Map(
  CHARACTER_CLASSES.map((c) => [ALPHA_WEAPONS[c].id, WEAPON_LABELS[c]] as const),
);
const SKILL_NAMES = new Map(SKILL_CATALOG.map((s) => [s.id, s.name] as const));
const SYNERGY_NAMES = new Map(SYNERGY_RULES.map((r) => [r.id as string, r.name] as const));

/** `weapon:<id>` / `skill:<id>` / `synergy:<id>` / `status:<effect>` / `debug` → Russian label. */
export function damageSourceLabel(source: string): string {
  const [kind, id = ''] = source.split(':');
  switch (kind) {
    case 'weapon':
      return WEAPON_BY_ID.get(id) ?? 'Оружие';
    case 'skill':
      return SKILL_NAMES.get(id) ?? 'Навык';
    case 'synergy':
      return `Синергия «${SYNERGY_NAMES.get(id) ?? id}»`;
    case 'status':
      return EFFECT_LABELS[id] ?? 'Эффект';
    case 'talent':
      return `Талант «${TALENT_CONFIG.nodes.get(source.slice('talent:'.length))?.name ?? 'талант'}»`;
    case 'debug':
      return 'Отладка';
    default:
      return 'Прочее';
  }
}
export const enemyTypeLabel = (type: EnemyType | 'unknown') => ENEMY_TYPE_LABELS[type];
