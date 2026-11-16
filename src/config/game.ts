import type { Stats, Upgrade } from '../core/types';
export const GAME = {
  title: 'The Last Light',
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
  name: 'Keeper of the Spark',
  role: 'Mage',
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
  name: 'Spark',
  range: 540,
  speed: 560,
  lifetime: 1.3,
  radius: 7,
};
export const ENEMY = {
  id: 'hollow',
  name: 'Voidling',
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
    name: 'Blazing Spark',
    description: 'Projectile damage +25%. Let the darkness retreat.',
    tag: 'DAMAGE',
  },
  {
    id: 'haste',
    icon: 'ϟ',
    name: 'Aether Flow',
    description: 'Automatic attacks 15% faster.',
    tag: 'ATTACK SPEED',
  },
  {
    id: 'vitality',
    icon: '♡',
    name: 'Living Light',
    description: '+25 max health. Restore 35 HP.',
    tag: 'SURVIVAL',
  },
  {
    id: 'stride',
    icon: '➶',
    name: 'Light Step',
    description: "Movement speed +12%. Don't let them surround you.",
    tag: 'MOVEMENT',
  },
  {
    id: 'magnet',
    icon: '◈',
    name: 'Call of Crystals',
    description: 'XP pickup radius +35%.',
    tag: 'ATTRACTION',
  },
  {
    id: 'multishot',
    icon: '⋔',
    name: 'Split',
    description: '+1 projectile per attack. Projectiles seek the nearest targets.',
    tag: 'PROJECTILES',
  },
];
