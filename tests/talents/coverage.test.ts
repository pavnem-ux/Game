import { describe, expect, it } from 'vitest';
import gapsMarkdown from '../../docs/talents-gaps.md?raw';
import archerSource from '../../src/talents/handlers/archer.ts?raw';
import mageSource from '../../src/talents/handlers/mage.ts?raw';
import rogueSource from '../../src/talents/handlers/rogue.ts?raw';
import warriorSource from '../../src/talents/handlers/warrior.ts?raw';
import { TALENT_CONFIG, TALENT_STATS } from '../../src/talents';
import type { TalentBehaviorEffect } from '../../src/talents';

const SOURCES: Record<string, string> = {
  rogue: rogueSource,
  mage: mageSource,
  warrior: warriorSource,
  archer: archerSource,
};
/** Owner-visible engine conflicts (talents-gaps.md «Engine conflicts»). */
const BLOCKED: Record<string, readonly number[]> = {
  'rogue.b1.n02': [2, 3], // E1
  'rogue.b3.n03': [2, 3], // E2
  'archer.b1.n05': [2, 3], // E3
};

describe('Task 09.1 §10.1 coverage — every rank is real or documented as blocked', () => {
  const nodes = [...TALENT_CONFIG.nodes.values()];
  it('56 nodes × 3 ranks = 168; no rank is pending', () => {
    const ranks = nodes.flatMap((n) => n.ranks);
    expect(nodes).toHaveLength(56);
    expect(ranks).toHaveLength(168);
    expect(ranks.filter((r) => r.status === 'pending')).toEqual([]);
    expect(ranks.filter((r) => r.status === 'ready')).toHaveLength(162);
  });
  it('blocked ranks are exactly E1–E3, each with a row (problem + proposed fix) in talents-gaps.md', () => {
    const blocked: Record<string, number[]> = {};
    for (const n of nodes)
      n.ranks.forEach((r, i) => {
        if (r.status === 'blocked') (blocked[n.id] ??= []).push(i + 1);
      });
    expect(blocked).toEqual(BLOCKED);
    for (const [id, e] of [
      ['rogue.b1.n02', 'E1'],
      ['rogue.b3.n03', 'E2'],
      ['archer.b1.n05', 'E3'],
    ])
      expect(gapsMarkdown).toMatch(
        new RegExp(`\\| ${e} +\\| \`${id.replace(/\./g, '\\.')}\` II–III`),
      );
  });
  it('every ready rank has effects; stats are known run stats; behaviours are read by their class handler', () => {
    for (const n of nodes) {
      const source = SOURCES[n.characterClass];
      n.ranks.forEach((r, i) => {
        if (r.status !== 'ready') return;
        expect(r.effects.length, `${n.id} ${i + 1}`).toBeGreaterThan(0);
        for (const e of r.effects) {
          if (e.kind === 'stat') {
            expect(TALENT_STATS).toContain(e.stat);
            continue;
          }
          // The handler of this class names the node and reads every parameter of the rank.
          expect(source, `${n.id} handler`).toContain(`'${n.id}'`);
          for (const key of Object.keys((e as TalentBehaviorEffect).params))
            expect(source, `${n.id} ${i + 1} param ${key}`).toMatch(
              new RegExp(`[.?]${key}\\b|\\b${key}:`),
            );
        }
      });
    }
  });
  it('every G1–G12 / C1–C8 row of the resolution table is resolved or blocked with references', () => {
    const table = gapsMarkdown.slice(0, gapsMarkdown.indexOf('## Engine conflicts'));
    for (const id of [
      ...Array.from({ length: 12 }, (_, i) => `G${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `C${i + 1}`),
    ]) {
      const row = table.split('\n').find((l) => new RegExp(`^\\| ${id} +\\|`).test(l));
      expect(row, id).toBeDefined();
      expect(row, id).toMatch(/\*\*(resolved|blocked)\*\*/);
      expect(row, id).not.toMatch(/pending/);
    }
  });
});
