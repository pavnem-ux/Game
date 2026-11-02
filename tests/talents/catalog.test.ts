import { describe, expect, it } from 'vitest';
import catalogMarkdown from '../../docs/talents.md?raw';
import gapsMarkdown from '../../docs/talents-gaps.md?raw';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import {
  TALENT_CATALOG_APPROVED,
  TALENT_CATALOG_DATA,
  TALENT_CONFIG,
  TALENT_RULES,
  loadTalentConfig,
} from '../../src/talents';
import type { TalentCatalogData } from '../../src/talents';

/** Independent parse of docs/talents.md (catalog v1.2, the owner's file). */
function parseCatalog(md: string) {
  const classes: Record<string, string> = {
    Разбойник: 'rogue',
    Маг: 'mage',
    Воин: 'warrior',
    Лучник: 'archer',
  };
  let cls = '';
  const branches: { cls: string; branch: number; name: string; count: number }[] = [];
  const nodes: { id: string; name: string; superpower: boolean; ranks: string[] }[] = [];
  for (const line of md.split('\n')) {
    let m = /^## (Разбойник|Маг|Воин|Лучник)$/.exec(line);
    if (m) cls = classes[m[1]];
    else if (line.startsWith('## ')) cls = '';
    if (!cls) continue;
    m = /^### Ветка (\d)\. (.+?) — (\d) узлов$/.exec(line);
    if (m) branches.push({ cls, branch: +m[1], name: m[2], count: +m[3] });
    m = /^\d\.\d\s+(.+?)\s+·\s+ID: (\S+?)(\s+·\s+СВЕРХСПОСОБНОСТЬ)?\s*$/.exec(line);
    if (m) nodes.push({ id: m[2], name: m[1], superpower: !!m[3], ranks: [] });
    m = /^- \*\*Ранг (?:I|II|III)\*\*: (.+)$/.exec(line);
    if (m && nodes.length) nodes[nodes.length - 1].ranks.push(m[1]);
  }
  const appendix = [...md.matchAll(/^### (G\d+|C\d) — /gm)].map((x) => x[1]);
  return { branches, nodes, appendix };
}

describe('Task 09 §1.1 talent catalog → config (verbatim, nothing invented)', () => {
  const parsed = parseCatalog(catalogMarkdown);
  it('the config contains exactly the catalog: 12 branches, 56 nodes, 168 rank texts', () => {
    expect(parsed.branches).toHaveLength(12);
    expect(parsed.nodes).toHaveLength(56);
    expect(
      TALENT_CATALOG_DATA.branches.map((b) => [b.characterClass, b.branch, b.name, b.nodeCount]),
    ).toEqual(parsed.branches.map((b) => [b.cls, b.branch, b.name, b.count]));
    expect(
      TALENT_CATALOG_DATA.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        superpower: n.superpower,
        ranks: n.ranks.map((r) => r.text),
      })),
    ).toEqual(parsed.nodes);
    expect(TALENT_CONFIG.nodes.size).toBe(TALENT_RULES.totals.nodes);
    expect([...TALENT_CONFIG.nodes.values()].flatMap((n) => n.ranks)).toHaveLength(168);
  });
  it('4 classes × 3 branches; branches 1–2 have 5 nodes from level 1, branch 3 has 4 at 30', () => {
    for (const cls of CHARACTER_CLASSES) {
      const branches = TALENT_CONFIG.branchesOf(cls);
      expect(branches.map((b) => b.nodes.length)).toEqual([5, 5, 4]);
      expect(branches.map((b) => b.requiredLevel)).toEqual([1, 1, 30]);
      expect(branches.map((b) => b.superpower)).toEqual([false, false, true]);
      for (const b of branches)
        b.nodes.forEach((n, i) => {
          expect(n.id).toBe(`${cls}.b${b.branch}.n0${i + 1}`);
          expect(n.requires).toBe(i === 0 ? null : `${cls}.b${b.branch}.n0${i}`);
          expect(n.superpower).toBe(b.branch === 3 && i === 0);
          expect(n.ranks.map((r) => r.rank)).toEqual([1, 2, 3]);
        });
    }
  });
  it('v1.2 is alpha-approved; every G/C reference exists in the appendix and is used', () => {
    expect(catalogMarkdown).toMatch(/^Каталог талантов · Task 09 · v1\.2 Alpha Approved/);
    expect(TALENT_CATALOG_APPROVED).toBe(true);
    const ranks = [...TALENT_CONFIG.nodes.values()].flatMap((n) => n.ranks);
    const used = new Set(ranks.flatMap((r) => r.refs));
    for (const ref of used) expect(parsed.appendix).toContain(ref);
    const decisions = parsed.appendix.filter((id) => id !== 'G0');
    expect(decisions).toHaveLength(20); // G1–G12, C1–C8
    for (const id of decisions) expect(used.has(id), id).toBe(true);
    // Every decision has a row in the resolution table of docs/talents-gaps.md.
    for (const id of parsed.appendix) expect(gapsMarkdown).toMatch(new RegExp(`\\| ${id} +\\|`));
  });
  it('rule 7: a rank is active only when ready (working + tested); pending/blocked stay inert', () => {
    const ranks = [...TALENT_CONFIG.nodes.values()].flatMap((n) => n.ranks);
    expect(ranks.every((r) => r.active === (r.status === 'ready'))).toBe(true);
    for (const r of ranks.filter((x) => x.status !== 'ready')) expect(r.effects).toEqual([]);
    for (const r of ranks.filter((x) => x.status === 'ready'))
      expect(r.effects.length).toBeGreaterThan(0);
    // Every blocked rank is documented in talents-gaps.md.
    for (const n of TALENT_CONFIG.nodes.values())
      if (n.ranks.some((r) => r.status === 'blocked')) expect(gapsMarkdown).toContain(n.id);
  });
  it('the loader rejects malformed catalogs', () => {
    const base = TALENT_CATALOG_DATA;
    const nodes = (f: (n: TalentCatalogData['nodes'][number]) => object) =>
      ({
        ...base,
        nodes: base.nodes.map((n, i) => (i === 0 ? { ...n, ...f(n) } : n)),
      }) as TalentCatalogData;
    const bad: TalentCatalogData[] = [
      { ...base, nodes: base.nodes.slice(1) },
      { ...base, nodes: [...base.nodes, base.nodes[0]] },
      nodes(() => ({ id: 'rogue.b1.n09' })),
      nodes((n) => ({ ranks: n.ranks.slice(0, 2) })),
      nodes((n) => ({ ranks: [{ ...n.ranks[0], text: ' ' }, n.ranks[1], n.ranks[2]] })),
      // ready without an effect
      nodes((n) => ({ ranks: [{ ...n.ranks[0], status: 'ready' }, n.ranks[1], n.ranks[2]] })),
      // unknown G/C reference
      nodes((n) => ({ ranks: [{ ...n.ranks[0], refs: ['G99'] }, n.ranks[1], n.ranks[2]] })),
      // unknown status
      nodes((n) => ({
        ranks: [{ ...n.ranks[0], status: 'done' as never }, n.ranks[1], n.ranks[2]],
      })),
      nodes(() => ({ superpower: true })),
      { ...base, branches: base.branches.map((b, i) => (i === 0 ? { ...b, nodeCount: 4 } : b)) },
    ];
    for (const data of bad) expect(() => loadTalentConfig(data)).toThrow(/Invalid talent catalog/);
  });
});
