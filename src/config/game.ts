import type { Stats, Upgrade } from '../core/types';
export const GAME = {
  title: 'Последний свет',
  playerRadius: 15,
  arenaSize: 3600,
  enemyCap: 240,
  gemCap: 300,
  projectileCap: 120,
  hitCap: 40,
  spawnRadius: 580,
  invulnerability: 0.65,
  hudInterval: 0.1,
} as const;
export const CLASS = {
  id: 'ember-keeper',
  name: 'Хранитель искры',
  role: 'Маг',
  color: 0x9defcb,
  growth: { hp: 4, damage: 0.8 },
  startingEquipment: ['ember-focus'],
  startingAbilities: ['ember-bolt'],
  stats: {
    maxHp: 100,
    armor: 1,
    speed: 205,
    damage: 20,
    interval: 0.65,
    pickup: 95,
    projectiles: 1,
  } satisfies Stats,
};
export const WEAPON = {
  id: 'ember-focus',
  name: 'Искра',
  range: 540,
  speed: 560,
  lifetime: 1.3,
  radius: 7,
};
export const ENEMY = {
  id: 'hollow',
  name: 'Пустотник',
  hp: 27,
  speed: 58,
  damage: 13,
  radius: 17,
  xp: 5,
};
export const UPGRADES: readonly Upgrade[] = [
  {
    id: 'power',
    icon: '✦',
    name: 'Пылающая искра',
    description: 'Урон снарядов +25%. Пусть тьма отступит.',
    tag: 'УРОН',
  },
  {
    id: 'haste',
    icon: 'ϟ',
    name: 'Поток эфира',
    description: 'Автоматическая атака на 15% быстрее.',
    tag: 'СКОРОСТЬ АТАКИ',
  },
  {
    id: 'vitality',
    icon: '♡',
    name: 'Живой свет',
    description: '+25 к максимальному здоровью. Восстановить 35 HP.',
    tag: 'ВЫЖИВАНИЕ',
  },
  {
    id: 'stride',
    icon: '➶',
    name: 'Лёгкий шаг',
    description: 'Скорость передвижения +12%. Не давайте себя окружить.',
    tag: 'ПЕРЕДВИЖЕНИЕ',
  },
  {
    id: 'magnet',
    icon: '◈',
    name: 'Зов кристаллов',
    description: 'Радиус сбора опыта +35%.',
    tag: 'ПРИТЯЖЕНИЕ',
  },
  {
    id: 'multishot',
    icon: '⋔',
    name: 'Раздвоение',
    description: '+1 снаряд при атаке. Снаряды выбирают ближайшие цели.',
    tag: 'СНАРЯДЫ',
  },
];
