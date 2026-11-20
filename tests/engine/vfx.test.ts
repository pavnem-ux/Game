import { describe, expect, it } from 'vitest';
import { VFX_CAPS, burstCount } from '../../src/engine/vfx/caps';
import { VfxEmitter } from '../../src/engine/vfx/emitters';
import { ELEMENT_PALETTE, VFX_ELEMENTS } from '../../src/engine/vfx/palette';
import { ParticleStore, VfxRandom, progress } from '../../src/engine/vfx/particles';
import { VFX_TEXTURE_KEYS, VFX_TEXTURE_SIZE } from '../../src/engine/vfx/textures';
import { parseArtManifest } from '../../src/engine/visuals/art-manifest';
import { ArtRegistry, artUsage } from '../../src/engine/visuals/art-registry';
import { GRAPHICS_QUALITIES } from '../../src/engine/visuals/quality';

/** Task 33 step 1: the VFX library (pure parts). */
describe('Task 33 — VFX textures and palette', () => {
  it('the 14 spec keys, each with a generated size', () => {
    expect([...VFX_TEXTURE_KEYS].sort()).toEqual(
      [
        'vfx_glow_soft',
        'vfx_spark_star',
        'vfx_shockwave_ring',
        'vfx_smoke_puff',
        'vfx_slash_arc',
        'vfx_ice_shard',
        'vfx_flame',
        'vfx_poison_drop',
        'vfx_lightning',
        'vfx_rune_circle',
        'vfx_cracks_ground',
        'vfx_arrow_trail',
        'vfx_blood_splash',
        'vfx_frost_burst',
      ].sort(),
    );
    for (const k of VFX_TEXTURE_KEYS) expect(VFX_TEXTURE_SIZE[k].every((n) => n > 0)).toBe(true);
  });
  it('one palette entry per element', () => {
    expect(VFX_ELEMENTS).toEqual([
      'physical',
      'fire',
      'ice',
      'poison',
      'bleed',
      'lightning',
      'arcane',
    ]);
    for (const e of VFX_ELEMENTS) expect(ELEMENT_PALETTE[e].color).toBeGreaterThan(0);
  });
  it('an owner art pack replaces a generated texture by key only (kind vfx)', () => {
    expect(artUsage('vfx_slash_arc')).toBe('vfx');
    const manifest = parseArtManifest(
      JSON.stringify({
        vfx_slash_arc: {
          file: 'assets/vfx/vfx_slash_arc.webp',
          size: [128, 128],
          anchor: 'center',
          kind: 'vfx',
        },
      }),
    );
    const r = new ArtRegistry(manifest);
    expect(r.sceneEntries().map((e) => e.key)).toContain('vfx_slash_arc');
    expect(r.vfxTexture('vfx_slash_arc')).toBe('vfx_slash_arc'); // not loaded yet
    r.markLoaded('vfx_slash_arc');
    expect(r.vfxTexture('vfx_slash_arc')).toBe('art:vfx_slash_arc');
    expect(r.vfxTexture('vfx_flame')).toBe('vfx_flame'); // not in the pack: generated
  });
});

describe('Task 33 — caps per quality', () => {
  it('High > Medium > Low; Low is minimal (no trails, no additive glow)', () => {
    const [high, medium, low] = GRAPHICS_QUALITIES.map((q) => VFX_CAPS[q]);
    expect(high.particles).toBeGreaterThan(medium.particles);
    expect(medium.particles).toBeGreaterThan(low.particles);
    expect(high.perEffect).toBeGreaterThan(low.perEffect);
    expect([low.trails, low.additive]).toEqual([false, false]);
    for (const q of GRAPHICS_QUALITIES)
      expect(VFX_CAPS[q].thinAbove).toBeLessThan(VFX_CAPS[q].particles);
  });
  it('a burst is scaled by quality, at least 1 and at most the per-effect cap', () => {
    expect(burstCount(12, VFX_CAPS.high)).toBe(12);
    expect(burstCount(12, VFX_CAPS.medium)).toBe(7);
    expect(burstCount(12, VFX_CAPS.low)).toBe(3);
    expect(burstCount(1, VFX_CAPS.low)).toBe(1);
    expect(burstCount(100, VFX_CAPS.high)).toBe(VFX_CAPS.high.perEffect);
    expect(burstCount(0, VFX_CAPS.high)).toBe(0);
  });
  it('the store never exceeds the quality cap, and a lower quality applies at once', () => {
    for (const q of GRAPHICS_QUALITIES) {
      const store = new ParticleStore(VFX_CAPS.high.particles, VFX_CAPS[q]);
      const fx = new VfxEmitter(store);
      for (let i = 0; i < 200; i++) fx.sparks(0, 0, 0xffffff, 12);
      expect(store.count, q).toBe(VFX_CAPS[q].particles);
      expect(store.dropped).toBeGreaterThan(0);
    }
    const store = new ParticleStore(VFX_CAPS.high.particles, VFX_CAPS.high);
    const fx = new VfxEmitter(store);
    for (let i = 0; i < 50; i++) fx.flash(0, 0, 0xffffff, 20);
    store.setCaps(VFX_CAPS.low);
    expect(store.count).toBe(VFX_CAPS.low.particles);
  });
  it('crowds thin out: lower alpha and every other optional particle skipped', () => {
    const caps = VFX_CAPS.medium;
    const store = new ParticleStore(VFX_CAPS.high.particles, caps);
    const fx = new VfxEmitter(store);
    for (let i = 0; i <= caps.thinAbove; i++) fx.flash(0, 0, 0xffffff, 20);
    expect(store.thinned).toBe(true);
    expect(store.alphaScale).toBe(caps.thinAlpha);
    const before = store.count;
    for (let i = 0; i < 10; i++) fx.flash(0, 0, 0xffffff, 20, 0.14, true);
    expect(store.count - before).toBe(5);
  });
  it('Low draws no trails; particles expire and the slots are reused', () => {
    const low = new ParticleStore(VFX_CAPS.high.particles, VFX_CAPS.low);
    new VfxEmitter(low).trail(0, 0, 0, 30, 0xffffff);
    expect(low.count).toBe(0);
    const store = new ParticleStore(8, VFX_CAPS.high);
    const fx = new VfxEmitter(store);
    fx.now = 1;
    fx.flash(0, 0, 0xffffff, 20, 0.1);
    fx.ring(0, 0, 0xffffff, 5, 40, 0.3);
    expect(store.count).toBe(2);
    store.update(1.15, 0.15);
    expect(store.count).toBe(1);
    expect(store.at(0).tex).toBe('vfx_shockwave_ring');
    expect(progress(store.at(0), 1.15)).toBeCloseTo(0.5, 9);
    store.update(1.5, 0.35);
    expect(store.count).toBe(0);
  });
  it('the render RNG is its own repeatable sequence', () => {
    const a = new VfxRandom(42),
      b = new VfxRandom(42);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
