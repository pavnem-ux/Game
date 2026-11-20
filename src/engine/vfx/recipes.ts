import type { CharacterClass } from '../../character-stats';
import type { VfxElement } from './palette';
import type { VfxTextureKey } from './textures';

/**
 * Task 33: what every attack / skill looks like — one data table (PROVISIONAL, tuned by data
 * only). A recipe names its element (the palette tint) and up to five parts:
 *  - `cast`: at the caster when a skill activates (glow, rune circle, ring or slash);
 *  - `trail`: behind its projectiles every frame;
 *  - `impact`: where a hit lands (flash, sparks, falling shards, small ring);
 *  - `area`: an instantaneous area hit (`skill-area`): ring, ground decal, rising plume, slashes;
 *  - `zone`: a lasting zone (inferno, blizzard, traps): a decal and a plume per second.
 * `light` recipes (talent secondary attacks, pets) are drawn smaller and fainter. Synergy level III
 * («Awakening») uses the same recipe scaled by `AWAKENED`.
 */
export interface CastFx {
  readonly kind: 'glow' | 'rune' | 'ring' | 'slash';
  /** World px (glow / rune diameter, ring radius, slash radius). */
  readonly size: number;
}
export interface TrailFx {
  readonly tex: VfxTextureKey;
  /** World px. */
  readonly length: number;
  /** Optional sparks shed along the way (staff bolt). */
  readonly sparks?: boolean;
}
export interface ImpactFx {
  /** Flash diameter (world px). */
  readonly flash: number;
  readonly sparks: number;
  readonly spark?: VfxTextureKey;
  readonly shards?: Readonly<{ tex: VfxTextureKey; count: number }>;
  /** Small ring radius (0 = none). */
  readonly ring?: number;
}
export interface AreaFx {
  readonly ring: boolean;
  readonly decal?: VfxTextureKey;
  readonly plume?: Readonly<{ tex: VfxTextureKey; count: number }>;
  /** Slash arcs around the centre (whirlwind, cleave, flurries). */
  readonly slashes?: number;
  /** Lightning / chain segments to random points of the area. */
  readonly bolts?: number;
  /** Heavy: shakes the screen (if the setting allows) and freezes hit poses. */
  readonly heavy?: boolean;
}
export interface ZoneFx {
  readonly decal?: VfxTextureKey;
  readonly plume: Readonly<{ tex: VfxTextureKey; perSecond: number }>;
}
export interface VfxRecipe {
  readonly element: VfxElement;
  readonly cast?: CastFx;
  readonly trail?: TrailFx;
  readonly impact?: ImpactFx;
  readonly area?: AreaFx;
  readonly zone?: ZoneFx;
  /** Secondary attacks (talents, pets): smaller, fainter. */
  readonly light?: boolean;
  /** Passive skills: no event of their own (kept so every skill id has an entry). */
  readonly passive?: boolean;
}
/** Level III synergy variant: larger and brighter. */
export const AWAKENED = Object.freeze({ scale: 1.45, extraRing: true, coreFlash: true });
/** Light (secondary) recipes are drawn at this size and alpha. */
export const LIGHT = Object.freeze({ scale: 0.6, alpha: 0.7 });

const sparkHit = (flash: number, sparks: number, ring = 0): ImpactFx => ({ flash, sparks, ring });

/** The 37 catalogue skills (28 class skills + 9 universal passives). */
export const SKILL_VFX: Readonly<Record<string, VfxRecipe>> = Object.freeze({
  // Mage — fire / ice.
  fireball: {
    element: 'fire',
    cast: { kind: 'glow', size: 34 },
    trail: { tex: 'vfx_flame', length: 26 },
    impact: { flash: 40, sparks: 8, ring: 22 },
    area: { ring: true, plume: { tex: 'vfx_flame', count: 6 } },
  },
  flame_burst: {
    element: 'fire',
    cast: { kind: 'rune', size: 60 },
    impact: sparkHit(24, 3),
    area: { ring: true, decal: 'vfx_cracks_ground', plume: { tex: 'vfx_flame', count: 10 } },
  },
  inferno: {
    element: 'fire',
    cast: { kind: 'glow', size: 30 },
    impact: sparkHit(18, 2),
    area: { ring: true, plume: { tex: 'vfx_flame', count: 6 } },
    zone: { decal: 'vfx_rune_circle', plume: { tex: 'vfx_flame', perSecond: 7 } },
  },
  frost_nova: {
    element: 'ice',
    cast: { kind: 'rune', size: 60 },
    impact: { flash: 22, sparks: 2, shards: { tex: 'vfx_ice_shard', count: 2 } },
    area: { ring: true, decal: 'vfx_frost_burst', plume: { tex: 'vfx_ice_shard', count: 8 } },
  },
  ice_shards: {
    element: 'ice',
    cast: { kind: 'glow', size: 26 },
    trail: { tex: 'vfx_ice_shard', length: 18 },
    impact: { flash: 26, sparks: 3, shards: { tex: 'vfx_ice_shard', count: 4 } },
  },
  blizzard: {
    element: 'ice',
    cast: { kind: 'glow', size: 30 },
    impact: sparkHit(16, 2),
    area: { ring: true, plume: { tex: 'vfx_ice_shard', count: 6 } },
    zone: { decal: 'vfx_rune_circle', plume: { tex: 'vfx_frost_burst', perSecond: 6 } },
  },
  elemental_mastery: { element: 'arcane', passive: true },
  // Warrior — physical, heavy melee.
  ground_slam: {
    element: 'physical',
    cast: { kind: 'slash', size: 40 },
    impact: sparkHit(26, 4),
    area: {
      ring: true,
      decal: 'vfx_cracks_ground',
      plume: { tex: 'vfx_smoke_puff', count: 6 },
      heavy: true,
    },
  },
  whirlwind: {
    element: 'physical',
    impact: sparkHit(20, 3),
    area: { ring: true, slashes: 4 },
  },
  shield_bash: {
    element: 'physical',
    cast: { kind: 'slash', size: 30 },
    impact: { flash: 44, sparks: 10, ring: 26, spark: 'vfx_spark_star' },
    area: { ring: true, heavy: true },
  },
  earthquake: {
    element: 'physical',
    cast: { kind: 'ring', size: 40 },
    impact: sparkHit(22, 3),
    area: {
      ring: true,
      decal: 'vfx_cracks_ground',
      plume: { tex: 'vfx_smoke_puff', count: 10 },
      heavy: true,
    },
  },
  cleave: {
    element: 'physical',
    impact: sparkHit(24, 4),
    area: { ring: false, slashes: 2 },
  },
  war_cry: {
    element: 'arcane',
    cast: { kind: 'ring', size: 70 },
    area: { ring: true, decal: 'vfx_rune_circle' },
  },
  battle_fury: { element: 'bleed', passive: true },
  // Archer — physical / poison projectiles and zones.
  arrow_rain: {
    element: 'physical',
    cast: { kind: 'glow', size: 24 },
    impact: sparkHit(18, 3),
    area: { ring: true, plume: { tex: 'vfx_arrow_trail', count: 6 } },
    zone: { decal: 'vfx_rune_circle', plume: { tex: 'vfx_spark_star', perSecond: 6 } },
  },
  toxic_volley: {
    element: 'poison',
    trail: { tex: 'vfx_arrow_trail', length: 30 },
    impact: { flash: 22, sparks: 2, shards: { tex: 'vfx_poison_drop', count: 4 } },
    area: { ring: true, plume: { tex: 'vfx_smoke_puff', count: 4 } },
  },
  piercing_arrow: {
    element: 'physical',
    trail: { tex: 'vfx_arrow_trail', length: 46 },
    impact: sparkHit(24, 5, 14),
  },
  split_shot: {
    element: 'poison',
    trail: { tex: 'vfx_arrow_trail', length: 28 },
    impact: { flash: 20, sparks: 2, shards: { tex: 'vfx_poison_drop', count: 3 } },
  },
  poison_trap: {
    element: 'poison',
    cast: { kind: 'rune', size: 40 },
    impact: { flash: 18, sparks: 1, shards: { tex: 'vfx_poison_drop', count: 3 } },
    area: { ring: true, plume: { tex: 'vfx_smoke_puff', count: 8 } },
    zone: { decal: 'vfx_rune_circle', plume: { tex: 'vfx_poison_drop', perSecond: 4 } },
  },
  hunters_mark: { element: 'arcane', cast: { kind: 'rune', size: 40 } },
  multishot: { element: 'physical', passive: true },
  // Rogue — daggers, bleed, shadow.
  blade_flurry: {
    element: 'physical',
    cast: { kind: 'slash', size: 30 },
    impact: { flash: 18, sparks: 4, shards: { tex: 'vfx_blood_splash', count: 1 } },
    area: { ring: false, slashes: 3 },
  },
  fan_of_knives: {
    element: 'physical',
    trail: { tex: 'vfx_arrow_trail', length: 20 },
    impact: sparkHit(18, 3),
  },
  lacerate: {
    element: 'bleed',
    cast: { kind: 'slash', size: 34 },
    impact: { flash: 22, sparks: 2, shards: { tex: 'vfx_blood_splash', count: 4 } },
    area: { ring: false, slashes: 1 },
  },
  shadow_strike: {
    element: 'lightning',
    cast: { kind: 'glow', size: 28 },
    trail: { tex: 'vfx_glow_soft', length: 22 },
    impact: { flash: 30, sparks: 4, ring: 16, spark: 'vfx_smoke_puff' },
  },
  blood_blades: {
    element: 'bleed',
    trail: { tex: 'vfx_arrow_trail', length: 24 },
    impact: { flash: 20, sparks: 2, shards: { tex: 'vfx_blood_splash', count: 3 } },
  },
  death_mark: { element: 'bleed', cast: { kind: 'rune', size: 40 } },
  serrated_blades: { element: 'bleed', passive: true },
  // Universal passives.
  power: { element: 'physical', passive: true },
  haste: { element: 'arcane', passive: true },
  vitality: { element: 'poison', passive: true },
  fortitude: { element: 'physical', passive: true },
  precision: { element: 'arcane', passive: true },
  deadly_strikes: { element: 'bleed', passive: true },
  swiftness: { element: 'arcane', passive: true },
  toxic_mastery: { element: 'poison', passive: true },
  lingering_effects: { element: 'arcane', passive: true },
});

/** The 12 synergies (level III = `AWAKENED`). */
export const SYNERGY_VFX: Readonly<Record<string, VfxRecipe>> = Object.freeze({
  thermal_shock: {
    element: 'fire',
    impact: { flash: 40, sparks: 6, shards: { tex: 'vfx_ice_shard', count: 4 }, ring: 26 },
    area: { ring: true, plume: { tex: 'vfx_smoke_puff', count: 4 } },
  },
  wildfire: {
    element: 'fire',
    impact: { flash: 30, sparks: 4, ring: 20 },
    area: { ring: true, plume: { tex: 'vfx_flame', count: 8 } },
  },
  shattered_ice: {
    element: 'ice',
    impact: { flash: 34, sparks: 3, shards: { tex: 'vfx_ice_shard', count: 6 }, ring: 22 },
    area: { ring: true, decal: 'vfx_frost_burst' },
  },
  skull_crusher: {
    element: 'physical',
    impact: { flash: 42, sparks: 8, ring: 24 },
    area: { ring: true, decal: 'vfx_cracks_ground', heavy: true },
  },
  battle_momentum: {
    element: 'arcane',
    impact: { flash: 30, sparks: 5, ring: 24 },
    area: { ring: true, slashes: 2 },
  },
  seismic_impact: {
    element: 'physical',
    impact: { flash: 34, sparks: 4, ring: 30 },
    area: {
      ring: true,
      decal: 'vfx_cracks_ground',
      plume: { tex: 'vfx_smoke_puff', count: 6 },
      heavy: true,
    },
  },
  toxic_barrage: {
    element: 'poison',
    impact: { flash: 26, sparks: 2, shards: { tex: 'vfx_poison_drop', count: 4 }, ring: 18 },
    area: { ring: true, plume: { tex: 'vfx_smoke_puff', count: 6 } },
  },
  plague_chain: {
    element: 'poison',
    impact: { flash: 24, sparks: 3, ring: 16 },
    area: { ring: true, bolts: 3 },
  },
  deadly_precision: {
    element: 'arcane',
    impact: { flash: 36, sparks: 6, ring: 20, spark: 'vfx_spark_star' },
  },
  blood_frenzy: {
    element: 'bleed',
    impact: { flash: 30, sparks: 3, shards: { tex: 'vfx_blood_splash', count: 4 }, ring: 20 },
  },
  deep_wounds: {
    element: 'bleed',
    impact: { flash: 26, sparks: 2, shards: { tex: 'vfx_blood_splash', count: 5 } },
    area: { ring: true, slashes: 1 },
  },
  final_cut: {
    element: 'bleed',
    impact: { flash: 44, sparks: 6, shards: { tex: 'vfx_blood_splash', count: 4 }, ring: 26 },
    area: { ring: false, slashes: 2, heavy: true },
  },
});

/**
 * Basic attacks per class: sword / dagger slashes with a fading tail, arrows with a short trail, the
 * staff bolt with a glow and a spark trail. Impact sparks take the element's colour.
 */
export const BASIC_VFX: Readonly<Record<CharacterClass, VfxRecipe>> = Object.freeze({
  warrior: {
    element: 'physical',
    cast: { kind: 'slash', size: 0 }, // radius = the weapon's attack range
    impact: sparkHit(20, 3),
  },
  rogue: {
    element: 'physical',
    cast: { kind: 'slash', size: 0 },
    impact: sparkHit(16, 2),
  },
  archer: {
    element: 'physical',
    trail: { tex: 'vfx_arrow_trail', length: 30 },
    impact: sparkHit(18, 3),
  },
  mage: {
    element: 'arcane',
    cast: { kind: 'glow', size: 22 },
    trail: { tex: 'vfx_glow_soft', length: 18, sparks: true },
    impact: sparkHit(24, 3, 12),
  },
});

/** Talent secondary attacks and pet hits (lighter). Unknown talent nodes use `talent`. */
export const SECONDARY_VFX: Readonly<Record<string, VfxRecipe>> = Object.freeze({
  offhand: {
    element: 'physical',
    light: true,
    cast: { kind: 'slash', size: 0 },
    impact: sparkHit(16, 2),
  },
  shadow_copy: {
    element: 'lightning',
    light: true,
    impact: { flash: 20, sparks: 3, spark: 'vfx_smoke_puff' },
    area: { ring: false, slashes: 1 },
  },
  ballista: {
    element: 'physical',
    light: true,
    trail: { tex: 'vfx_arrow_trail', length: 36 },
    impact: sparkHit(22, 4, 12),
  },
  talent: { element: 'arcane', light: true, impact: sparkHit(16, 2) },
  pet: {
    element: 'arcane',
    light: true,
    trail: { tex: 'vfx_glow_soft', length: 14 },
    impact: sparkHit(16, 2),
  },
});
/** Talent nodes with their own look (the rest use `SECONDARY_VFX.talent`). */
const TALENT_LOOK: Readonly<Record<string, keyof typeof SECONDARY_VFX>> = Object.freeze({
  'rogue.b2.n03': 'shadow_copy',
  'archer.b3.n01': 'ballista',
});
export const OFFHAND_WEAPON_ID = 'alpha-offhand';

/**
 * The recipe of a damage source / weapon id: `skill:<id>`, `synergy:<id>`, `talent:<node>`,
 * `pet.<id>` / `pet:<id>`, the off-hand, else the class's basic attack. Unknown skills / synergies
 * fall back to the basic attack (never nothing).
 */
export function recipeFor(source: string, characterClass: CharacterClass): VfxRecipe {
  if (source.startsWith('skill:')) {
    const id = source.slice(6).split(/[#:]/)[0];
    return SKILL_VFX[id] ?? BASIC_VFX[characterClass];
  }
  if (source.startsWith('synergy:')) {
    const id = source.slice(8).split(/[#:]/)[0];
    return SYNERGY_VFX[id] ?? BASIC_VFX[characterClass];
  }
  if (source.startsWith('talent:')) return SECONDARY_VFX[TALENT_LOOK[source.slice(7)] ?? 'talent'];
  if (source.startsWith('pet.') || source.startsWith('pet:')) return SECONDARY_VFX.pet;
  if (source === OFFHAND_WEAPON_ID) return SECONDARY_VFX.offhand;
  return BASIC_VFX[characterClass];
}
