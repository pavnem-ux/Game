/**
 * Task 20 pets — the single place for pet numbers. Every value is PROVISIONAL (owner-controlled).
 * Framework-independent: no Phaser/React/storage imports.
 *
 * «Player damage» = the higher of the player's current physical / magical damage (snapshot at the
 * moment of the pet's action). Each pet level above 1 adds +20% to the pet's MAIN numbers
 * (`main` keys below); the other numbers stay as at level 1.
 */
export type PetId = 'firefly' | 'owlet' | 'fox' | 'hedgehog' | 'kitten' | 'wolf';
export const PET_IDS: readonly PetId[] = Object.freeze([
  'firefly',
  'owlet',
  'fox',
  'hedgehog',
  'kitten',
  'wolf',
]);
export type PetSource = Readonly<{ kind: 'shop'; price: number }> | Readonly<{ kind: 'quest' }>;
export interface PetDefinition {
  readonly id: PetId;
  readonly name: string;
  /** Short effect text for cards (Russian; numbers come from `petEffectText`). */
  readonly role: string;
  readonly source: PetSource;
  /** Level-1 numbers (units in the key names). */
  readonly params: Readonly<Record<string, number>>;
  /** Keys scaled by the level factor (the pet's «main number»). */
  readonly main: readonly string[];
  /** Pets with a timed action show a cooldown ring in the HUD. */
  readonly interval: number | null;
  /** Portrait / sprite tint. */
  readonly color: number;
}
const def = (d: PetDefinition): PetDefinition =>
  Object.freeze({ ...d, params: Object.freeze({ ...d.params }), main: Object.freeze([...d.main]) });

export const PET_CONFIG: Readonly<Record<PetId, PetDefinition>> = Object.freeze({
  firefly: def({
    id: 'firefly',
    name: 'Светлячок Лучик',
    role: 'Лечит героя',
    source: { kind: 'quest' },
    params: { healPercent: 2, interval: 8 },
    main: ['healPercent'],
    interval: 8,
    color: 0xffe27a,
  }),
  owlet: def({
    id: 'owlet',
    name: 'Совёнок Угу',
    role: 'Стреляет по ближайшему врагу',
    source: { kind: 'shop', price: 1500 },
    params: { damagePercent: 20, range: 400, interval: 1.2, speed: 520, radius: 6 },
    main: ['damagePercent'],
    interval: 1.2,
    color: 0xc9a27a,
  }),
  fox: def({
    id: 'fox',
    name: 'Лисёнок-огонёк',
    role: 'Прорывается сквозь врага и поджигает',
    source: { kind: 'quest' },
    params: {
      damagePercent: 60,
      range: 300,
      interval: 6,
      burnStacks: 1,
      burnPerTick: 3,
      burnDuration: 4,
    },
    main: ['damagePercent'],
    interval: 6,
    color: 0xff8a3d,
  }),
  hedgehog: def({
    id: 'hedgehog',
    name: 'Ёжик-хранитель',
    role: 'Сопротивление и щит',
    source: { kind: 'shop', price: 2500 },
    params: { resistance: 6, barrierPercent: 5, interval: 10, barrierDuration: 1.5 },
    main: ['resistance', 'barrierPercent'],
    interval: 10,
    color: 0x9c8466,
  }),
  kitten: def({
    id: 'kitten',
    name: 'Котёнок удачи',
    role: 'Больше монет, шире подбор',
    source: { kind: 'shop', price: 3000 },
    params: { coinPercent: 10, pickupRadiusPercent: 15 },
    main: ['coinPercent'],
    interval: null,
    color: 0xf0c060,
  }),
  wolf: def({
    id: 'wolf',
    name: 'Дух-волк',
    role: 'Скорость атаки и движения',
    source: { kind: 'quest' },
    params: { attackSpeed: 8, movementSpeedPercent: 5 },
    main: ['attackSpeed'],
    interval: null,
    color: 0x9fd2ff,
  }),
});

/** Pet levels and their forge costs (Gold / ore to reach level 2 / 3 / 4 / 5). */
export const PET_LEVEL_RULES = Object.freeze({
  maxLevel: 5,
  /** Main-number bonus per level above 1 (level 5 = ×1.8). */
  perLevel: 0.2,
  gold: Object.freeze([500, 1000, 2000, 4000]),
  ore: Object.freeze([10, 20, 35, 50]),
});
/** Follow behaviour (rendering-free; positions only). */
export const PET_FOLLOW = Object.freeze({
  /** Distance behind the player (opposite the facing direction). */
  offset: 40,
  /** Exponential smoothing rate (1/s): the pet closes ~1 − e^(−rate·dt) of the gap per step. */
  rate: 8,
});
