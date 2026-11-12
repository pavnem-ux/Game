import Phaser from 'phaser';
import { ART_SCALE } from './keys';
import type { TextureKey } from './keys';
import { Pool } from './pool';

/** Task 18 render depths (ground graphics stay at 5, overlay HP bars/marks at 8, labels ≥ 10). */
export const DEPTH = Object.freeze({
  items: 3,
  shadows: 4,
  glows: 5.5,
  bodies: 6,
  projectiles: 7,
  overlay: 8,
});
type Img = Phaser.GameObjects.Image;

/**
 * Task 18: pooled sprite rendering of units, items and projectiles (textures from
 * `buildUnitTextures`). Each frame: `begin()`, draw calls, `end()` hides unused sprites. No
 * per-frame allocation once the pools have grown; never touches the simulation.
 */
export class UnitRenderer {
  private readonly shadows: Pool<Img>;
  private readonly bodies: Pool<Img>;
  private readonly flashes: Pool<Img>;
  private readonly glows: Pool<Img>;
  private readonly items: Pool<Img>;
  private readonly projectiles: Pool<Img>;
  private readonly phases = new Map<string, number>();
  glowEnabled = true;
  constructor(scene: Phaser.Scene) {
    const make =
      (key: TextureKey, depth: number, additive = false) =>
      () => {
        const img = scene.add.image(0, 0, key).setDepth(depth).setVisible(false);
        if (additive) img.setBlendMode(Phaser.BlendModes.ADD);
        return img;
      };
    const hide = (img: Img) => {
      if (img.visible) img.setVisible(false);
    };
    this.shadows = new Pool(make('shadow', DEPTH.shadows), hide);
    this.bodies = new Pool(make('enemy-melee', DEPTH.bodies), hide);
    this.flashes = new Pool(make('enemy-melee', DEPTH.bodies), hide);
    this.glows = new Pool(make('glow', DEPTH.glows, true), hide);
    this.items = new Pool(make('crystal', DEPTH.items), hide);
    this.projectiles = new Pool(make('proj-bolt', DEPTH.projectiles), hide);
  }
  begin(): void {
    this.shadows.begin();
    this.bodies.begin();
    this.flashes.begin();
    this.glows.begin();
    this.items.begin();
    this.projectiles.begin();
  }
  end(): void {
    this.shadows.end();
    this.bodies.end();
    this.flashes.end();
    this.glows.end();
    this.items.end();
    this.projectiles.end();
  }
  /** Stable per-entity animation phase (idle bob offset), computed once per id. */
  private phase(id: string): number {
    let p = this.phases.get(id);
    if (p === undefined) {
      p = 0;
      for (let i = 0; i < id.length; i++) p = (p * 31 + id.charCodeAt(i)) % 6283;
      p /= 1000;
      if (this.phases.size > 512) this.phases.clear();
      this.phases.set(id, p);
    }
    return p;
  }
  /**
   * A unit: shadow, optional glow (elite rim / boss aura), body with idle bob and squash on hit,
   * white hit flash overlay. `scale` is the display scale of the texture.
   */
  unit(
    id: string,
    key: TextureKey,
    x: number,
    y: number,
    scale: number,
    time: number,
    flash: number,
    options: { alpha?: number; glow?: number; glowScale?: number; shadowWidth?: number } = {},
  ): void {
    const bob = Math.sin(time * 5 + this.phase(id)) * 1.4;
    const squash = flash > 0 ? flash * 0.16 : 0;
    const alpha = options.alpha ?? 1;
    const sw = (options.shadowWidth ?? 34) / (38 * ART_SCALE);
    this.shadows
      .next()
      .setPosition(x, y + 15 * scale * ART_SCALE)
      .setScale(sw * scale * ART_SCALE, sw * scale * ART_SCALE)
      .setAlpha(alpha)
      .setVisible(true);
    if (options.glow !== undefined && this.glowEnabled) {
      const pulse = 1 + Math.sin(time * 3 + this.phase(id)) * 0.06;
      const gs = (options.glowScale ?? 0.9) * scale * ART_SCALE * pulse;
      this.glows
        .next()
        .setPosition(x, y)
        .setScale(gs)
        .setTint(options.glow)
        .setAlpha(0.75 * alpha)
        .setVisible(true);
    }
    const depth = DEPTH.bodies + y * 1e-5;
    this.bodies
      .next()
      .setTexture(key)
      .setPosition(x, y + bob - squash * 6)
      .setScale(scale * (1 + squash * 0.6), scale * (1 - squash))
      .setAlpha(alpha)
      .setDepth(depth)
      .setVisible(true);
    if (flash > 0)
      this.flashes
        .next()
        .setTexture(key)
        .setTintFill(0xffffff)
        .setPosition(x, y + bob - squash * 6)
        .setScale(scale * (1 + squash * 0.6), scale * (1 - squash))
        .setAlpha(0.65 * flash * alpha)
        .setDepth(depth + 1e-6)
        .setVisible(true);
  }
  /** A ground item (crystal, coin, chest) with an optional gentle hover. */
  item(key: TextureKey, x: number, y: number, scale: number, alpha = 1, hover = 0): void {
    this.items
      .next()
      .setTexture(key)
      .setPosition(x, y - hover)
      .setScale(scale)
      .setAlpha(alpha)
      .setVisible(true);
  }
  /** A projectile rotated along its direction; `tint` colours the white bolt texture. */
  projectile(
    key: TextureKey,
    x: number,
    y: number,
    dx: number,
    dy: number,
    scale: number,
    tint: number | null,
  ): void {
    const img = this.projectiles
      .next()
      .setTexture(key)
      .setPosition(x, y)
      .setRotation(Math.atan2(dy, dx))
      .setScale(scale)
      .setVisible(true);
    if (tint === null) img.clearTint();
    else img.setTint(tint);
  }
  /** A free glow (light halos, auras) — additive, tinted. */
  glow(x: number, y: number, radius: number, color: number, alpha: number): void {
    if (!this.glowEnabled) return;
    this.glows
      .next()
      .setPosition(x, y)
      .setScale(radius / 64)
      .setTint(color)
      .setAlpha(alpha)
      .setVisible(true);
  }
}
