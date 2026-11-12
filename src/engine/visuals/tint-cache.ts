import type Phaser from 'phaser';

/**
 * Task 18: coloured copies of textures, baked once per (texture, colour). The alpha runs on
 * Phaser's Canvas renderer, which ignores `setTint` / `setTintFill`; a baked copy looks the same in
 * Canvas and WebGL. `mode`: 'tint' multiplies the colour (like WebGL tint) and keeps the alpha;
 * 'fill' paints a solid silhouette (hit flash). Lookups after the first bake allocate nothing.
 */
export class TintCache {
  private readonly keys = new Map<string, Map<number, string>>();
  constructor(private readonly scene: Phaser.Scene) {}
  get(base: string, color: number, mode: 'tint' | 'fill' = 'tint'): string {
    const id = mode === 'fill' ? `${base}!fill` : base;
    let byColor = this.keys.get(id);
    if (!byColor) {
      byColor = new Map();
      this.keys.set(id, byColor);
    }
    const known = byColor.get(color);
    if (known) return known;
    const key = `${id}#${color.toString(16).padStart(6, '0')}`;
    if (!this.scene.textures.exists(key)) this.bake(base, key, color, mode);
    byColor.set(color, key);
    return key;
  }
  private bake(base: string, key: string, color: number, mode: 'tint' | 'fill') {
    const src = this.scene.textures.get(base).getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };
    const tex = this.scene.textures.createCanvas(key, src.width, src.height);
    if (!tex) return;
    const ctx = tex.getContext();
    const css = `#${color.toString(16).padStart(6, '0')}`;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = mode === 'fill' ? 'source-atop' : 'multiply';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, src.width, src.height);
    if (mode === 'tint') {
      // Multiply also paints transparent pixels: keep only the original shape's alpha.
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(src, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
    tex.refresh();
  }
}
