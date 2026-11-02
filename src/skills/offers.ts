import { BONUS_REWARDS, SKILL_RULES } from './config';
import type { BonusCard, BonusRewardId, OfferCard, SkillCard, SkillDefinition } from './types';

export type Random = () => number;
export interface OfferPools {
  /** Unowned skills whose slot category still has room. */
  readonly fresh: readonly SkillDefinition[];
  /** Owned skills below max rank. */
  readonly upgrades: readonly SkillDefinition[];
}
export interface OwnedView {
  readonly ranks: ReadonlyMap<string, number>;
  readonly autoUsed: number;
  readonly passiveUsed: number;
  /** Task 09.1: automatic-slot maximum (default `SKILL_RULES.autoSlots`). */
  readonly autoMax?: number;
}

function draw(random: Random): number {
  const value = random();
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1)
    throw new RangeError('Offer random source must return a number in [0, 1).');
  return value;
}
function takeRandom<T>(items: T[], random: Random): T {
  return items.splice(Math.floor(draw(random) * items.length), 1)[0];
}
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(draw(random) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Eligibility is re-evaluated from scratch for every level and every reroll. */
export function eligiblePools(classPool: readonly SkillDefinition[], owned: OwnedView): OfferPools {
  const fresh: SkillDefinition[] = [],
    upgrades: SkillDefinition[] = [];
  for (const d of classPool) {
    const rank = owned.ranks.get(d.id);
    if (rank !== undefined) {
      if (rank < SKILL_RULES.maxRank) upgrades.push(d);
    } else if (
      d.kind === 'auto'
        ? owned.autoUsed < (owned.autoMax ?? SKILL_RULES.autoSlots)
        : owned.passiveUsed < SKILL_RULES.passiveSlots
    )
      fresh.push(d);
  }
  return { fresh, upgrades };
}

/**
 * Managed random selection of unique skill IDs. When both categories exist the offer always holds
 * at least one new skill and one upgrade; the remaining card comes from the union. Order is shuffled.
 */
export function pickSkills(
  pools: OfferPools,
  random: Random,
  size: number = SKILL_RULES.offerSize,
): SkillDefinition[] {
  const fresh = [...pools.fresh],
    upgrades = [...pools.upgrades];
  const picked: SkillDefinition[] = [];
  if (fresh.length && upgrades.length) {
    picked.push(takeRandom(fresh, random), takeRandom(upgrades, random));
    const rest = [...fresh, ...upgrades];
    while (picked.length < size && rest.length) picked.push(takeRandom(rest, random));
  } else {
    const only = fresh.length ? fresh : upgrades;
    while (picked.length < size && only.length) picked.push(takeRandom(only, random));
  }
  return shuffle(picked, random);
}

export function skillCard(definition: SkillDefinition, currentRank: number): SkillCard {
  const nextRank = currentRank + 1;
  return Object.freeze({
    kind: 'skill',
    skillId: definition.id,
    name: definition.name,
    icon: definition.icon,
    skillKind: definition.kind,
    isNew: currentRank === 0,
    currentRank,
    nextRank,
    summary: definition.rankSummaries[nextRank - 1],
  });
}
export const BONUS_IDS: readonly BonusRewardId[] = Object.freeze(['recovery', 'barrier', 'gold']);
export function bonusCards(): readonly BonusCard[] {
  return Object.freeze(
    BONUS_IDS.map((bonusId) =>
      Object.freeze({ kind: 'bonus' as const, bonusId, ...BONUS_REWARDS[bonusId] }),
    ),
  );
}
export function cardKey(card: OfferCard): string {
  return card.kind === 'skill' ? card.skillId : `bonus:${card.bonusId}`;
}

/**
 * Reroll: prefer excluding the cards just rejected, but only when that keeps the same card count and
 * the managed-random guarantee; otherwise repeats are allowed rather than shrinking the offer.
 */
export function rerollSkills(
  pools: OfferPools,
  rejected: ReadonlySet<string>,
  random: Random,
): SkillDefinition[] {
  const full = Math.min(SKILL_RULES.offerSize, pools.fresh.length + pools.upgrades.length);
  const mixed = pools.fresh.length > 0 && pools.upgrades.length > 0;
  const filtered: OfferPools = {
    fresh: pools.fresh.filter((d) => !rejected.has(d.id)),
    upgrades: pools.upgrades.filter((d) => !rejected.has(d.id)),
  };
  const filteredCount = filtered.fresh.length + filtered.upgrades.length;
  const filteredMixed = filtered.fresh.length > 0 && filtered.upgrades.length > 0;
  if (filteredCount >= full && (!mixed || filteredMixed)) return pickSkills(filtered, random, full);
  return pickSkills(pools, random, full);
}

/** A reroll is meaningful only if a different set of cards could be produced. */
export function rerollIsMeaningful(pools: OfferPools): boolean {
  return pools.fresh.length + pools.upgrades.length > SKILL_RULES.offerSize;
}
