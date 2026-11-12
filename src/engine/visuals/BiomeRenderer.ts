import Phaser from 'phaser';
import type { Pen } from './art';
import { ARENA, DECOR_KEYS, decorLayout, mapLook } from './biomes';
import type { MapLook } from './biomes';
import { DECOR_ART, DECOR_BASE_Y, DECOR_SIZE, FX_ART, FX_SIZE } from './decor-art';
import { QUALITY_PRESETS } from './quality';
import type { GraphicsQuality } from './quality';
import { renderRandom } from './render-rng';
import { TintCache } from './tint-cache';

/** Task 18 biome layers (all below units except the falling particles). */
export const BIOME_DEPTH = Object.freeze({
  ground: -10,
  features: -7,
  decor: -5,
  fog: 4.7,
  /** Above the darkness (9.5): fireflies, embers and snow read as light. */
  particles: 9.6,
});
const TILE = 256;
const pen = (g: Phaser.GameObjects.Graphics): Pen => g;

/**
 * Task 18: draws a map's biome once (ground tile, paths, signature feature, decor) and animates
 * its ambient particles. Rendering only; the layout comes from the render-only RNG (`biomes.ts`).
 */
export class BiomeRenderer {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private decor: Phaser.GameObjects.Image[] = [];
  private particles: Phaser.GameObjects.Image[] = [];
  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private pv = new Float32Array(0);
  private built: { mapId: number | null; quality: GraphicsQuality } | null = null;
  look: MapLook | null = null;
  private readonly tints: TintCache;
  constructor(private readonly scene: Phaser.Scene) {
    this.tints = new TintCache(scene);
    for (const key of DECOR_KEYS) this.bake(key, DECOR_SIZE, (g) => DECOR_ART[key](pen(g)));
    this.bake('fx-mote', FX_SIZE, (g) => FX_ART.mote(pen(g)));
    this.bake('fx-fog', FX_SIZE, (g) => FX_ART.fog(pen(g)));
  }
  private bake(key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, size, size);
    g.destroy();
  }
  /** Builds the biome of a map (no-op when the same map and quality are already shown). */
  build(mapId: number | null, quality: GraphicsQuality): void {
    if (this.built && this.built.mapId === mapId && this.built.quality === quality) return;
    this.destroy();
    const look = mapLook(mapId);
    this.look = look;
    this.built = { mapId, quality };
    const preset = QUALITY_PRESETS[quality];
    const scene = this.scene;
    // Ground: a tiled procedural texture (noise patches) baked once per map.
    const groundKey = `ground-map-${mapId ?? 0}`;
    this.bake(groundKey, TILE, (g) => this.drawGroundTile(g, look));
    this.keep(
      scene.add
        .tileSprite(0, 0, ARENA.size, ARENA.size, groundKey)
        .setOrigin(0)
        .setDepth(BIOME_DEPTH.ground),
    );
    // Large features drawn once: paths, the map's signature, arena wall and the start ring.
    const f = scene.add.graphics().setDepth(BIOME_DEPTH.features);
    this.keep(f);
    this.drawFeatures(f, look);
    // Decor: baked prop textures scattered by the render seed (density by quality).
    for (const item of decorLayout(look, preset.decorDensity)) {
      const img = scene.add
        .image(item.x, item.y, item.key)
        .setOrigin(0.5, DECOR_BASE_Y)
        .setScale(item.flip ? -item.scale : item.scale, item.scale)
        .setDepth(BIOME_DEPTH.decor);
      this.keep(img);
      this.decor.push(img);
    }
    // Ambient particles (count by quality), positions in fixed arrays.
    const kind = look.biome.particles;
    // Fog uses few large, faint banks; the other kinds are small motes.
    const n = kind === 'fog' ? Math.round(preset.particles / 4) : preset.particles;
    const rand = renderRandom(look.seed ^ 0xf1ea);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = rand() * 2000;
      this.py[i] = rand() * 1400;
      this.pv[i] = rand();
      const fog = kind === 'fog';
      // Fireflies and embers glow (additive); ash motes stay plain grey. Colours are baked.
      const ember = kind === 'ash' && this.pv[i] > 0.66;
      const color = ember ? 0xffa25a : PARTICLE_TINT[kind];
      const img = scene.add
        .image(0, 0, this.tints.get(fog ? 'fx-fog' : 'fx-mote', color))
        .setDepth(fog ? BIOME_DEPTH.fog : BIOME_DEPTH.particles)
        .setScale(fog ? 3 + this.pv[i] * 3 : kind === 'fireflies' ? 0.32 : 0.3);
      if (kind === 'fireflies' || ember) img.setBlendMode(Phaser.BlendModes.ADD);
      if (kind === 'ash') img.setAlpha(ember ? 1 : 0.7);
      this.keep(img);
      this.particles.push(img);
    }
  }
  private keep(o: Phaser.GameObjects.GameObject) {
    this.objects.push(o);
  }
  private drawGroundTile(g: Phaser.GameObjects.Graphics, look: MapLook) {
    const p = look.palette;
    const rand = renderRandom(look.seed ^ 0x6e0d);
    g.fillStyle(p.base).fillRect(0, 0, TILE, TILE);
    // Soft noise patches; wrapped copies keep the tile seamless.
    for (let i = 0; i < 40; i++) {
      const x = rand() * TILE,
        y = rand() * TILE,
        r = 6 + rand() * rand() * 48;
      const color = i % 2 ? p.patchA : p.patchB;
      for (const [dx, dy] of WRAP)
        g.fillStyle(color, 0.1).fillEllipse(x + dx * TILE, y + dy * TILE, r * 2, r * 1.4);
    }
    for (let i = 0; i < 160; i++) {
      const x = rand() * TILE,
        y = rand() * TILE;
      g.fillStyle(i % 3 ? p.patchA : p.patchB, 0.5).fillRect(x, y, rand() * 3 + 1, rand() * 2 + 1);
    }
  }
  private drawFeatures(g: Phaser.GameObjects.Graphics, look: MapLook) {
    const p = look.palette;
    // Paths: a wide soft stroke plus a narrower core.
    for (const path of look.paths) {
      g.lineStyle(46, p.path, 0.18).strokePoints(path as { x: number; y: number }[], false);
      g.lineStyle(26, p.path, 0.32).strokePoints(path as { x: number; y: number }[], false);
    }
    const s = look.signature;
    const rand = renderRandom(look.seed ^ 0x5157);
    const ring = (n: number, r: number, draw: (x: number, y: number, a: number) => void) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.2;
        draw(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, a);
      }
    };
    switch (s.kind) {
      case 'clearing':
        for (let i = 0; i < 6; i++)
          g.fillStyle(0x3a5a34, 0.07).fillCircle(s.x, s.y, s.radius * (1 - i * 0.12));
        break;
      case 'flower-ring':
        g.fillStyle(0x2c4a2e, 0.25).fillCircle(s.x, s.y, s.radius);
        ring(36, s.radius * 0.85, (x, y) =>
          g.fillStyle(rand() < 0.5 ? 0xd8d27a : 0xc8a2ef, 0.85).fillCircle(x, y, 3),
        );
        break;
      case 'bog-lake':
        g.fillStyle(0x08161a, 0.85).fillEllipse(s.x, s.y, s.radius * 2.2, s.radius * 1.4);
        g.lineStyle(2, 0x2a5058, 0.5).strokeEllipse(s.x, s.y, s.radius * 1.6, s.radius * 0.9);
        g.lineStyle(1, 0x3c6a70, 0.35).strokeEllipse(s.x, s.y, s.radius, s.radius * 0.5);
        break;
      case 'barrow-circle':
        g.fillStyle(0x223a30, 0.4).fillCircle(s.x, s.y, s.radius * 0.6);
        ring(9, s.radius * 0.8, (x, y) => {
          g.fillStyle(0x0a0f0e, 0.6).fillEllipse(x + 2, y + 6, 22, 8);
          g.fillStyle(0x56605a).fillRoundedRect(x - 7, y - 22, 14, 26, 5);
        });
        break;
      case 'ruin-circle':
        g.fillStyle(0x3a3638, 0.45).fillCircle(s.x, s.y, s.radius * 0.75);
        g.lineStyle(2, 0x5a5658, 0.5).strokeCircle(s.x, s.y, s.radius * 0.75);
        ring(8, s.radius * 0.75, (x, y) => {
          const h = 10 + rand() * 24;
          g.fillStyle(0x0a0a0c, 0.5).fillEllipse(x + 3, y + 4, 22, 8);
          g.fillStyle(0x6a6460).fillRect(x - 7, y - h, 14, h);
          g.fillStyle(0x7e7874).fillRect(x - 9, y - h - 4, 18, 4);
        });
        break;
      case 'ember-rift': {
        let x = s.x - s.radius,
          y = s.y;
        g.lineStyle(10, 0xff7a3d, 0.12);
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= 10; i++) {
          pts.push({ x, y });
          x += (s.radius * 2) / 10;
          y = s.y + (rand() * 2 - 1) * 28;
        }
        g.strokePoints(pts, false);
        g.lineStyle(3, 0xffb36b, 0.7).strokePoints(pts, false);
        break;
      }
      case 'frozen-lake':
        g.fillStyle(0x9fc8e8, 0.22).fillEllipse(s.x, s.y, s.radius * 2.3, s.radius * 1.5);
        g.lineStyle(2, 0xd8f0ff, 0.35).strokeEllipse(s.x, s.y, s.radius * 2.3, s.radius * 1.5);
        g.lineStyle(1, 0xe8f6ff, 0.45);
        for (let i = 0; i < 7; i++) {
          const a = rand() * Math.PI * 2;
          g.lineBetween(
            s.x,
            s.y,
            s.x + Math.cos(a) * s.radius * 0.9,
            s.y + Math.sin(a) * s.radius * 0.55,
          );
        }
        break;
      case 'ice-ring':
        g.fillStyle(0x223447, 0.4).fillCircle(s.x, s.y, s.radius * 0.7);
        ring(14, s.radius * 0.8, (x, y) => {
          const h = 14 + rand() * 22;
          g.fillStyle(0x7fb8e0, 0.9).fillTriangle(x, y - h, x - 6, y, x + 6, y);
        });
        break;
    }
    // Arena wall and the start ring (kept from the original arena).
    g.lineStyle(2, 0xb0b78a, 0.2)
      .strokeCircle(ARENA.centre, ARENA.centre, 100)
      .strokeCircle(ARENA.centre, ARENA.centre, 110);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      g.lineBetween(
        ARENA.centre + Math.cos(a) * 90,
        ARENA.centre + Math.sin(a) * 90,
        ARENA.centre + Math.cos(a) * 102,
        ARENA.centre + Math.sin(a) * 102,
      );
    }
    g.lineStyle(12, shiftedWall(look)).strokeRect(10, 10, ARENA.size - 20, ARENA.size - 20);
  }
  /**
   * Per frame: cull decor outside the view and move the ambient particles (allocation-free).
   * `time` is presentation time in seconds.
   */
  update(view: Phaser.Geom.Rectangle, time: number, dt: number): void {
    const margin = 140;
    const left = view.x - margin,
      right = view.right + margin,
      top = view.y - margin,
      bottom = view.bottom + margin * 1.6;
    for (const img of this.decor) {
      const on = img.x > left && img.x < right && img.y > top && img.y < bottom;
      if (img.visible !== on) img.setVisible(on);
    }
    const kind = this.look?.biome.particles;
    if (!kind) return;
    const w = view.width + 200,
      h = view.height + 200;
    for (let i = 0; i < this.particles.length; i++) {
      const v = this.pv[i];
      if (kind === 'snow') {
        this.py[i] += (28 + v * 40) * dt;
        this.px[i] += Math.sin(time * 0.8 + v * 9) * 12 * dt;
      } else if (kind === 'ash') {
        // Grey ash falls; a third of the motes are embers rising.
        const ember = v > 0.66;
        this.py[i] += (ember ? -(20 + v * 26) : 14 + v * 20) * dt;
        this.px[i] += Math.sin(time * 0.6 + v * 11) * 10 * dt;
      } else if (kind === 'fog') {
        this.px[i] += (8 + v * 10) * dt;
      } else {
        this.px[i] += Math.cos(time * 0.7 + v * 13) * 14 * dt;
        this.py[i] += Math.sin(time * 0.9 + v * 7) * 12 * dt;
      }
      const x = view.x - 100 + ((((this.px[i] - view.x) % w) + w) % w);
      const y = view.y - 100 + ((((this.py[i] - view.y) % h) + h) % h);
      const img = this.particles[i];
      img.setPosition(x, y);
      if (kind === 'fireflies')
        img.setAlpha(0.1 + 0.7 * Math.max(0, Math.sin(time * 1.3 + v * 20)));
      else if (kind === 'fog') img.setAlpha(0.14 + 0.06 * Math.sin(time * 0.3 + v * 9));
    }
  }
  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.decor = [];
    this.particles = [];
    this.built = null;
  }
}
const WRAP = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;
const PARTICLE_TINT = {
  fireflies: 0xd8f07a,
  fog: 0x9fb8b4,
  ash: 0x8a8686,
  snow: 0xf0f6ff,
} as const;
const shiftedWall = (look: MapLook) => look.palette.patchA;
