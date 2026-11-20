import Phaser from 'phaser';
import { Pool } from '../visuals/pool';
import type { TintCache } from '../visuals/tint-cache';
import { VFX_CAPS } from './caps';
import type { VfxCaps } from './caps';
import { VfxEmitter } from './emitters';
import { ParticleStore, alphaAt, progress, scaleAt } from './particles';
import { buildVfxTextures } from './textures';
import type { VfxTextureKey } from './textures';

/**
 * Task 33 render depth of player VFX: above unit bodies (6), below enemy telegraphs (6.8) and every
 * projectile (7), and far below the darkness / overlay layers.
 */
export const VFX_DEPTH = 6.6;
/** Telegraph layer (enemy / boss danger zones): above player VFX, never thinned. */
export const TELEGRAPH_DEPTH = 6.8;
type Img = Phaser.GameObjects.Image;

/**
 * Task 33: draws the particle store with pooled images. Rendering only: reads its own store, never
 * the world. `begin`/`draw` once per frame; nothing is allocated once the pool has grown.
 */
export class VfxRenderer {
  readonly store: ParticleStore;
  readonly emit: VfxEmitter;
  private readonly pool: Pool<Img>;
  /** Owner art for a key once loaded (art pack), else the generated texture. */
  textureOf: (key: VfxTextureKey) => string = (key) => key;
  private last = 0;
  constructor(
    scene: Phaser.Scene,
    private readonly tints: TintCache,
    caps: VfxCaps = VFX_CAPS.high,
  ) {
    buildVfxTextures(scene);
    this.store = new ParticleStore(VFX_CAPS.high.particles, caps);
    this.emit = new VfxEmitter(this.store);
    this.pool = new Pool(
      () => scene.add.image(0, 0, 'vfx_glow_soft').setDepth(VFX_DEPTH).setVisible(false),
      (img) => {
        if (img.visible) img.setVisible(false);
      },
    );
  }
  setCaps(caps: VfxCaps): void {
    this.store.setCaps(caps);
  }
  /** A new run (or a restart): drop every effect. */
  reset(now = 0): void {
    this.store.clear();
    this.last = now;
    this.emit.now = now;
  }
  /** Sets the effect clock for spawns made this frame (the snapshot time). */
  begin(now: number): void {
    const dt = Math.max(0, Math.min(0.1, now - this.last));
    if (now < this.last) this.store.clear(); // time went back: a new world
    this.last = now;
    this.emit.now = now;
    this.store.update(now, dt);
  }
  /** Draws every live particle (after this frame's spawns). */
  draw(now: number): void {
    const store = this.store;
    const alphaScale = store.alphaScale;
    this.pool.begin();
    for (let i = 0; i < store.count; i++) {
      const p = store.at(i);
      const t = progress(p, now);
      const a = alphaAt(p, t) * alphaScale;
      if (a <= 0.01) continue;
      const base = this.textureOf(p.tex);
      const key = p.color === 0xffffff ? base : this.tints.get(base, p.color);
      const img = this.pool.next();
      if (img.texture.key !== key) img.setTexture(key);
      const s = scaleAt(p, t);
      img
        .setPosition(p.x, p.y)
        .setOrigin(p.originX, 0.5)
        .setRotation(p.rot)
        .setScale(s * p.scaleX, s)
        .setAlpha(Math.min(1, a))
        .setVisible(true);
      const mode = p.additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL;
      if (img.blendMode !== mode) img.setBlendMode(mode);
    }
    this.pool.end();
  }
  get live(): number {
    return this.store.count;
  }
}
