import type { CharacterClass } from '../character-stats';
import type { TalentEffect } from './effects';

/** Task 09 permanent talent trees: catalog data (verbatim) and validated config types. */
export type TalentRankNumber = 1 | 2 | 3;
export type TalentBranchNumber = 1 | 2 | 3;
/**
 * Task 09.1 rule 7: `pending` = defined in catalog v1.2 but not yet working in combat (inert);
 * `ready` = its effect works in combat and is tested; `blocked` = engine conflict listed in
 * `docs/talents-gaps.md`. Only `ready` ranks (of an approved catalog) are active.
 */
export type TalentRankStatus = 'pending' | 'ready' | 'blocked';
export interface TalentRankData {
  /** Verbatim Russian rank text from `docs/talents.md`. */
  readonly text: string;
  readonly status: TalentRankStatus;
  /** Catalog appendix decisions (G1–G12, C1–C8) giving this rank its exact parameters. */
  readonly refs: readonly string[];
  /**
   * Effect descriptors of this rank (its complete effect). Allowed only on `ready` ranks; a
   * `ready` rank must have at least one. Absent = no effect yet.
   */
  readonly effects?: readonly TalentEffect[];
}
export interface TalentNodeData {
  readonly id: string;
  readonly characterClass: CharacterClass;
  readonly branch: TalentBranchNumber;
  readonly order: number;
  readonly name: string;
  readonly superpower: boolean;
  readonly ranks: readonly TalentRankData[];
}
export interface TalentBranchData {
  readonly characterClass: CharacterClass;
  readonly branch: TalentBranchNumber;
  readonly name: string;
  readonly nodeCount: number;
}
export interface TalentCatalogData {
  readonly branches: readonly TalentBranchData[];
  readonly nodes: readonly TalentNodeData[];
}

export interface TalentRank extends TalentRankData {
  readonly rank: TalentRankNumber;
  /** True only when the rank may change combat (ready + catalog approved). */
  readonly active: boolean;
  readonly effects: readonly TalentEffect[];
}
export interface TalentNode extends Omit<TalentNodeData, 'ranks'> {
  readonly ranks: readonly [TalentRank, TalentRank, TalentRank];
  /** Previous node in the branch (needs rank II), null for the first node. */
  readonly requires: string | null;
  /** Permanent class level needed for the branch (30 for the superpower branch). */
  readonly requiredLevel: number;
}
export interface TalentBranch extends TalentBranchData {
  readonly superpower: boolean;
  readonly requiredLevel: number;
  readonly nodes: readonly TalentNode[];
}
export interface TalentConfig {
  readonly approved: boolean;
  readonly branches: readonly TalentBranch[];
  readonly nodes: ReadonlyMap<string, TalentNode>;
  branchesOf(characterClass: CharacterClass): readonly TalentBranch[];
}
/** Allocated ranks of one class tree: node id → rank (absent = 0). Only ranks are stored. */
export type TalentRanks = Readonly<Record<string, number>>;
