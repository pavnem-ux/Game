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
      'Часть рангов пока не действует в бою (отмечены): изученные ранги сохраняются и заработают после реализации.',
    rankPending: 'пока не действует в бою',
    rankBlocked: 'заблокировано: см. talents-gaps',
    noRefund: 'Сброса талантов нет: выбор окончательный.',
  }),
  seed: Object.freeze({ label: 'Сид забега' }),
  settings: Object.freeze({
    title: 'Игра',
    screenShake: 'Тряска экрана',
    screenShakeHint: 'Лёгкая тряска при получении урона и тяжёлых атаках босса.',
    sound: 'Звук',
    masterVolume: 'Общая громкость',
    sfxVolume: 'Эффекты',
    musicVolume: 'Музыка',
    muted: 'Без звука',
    soundHint: 'Все звуки создаются в игре. Звук включается после первого нажатия или клика.',
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
  /** Task 13: meta screens (hub, characters, equipment, talents, shop, map path) and the UI kit. */
  meta: Object.freeze({
    title: 'Последний свет',
    subtitle: 'Хроники угасающих сказок',
    nav: Object.freeze({
      label: 'Главное меню',
      hub: 'Главная',
      character: 'Персонаж',
      equipment: 'Экипировка',
      talents: 'Таланты',
      shop: 'Магазин',
      maps: 'Карта похода',
      progression: 'Прогресс',
      settings: 'Настройки',
      back: 'Назад',
    }),
    gold: (amount: string) => `Золото: ${amount}`,
    hub: Object.freeze({
      fight: 'В бой',
      fightHint: 'Открыть карту похода',
      quickStart: (mapId: number) => `Начать забег · карта ${mapId}`,
      selected: 'Выбранный герой',
      level: (level: number) => `Уровень ${level}`,
      campaign: (done: number, total: number) => `Пройдено карт: ${done} из ${total}`,
      next: (mapId: number, name: string) => `Следующая цель: ${mapId}. ${name}`,
      controls: 'WASD / стрелки — движение · P / Esc — пауза · на телефоне — джойстик',
      forfeit:
        'Сохранения внутри забега нет: выход в меню или перезагрузка страницы во время забега засчитывается как отказ — без награды.',
    }),
    character: Object.freeze({
      title: 'Выбор героя',
      select: 'Выбрать',
      selected: 'Выбран',
      roles: Object.freeze({
        warrior: Object.freeze(['Ближний бой', 'Стойкость']),
        mage: Object.freeze(['Магия', 'Урон по области']),
        archer: Object.freeze(['Дальний бой', 'Скорость']),
        rogue: Object.freeze(['Криты', 'Яды и кровотечение']),
      }) as Readonly<Record<string, readonly string[]>>,
      level: (level: number) => `Уровень ${level} / 50`,
      xp: (xp: number, next: number | null) =>
        next === null ? 'Максимальный уровень' : `Опыт ${xp} / ${next}`,
      points: (n: number) => `Очки талантов: ${n}`,
      weapon: (name: string) => `Оружие: ${name}`,
      toEquipment: 'Экипировка',
      toTalents: 'Таланты',
      cardLabel: (name: string, level: number) => `${name}: уровень ${level}`,
    }),
    stats: Object.freeze({
      maxHp: 'Здоровье',
      physicalDamage: 'Физ. урон',
      magicalDamage: 'Маг. урон',
      attackSpeed: 'Скорость атаки',
      criticalChance: 'Шанс крита',
      criticalDamage: 'Крит. урон',
      resistance: 'Сопротивление',
      dodgeChance: 'Уклонение',
      movementSpeed: 'Скорость движения',
      cooldownReduction: 'Сокр. перезарядки',
      areaSize: 'Размер области',
    }),
    equipment: Object.freeze({
      title: 'Экипировка',
      empty: 'Пусто',
      owned: 'Ваши предметы',
      all: 'Все',
      noItems: 'Нет подходящих предметов. Купите их в магазине.',
      toShop: 'В магазин',
      equip: 'Надеть',
      unequip: 'Снять',
      equipped: 'Надето',
      compare: (name: string) => `Если надеть «${name}»`,
      noChange: 'Характеристики не изменятся.',
      finalStats: 'Итоговые характеристики',
      without: 'Без снаряжения',
      with: 'Со снаряжением',
      nextRun: 'Изменения действуют со следующего забега.',
      starter: 'Стартовое',
      unequipFailed: 'Не удалось снять предмет.',
      equipFailed: 'Не удалось надеть.',
    }),
    talents: Object.freeze({
      available: (n: number) => `Свободно очков: ${n}`,
      seal: 'доступно с 30 уровня',
      learn: (rank: string) => `Изучить ранг ${rank}`,
      learned: (name: string, rank: string) => `Изучено: «${name}», ранг ${rank}`,
      confirm: (name: string, rank: string) => `Изучить «${name}» до ранга ${rank}?`,
      confirmNote: 'Сброса талантов нет: выбор окончательный.',
      maxed: 'Освоено полностью',
      locked: 'Закрыто',
      pickNode: 'Выберите талант, чтобы увидеть его ранги.',
    }),
    shop: Object.freeze({
      lockedOverlay: (mapId: number) => `откроется после карты ${mapId}`,
      owned: 'Куплено',
      equippedStamp: 'Надето',
    }),
    maps: Object.freeze({
      title: 'Карта похода',
      act: (roman: string, name: string) => `Акт ${roman} · ${name}`,
      node: (id: number, name: string, state: string) => `Карта ${id}: ${name}${state}`,
      locked: ', закрыта',
      done: ', пройдена',
      available: ', открыта',
      lockedReason: (prev: number) => `Победите на карте ${prev}`,
      duration: 'Длительность',
      difficulty: 'Сложность',
      recommended: 'Рекомендуемый уровень',
      yourLevel: (level: number) => `ваш уровень ${level}`,
      rewards: 'Награда',
      reward: (xp: number, gold: number) => `${xp} опыта · ${gold} золота`,
      modifiers: 'Особенности',
      noModifiers: 'нет',
      boss: 'Босс',
      bossHidden: '???',
      best: 'Лучший результат',
      notDone: 'Ещё не пройдена',
      fight: 'В бой',
      fightLabel: (id: number) => `Играть: карта ${id}`,
      select: 'Выбрать',
      close: 'Закрыть',
    }),
    modal: Object.freeze({ confirm: 'Подтвердить', cancel: 'Отмена' }),
    /** Task 14: level-up offer controls. */
    offer: Object.freeze({
      reroll: (n: number) => `Перебросить · осталось ${n}`,
      banish: (n: number) => `Изгнать · осталось ${n}`,
      banishCancel: 'Отменить изгнание',
      banishHint: 'Выберите карту, которую нужно изгнать до конца забега (или нажмите 1–3).',
      banishCard: (name: string) => `Изгнать: ${name}`,
      skip: (coins: number) => (coins > 0 ? `Пропустить · +${coins} монет` : 'Пропустить'),
      hotkeys: 'R — перебросить · B — изгнать · S — пропустить · 1–3 — выбрать',
      noRerolls: 'Перебросы закончились или переброс ничего не изменит',
      reasons: Object.freeze({
        'none-left': 'Изгнания закончились',
        'last-upgrade': 'Нельзя изгнать последнее доступное улучшение',
        'not-skill': 'Награду изгнать нельзя',
        'no-offer': 'Изгнание недоступно',
      }) as Readonly<Record<string, string>>,
      banished: (n: number) => `Изгнано: ${n}`,
    }),
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
  swift: 'Стремительные бесы',
  brute: 'Каменные тролли',
  bombard: 'Колдуны-бомбардиры',
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
