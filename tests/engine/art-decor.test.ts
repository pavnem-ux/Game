import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseArtManifest } from '../../src/engine/visuals/art-manifest';
import { decorEntriesForAct } from '../../src/engine/visuals/art-registry';
import {
  ARENA,
  TALL_DECOR,
  artDecorLayout,
  decorLayout,
  mapLook,
} from '../../src/engine/visuals/biomes';

/** Task 31: the art decor layout (same seeded spots, tall-prop density and clearance). */
const manifest = parseArtManifest(readFileSync('public/assets/manifest.json', 'utf8'));
const propsOf = (act: 1 | 2 | 3 | 4) =>
  decorEntriesForAct(manifest, act).map((e) => ({ key: e.key, tall: e.decor!.tall }));
const MAPS = [1, 7, 11, 18, 21, 29, 31, 40];

describe('Task 31 — art decor layout', () => {
  it("uses the same seeded spots as the procedural decor, with the act's own props", () => {
    for (const mapId of MAPS) {
      const look = mapLook(mapId);
      const procedural = decorLayout(look, 1);
      const art = artDecorLayout(look, 1, propsOf(look.act));
      expect(art.map((i) => [i.x, i.y, i.scale, i.flip])).toEqual(
        procedural.map((i) => [i.x, i.y, i.scale, i.flip]),
      );
      const own = new Set(propsOf(look.act).map((p) => p.key));
      expect(
        art.every((i) => own.has(i.key)),
        `map ${mapId}`,
      ).toBe(true);
    }
  });
  it('tall props stay ≥ 250 from the spawn centre and appear about half as often', () => {
    let tall = 0,
      naive = 0;
    for (const mapId of MAPS) {
      const look = mapLook(mapId);
      const props = propsOf(look.act);
      const art = artDecorLayout(look, 1, props);
      for (const i of art.filter((x) => x.tall))
        expect(Math.hypot(i.x - ARENA.centre, i.y - ARENA.centre)).toBeGreaterThanOrEqual(
          TALL_DECOR.clearRadius,
        );
      tall += art.filter((x) => x.tall).length;
      // What a plain pick would give: the tall props' share of the act's props.
      naive += (art.length * props.filter((p) => p.tall).length) / props.length;
    }
    expect(tall / naive).toBeGreaterThan(0.35);
    expect(tall / naive).toBeLessThan(0.65);
  });
  it('is deterministic per map and empty without props (procedural decor stays)', () => {
    const look = mapLook(21);
    expect(artDecorLayout(look, 0.6, propsOf(3))).toEqual(artDecorLayout(look, 0.6, propsOf(3)));
    expect(artDecorLayout(look, 1, [])).toEqual([]);
  });
});
