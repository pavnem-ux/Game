import Phaser from 'phaser';
import type { Pen } from './art';
import { ARENA, DECOR_KEYS, TALL_DECOR, artDecorLayout, decorLayout, mapLook } from './biomes';
import type { ArtDecorProp, MapLook } from './biomes';
import { DECOR_ART, DECOR_BASE_Y, DECOR_SIZE, FX_ART, FX_SIZE } from './decor-art';
import { QUALITY_PRESETS } from './quality';
import type { GraphicsQuality } from './quality';
import { renderRandom } from './render-rng';
import { TintCache } from './tint-cache';
import { GROUND_TILE_WORLD, groundTint } from './art-ground';

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
/**
 * Task 31: displayed size (world px, largest side) of the art decor props before the seeded scale
 * jitter (0.8–1.25). Provisional, for the owner to tune.
 */
export const DECOR_ART_DISPLAY = Object.freeze({ low: 96, tall: 176 });
/** Task 31: at most this many blockers (live activities + chests) hide nearby tall props. */
const MAX_BLOCKERS = 16;
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
  /** Task 26: the ground tile sprite of the current map and the art texture baked for it. */
  private ground: Phaser.GameObjects.TileSprite | null = null;
  private groundArt: string | null = null;
  /** Task 31: the act's art decor replaced the procedural props (once per map). */
  private decorArt = false;
  /** Tall art props (subset of `decor`) and the blocker points that hide them (x, y pairs). */
  private tall: Phaser.GameObjects.Image[] = [];
  private readonly blockers = new Float32Array(MAX_BLOCKERS * 2);
  private blockerCount = 0;
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
    this.ground = scene.add
      .tileSprite(0, 0, ARENA.size, ARENA.size, groundKey)
      .setOrigin(0)
      .setDepth(BIOME_DEPTH.ground);
    this.keep(this.ground);
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
    const clear2 = TALL_DECOR.clearRadius * TALL_DECOR.clearRadius;
    for (const img of this.decor) {
      let on = img.x > left && img.x < right && img.y > top && img.y < bottom;
      // Task 31: a tall prop never stands over a live activity or chest.
      if (on && img.getData('tall') === true)
        for (let b = 0; b < this.blockerCount; b++) {
          const dx = img.x - this.blockers[b * 2],
            dy = img.y - this.blockers[b * 2 + 1];
          if (dx * dx + dy * dy < clear2) {
            on = false;
            break;
          }
        }
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
  /**
   * Task 26: once the act's ground texture has loaded (`texture` = its Phaser key, null while it
   * is missing), tiles it under everything instead of the procedural ground, tinted with the map's
   * variation (within ±8%). Called every frame; after the first swap it is a single null check.
   */
  /** The art ground texture shown for this map, or null while the procedural ground is used. */
  get artGround(): string | null {
    return this.groundArt;
  }
  /**
   * Task 31: replaces the procedural decor with the act's art props once they have all loaded (same
   * seeded spots, `artDecorLayout`); idempotent per map. Decor stays at `BIOME_DEPTH.decor`, below
   * every unit, pickup, projectile and telegraph; no prop gets a light or glow.
   */
  applyArtDecor(
    props:
      | readonly {
          readonly texture: string;
          readonly entry: {
            readonly key: string;
            readonly width: number;
            readonly height: number;
            readonly decor?: { readonly tall: boolean };
          };
        }[]
      | null,
  ): void {
    if (this.decorArt || !props || !this.look || !this.built) return;
    const byKey = new Map(props.map((p) => [p.entry.key, p]));
    const list: ArtDecorProp[] = props.map((p) => ({
      key: p.entry.key,
      tall: p.entry.decor?.tall === true,
    }));
    const density = QUALITY_PRESETS[this.built.quality].decorDensity;
    for (const img of this.decor) img.destroy();
    this.objects = this.objects.filter((o) => !this.decor.includes(o as Phaser.GameObjects.Image));
    this.decor = [];
    this.tall = [];
    for (const item of artDecorLayout(this.look, density, list)) {
      const prop = byKey.get(item.key)!;
      const size = item.tall ? DECOR_ART_DISPLAY.tall : DECOR_ART_DISPLAY.low;
      const scale = (size * item.scale) / Math.max(prop.entry.width, prop.entry.height);
      const img = this.scene.add
        .image(item.x, item.y, prop.texture)
        .setOrigin(0.5, 1)
        .setScale(item.flip ? -scale : scale, scale)
        .setDepth(BIOME_DEPTH.decor)
        .setData('tall', item.tall);
      this.keep(img);
      this.decor.push(img);
      if (item.tall) this.tall.push(img);
    }
    this.decorArt = true;
  }
  /** Task 31: the points (live activities, chests) tall props keep clear of; at most 16. */
  setDecorBlockers(
    a: readonly { readonly x: number; readonly y: number }[],
    b: readonly { readonly x: number; readonly y: number }[],
  ): void {
    let n = 0;
    for (const list of [a, b])
      for (let i = 0; i < list.length && n < MAX_BLOCKERS; i++, n++) {
        this.blockers[n * 2] = list[i].x;
        this.blockers[n * 2 + 1] = list[i].y;
      }
    this.blockerCount = n;
  }
  /** Number of tall art props on the map (diagnostics / tests). */
  tallDecorCount(): number {
    return this.tall.length;
  }
  applyArtGround(texture: string | null): void {
    if (this.groundArt !== null || texture === null || !this.ground || !this.look) return;
    const tint = groundTint(this.look);
    const key = `${texture}~map${this.built?.mapId ?? 0}`;
    if (!this.scene.textures.exists(key) && !this.bakeTinted(texture, key, tint)) return;
    const src = this.scene.textures.get(key).getSourceImage() as { width: number };
    this.ground.setTexture(key).setTileScale(GROUND_TILE_WORLD / src.width);
    this.groundArt = key;
  }
  /**
   * A copy of `texture` multiplied per channel by `tint` (each 0.92–1.08). The Canvas renderer
   * ignores setTint, so the tint is baked: multiply by tint / max(tint) (darkens), then add the
   * copy onto itself at alpha max(tint) − 1 (brightens multiplicatively). Ground is opaque.
   */
  private bakeTinted(texture: string, key: string, tint: readonly [number, number, number]) {
    const src = this.scene.textures.get(texture).getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };
    const tex = this.scene.textures.createCanvas(key, src.width, src.height);
    if (!tex) return false;
    const ctx = tex.getContext();
    const top = Math.max(1, ...tint);
    const c = (v: number) => Math.round((v / top) * 255);
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${c(tint[0])}, ${c(tint[1])}, ${c(tint[2])})`;
    ctx.fillRect(0, 0, src.width, src.height);
    if (top > 1) {
      const copy = document.createElement('canvas');
      copy.width = src.width;
      copy.height = src.height;
      copy.getContext('2d')!.drawImage(tex.getSourceImage() as HTMLCanvasElement, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = top - 1;
      ctx.drawImage(copy, 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    tex.refresh();
    return true;
  }
  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.ground = null;
    // The baked ground copy belongs to this map (1024² canvas): free it with the map.
    if (this.groundArt && this.scene.textures.exists(this.groundArt))
      this.scene.textures.remove(this.groundArt);
    this.groundArt = null;
    this.decor = [];
    this.tall = [];
    this.decorArt = false;
    this.blockerCount = 0;
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
