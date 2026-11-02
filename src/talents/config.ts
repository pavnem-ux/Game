import { CHARACTER_CLASSES } from '../character-stats';
import type { CharacterClass } from '../character-stats';
import { TALENT_CATALOG_DATA } from './catalog';
import { validateTalentEffect } from './effects';
import type {
  TalentBranch,
  TalentBranchNumber,
  TalentCatalogData,
  TalentConfig,
  TalentNode,
  TalentRankNumber,
} from './types';

/**
 * Task 09 talent rules that are fixed by the spec/catalog (structure, not balance):
 * branches 1–2 have 5 nodes and open from level 1; branch 3 (superpower) has 4 nodes and opens
 * at permanent level 30; a node needs the previous node at rank II; ranks I–III.
 */
export const TALENT_RULES = Object.freeze({
  branchesPerClass: 3,
  nodesPerBranch: Object.freeze({ 1: 5, 2: 5, 3: 4 } as Record<TalentBranchNumber, number>),
  maxRank: 3 as TalentRankNumber,
  prerequisiteRank: 2,
  superpowerBranch: 3 as TalentBranchNumber,
  superpowerLevel: 30,
  totals: Object.freeze({ branches: 12, nodes: 56, ranks: 168 }),
});
/**
 * G0 (`docs/talents-gaps.md`): the catalog marks every number as an unapproved balancing
 * proposal. Until the owner approves it, no talent rank changes combat (all ranks inert).
 */
export const TALENT_CATALOG_APPROVED = false;

const ID = /^(warrior|mage|archer|rogue)\.b([1-3])\.n0([1-5])$/;

/** Validates the catalog data and builds the frozen config. Throws on any structural error. */
export function loadTalentConfig(
  data: TalentCatalogData = TALENT_CATALOG_DATA,
  approved: boolean = TALENT_CATALOG_APPROVED,
): TalentConfig {
  const fail = (msg: string): never => {
    throw new Error(`Invalid talent catalog: ${msg}`);
  };
  const ids = new Set<string>();
  for (const n of data.nodes) {
    const m = ID.exec(n.id) ?? fail(`bad id ${n.id}`);
    if (ids.has(n.id)) fail(`duplicate ${n.id}`);
    ids.add(n.id);
    if (m[1] !== n.characterClass || Number(m[2]) !== n.branch || Number(m[3]) !== n.order)
      fail(`${n.id} does not match class/branch/order`);
    if (!n.name.trim()) fail(`${n.id} has no name`);
    if (n.ranks.length !== TALENT_RULES.maxRank) fail(`${n.id} needs ranks I–III`);
    for (const r of n.ranks) {
      if (!r.text.trim()) fail(`${n.id} has an empty rank`);
      if (r.status === 'ready' && r.gaps.length) fail(`${n.id} is ready but lists gaps`);
      if (r.status !== 'ready' && !r.gaps.length) fail(`${n.id} is ${r.status} without a gap id`);
      if (r.status === 'missing' && !r.gaps.some((g) => g.startsWith('G')))
        fail(`${n.id} is missing without a G gap`);
      // Rule 6: an undefined or unclear rank can never carry an effect.
      if (r.effects?.length && r.status !== 'ready')
        fail(`${n.id} has effects on a ${r.status} rank`);
      r.effects?.forEach((e, i) => {
        try {
          validateTalentEffect(e, `${n.id} effect ${i}`);
        } catch (error) {
          fail((error as Error).message);
        }
      });
    }
    const superpower = n.branch === TALENT_RULES.superpowerBranch && n.order === 1;
    if (n.superpower !== superpower) fail(`${n.id} superpower flag`);
  }
  const branches: TalentBranch[] = [];
  for (const cls of CHARACTER_CLASSES)
    for (const b of [1, 2, 3] as TalentBranchNumber[]) {
      const meta =
        data.branches.find((x) => x.characterClass === cls && x.branch === b) ??
        fail(`missing branch ${cls}.b${b}`);
      const expected = TALENT_RULES.nodesPerBranch[b];
      if (meta.nodeCount !== expected) fail(`${cls}.b${b} must have ${expected} nodes`);
      const requiredLevel = b === TALENT_RULES.superpowerBranch ? TALENT_RULES.superpowerLevel : 1;
      const nodes: TalentNode[] = [];
      for (let order = 1; order <= expected; order++) {
        const id = `${cls}.b${b}.n0${order}`;
        const n = data.nodes.find((x) => x.id === id) ?? fail(`missing node ${id}`);
        nodes.push(
          Object.freeze({
            ...n,
            requires: order === 1 ? null : `${cls}.b${b}.n0${order - 1}`,
            requiredLevel,
            ranks: n.ranks.map((r, i) =>
              Object.freeze({
                ...r,
                gaps: Object.freeze([...r.gaps]),
                effects: Object.freeze((r.effects ?? []).map((e) => Object.freeze({ ...e }))),
                rank: (i + 1) as TalentRankNumber,
                active: approved && r.status === 'ready',
              }),
            ) as unknown as TalentNode['ranks'],
          }),
        );
      }
      branches.push(
        Object.freeze({
          ...meta,
          superpower: b === TALENT_RULES.superpowerBranch,
          requiredLevel,
          nodes: Object.freeze(nodes),
        }),
      );
    }
  if (data.branches.length !== TALENT_RULES.totals.branches) fail('branch count');
  if (data.nodes.length !== TALENT_RULES.totals.nodes) fail('node count');
  const nodes = new Map<string, TalentNode>();
  for (const b of branches) for (const n of b.nodes) nodes.set(n.id, n);
  const byClass = new Map<CharacterClass, readonly TalentBranch[]>(
    CHARACTER_CLASSES.map((c) => [
      c,
      Object.freeze(branches.filter((b) => b.characterClass === c)),
    ]),
  );
  return Object.freeze({
    approved,
    branches: Object.freeze(branches),
    nodes,
    branchesOf: (c: CharacterClass) => byClass.get(c) ?? fail(`unknown class ${c}`),
  });
}
/** The validated app-wide talent config (validated at startup). */
export const TALENT_CONFIG: TalentConfig = loadTalentConfig();
