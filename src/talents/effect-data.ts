import type { TalentEffect, TalentStat } from './effects';
import type { TalentCatalogData } from './types';

/**
 * Task 09.1 effect data: the implemented ranks' effect descriptors (numbers from catalog v1.2 and
 * its G/C appendix) and the ranks blocked by an engine conflict (`docs/talents-gaps.md`). A rank
 * listed here with effects becomes `ready`; everything else stays `pending` (inert). Filled in
 * phase by phase; never filled for a rank whose effect is not implemented and tested.
 */
export type RankEffects = Partial<Record<1 | 2 | 3, readonly TalentEffect[]>>;
const b = (params: Record<string, number>): TalentEffect =>
  Object.freeze({ kind: 'behavior', params: Object.freeze(params) });
const st = (stat: TalentStat, value: number): TalentEffect =>
  Object.freeze({ kind: 'stat', stat, value });
const same = (params: Record<string, number>) => [b(params)];

export const TALENT_RANK_EFFECTS: Readonly<Record<string, RankEffects>> = Object.freeze({
  // ── Rogue · Ассасин (Phase 2) ──
  'rogue.b1.n01': {
    1: same({ bonus: 6 }),
    2: same({ bonus: 10, stacks: 5, extra: 5 }),
    3: same({ bonus: 15, stacks: 10, extra: 10 }),
  },
  'rogue.b1.n02': { 1: same({ critChance: 3 }) },
  'rogue.b1.n03': {
    1: same({ bleedDamage: 8 }),
    2: same({ bleedDamage: 13, stacks: 5, direct: 4 }),
    3: same({ bleedDamage: 20, stacks: 10, direct: 8 }),
  },
  'rogue.b1.n04': {
    1: same({ hpBelow: 30, bonus: 8 }),
    2: same({ hpBelow: 30, bonus: 12, bleedExtra: 5 }),
    3: same({ hpBelow: 30, bonus: 18, finalCut: 15 }),
  },
  'rogue.b1.n05': {
    1: same({ critDamage: 10 }),
    2: same({ critDamage: 18, bleedExtra: 7 }),
    3: same({ critDamage: 28, hpBelow: 30, lowHpExtra: 12 }),
  },
  // ── Rogue · Теневой охотник (Phase 2; G3, G4, C8) ──
  'rogue.b2.n01': {
    1: [st('dodgeChance', 2)],
    2: [st('dodgeChance', 4), st('movementSpeedPercent', 3)],
    3: [st('dodgeChance', 6), st('movementSpeedPercent', 5)],
  },
  'rogue.b2.n02': {
    1: same({ coefficient: 0.45, cooldown: 3 }),
    2: same({ coefficient: 0.65, cooldown: 2.5 }),
    3: same({ coefficient: 0.85, cooldown: 2 }),
  },
  'rogue.b2.n03': {
    1: same({
      chance: 15,
      lifetime: 3,
      cooldown: 12,
      coefficient: 0.2,
      interval: 1.2,
      offset: 45,
      radius: 180,
    }),
    2: same({
      chance: 25,
      lifetime: 4,
      cooldown: 12,
      coefficient: 0.2,
      interval: 1.2,
      offset: 45,
      radius: 180,
    }),
    3: same({
      chance: 35,
      lifetime: 5,
      cooldown: 12,
      coefficient: 0.2,
      interval: 1.2,
      offset: 45,
      radius: 180,
    }),
  },
  'rogue.b2.n04': {
    1: same({ coefficient: 0.35, speed: 1 }),
    2: same({ coefficient: 0.5, speed: 1.1 }),
    3: same({ coefficient: 0.65, speed: 1.2 }),
  },
  'rogue.b2.n05': {
    1: same({ speedPercent: 8, duration: 2 }),
    2: same({ speedPercent: 12, duration: 2.5 }),
    3: same({ speedPercent: 16, duration: 3, counterMultiplier: 1.15 }),
  },
  // Rogue b3: G1 (tick 1.5/2/3), G2 (4 s), G5 (radius 80/100/130, CD 8 s).
  'rogue.b3.n01': {
    1: same({ chance: 15, tick: 1.5, duration: 4 }),
    2: same({ chance: 25, tick: 2, duration: 4 }),
    3: same({ chance: 35, tick: 3, duration: 4 }),
  },
  'rogue.b3.n02': {
    1: same({ two: 8 }),
    2: same({ two: 14, three: 20 }),
    3: same({ two: 18, three: 28 }),
  },
  'rogue.b3.n03': {
    1: same({ dotTaken: 10 }),
  },
  'rogue.b3.n04': {
    1: same({ coefficient: 1.5, radius: 80, cooldown: 8, stacks: 10 }),
    2: same({ coefficient: 2, radius: 100, cooldown: 8, stacks: 10 }),
    3: same({ coefficient: 2.6, radius: 130, cooldown: 8, stacks: 10 }),
  },
  // ── Mage · Повелитель стихий / Арканист (Phase 4; C2) ──
  'mage.b1.n01': {
    1: same({ bonus: 5 }),
    2: same({ bonus: 9, area: 4 }),
    3: same({ bonus: 14, area: 8 }),
  },
  'mage.b1.n02': {
    1: same({ burnDamage: 8 }),
    2: same({ burnDamage: 15, burnDuration: 10 }),
    3: same({ burnDamage: 24, burnDuration: 15 }),
  },
  'mage.b1.n03': {
    1: same({ bonus: 6 }),
    2: same({ bonus: 10, slow: 3 }),
    3: same({ bonus: 16, slow: 5 }),
  },
  'mage.b1.n04': {
    1: same({ thermalShock: 10 }),
    2: same({ thermalShock: 10, shatteredIce: 12 }),
    3: same({ thermalShock: 20, shatteredIce: 22 }),
  },
  'mage.b1.n05': {
    1: same({ radius: 10 }),
    2: same({ radius: 20, neighbours: 1, maxNeighbours: 4 }),
    3: same({ radius: 30, neighbours: 2, maxNeighbours: 5 }),
  },
  'mage.b2.n01': {
    1: [st('cooldownReduction', 3)],
    2: [st('cooldownReduction', 5), st('magicalDamagePercent', 3)],
    3: [st('cooldownReduction', 8), st('magicalDamagePercent', 5)],
  },
  'mage.b2.n02': {
    1: same({ critChance: 3 }),
    2: same({ critChance: 5, critDamage: 10 }),
    3: same({ critChance: 8, critDamage: 20 }),
  },
  'mage.b2.n03': {
    1: same({ barrier: 10, duration: 3, cooldown: 20 }),
    2: same({ barrier: 15, duration: 3, cooldown: 18 }),
    3: same({ barrier: 20, duration: 4, cooldown: 15 }),
  },
  'mage.b2.n04': {
    1: same({ bonus: 6, hpAbove: 70 }),
    2: same({ bonus: 10, hpAbove: 70, cdr: 3 }),
    3: same({ bonus: 15, hpAbove: 70, cdr: 5 }),
  },
  'mage.b2.n05': {
    1: same({ reduce: 0.1, icd: 1 }),
    2: same({ reduce: 0.2, icd: 1 }),
    3: same({ reduce: 0.3, icd: 0.8 }),
  },
  // ── Mage · Верховный маг (Phase 5; C1: enhanced = the 5th-slot active) ──
  'mage.b3.n01': {
    1: same({ extraSlots: 1 }),
    2: same({ extraSlots: 1, bonus: 8 }),
    3: same({ extraSlots: 1, bonus: 15, cd: 5 }),
  },
  'mage.b3.n02': {
    1: same({ area: 5 }),
    2: same({ area: 10, dot: 8 }),
    3: same({ area: 15, dot: 15 }),
  },
  'mage.b3.n03': {
    1: same({ cd: 5 }),
    2: same({ cd: 10 }),
    3: same({ cd: 15 }),
  },
  'mage.b3.n04': {
    1: same({ bonus: 10 }),
    2: same({ bonus: 18, critDamage: 15 }),
    3: same({ bonus: 28, critDamage: 25 }),
  },
});
/** Ranks blocked by an engine conflict: node → ranks (reason in `docs/talents-gaps.md`). */
export const TALENT_BLOCKED: Readonly<Record<string, readonly (1 | 2 | 3)[]>> = Object.freeze({
  // Per-target crit chance on multi-target dagger strikes (one crit roll per snapshot): E1.
  'rogue.b1.n02': [2, 3],
  // Extra-stack trigger undefined + basic dagger Bleed exists without serrated_blades: E2.
  'rogue.b3.n03': [2, 3],
});

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
