import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import {
  ArtManifestError,
  duplicateTopLevelKeys,
  parseArtManifest,
} from '../../src/engine/visuals/art-manifest';
import {
  ArtRegistry,
  CURRENCY_ART,
  GROUND_ART,
  PICKUP_ART,
  UNIT_ART,
  artTextureKey,
  artUsage,
  portraitArtKey,
} from '../../src/engine/visuals/art-registry';
import { TEXTURE_KEYS } from '../../src/engine/visuals/keys';

/** Task 25 Phase 1: the owner's art pack, its manifest and the registry with procedural fallback. */
const PUBLIC = 'public';
const text = readFileSync(join(PUBLIC, 'assets/manifest.json'), 'utf8');
const manifest = parseArtManifest(text);

/** Width × height of a WebP file (VP8 lossy, VP8L lossless or VP8X extended header). */
function webpSize(buf: Buffer): [number, number] {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}
const entry = (key: string, extra: Record<string, unknown> = {}) => ({
  file: `assets/enemies/${key}.webp`,
  size: [256, 256],
  anchor: 'bottom-center',
  ...extra,
});

describe('Task 25 — art pack 1 files and manifest', () => {
  it('26 entries (pack 1: 17, pack 2: 9); every file exists and has the manifest size', () => {
    expect(manifest.size).toBe(26);
    for (const e of manifest.values()) {
      const buf = readFileSync(join(PUBLIC, e.file));
      expect(webpSize(buf), e.key).toEqual([e.width, e.height]);
    }
  });
  it('every image under public/assets has a manifest entry (nothing unlisted)', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(webp|png)$/.test(name)) files.push(p.slice(PUBLIC.length + 1));
      }
    };
    walk(join(PUBLIC, 'assets'));
    expect(files.sort()).toEqual([...manifest.values()].map((e) => e.file).sort());
  });
  it('the whole art set stays under 2 MB (Task 26 budget; pack 1 alone was < 1 MB)', () => {
    let total = statSync(join(PUBLIC, 'assets/manifest.json')).size;
    for (const e of manifest.values()) total += statSync(join(PUBLIC, e.file)).size;
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });
  it('no duplicate keys in the manifest text', () => {
    expect(duplicateTopLevelKeys(text)).toEqual([]);
    const dup = `{"enemy_melee": ${JSON.stringify(entry('enemy_melee'))}, "enemy_melee": ${JSON.stringify(entry('enemy_melee'))}}`;
    expect(duplicateTopLevelKeys(dup)).toEqual(['enemy_melee']);
    expect(() => parseArtManifest(dup)).toThrow(/duplicate key "enemy_melee"/);
    // Keys nested inside entries, or inside strings, are not top-level keys.
    expect(duplicateTopLevelKeys('{"a": {"file": "x", "b": {"file": "y"}}, "c": "a\\"b"}')).toEqual(
      [],
    );
  });
  it('every manifest key resolves to a use in this build', () => {
    for (const key of manifest.keys()) expect(artUsage(key), key).not.toBeNull();
    for (const art of Object.values(UNIT_ART)) expect(manifest.has(art!), art).toBe(true);
    for (const c of CHARACTER_CLASSES) {
      const p = manifest.get(portraitArtKey(c));
      expect(p?.anchor, c).toBe('center');
    }
    // Unit art is pinned at the feet.
    for (const art of Object.values(UNIT_ART))
      expect(manifest.get(art!)!.anchor).toBe('bottom-center');
  });
});

describe('Task 25 — manifest validation', () => {
  const parse = (obj: unknown) => () => parseArtManifest(JSON.stringify(obj));
  it('rejects a file name that does not match the key, bad sizes, anchors and paths', () => {
    expect(parse({ enemy_melee: entry('enemy_ranged') })).toThrow(/does not match the key/);
    expect(parse({ a: entry('a', { size: [0, 10] }) })).toThrow(/size/);
    expect(parse({ a: entry('a', { size: [4096, 10] }) })).toThrow(/size/);
    expect(parse({ a: entry('a', { anchor: 'top' }) })).toThrow(/anchor/);
    expect(parse({ a: entry('a', { file: '../a.webp' }) })).toThrow(/file/);
    expect(parse({ a: entry('a', { file: 'https://cdn.example/a.webp' }) })).toThrow(/file/);
    expect(parse({ 'Bad-Key': entry('a') })).toThrow(/key/);
    expect(parse([entry('a')])).toThrow(/JSON object/);
    expect(() => parseArtManifest('{not json')).toThrow(ArtManifestError);
  });
  it('lists every problem at once and accepts extra fields', () => {
    try {
      parseArtManifest(JSON.stringify({ a: entry('b'), c: entry('c', { anchor: 'x' }) }));
      expect.unreachable();
    } catch (e) {
      expect((e as ArtManifestError).problems).toHaveLength(2);
    }
    const ok = parseArtManifest(JSON.stringify({ a: entry('a', { source: 'owner' }) }));
    expect(ok.get('a')).toEqual({
      key: 'a',
      file: 'assets/enemies/a.webp',
      width: 256,
      height: 256,
      anchor: 'bottom-center',
      kind: null, // no `kind` field (pack 1 style)
    });
  });
});

describe('Task 25 — registry with procedural fallback', () => {
  it('a look uses its art only once the image has loaded', () => {
    const r = new ArtRegistry(manifest);
    expect(r.texture('enemy-melee')).toBe('enemy-melee');
    expect(r.art('enemy-melee')).toBeNull();
    r.markLoaded('enemy_melee');
    expect(r.texture('enemy-melee')).toBe('art:enemy_melee');
    expect(r.art('enemy-melee')?.anchor).toBe('bottom-center');
  });
  it('a key missing from the manifest keeps the procedural texture (partial packs work)', () => {
    const partial = new Map(manifest);
    partial.delete('enemy_swift_imp');
    const r = new ArtRegistry(partial);
    for (const art of new Set(Object.values(UNIT_ART))) r.markLoaded(art!);
    expect(r.texture('enemy-swift')).toBe('enemy-swift');
    expect(r.texture('enemy-brute')).toBe('art:enemy_stone_troll');
    // An empty registry (no manifest / before it loads) is all procedural.
    const empty = new ArtRegistry(new Map());
    for (const key of TEXTURE_KEYS) expect(empty.texture(key)).toBe(key);
  });
  it('bosses, items and projectiles keep their procedural art', () => {
    const r = new ArtRegistry(manifest);
    for (const art of manifest.keys()) r.markLoaded(art);
    // Task 26 gives crystals, coins and chests art; these still have none.
    for (const key of ['boss', 'proj-bolt', 'proj-arrow', 'shadow', 'glow', 'pet-fox'] as const)
      expect(r.texture(key)).toBe(key);
  });
  it('maps every class, enemy kind, elite profile and the Task 24 thief / nest', () => {
    const r = new ArtRegistry(manifest);
    for (const art of manifest.keys()) r.markLoaded(art);
    const expected: Record<string, string> = {
      'player-warrior': 'player_warrior',
      'player-mage': 'player_mage',
      'player-archer': 'player_archer',
      'player-rogue': 'player_rogue',
      'enemy-melee': 'enemy_melee',
      'enemy-ranged': 'enemy_ranged',
      'enemy-swift': 'enemy_swift_imp',
      'enemy-brute': 'enemy_stone_troll',
      'enemy-bombard': 'enemy_bombard_warlock',
      'elite-melee': 'elite_savage_brute',
      'elite-ranged': 'elite_dark_conjurer',
      'activity-thief': 'enemy_treasure_thief',
      'activity-nest': 'nest_blight',
    };
    for (const [look, art] of Object.entries(expected))
      expect(r.texture(look as never), look).toBe(artTextureKey(art));
    expect(r.unitEntries()).toHaveLength(13);
  });
  it('art texture keys never collide with procedural keys', () => {
    for (const art of manifest.keys())
      expect((TEXTURE_KEYS as readonly string[]).includes(artTextureKey(art))).toBe(false);
  });
});

describe('Task 26 — pack 2 kinds: ground and pickup', () => {
  it('every pack-2 key resolves, and its declared kind matches how this build uses it', () => {
    let declared = 0;
    for (const e of manifest.values()) {
      if (e.kind === null) continue;
      declared++;
      expect(artUsage(e.key), e.key).toBe(e.kind);
    }
    expect(declared).toBe(9);
    for (const art of [...Object.values(PICKUP_ART), ...Object.values(GROUND_ART)])
      expect(manifest.has(art!), art).toBe(true);
    for (const art of Object.values(CURRENCY_ART)) expect(manifest.has(art), art).toBe(true);
    for (const art of Object.values(GROUND_ART)) expect(manifest.get(art)!.anchor).toBe('tile');
  });
  it('maps each act to its ground and each pickup look to its art once loaded', () => {
    const r = new ArtRegistry(manifest);
    expect([1, 2, 3, 4].map((a) => r.ground(a as 1 | 2 | 3 | 4))).toEqual([null, null, null, null]);
    for (const art of manifest.keys()) r.markLoaded(art);
    expect([1, 2, 3, 4].map((a) => r.ground(a as 1 | 2 | 3 | 4))).toEqual([
      'art:ground_forest',
      'art:ground_marsh',
      'art:ground_ashlands',
      'art:ground_frost',
    ]);
    expect(r.texture('crystal')).toBe('art:xp_crystal');
    expect(r.texture('coin')).toBe('art:coin');
    expect(r.texture('chest-wooden')).toBe('art:chest_wooden');
    expect(r.texture('chest-enchanted')).toBe('art:chest_enchanted');
    expect(r.loadedLooks()).toBe(17);
    expect(r.loadedGrounds()).toBe(4);
    // The scene loads units, pickups and grounds; portraits and the UI-only ore stay DOM images.
    const scene = r.sceneEntries().map((e) => e.key);
    expect(scene).toHaveLength(21);
    expect(scene).not.toContain('ore');
    expect(scene.some((k) => k.startsWith('portrait_'))).toBe(false);
  });
  it('a missing ground or pickup key keeps the procedural look', () => {
    const partial = new Map(manifest);
    partial.delete('ground_marsh');
    partial.delete('coin');
    const r = new ArtRegistry(partial);
    for (const art of partial.keys()) r.markLoaded(art);
    expect(r.ground(2)).toBeNull();
    expect(r.ground(1)).toBe('art:ground_forest');
    expect(r.texture('coin')).toBe('coin');
    expect(r.texture('crystal')).toBe('art:xp_crystal');
  });
  it('validation: "tile" only with kind "ground"; unknown kinds rejected', () => {
    const ground = (extra: Record<string, unknown>) =>
      JSON.stringify({
        ground_x: { file: 'assets/ground/ground_x.webp', size: [1024, 1024], ...extra },
      });
    expect(() => parseArtManifest(ground({ anchor: 'tile', kind: 'ground' }))).not.toThrow();
    expect(() => parseArtManifest(ground({ anchor: 'tile' }))).toThrow(/tile/);
    expect(() => parseArtManifest(ground({ anchor: 'center', kind: 'ground' }))).toThrow(/tile/);
    expect(() => parseArtManifest(ground({ anchor: 'tile', kind: 'decal' }))).toThrow(/kind/);
  });
});
