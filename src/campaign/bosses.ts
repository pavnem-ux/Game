import type { BossAbility } from './boss-abilities';
import { validateBossAbilities } from './boss-abilities';
import { CAMPAIGN_MAPS, actOf } from './config';

/**
 * Task 08 / Task 10 boss definitions (one per map, referenced by `CampaignMap.bossId`). All numbers
 * are PROVISIONAL. Task 10 bosses (maps 11–40) reuse the same ability library: Acts II–III have
 * 2–3 abilities, Act IV exactly 3 with shorter cooldowns; no two bosses share an ability set with
 * identical parameters. HP/damage multiply the map-scaled enemy stats; the base AI is an existing enemy
 * behaviour (melee or ranged). Every boss has a distinct combination of ability kinds/params.
 */
export interface BossControlLimits {
  /** Strongest Slow allowed on this boss (global cap 60%). */
  readonly maxSlow: number;
  /** Stun duration multiplier (≤ 1). */
  readonly stunScale: number;
  /** Immunity after a stun ends (≥ global 1.2 s). */
  readonly stunImmunity: number;
}
export interface BossDefinition {
  readonly id: string;
  readonly behavior: 'melee' | 'ranged';
  readonly hpMultiplier: number;
  readonly damageMultiplier: number;
  readonly radiusScale: number;
  readonly speedScale: number;
  /** Extra run XP added to the boss crystal. */
  readonly xpReward: number;
  readonly control: BossControlLimits;
  readonly abilities: readonly BossAbility[];
}

const CC: BossControlLimits = Object.freeze({ maxSlow: 0.3, stunScale: 0.5, stunImmunity: 3 });
const CC_HARD: BossControlLimits = Object.freeze({
  maxSlow: 0.25,
  stunScale: 0.4,
  stunImmunity: 4,
});

const burst = (
  id: string,
  cooldown: number,
  projectiles: number,
  coefficient: number,
  speed = 220,
  initialDelay = 2,
): BossAbility =>
  Object.freeze({
    id,
    kind: 'radial_burst',
    cooldown,
    windup: 0.6,
    initialDelay,
    projectiles,
    coefficient,
    speed,
  });
const slam = (
  id: string,
  cooldown: number,
  radius: number,
  coefficient: number,
  windup = 1.2,
  initialDelay = 4,
): BossAbility =>
  Object.freeze({ id, kind: 'circle_aoe', cooldown, windup, initialDelay, radius, coefficient });
const charge = (
  id: string,
  cooldown: number,
  speedMultiplier: number,
  impactCoefficient: number,
  windup = 1,
  initialDelay = 6,
): BossAbility =>
  Object.freeze({
    id,
    kind: 'charge',
    cooldown,
    windup,
    initialDelay,
    duration: 0.9,
    speedMultiplier,
    impactCoefficient,
    impactRange: 24,
  });
const haste = (
  id: string,
  cooldown: number,
  multiplier: number,
  duration = 4,
  initialDelay = 8,
): BossAbility =>
  Object.freeze({
    id,
    kind: 'speed_buff',
    cooldown,
    windup: 0,
    initialDelay,
    duration,
    multiplier,
  });
const adds = (
  id: string,
  cooldown: number,
  count: number,
  profile: 'melee' | 'ranged',
  initialDelay = 10,
): BossAbility =>
  Object.freeze({ id, kind: 'summon', cooldown, windup: 0.8, initialDelay, count, profile });

/** Task 10: bosses of maps 11–40 (provisional), built from the same ability helpers. */
const LATER_BOSSES: Readonly<Record<string, BossDefinition>> = {
  old_leshy: {
    id: 'old_leshy',
    behavior: 'melee',
    hpMultiplier: 20,
    damageMultiplier: 2.0,
    radiusScale: 2.3,
    speedScale: 0.85,
    xpReward: 270,
    control: CC,
    abilities: [slam('root_grasp', 9.5, 110, 1.6), adds('wood_spirits', 17, 3, 'melee')],
  },
  giant_bear: {
    id: 'giant_bear',
    behavior: 'melee',
    hpMultiplier: 22,
    damageMultiplier: 2.0,
    radiusScale: 2.7,
    speedScale: 0.9,
    xpReward: 280,
    control: CC_HARD,
    abilities: [charge('maul_rush', 11, 3.4, 1.7), slam('ground_paw', 9, 100, 1.7)],
  },
  key_keeper: {
    id: 'key_keeper',
    behavior: 'ranged',
    hpMultiplier: 20,
    damageMultiplier: 2.0,
    radiusScale: 2.0,
    speedScale: 0.9,
    xpReward: 290,
    control: CC,
    abilities: [burst('key_scatter', 8.5, 12, 0.8), haste('lock_spin', 15, 1.4)],
  },
  water_tsar: {
    id: 'water_tsar',
    behavior: 'ranged',
    hpMultiplier: 21,
    damageMultiplier: 2.0,
    radiusScale: 2.4,
    speedScale: 0.85,
    xpReward: 300,
    control: CC_HARD,
    abilities: [burst('tide_ring', 8, 14, 0.8, 200), adds('drowned_court', 18, 3, 'ranged')],
  },
  seer_owl: {
    id: 'seer_owl',
    behavior: 'ranged',
    hpMultiplier: 20,
    damageMultiplier: 2.1,
    radiusScale: 2.0,
    speedScale: 1.05,
    xpReward: 310,
    control: CC,
    abilities: [
      burst('feather_storm', 7.5, 10, 0.85, 260),
      charge('night_swoop', 11, 3.6, 1.6),
      haste('omen_flight', 16, 1.35),
    ],
  },
  gingerbread_giant: {
    id: 'gingerbread_giant',
    behavior: 'melee',
    hpMultiplier: 24,
    damageMultiplier: 2.0,
    radiusScale: 2.8,
    speedScale: 0.75,
    xpReward: 320,
    control: CC_HARD,
    abilities: [slam('icing_crash', 10, 125, 1.8, 1.4), adds('crumb_men', 17, 4, 'melee')],
  },
  copper_serpent: {
    id: 'copper_serpent',
    behavior: 'melee',
    hpMultiplier: 22,
    damageMultiplier: 2.1,
    radiusScale: 2.3,
    speedScale: 1.0,
    xpReward: 330,
    control: CC,
    abilities: [
      charge('copper_coil', 10, 3.8, 1.6),
      burst('verdigris_spit', 8.5, 12, 0.8, 240),
      slam('tail_lash', 9.5, 95, 1.6),
    ],
  },
  midnight_miller: {
    id: 'midnight_miller',
    behavior: 'melee',
    hpMultiplier: 23,
    damageMultiplier: 2.1,
    radiusScale: 2.3,
    speedScale: 0.9,
    xpReward: 340,
    control: CC_HARD,
    abilities: [
      slam('millstone', 9, 115, 1.8, 1.3),
      haste('wheel_spin', 14, 1.45),
      adds('flour_wraiths', 18, 3, 'ranged'),
    ],
  },
  raven_prince: {
    id: 'raven_prince',
    behavior: 'ranged',
    hpMultiplier: 22,
    damageMultiplier: 2.2,
    radiusScale: 2.1,
    speedScale: 1.0,
    xpReward: 350,
    control: CC,
    abilities: [burst('raven_cloud', 7, 14, 0.85, 230), charge('dark_dive', 10, 3.9, 1.7)],
  },
  ice_voivode: {
    id: 'ice_voivode',
    behavior: 'melee',
    hpMultiplier: 25,
    damageMultiplier: 2.2,
    radiusScale: 2.5,
    speedScale: 0.9,
    xpReward: 360,
    control: CC_HARD,
    abilities: [
      slam('frost_mace', 8.5, 120, 1.9, 1.3),
      burst('icicle_crown', 8, 16, 0.85),
      charge('glacier_march', 12, 3.5, 1.8),
    ],
  },
  bone_warden: {
    id: 'bone_warden',
    behavior: 'melee',
    hpMultiplier: 24,
    damageMultiplier: 2.2,
    radiusScale: 2.4,
    speedScale: 0.8,
    xpReward: 370,
    control: CC_HARD,
    abilities: [
      slam('bone_quake', 9, 120, 1.9),
      adds('skeleton_watch', 16, 4, 'melee'),
      burst('marrow_shards', 8.5, 12, 0.85),
    ],
  },
  shadow_ferryman: {
    id: 'shadow_ferryman',
    behavior: 'ranged',
    hpMultiplier: 23,
    damageMultiplier: 2.2,
    radiusScale: 2.2,
    speedScale: 0.95,
    xpReward: 380,
    control: CC,
    abilities: [burst('oar_wake', 7.5, 16, 0.85, 210), adds('lost_souls', 17, 3, 'ranged')],
  },
  noon_wraith: {
    id: 'noon_wraith',
    behavior: 'melee',
    hpMultiplier: 23,
    damageMultiplier: 2.3,
    radiusScale: 2.0,
    speedScale: 1.15,
    xpReward: 390,
    control: CC,
    abilities: [charge('scythe_dash', 9, 4.0, 1.8, 0.9), haste('heat_haze', 13, 1.5)],
  },
  graveyard_master: {
    id: 'graveyard_master',
    behavior: 'melee',
    hpMultiplier: 25,
    damageMultiplier: 2.3,
    radiusScale: 2.4,
    speedScale: 0.85,
    xpReward: 400,
    control: CC_HARD,
    abilities: [
      slam('grave_bell', 9.5, 125, 2.0, 1.3),
      adds('restless_dead', 16, 5, 'melee'),
      haste('night_vigil', 15, 1.4),
    ],
  },
  rusted_gatekeeper: {
    id: 'rusted_gatekeeper',
    behavior: 'melee',
    hpMultiplier: 27,
    damageMultiplier: 2.2,
    radiusScale: 2.8,
    speedScale: 0.7,
    xpReward: 410,
    control: CC_HARD,
    abilities: [slam('rust_gate', 10, 130, 2.0, 1.4), charge('hinge_ram', 12, 3.3, 1.9)],
  },
  fire_rider: {
    id: 'fire_rider',
    behavior: 'melee',
    hpMultiplier: 24,
    damageMultiplier: 2.4,
    radiusScale: 2.2,
    speedScale: 1.2,
    xpReward: 420,
    control: CC,
    abilities: [
      charge('flame_gallop', 9, 4.2, 1.8, 0.9),
      burst('cinder_trail', 8, 14, 0.9, 250),
      haste('blazing_spurs', 14, 1.5),
    ],
  },
  mourner: {
    id: 'mourner',
    behavior: 'ranged',
    hpMultiplier: 24,
    damageMultiplier: 2.3,
    radiusScale: 2.0,
    speedScale: 0.95,
    xpReward: 430,
    control: CC,
    abilities: [
      burst('tear_rain', 7, 18, 0.85, 200),
      haste('grief_wail', 15, 1.4),
      adds('weeping_shades', 18, 3, 'ranged'),
    ],
  },
  deep_smith: {
    id: 'deep_smith',
    behavior: 'melee',
    hpMultiplier: 27,
    damageMultiplier: 2.4,
    radiusScale: 2.6,
    speedScale: 0.8,
    xpReward: 440,
    control: CC_HARD,
    abilities: [slam('anvil_fall', 8.5, 120, 2.1, 1.3), burst('spark_spray', 8, 14, 0.9)],
  },
  withered_tsarevna: {
    id: 'withered_tsarevna',
    behavior: 'ranged',
    hpMultiplier: 25,
    damageMultiplier: 2.4,
    radiusScale: 2.1,
    speedScale: 1.0,
    xpReward: 450,
    control: CC,
    abilities: [
      burst('thorn_petals', 7.5, 16, 0.9, 230),
      charge('bramble_rush', 10.5, 3.7, 1.8),
      adds('rose_thralls', 17, 4, 'melee'),
    ],
  },
  deathless_guard: {
    id: 'deathless_guard',
    behavior: 'melee',
    hpMultiplier: 28,
    damageMultiplier: 2.5,
    radiusScale: 2.6,
    speedScale: 0.9,
    xpReward: 460,
    control: CC_HARD,
    abilities: [
      slam('deathless_strike', 8.5, 130, 2.1, 1.3),
      charge('undying_march', 11, 3.8, 2.0),
      haste('needle_oath', 14, 1.45),
    ],
  },
  thunder_kite: {
    id: 'thunder_kite',
    behavior: 'ranged',
    hpMultiplier: 27,
    damageMultiplier: 2.6,
    radiusScale: 2.2,
    speedScale: 1.1,
    xpReward: 470,
    control: CC,
    abilities: [
      burst('lightning_wheel', 6, 16, 0.95, 260),
      charge('thunder_dive', 8, 4.2, 2.0),
      haste('storm_wings', 11, 1.5),
    ],
  },
  renegade_stargazer: {
    id: 'renegade_stargazer',
    behavior: 'ranged',
    hpMultiplier: 27,
    damageMultiplier: 2.6,
    radiusScale: 2.0,
    speedScale: 0.95,
    xpReward: 480,
    control: CC,
    abilities: [
      burst('falling_stars', 5.5, 18, 0.9, 220),
      adds('star_shards', 13, 4, 'ranged'),
      slam('meteor', 7, 115, 2.1, 1.3),
    ],
  },
  mirror_kikimora: {
    id: 'mirror_kikimora',
    behavior: 'melee',
    hpMultiplier: 28,
    damageMultiplier: 2.6,
    radiusScale: 2.3,
    speedScale: 1.0,
    xpReward: 490,
    control: CC_HARD,
    abilities: [
      charge('mirror_lunge', 7.5, 4.0, 2.0),
      adds('reflections', 13, 4, 'melee'),
      burst('glass_spray', 6, 14, 0.95, 240),
    ],
  },
  storm_lord: {
    id: 'storm_lord',
    behavior: 'ranged',
    hpMultiplier: 29,
    damageMultiplier: 2.7,
    radiusScale: 2.4,
    speedScale: 0.95,
    xpReward: 500,
    control: CC_HARD,
    abilities: [
      burst('tempest_ring', 5, 20, 0.9, 230),
      slam('downburst', 7, 125, 2.2, 1.3),
      haste('gale_step', 11.5, 1.5),
    ],
  },
  drowse: {
    id: 'drowse',
    behavior: 'melee',
    hpMultiplier: 28,
    damageMultiplier: 2.6,
    radiusScale: 2.2,
    speedScale: 1.05,
    xpReward: 510,
    control: CC,
    abilities: [
      slam('slumber_wave', 7.5, 120, 2.0, 1.4),
      haste('dream_drift', 10.5, 1.55),
      adds('nightmares', 12.5, 4, 'ranged'),
    ],
  },
  sea_serpent: {
    id: 'sea_serpent',
    behavior: 'melee',
    hpMultiplier: 30,
    damageMultiplier: 2.7,
    radiusScale: 2.6,
    speedScale: 1.0,
    xpReward: 520,
    control: CC_HARD,
    abilities: [
      charge('surge', 7, 4.3, 2.1),
      burst('brine_spout', 6.5, 16, 0.95, 250),
      slam('coil_crush', 7.5, 130, 2.2, 1.3),
    ],
  },
  scarlet_knight: {
    id: 'scarlet_knight',
    behavior: 'melee',
    hpMultiplier: 30,
    damageMultiplier: 2.8,
    radiusScale: 2.3,
    speedScale: 1.1,
    xpReward: 530,
    control: CC_HARD,
    abilities: [
      charge('crimson_lance', 6.5, 4.4, 2.2, 0.9),
      haste('war_banner', 11, 1.5),
      slam('dawn_cleave', 7, 120, 2.2),
    ],
  },
  faceless_tsar: {
    id: 'faceless_tsar',
    behavior: 'ranged',
    hpMultiplier: 31,
    damageMultiplier: 2.8,
    radiusScale: 2.4,
    speedScale: 0.9,
    xpReward: 540,
    control: CC_HARD,
    abilities: [
      burst('silent_decree', 5.5, 18, 1.0, 220),
      adds('mute_guard', 12, 5, 'melee'),
      haste('hollow_crown', 12, 1.45),
    ],
  },
  edge_warden: {
    id: 'edge_warden',
    behavior: 'melee',
    hpMultiplier: 32,
    damageMultiplier: 2.9,
    radiusScale: 2.7,
    speedScale: 0.95,
    xpReward: 550,
    control: CC_HARD,
    abilities: [
      slam('world_edge', 6.5, 135, 2.3, 1.3),
      charge('brink_rush', 7.5, 4.0, 2.2),
      adds('void_sentries', 12.5, 4, 'ranged'),
    ],
  },
  dark_storyteller: {
    id: 'dark_storyteller',
    behavior: 'ranged',
    hpMultiplier: 34,
    damageMultiplier: 3.0,
    radiusScale: 2.6,
    speedScale: 1.0,
    xpReward: 560,
    control: CC_HARD,
    abilities: [
      burst('ink_storm', 5, 22, 1.0, 240),
      slam('final_chapter', 6.5, 140, 2.4, 1.3),
      charge('plot_twist', 7, 4.2, 2.3),
    ],
  },
};

export const BOSS_DEFINITIONS: Readonly<Record<string, BossDefinition>> = Object.freeze({
  thornwarden: {
    id: 'thornwarden',
    behavior: 'melee',
    hpMultiplier: 12,
    damageMultiplier: 1.5,
    radiusScale: 2.2,
    speedScale: 0.8,
    xpReward: 120,
    control: CC,
    abilities: [slam('thorn_slam', 9, 90, 1.4), adds('saplings', 16, 2, 'melee', 6)],
  },
  marsh_witch: {
    id: 'marsh_witch',
    behavior: 'ranged',
    hpMultiplier: 12,
    damageMultiplier: 1.5,
    radiusScale: 2,
    speedScale: 0.9,
    xpReward: 130,
    control: CC,
    abilities: [burst('bog_spray', 7, 8, 0.7, 200), adds('marsh_imps', 15, 2, 'ranged', 8)],
  },
  stone_colossus: {
    id: 'stone_colossus',
    behavior: 'melee',
    hpMultiplier: 16,
    damageMultiplier: 1.6,
    radiusScale: 2.6,
    speedScale: 0.65,
    xpReward: 140,
    control: CC_HARD,
    abilities: [slam('quake_slam', 8, 120, 1.6, 1.4), charge('boulder_roll', 12, 3, 1.5)],
  },
  ash_wolf: {
    id: 'ash_wolf',
    behavior: 'melee',
    hpMultiplier: 13,
    damageMultiplier: 1.6,
    radiusScale: 2,
    speedScale: 1.15,
    xpReward: 150,
    control: CC,
    abilities: [
      charge('pounce', 8, 3.8, 1.4, 0.9, 3),
      haste('ash_howl', 13, 1.5),
      slam('ember_bite', 10, 70, 1.3, 1, 5),
    ],
  },
  barrow_king: {
    id: 'barrow_king',
    behavior: 'melee',
    hpMultiplier: 17,
    damageMultiplier: 1.7,
    radiusScale: 2.3,
    speedScale: 0.8,
    xpReward: 160,
    control: CC_HARD,
    abilities: [
      burst('frost_ring', 8, 12, 0.75),
      slam('grave_crush', 9, 100, 1.6),
      adds('barrow_guard', 18, 3, 'melee'),
    ],
  },
  mire_serpent: {
    id: 'mire_serpent',
    behavior: 'melee',
    hpMultiplier: 17,
    damageMultiplier: 1.7,
    radiusScale: 2.2,
    speedScale: 1,
    xpReward: 170,
    control: CC,
    abilities: [
      charge('serpent_lunge', 9, 3.6, 1.5),
      burst('venom_spit', 8, 10, 0.8, 240),
      adds('mire_spawn', 17, 2, 'ranged'),
    ],
  },
  fallen_bellringer: {
    id: 'fallen_bellringer',
    behavior: 'ranged',
    hpMultiplier: 18,
    damageMultiplier: 1.8,
    radiusScale: 2.1,
    speedScale: 0.9,
    xpReward: 180,
    control: CC_HARD,
    abilities: [
      burst('toll_wave', 6.5, 14, 0.75, 210),
      haste('frantic_peal', 14, 1.45),
      slam('bell_drop', 9, 105, 1.7, 1.3),
    ],
  },
  crimson_reaper: {
    id: 'crimson_reaper',
    behavior: 'melee',
    hpMultiplier: 19,
    damageMultiplier: 1.9,
    radiusScale: 2.2,
    speedScale: 1.05,
    xpReward: 190,
    control: CC_HARD,
    abilities: [
      charge('reaping_dash', 8, 4, 1.6, 0.9),
      slam('harvest', 9, 110, 1.8),
      haste('blood_rush', 13, 1.5),
      adds('crimson_shades', 18, 3, 'melee'),
    ],
  },
  dusk_knight: {
    id: 'dusk_knight',
    behavior: 'melee',
    hpMultiplier: 20,
    damageMultiplier: 2,
    radiusScale: 2.3,
    speedScale: 1,
    xpReward: 200,
    control: CC_HARD,
    abilities: [
      charge('dusk_charge', 8, 3.8, 1.7),
      slam('shadow_cleave', 8.5, 115, 1.8),
      burst('umbral_ring', 7.5, 12, 0.85),
      haste('oath_of_night', 14, 1.4),
    ],
  },
  last_dark: {
    id: 'last_dark',
    behavior: 'melee',
    hpMultiplier: 24,
    damageMultiplier: 2.1,
    radiusScale: 2.6,
    speedScale: 0.95,
    xpReward: 260,
    control: CC_HARD,
    abilities: [
      burst('void_bloom', 7, 16, 0.85, 230),
      slam('collapse', 8, 125, 1.9, 1.3),
      charge('night_rush', 10, 3.8, 1.8),
      haste('dread_tide', 15, 1.45),
      adds('last_shadows', 16, 4, 'melee'),
    ],
  },
  ...LATER_BOSSES,
});

export function getBossDefinition(bossId: string): BossDefinition {
  const def = BOSS_DEFINITIONS[bossId];
  if (!def) throw new RangeError(`Unknown boss: ${bossId}.`);
  return def;
}
/** Kind-set signature (distinct within Act I, Task 08). */
export const bossSignature = (def: BossDefinition) =>
  [...new Set(def.abilities.map((a) => a.kind))].sort().join('+');
/**
 * Task 10: ability set + parameters (ids excluded); no two bosses may share it. Abilities are
 * compared as their numeric/kind fields so renaming an ability cannot hide a duplicate.
 */
export const bossParamSignature = (def: BossDefinition) =>
  def.abilities
    .map((a) =>
      Object.entries(a)
        .filter(([k]) => k !== 'id')
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, v]) => `${k}=${v}`)
        .join(','),
    )
    .sort()
    .join('|');
/** Task 10 §1.2: number of abilities allowed per act. */
export const BOSS_ABILITY_COUNTS: Readonly<Record<number, readonly [number, number]>> =
  Object.freeze({
    2: [2, 3],
    3: [2, 3],
    4: [3, 3],
  });

/** Startup validation: one boss per map, valid abilities, distinct combos, sane CC limits. */
export function validateBossDefinitions(): void {
  const signatures = new Set<string>();
  const params = new Set<string>();
  const cooldowns: Record<number, Record<string, number[]>> = {};
  for (const map of CAMPAIGN_MAPS) {
    const def = getBossDefinition(map.bossId);
    if (def.id !== map.bossId) throw new Error(`Boss ${map.bossId} id mismatch.`);
    validateBossAbilities(def.abilities);
    const act = actOf(map.id).id;
    if (act === 1) {
      const sig = bossSignature(def);
      if (signatures.has(sig))
        throw new Error(`Boss ${def.id} repeats ability combination ${sig}.`);
      signatures.add(sig);
    } else {
      const [min, max] = BOSS_ABILITY_COUNTS[act];
      if (def.abilities.length < min || def.abilities.length > max)
        throw new Error(`Boss ${def.id} needs ${min}–${max} abilities in act ${act}.`);
      for (const a of def.abilities) ((cooldowns[act] ??= {})[a.kind] ??= []).push(a.cooldown);
    }
    const p = bossParamSignature(def);
    if (params.has(p)) throw new Error(`Boss ${def.id} repeats another boss's ability set.`);
    params.add(p);
    const c = def.control;
    if (
      !(
        c.maxSlow > 0 &&
        c.maxSlow <= 0.6 &&
        c.stunScale > 0 &&
        c.stunScale <= 1 &&
        c.stunImmunity >= 1.2
      )
    )
      throw new RangeError(`Boss ${def.id} control limits invalid.`);
    for (const v of [
      def.hpMultiplier,
      def.damageMultiplier,
      def.radiusScale,
      def.speedScale,
      def.xpReward,
    ])
      if (!Number.isFinite(v) || v <= 0)
        throw new RangeError(`Boss ${def.id} has an invalid value.`);
  }
  // Act IV: every ability kind cools down faster than the same kind anywhere in Acts II–III.
  for (const [kind, list] of Object.entries(cooldowns[4] ?? {})) {
    const earlier = [...(cooldowns[2]?.[kind] ?? []), ...(cooldowns[3]?.[kind] ?? [])];
    if (earlier.length && Math.max(...list) >= Math.min(...earlier))
      throw new RangeError(`Act IV ${kind} cooldowns must be shorter than Acts II–III.`);
  }
}
validateBossDefinitions();
