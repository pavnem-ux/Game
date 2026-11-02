import type { TalentEffect } from './effects';
import type { TalentCatalogData } from './types';

/**
 * Task 09.1 effect data: the implemented ranks' effect descriptors (numbers from catalog v1.2 and
 * its G/C appendix) and the ranks blocked by an engine conflict (`docs/talents-gaps.md`). A rank
 * listed here with effects becomes `ready`; everything else stays `pending` (inert). Filled in
 * phase by phase; never filled for a rank whose effect is not implemented and tested.
 */
export type RankEffects = Partial<Record<1 | 2 | 3, readonly TalentEffect[]>>;
export const TALENT_RANK_EFFECTS: Readonly<Record<string, RankEffects>> = Object.freeze({});
/** Ranks blocked by an engine conflict: node → ranks (reason in `docs/talents-gaps.md`). */
export const TALENT_BLOCKED: Readonly<Record<string, readonly (1 | 2 | 3)[]>> = Object.freeze({});

/** Applies the effect data to the verbatim catalog: ready / blocked / pending per rank. */
export function withEffectData(
  data: TalentCatalogData,
  effects: Readonly<Record<string, RankEffects>> = TALENT_RANK_EFFECTS,
  blocked: Readonly<Record<string, readonly (1 | 2 | 3)[]>> = TALENT_BLOCKED,
): TalentCatalogData {
  for (const id of [...Object.keys(effects), ...Object.keys(blocked)])
    if (!data.nodes.some((n) => n.id === id))
      throw new Error(`Effect data for unknown node ${id}.`);
  return {
    ...data,
    nodes: data.nodes.map((n) => ({
      ...n,
      ranks: n.ranks.map((r, i) => {
        const rank = (i + 1) as 1 | 2 | 3;
        if (blocked[n.id]?.includes(rank)) {
          if (effects[n.id]?.[rank]) throw new Error(`${n.id} rank ${rank} is blocked and ready.`);
          return { ...r, status: 'blocked' as const };
        }
        const e = effects[n.id]?.[rank];
        return e ? { ...r, status: 'ready' as const, effects: e } : r;
      }),
    })),
  };
}
