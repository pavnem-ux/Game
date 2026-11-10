import type { BossAbility } from './boss-abilities';
import { validateBossAbilities } from './boss-abilities';
import { CAMPAIGN_MAPS } from './config';

/**
 * Task 08 boss definitions (one per map, referenced by `CampaignMap.bossId`). All numbers are
 * PROVISIONAL. HP/damage multiply the map-scaled enemy stats; the base AI is an existing enemy
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
});

export function getBossDefinition(bossId: string): BossDefinition {
  const def = BOSS_DEFINITIONS[bossId];
  if (!def) throw new RangeError(`Unknown boss: ${bossId}.`);
  return def;
}
/** Kind-set signature; every boss must have a distinct combination. */
export const bossSignature = (def: BossDefinition) =>
  [...new Set(def.abilities.map((a) => a.kind))].sort().join('+');

/** Startup validation: one boss per map, valid abilities, distinct combos, sane CC limits. */
export function validateBossDefinitions(): void {
  const signatures = new Set<string>();
  for (const map of CAMPAIGN_MAPS) {
    const def = getBossDefinition(map.bossId);
    if (def.id !== map.bossId) throw new Error(`Boss ${map.bossId} id mismatch.`);
    validateBossAbilities(def.abilities);
    const sig = bossSignature(def);
    if (signatures.has(sig)) throw new Error(`Boss ${def.id} repeats ability combination ${sig}.`);
    signatures.add(sig);
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
}
validateBossDefinitions();
