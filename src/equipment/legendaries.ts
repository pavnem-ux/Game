import type { CharacterClass } from '../character-stats';
import { LEGENDARY_RULES } from './config';
import type { DropDifficulty, GearSlot, LegendaryId } from './config';

/**
 * Task 43 Legendary catalogue (pure): the 10 items in pool order, their effect text, the map
 * pools and validation. Effects run in the talent combat layer (`src/talents/legendary.ts`).
 */
export type LegendaryDef = (typeof LEGENDARY_RULES.items)[number];
export const LEGENDARIES: readonly LegendaryDef[] = LEGENDARY_RULES.items;
const BY_ID = new Map<string, LegendaryDef>(LEGENDARIES.map((l) => [l.id, l]));
export const legendaryDef = (id: string): LegendaryDef | null => BY_ID.get(id) ?? null;
export const isLegendaryId = (id: unknown): id is LegendaryId =>
  typeof id === 'string' && BY_ID.has(id);

const R = LEGENDARY_RULES;
/** The unique effect text shown on the item card. */
export const LEGENDARY_TEXT: Readonly<Record<LegendaryId, string>> = Object.freeze({
  barrow_crown: `When HP drops below ${R.crown.hpBelow}%: a barrier of ${R.crown.barrier}% max HP. Cooldown ${R.crown.cooldown} s.`,
  leshy_bark: `When hit: thorns deal ${R.bark.resistanceShare}% of your Armor to enemies within ${R.bark.radius}. At most once per ${R.bark.cooldown} s.`,
  ash_wolf_stride: `+${R.stride.movementSpeedPercent}% movement speed. After ${R.stride.moveSeconds} s of moving without stopping, the next attack is a guaranteed crit.`,
  millwheel_gauntlets: `Every ${R.millwheel.everyAttacks}th basic weapon attack releases a shockwave: radius ${R.millwheel.radius}, ${R.millwheel.weaponShare}% of weapon damage.`,
  mourner_heart: `Healing above max HP becomes a barrier, up to ${R.heart.maxBarrier}% of max HP.`,
  water_tsar_ring: `Each crystal picked up heals ${R.ring.healPerCrystal}% of max HP, at most ${R.ring.maxPerSecond}% of max HP per second.`,
  warden_edge: `Every ${R.warden.everyHits}th direct hit on the same elite or boss deals double damage.`,
  frost_warlord_staff: `Direct hits Chill (Slow ${R.frost.slow * 100}%, ${R.frost.seconds} s). Direct hits on Chilled targets deal +${R.frost.bonusPercent}% damage.`,
  thunder_kite_bow: `Direct hits on targets farther than ${R.kite.distance} deal +${R.kite.bonusPercent}% damage.`,
  mire_serpent_fangs: `When an enemy with Bleed dies, its Bleed spreads to the ${R.mire.targets} nearest enemies within ${R.mire.radius}.`,
});

/**
 * The Legendary pool of a map: act = ⌊(m − 1) / 10⌋, k = (m − 1) mod 10; indexes (k + act),
 * (k + act + 3), (k + act + 6) mod 10.
 */
export function legendaryPool(mapId: number): readonly LegendaryDef[] {
  if (!Number.isInteger(mapId) || mapId < 1) throw new RangeError('Invalid map id.');
  const act = Math.floor((mapId - 1) / 10);
  const k = (mapId - 1) % 10;
  return Object.freeze([0, 3, 6].map((d) => LEGENDARIES[(k + act + d) % 10]));
}
/** The pool without other classes' weapons (never empty: every pool holds a non-weapon). */
export const classLegendaryPool = (mapId: number, c: CharacterClass) =>
  legendaryPool(mapId).filter((l) => l.slot !== 'weapon' || l.characterClass === c);
/** The chance (percent) a boss item of this difficulty becomes a Legendary. */
export const legendaryChance = (difficulty: DropDifficulty) => R.bossChance[difficulty];
/** Throws unless the item shape fits the Legendary (slot, weapon class). */
export function checkLegendaryFit(
  id: string,
  slot: GearSlot,
  characterClass: CharacterClass | undefined,
): LegendaryDef {
  const def = legendaryDef(id);
  if (!def) throw new RangeError('Unknown legendary id.');
  if (def.slot !== slot) throw new RangeError('The Legendary does not fit this slot.');
  if (def.slot === 'weapon' && def.characterClass !== characterClass)
    throw new RangeError('The Legendary weapon belongs to another class.');
  return def;
}
