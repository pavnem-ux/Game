import type { CharacterClass } from '../character-stats';
import { talentPoints } from '../profile/class-xp';
import { TALENT_CONFIG, TALENT_RULES } from './config';
import type { TalentConfig, TalentNode, TalentRanks } from './types';

/**
 * Task 09 §1.1 talent tree rules (pure). Points are always derived:
 * earned = talentPoints(level) (Task 08), spent = sum of allocated ranks, available = earned −
 * spent. Nothing is stored except node ranks. No refunds/respec (none in the catalog).
 */
export type TalentBlockReason =
  | 'unknown-node'
  | 'wrong-class'
  | 'max-rank'
  | 'level'
  | 'prerequisite'
  | 'no-points';
export type PurchaseCheck =
  | Readonly<{ ok: true; nextRank: number }>
  | Readonly<{ ok: false; reason: TalentBlockReason }>;

export class TalentRuleError extends Error {
  constructor(readonly reason: TalentBlockReason) {
    super(`Talent purchase not allowed: ${reason}.`);
    this.name = 'TalentRuleError';
  }
}

export const earnedTalentPoints = (level: number): number => talentPoints(level);
export function spentTalentPoints(ranks: TalentRanks): number {
  let spent = 0;
  for (const rank of Object.values(ranks)) spent += rank;
  return spent;
}
/** Never negative (an over-spent tree is rejected by `validateTalentRanks`). */
export function availableTalentPoints(level: number, ranks: TalentRanks): number {
  return Math.max(0, earnedTalentPoints(level) - spentTalentPoints(ranks));
}
export const rankOf = (ranks: TalentRanks, nodeId: string): number => ranks[nodeId] ?? 0;

/** Whether the next rank of `nodeId` may be bought now, with the first blocking reason. */
export function checkPurchase(
  characterClass: CharacterClass,
  level: number,
  ranks: TalentRanks,
  nodeId: string,
  config: TalentConfig = TALENT_CONFIG,
): PurchaseCheck {
  const node = config.nodes.get(nodeId);
  if (!node) return Object.freeze({ ok: false, reason: 'unknown-node' });
  if (node.characterClass !== characterClass)
    return Object.freeze({ ok: false, reason: 'wrong-class' });
  const current = rankOf(ranks, nodeId);
  if (current >= TALENT_RULES.maxRank) return Object.freeze({ ok: false, reason: 'max-rank' });
  if (level < node.requiredLevel) return Object.freeze({ ok: false, reason: 'level' });
  if (node.requires && rankOf(ranks, node.requires) < TALENT_RULES.prerequisiteRank)
    return Object.freeze({ ok: false, reason: 'prerequisite' });
  if (availableTalentPoints(level, ranks) < 1)
    return Object.freeze({ ok: false, reason: 'no-points' });
  return Object.freeze({ ok: true, nextRank: current + 1 });
}
/** Buys one rank; returns the new (frozen) ranks or throws `TalentRuleError`. */
export function purchaseRank(
  characterClass: CharacterClass,
  level: number,
  ranks: TalentRanks,
  nodeId: string,
  config: TalentConfig = TALENT_CONFIG,
): TalentRanks {
  const check = checkPurchase(characterClass, level, ranks, nodeId, config);
  if (!check.ok) throw new TalentRuleError(check.reason);
  return Object.freeze({ ...ranks, [nodeId]: check.nextRank });
}

export type TalentValidation =
  | Readonly<{ ok: true; ranks: TalentRanks }>
  | Readonly<{ ok: false; errors: readonly string[] }>;
/**
 * Validates stored/imported ranks of one class tree (§1.4): known node ids of this class,
 * whole ranks 0–3, prerequisites met, branch 3 only at level ≥ 30, spent ≤ earned.
 * Zero ranks are dropped from the normalised result. Never repairs invalid data.
 */
export function validateTalentRanks(
  characterClass: CharacterClass,
  level: number,
  raw: unknown,
  config: TalentConfig = TALENT_CONFIG,
): TalentValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return Object.freeze({ ok: false, errors: Object.freeze(['talents must be an object']) });
  const ranks: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const node = config.nodes.get(id);
    if (!node || node.characterClass !== characterClass) errors.push(`unknown node ${id}`);
    else if (
      !Number.isInteger(value) ||
      (value as number) < 0 ||
      (value as number) > TALENT_RULES.maxRank
    )
      errors.push(`invalid rank for ${id}`);
    else if ((value as number) > 0) ranks[id] = value as number;
  }
  for (const id of Object.keys(ranks)) {
    const node = config.nodes.get(id) as TalentNode;
    if (level < node.requiredLevel) errors.push(`${id} needs level ${node.requiredLevel}`);
    if (node.requires && rankOf(ranks, node.requires) < TALENT_RULES.prerequisiteRank)
      errors.push(`${id} needs ${node.requires} at rank ${TALENT_RULES.prerequisiteRank}`);
  }
  if (spentTalentPoints(ranks) > earnedTalentPoints(level))
    errors.push('more points spent than earned');
  return errors.length
    ? Object.freeze({ ok: false, errors: Object.freeze(errors) })
    : Object.freeze({ ok: true, ranks: Object.freeze(ranks) });
}
/** §1.1: the superpower activates only with rank I of the branch-3 first node (not level 30). */
export function superpowerActive(characterClass: CharacterClass, ranks: TalentRanks): boolean {
  return rankOf(ranks, `${characterClass}.b${TALENT_RULES.superpowerBranch}.n01`) >= 1;
}
/** UI/state helper: rank and whether the next rank is purchasable (with the reason). */
export function talentNodeState(
  characterClass: CharacterClass,
  level: number,
  ranks: TalentRanks,
  nodeId: string,
  config: TalentConfig = TALENT_CONFIG,
) {
  const check = checkPurchase(characterClass, level, ranks, nodeId, config);
  return Object.freeze({
    rank: rankOf(ranks, nodeId),
    purchasable: check.ok,
    reason: check.ok ? null : check.reason,
  });
}
