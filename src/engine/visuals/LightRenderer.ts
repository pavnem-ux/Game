import Phaser from 'phaser';
import { MAX_LIGHTS, QUALITY_PRESETS } from './quality';
import type { GraphicsQuality } from './quality';
import { TintCache } from './tint-cache';

/** Task 18 light layer depth: above units/projectiles (7) and the HP overlay (8), below labels. */
export const LIGHT_DEPTH = 9.5;
/** Darkness colours: the normal night and the boss phase (deeper, redder). */
export const WARM_DARK = 0x04060b;
export const BOSS_DARK = 0x16040a;
const LIGHT_TEX = 'light-radial';
const VIGNETTE_TEX = 'light-vignette';
const LIGHT_SIZE = 256;
const VIGNETTE_SIZE = 512;

/**
 * Task 18 «Последний свет»: a darkness overlay with holes cut by light sources. High/Medium: a
 * reduced-resolution render texture fixed to the screen, filled with darkness each frame and erased
 * with a radial light texture per source (Canvas `destination-out`). Low: one baked radial
 * vignette centred on the player (no per-frame render texture). Rendering only.
 */
export class LightRenderer {
  private rt: Phaser.GameObjects.RenderTexture | null = null;
  private vignette: Phaser.GameObjects.Image | null = null;
  /** Warm additive halo above the darkness (the light's colour; red in boss phase). */
  private halo: Phaser.GameObjects.Image | null = null;
  private quality: GraphicsQuality = 'high';
  private scale = 0.5;
  private count = 0;
  private cam!: Phaser.Cameras.Scene2D.Camera;
  private readonly tints: TintCache;
  constructor(private readonly scene: Phaser.Scene) {
    this.tints = new TintCache(scene);
    this.bakeTextures();
  }
  private bakeTextures() {
    const textures = this.scene.textures;
    if (!textures.exists(LIGHT_TEX)) {
      // Radial light: many faint discs → opaque centre fading to a transparent edge.
      const g = this.scene.make.graphics({}, false);
      const c = LIGHT_SIZE / 2;
      for (let i = 0; i < 28; i++) g.fillStyle(0xffffff, 0.085).fillCircle(c, c, c * (1 - i / 28));
      g.generateTexture(LIGHT_TEX, LIGHT_SIZE, LIGHT_SIZE);
      g.destroy();
    }
    if (!textures.exists(VIGNETTE_TEX)) {
      // Low quality: transparent centre, darkness growing towards the edge (opaque outside).
      const g = this.scene.make.graphics({}, false);
      const c = VIGNETTE_SIZE / 2;
      for (let i = 0; i < 40; i++) {
        const r = c * (0.18 + (i / 40) * 0.82);
        g.lineStyle(c / 40 + 1, 0x000000, Math.min(1, (i / 40) ** 1.6)).strokeCircle(c, c, r);
      }
      g.lineStyle(c * 1.2, 0x000000, 1).strokeCircle(c, c, c * 1.6);
      g.generateTexture(VIGNETTE_TEX, VIGNETTE_SIZE, VIGNETTE_SIZE);
      g.destroy();
    }
  }
  setQuality(quality: GraphicsQuality): void {
    if (quality === this.quality && (this.rt || this.vignette)) return;
    this.quality = quality;
    this.rt?.destroy();
    this.rt = null;
    this.vignette?.destroy();
    this.vignette = null;
    const preset = QUALITY_PRESETS[quality];
    if (preset.lightResolution > 0) {
      this.scale = preset.lightResolution;
      this.rt = this.scene.add
        .renderTexture(0, 0, 8, 8)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(LIGHT_DEPTH);
    } else
      this.vignette = this.scene.add
        .image(0, 0, VIGNETTE_TEX)
        .setScrollFactor(0)
        .setDepth(LIGHT_DEPTH);
  }
  get maxLights(): number {
    return MAX_LIGHTS[this.quality];
  }
  /**
   * Starts a frame: darkness colour/strength and the player's light (screen position from the
   * camera). Returns false when the layer is off (no world / zero darkness).
   */
  begin(
    cam: Phaser.Cameras.Scene2D.Camera,
    darkness: number,
    color: number,
    player: { x: number; y: number; radius: number },
  ): void {
    this.cam = cam;
    this.count = 0;
    this.halo ??= this.scene.add
      .image(0, 0, 'glow')
      .setDepth(LIGHT_DEPTH + 0.05)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.halo
      .setPosition(player.x, player.y)
      .setScale((player.radius * 0.85) / 64)
      .setTexture(this.tints.get('glow', color === WARM_DARK ? 0xffb070 : 0xff5a40))
      .setAlpha(darkness > 0 ? 0.11 + darkness * 0.08 : 0)
      .setVisible(darkness > 0);
    const w = cam.width,
      h = cam.height;
    if (this.rt) {
      const tw = Math.max(8, Math.ceil(w * this.scale)),
        th = Math.max(8, Math.ceil(h * this.scale));
      if (this.rt.width !== tw || this.rt.height !== th) this.rt.setSize(tw, th);
      this.rt.setDisplaySize(w, h).setVisible(darkness > 0);
      this.rt.clear();
      if (darkness > 0) this.rt.fill(color, Math.min(0.95, darkness));
      this.add(player.x, player.y, player.radius, 1);
    } else if (this.vignette) {
      const sx = player.x - cam.worldView.x,
        sy = player.y - cam.worldView.y;
      // The transparent core matches the player light radius; the edge covers the whole screen.
      const scale = (player.radius / (VIGNETTE_SIZE * 0.18)) * 1.15;
      this.vignette
        .setPosition(sx, sy)
        .setScale(Math.max(scale, (Math.hypot(w, h) * 2.2) / VIGNETTE_SIZE))
        .setTexture(this.tints.get(VIGNETTE_TEX, color === WARM_DARK ? 0xffffff : 0xffb0b0))
        .setAlpha(Math.min(0.92, darkness * 1.25))
        .setVisible(darkness > 0);
    }
  }
  /** Cuts a light hole (world position, radius, strength 0–1). Capped per quality. */
  add(x: number, y: number, radius: number, strength: number): void {
    if (!this.rt || this.count >= this.maxLights || strength <= 0) return;
    const cam = this.cam;
    const sx = (x - cam.worldView.x) * this.scale,
      sy = (y - cam.worldView.y) * this.scale;
    const r = radius * this.scale;
    if (sx < -r || sy < -r || sx > this.rt.width + r || sy > this.rt.height + r) return;
    this.count++;
    this.rt.stamp(LIGHT_TEX, undefined, sx, sy, {
      erase: true,
      alpha: Math.min(1, strength),
      scale: (r * 2) / LIGHT_SIZE,
    });
  }
  hide(): void {
    this.halo?.setVisible(false);
    this.rt?.setVisible(false);
    this.vignette?.setVisible(false);
  }
}
