import type Phaser from 'phaser';
import { ART_BODY_WIDTH_PER_RADIUS, artLayout, artTuning, visibleBounds } from './art-display';
import type { ArtBounds, ArtDisplayTuning } from './art-display';
import { artTextureKey } from './art-registry';

/** Everything needed to draw one art key at one collision radius (cached; never rebuilt). */
export interface ArtDraw {
  readonly texture: string;
  /** Display scale of `texture` (the baked copy), positive. */
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
  /** Body height above the feet (world px). */
  readonly height: number;
  readonly tuning: ArtDisplayTuning;
}

/**
 * Task 25: display-ready copies of the owner's unit art. A 256–384 px image drawn at 30–70 px on
 * every frame is slow on the Canvas renderer and aliases (one big `drawImage` downscale), so each
 * image is baked once per display width into a smaller canvas texture (successive halving with
 * high-quality smoothing), at `BAKE_RESOLUTION` × its world size so it stays sharp at DPR 2.
 * The opaque bounds of each source image are measured once (the "visible body" for sizing).
 * Lookups after the first bake allocate nothing.
 */
export const BAKE_RESOLUTION = 2;
export interface BakedArt {
  readonly texture: string;
  /** Baked size ÷ source size (scale the source layout by 1 / factor to draw the copy). */
  readonly factor: number;
}
type Source = CanvasImageSource & { width: number; height: number };

export class ArtSprites {
  private readonly bounds = new Map<string, ArtBounds>();
  private readonly baked = new Map<string, Map<number, BakedArt>>();
  private readonly draws = new Map<string, Map<number, ArtDraw>>();
  constructor(private readonly scene: Phaser.Scene) {}
  /**
   * Size, anchor and texture of an art key for a collision radius (the visible body ≈ 2.4 × radius
   * wide, feet at the bottom of the body). Built and baked on first use, then a lookup.
   */
  draw(artKey: string, radius: number): ArtDraw {
    let byRadius = this.draws.get(artKey);
    if (!byRadius) {
      byRadius = new Map();
      this.draws.set(artKey, byRadius);
    }
    const known = byRadius.get(radius);
    if (known) return known;
    const tuning = artTuning(artKey);
    const layout = artLayout(this.boundsOf(artKey), radius, tuning);
    const baked = this.get(artKey, ART_BODY_WIDTH_PER_RADIUS * radius * tuning.scale);
    const made: ArtDraw = Object.freeze({
      texture: baked.texture,
      scale: layout.scale / baked.factor,
      originX: layout.originX,
      originY: layout.originY,
      height: layout.height,
      tuning,
    });
    byRadius.set(radius, made);
    return made;
  }
  private source(artKey: string): Source {
    return this.scene.textures.get(artTextureKey(artKey)).getSourceImage() as Source;
  }
  /** Opaque bounds of the source image (measured once per image). */
  boundsOf(artKey: string): ArtBounds {
    let b = this.bounds.get(artKey);
    if (!b) {
      const src = this.source(artKey);
      const canvas = document.createElement('canvas');
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(src, 0, 0);
        b = visibleBounds(
          ctx.getImageData(0, 0, src.width, src.height).data,
          src.width,
          src.height,
        );
      } else
        b = {
          width: src.width,
          height: src.height,
          left: 0,
          right: src.width - 1,
          top: 0,
          bottom: src.height - 1,
        };
      this.bounds.set(artKey, b);
    }
    return b;
  }
  /** A copy whose visible body is `worldWidth × BAKE_RESOLUTION` px wide (cached per px width). */
  get(artKey: string, worldWidth: number): BakedArt {
    const target = Math.max(8, Math.round(worldWidth * BAKE_RESOLUTION));
    let byWidth = this.baked.get(artKey);
    if (!byWidth) {
      byWidth = new Map();
      this.baked.set(artKey, byWidth);
    }
    const known = byWidth.get(target);
    if (known) return known;
    const made = this.bake(artKey, target);
    byWidth.set(target, made);
    return made;
  }
  private bake(artKey: string, target: number): BakedArt {
    const b = this.boundsOf(artKey);
    const factor = target / (b.right - b.left + 1);
    // Never upscale: a copy larger than the source adds nothing.
    if (factor >= 1) return { texture: artTextureKey(artKey), factor: 1 };
    const key = `${artTextureKey(artKey)}@${target}`;
    const full = this.source(artKey);
    const w1 = Math.max(1, Math.round(full.width * factor)),
      h1 = Math.max(1, Math.round(full.height * factor));
    if (!this.scene.textures.exists(key)) {
      let src: Source = full;
      let w = src.width,
        h = src.height;
      // Halve while still more than 2× too big (each step averages 2×2 pixels: no aliasing).
      while (w / 2 >= w1 && h / 2 >= h1) {
        const step = document.createElement('canvas');
        step.width = Math.round(w / 2);
        step.height = Math.round(h / 2);
        const sctx = step.getContext('2d')!;
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(src, 0, 0, w, h, 0, 0, step.width, step.height);
        src = step;
        w = step.width;
        h = step.height;
      }
      const tex = this.scene.textures.createCanvas(key, w1, h1);
      if (!tex) return { texture: artTextureKey(artKey), factor: 1 };
      const ctx = tex.getContext();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, w, h, 0, 0, w1, h1);
      tex.refresh();
    }
    // The real factor of the rounded copy (keeps the visible width exact).
    return { texture: key, factor: w1 / full.width };
  }
}
