import type { CharacterClass } from '../character-stats';
import { NO_MODIFIERS } from '../skills/stats';
import type { RunStatModifiers } from '../skills/stats';
import { TALENT_CONFIG } from './config';
import type { TalentEffect } from './effects';
import { spentTalentPoints, superpowerActive, validateTalentRanks } from './rules';
import type { TalentConfig, TalentRanks } from './types';

/**
 * Task 09 §1.2 modifier pipeline (pure). At run start a class's stored ranks become one
 * `TalentLoadout`: only the current rank of each node counts (catalog ranks are totals), only
 * active ranks (ready + catalog approved) contribute, and stat effects are summed into one
 * `RunStatModifiers` layer that the Skill Engine composes together with run passives/buffs —
 * so the central caps are applied exactly once, at the existing `composeRunStats` stage.
 */
export interface ResolvedTalentEffect {
  readonly nodeId: string;
  readonly rank: number;
  readonly effect: TalentEffect;
}
export interface TalentLoadout {
  readonly characterClass: CharacterClass;
  readonly ranks: TalentRanks;
  readonly pointsSpent: number;
  /** Ranks that currently change combat (0 while the catalog is not approved). */
  readonly activeRanks: number;
  readonly effects: readonly ResolvedTalentEffect[];
  /** Talent stat layer for `composeRunStats` (all zero without active stat effects). */
  readonly modifiers: RunStatModifiers;
  /** Superpower bought (branch-3 node 1 rank I); its effects still need an active rank. */
  readonly superpower: boolean;
}

export function activeTalentEffects(
  characterClass: CharacterClass,
  ranks: TalentRanks,
  config: TalentConfig = TALENT_CONFIG,
): readonly ResolvedTalentEffect[] {
  const out: ResolvedTalentEffect[] = [];
  for (const branch of config.branchesOf(characterClass))
    for (const node of branch.nodes) {
      const rank = ranks[node.id] ?? 0;
      if (rank < 1) continue;
      const data = node.ranks[rank - 1];
      if (!data.active) continue;
      for (const effect of data.effects) out.push(Object.freeze({ nodeId: node.id, rank, effect }));
    }
  return Object.freeze(out);
}
export function talentStatModifiers(effects: readonly ResolvedTalentEffect[]): RunStatModifiers {
  const m: Record<keyof RunStatModifiers, number> = { ...NO_MODIFIERS };
  for (const { effect } of effects) if (effect.kind === 'stat') m[effect.stat] += effect.value;
  return Object.freeze(m);
}
/** Validated loadout for a run; throws RangeError for an invalid tree (never repaired). */
export function talentLoadout(
  characterClass: CharacterClass,
  level: number,
  ranks: TalentRanks = {},
  config: TalentConfig = TALENT_CONFIG,
): TalentLoadout {
  const valid = validateTalentRanks(characterClass, level, ranks, config);
  if (!valid.ok) throw new RangeError(`Invalid talents: ${valid.errors.join('; ')}.`);
  const effects = activeTalentEffects(characterClass, valid.ranks, config);
  const activeRanks = Object.entries(valid.ranks).filter(
    ([id, rank]) => config.nodes.get(id)!.ranks[rank - 1].active,
  ).length;
  return Object.freeze({
    characterClass,
    ranks: valid.ranks,
    pointsSpent: spentTalentPoints(valid.ranks),
    activeRanks,
    effects,
    modifiers: talentStatModifiers(effects),
    superpower: superpowerActive(characterClass, valid.ranks),
  });
}
