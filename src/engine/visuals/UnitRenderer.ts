import Phaser from 'phaser';
import { ART_SCALE } from './keys';
import type { TextureKey } from './keys';
import { Pool } from './pool';
import { TintCache } from './tint-cache';

/** Task 18 render depths (ground graphics 5, darkness 9.5, overlay HP bars/marks 9.7, labels ≥ 10). */
export const DEPTH = Object.freeze({
  items: 3,
  /** Task 25: ground shadows of owner-art units (procedural textures bake theirs in). */
  shadows: 5.4,
  glows: 5.5,
  /** Units keep the simulation order (no per-frame y-sort: a depth change re-sorts the list). */
  bodies: 6,
  projectiles: 7,
  /** HP bars, marks, stun lines: above the darkness layer (9.5) so they stay readable. */
  overlay: 9.7,
});
type Img = Phaser.GameObjects.Image;
/** setTexture only when it changes (Phaser re-resolves texture + frame on every call). */
const tex = (img: Img, key: string): Img => (img.texture.key === key ? img : img.setTexture(key));

/**
 * Task 18: pooled sprite rendering of units, items and projectiles (textures from
 * `buildUnitTextures`). Each frame: `begin()`, draw calls, `end()` hides unused sprites. No
 * per-frame allocation once the pools have grown; never touches the simulation.
 */
export class UnitRenderer {
  private readonly bodies: Pool<Img>;
  private readonly shadows: Pool<Img>;
  private readonly glows: Pool<Img>;
  private readonly items: Pool<Img>;
  private readonly projectiles: Pool<Img>;
  private readonly phases = new Map<string, number>();
  glowEnabled = true;
  /** Baked coloured copies (the Canvas renderer ignores setTint). */
  readonly tints: TintCache;
  constructor(scene: Phaser.Scene) {
    this.tints = new TintCache(scene);
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
    this.bodies = new Pool(make('enemy-melee', DEPTH.bodies), hide);
    this.shadows = new Pool(make('shadow', DEPTH.shadows), hide);
    this.glows = new Pool(make('glow', DEPTH.glows, true), hide);
    this.items = new Pool(make('crystal', DEPTH.items), hide);
    this.projectiles = new Pool(make('proj-bolt', DEPTH.projectiles), hide);
  }
  /** Camera view (+ margin) of this frame: sprites outside it are not drawn at all. */
  private vx0 = -Infinity;
  private vy0 = -Infinity;
  private vx1 = Infinity;
  private vy1 = Infinity;
  /** Canvas draws every visible sprite (save/restore + drawImage), even off-screen: cull first. */
  setView(view: { x: number; y: number; right: number; bottom: number }, margin = 96): void {
    this.vx0 = view.x - margin;
    this.vy0 = view.y - margin;
    this.vx1 = view.right + margin;
    this.vy1 = view.bottom + margin;
  }
  private outside(x: number, y: number, r: number): boolean {
    return x + r < this.vx0 || x - r > this.vx1 || y + r < this.vy0 || y - r > this.vy1;
  }
  begin(): void {
    this.freeGlows = 0;
    this.bodies.begin();
    this.shadows.begin();
    this.glows.begin();
    this.items.begin();
    this.projectiles.begin();
  }
  end(): void {
    this.bodies.end();
    this.shadows.end();
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
    options: { alpha?: number; glow?: number; glowScale?: number } = {},
  ): void {
    if (this.outside(x, y, 64 * scale * ART_SCALE)) return;
    const bob = Math.sin(time * 5 + this.phase(id)) * 1.4;
    const squash = flash > 0 ? flash * 0.16 : 0;
    const alpha = options.alpha ?? 1;
    // The ground shadow is baked into unit textures (Canvas draws each sprite with save/restore).
    if (options.glow !== undefined && this.glowEnabled) {
      const pulse = 1 + Math.sin(time * 3 + this.phase(id)) * 0.06;
      const gs = (options.glowScale ?? 0.9) * scale * ART_SCALE * pulse;
      tex(this.glows.next(), this.tints.get('glow', options.glow))
        .setPosition(x, y)
        .setScale(gs)
        .setAlpha(0.75 * alpha)
        .setVisible(true);
    }
    // Hit flash: the body itself turns into its baked white silhouette while the flash is strong
    // (one sprite per unit; a second overlay sprite costs a save/restore + drawImage on Canvas).
    const body = flash > 0.45 ? this.tints.get(key, 0xffffff, 'fill') : key;
    tex(this.bodies.next(), body)
      .setOrigin(0.5, 0.5)
      .setPosition(x, y + bob - squash * 6)
      .setScale(scale * (1 + squash * 0.6), scale * (1 - squash))
      .setAlpha(alpha)
      .setVisible(true);
  }
  /**
   * Task 25: a unit drawn with owner art, pinned at its feet (`feetY` = position.y + radius):
   * separate ground shadow, optional glow around the body, body with idle bob, squash on hit
   * (the feet stay planted), white hit-flash silhouette and a horizontal mirror (`flip` = −1).
   * `scale` / `originX` / `originY` / `height` come from `artLayout` (scale already divided by the
   * baked copy's factor); `radius` sizes the shadow. Same feedback as `unit`, different anchor.
   */
  artUnit(
    id: string,
    texture: string,
    x: number,
    feetY: number,
    scale: number,
    originX: number,
    originY: number,
    height: number,
    radius: number,
    flip: 1 | -1,
    time: number,
    flash: number,
    options: { alpha?: number; glow?: number; glowScale?: number } = {},
  ): void {
    const span = Math.max(height, radius * 2.4);
    if (this.outside(x, feetY - height / 2, span * 0.6)) return;
    const bob = Math.sin(time * 5 + this.phase(id)) * 1.4;
    const squash = flash > 0 ? flash * 0.16 : 0;
    const alpha = options.alpha ?? 1;
    // The shadow texture's ellipse is 38 px wide: ≈ 2.2 × radius under the feet.
    tex(this.shadows.next(), 'shadow')
      .setPosition(x, feetY)
      .setScale((radius * 2.2) / 38)
      .setAlpha(alpha)
      .setVisible(true);
    if (options.glow !== undefined && this.glowEnabled) {
      const pulse = 1 + Math.sin(time * 3 + this.phase(id)) * 0.06;
      const gs = ((options.glowScale ?? 0.9) * span * pulse) / 64;
      tex(this.glows.next(), this.tints.get('glow', options.glow))
        .setPosition(x, feetY - height / 2)
        .setScale(gs)
        .setAlpha(0.75 * alpha)
        .setVisible(true);
    }
    const body = flash > 0.45 ? this.tints.get(texture, 0xffffff, 'fill') : texture;
    // The idle bob lifts the body slightly off the ground (never below the feet).
    tex(this.bodies.next(), body)
      .setOrigin(originX, originY)
      .setPosition(x, feetY - Math.abs(bob))
      .setScale(scale * (1 + squash * 0.6) * flip, scale * (1 - squash))
      .setAlpha(alpha)
      .setVisible(true);
  }
  /**
   * A ground item (crystal, coin, chest, pet) with an optional gentle hover. `originY` 1 pins the
   * image at its bottom edge (Task 30 pet art, bottom-centre anchor); pooled images always get their
   * origin set, so a pinned pet never leaks its origin to the next item.
   */
  item(
    key: string,
    x: number,
    y: number,
    scale: number,
    alpha = 1,
    hover = 0,
    flipX: 1 | -1 = 1,
    originY = 0.5,
  ): void {
    if (this.outside(x, y, 40)) return;
    tex(this.items.next(), key)
      .setOrigin(0.5, originY)
      .setPosition(x, y - hover)
      .setScale(scale * flipX, scale)
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
    if (this.outside(x, y, 24)) return;
    tex(this.projectiles.next(), tint === null ? key : this.tints.get(key, tint))
      .setPosition(x, y)
      .setRotation(Math.atan2(dy, dx))
      .setScale(scale)
      .setVisible(true);
  }
  /** Free glows drawn this frame (additive blending is costly on Canvas: capped). */
  private freeGlows = 0;
  static readonly MAX_FREE_GLOWS = 32;
  /** A free glow (light halos, auras) — additive, tinted. */
  glow(x: number, y: number, radius: number, color: number, alpha: number): void {
    if (
      !this.glowEnabled ||
      this.freeGlows >= UnitRenderer.MAX_FREE_GLOWS ||
      this.outside(x, y, radius)
    )
      return;
    this.freeGlows++;
    tex(this.glows.next(), this.tints.get('glow', color))
      .setPosition(x, y)
      .setScale(radius / 64)
      .setAlpha(alpha)
      .setVisible(true);
  }
}
