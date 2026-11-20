import { burstCount } from './caps';
import type { VfxCaps } from './caps';
import { ParticleStore, VfxRandom } from './particles';
import type { Particle, ParticleSpec } from './particles';
import { VFX_TEXTURE_SIZE } from './textures';
import type { VfxTextureKey } from './textures';

/**
 * Task 33: the effect building blocks (pure): flashes, expanding rings, slash arcs, spark / shard
 * bursts, ground decals (runes, cracks), lightning segments and trail puffs. Sizes are world px;
 * every call fills one reusable scratch spec, so spawning allocates nothing.
 */
const S = {} as Particle;
const RESET: Omit<Particle, 'tex' | 'x' | 'y' | 'life'> = Object.freeze({
  color: 0xffffff,
  vx: 0,
  vy: 0,
  drag: 1,
  gravity: 0,
  born: 0,
  s0: 1,
  s1: 1,
  scaleX: 1,
  a0: 1,
  a1: 0,
  rot: 0,
  spin: 0,
  additive: false,
  optional: false,
  originX: 0.5,
});
function spec(tex: VfxTextureKey, x: number, y: number, life: number): Particle {
  Object.assign(S, RESET);
  S.tex = tex;
  S.x = x;
  S.y = y;
  S.life = life;
  return S;
}
/** Display scale for a texture so its width is `px` world px. */
export const scaleFor = (tex: VfxTextureKey, px: number): number => px / VFX_TEXTURE_SIZE[tex][0];

export class VfxEmitter {
  now = 0;
  constructor(
    readonly store: ParticleStore,
    readonly rng = new VfxRandom(),
  ) {}
  get caps(): VfxCaps {
    return this.store.caps;
  }
  private add(p: ParticleSpec): boolean {
    return this.store.spawn(p, this.now);
  }
  private glowy(): boolean {
    return this.store.additive;
  }
  /** A bright soft flash (impact core, crit, cast). */
  flash(x: number, y: number, color: number, size: number, life = 0.14, optional = false): void {
    const p = spec('vfx_glow_soft', x, y, life);
    p.color = color;
    p.s0 = scaleFor('vfx_glow_soft', size * 0.6);
    p.s1 = scaleFor('vfx_glow_soft', size);
    p.a0 = 0.95;
    p.additive = this.glowy();
    p.optional = optional;
    this.add(p);
  }
  /** An expanding ring from `r0` to `r1` (world px radius). */
  ring(
    x: number,
    y: number,
    color: number,
    r0: number,
    r1: number,
    life = 0.32,
    alpha = 0.9,
  ): void {
    const p = spec('vfx_shockwave_ring', x, y, life);
    p.color = color;
    p.s0 = scaleFor('vfx_shockwave_ring', r0 * 2);
    p.s1 = scaleFor('vfx_shockwave_ring', r1 * 2);
    p.a0 = alpha;
    p.additive = this.glowy();
    this.add(p);
  }
  /**
   * A slash arc of radius `r` facing `angle` (the crescent's middle points along it), sweeping a
   * little and fading — the swing's tail.
   */
  arc(
    x: number,
    y: number,
    angle: number,
    r: number,
    color: number,
    life = 0.16,
    flip = false,
  ): void {
    const p = spec('vfx_slash_arc', x, y, life);
    p.color = color;
    p.s0 = scaleFor('vfx_slash_arc', r * 2) * 0.86;
    p.s1 = scaleFor('vfx_slash_arc', r * 2) * 1.05;
    p.scaleX = flip ? -1 : 1;
    p.rot = angle;
    p.spin = flip ? -2.2 : 2.2;
    p.a0 = 1;
    p.additive = this.glowy();
    this.add(p);
  }
  /** Sparks flying outward (impacts): `count` before quality scaling. */
  sparks(
    x: number,
    y: number,
    color: number,
    count: number,
    speed = 160,
    size = 12,
    tex: VfxTextureKey = 'vfx_spark_star',
  ): void {
    const n = burstCount(count, this.caps);
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const v = speed * (0.45 + this.rng.next() * 0.75);
      const p = spec(tex, x, y, 0.22 + this.rng.next() * 0.18);
      p.color = color;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.drag = 0.02;
      p.s0 = scaleFor(tex, size * (0.7 + this.rng.next() * 0.6));
      p.s1 = p.s0 * 0.3;
      p.rot = a;
      p.spin = (this.rng.next() - 0.5) * 8;
      p.additive = this.glowy();
      p.optional = i > 0;
      this.add(p);
    }
  }
  /** Heavier pieces that fall (ice shards, droplets, blood). */
  shards(
    x: number,
    y: number,
    color: number,
    count: number,
    tex: VfxTextureKey,
    size = 14,
    speed = 140,
  ): void {
    const n = burstCount(count, this.caps);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (this.rng.next() - 0.5) * Math.PI * 1.4;
      const v = speed * (0.5 + this.rng.next() * 0.7);
      const p = spec(tex, x, y, 0.35 + this.rng.next() * 0.2);
      p.color = color;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.gravity = 420;
      p.drag = 0.3;
      p.s0 = scaleFor(tex, size);
      p.s1 = p.s0 * 0.7;
      p.rot = a + Math.PI / 2;
      p.spin = (this.rng.next() - 0.5) * 6;
      p.a0 = 0.95;
      p.optional = i > 0;
      this.add(p);
    }
  }
  /** A ground decal under an area (rune circle, cracks, poison pool): fades in place. */
  decal(
    x: number,
    y: number,
    tex: VfxTextureKey,
    color: number,
    radius: number,
    life = 0.5,
    alpha = 0.7,
    spin = 0,
  ): void {
    const p = spec(tex, x, y, life);
    p.color = color;
    p.s0 = scaleFor(tex, radius * 2) * 0.9;
    p.s1 = scaleFor(tex, radius * 2);
    p.a0 = alpha;
    p.spin = spin;
    p.rot = this.rng.next() * Math.PI * 2;
    this.add(p);
  }
  /** Rising puffs over an area (flames, smoke, poison bubbles): `count` before scaling. */
  plume(
    x: number,
    y: number,
    radius: number,
    color: number,
    count: number,
    tex: VfxTextureKey,
    size = 22,
  ): void {
    const n = burstCount(count, this.caps);
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2,
        d = Math.sqrt(this.rng.next()) * radius;
      const p = spec(tex, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.35 + this.rng.next() * 0.25);
      p.color = color;
      p.vy = -40 - this.rng.next() * 40;
      p.vx = (this.rng.next() - 0.5) * 20;
      p.s0 = scaleFor(tex, size * 0.6);
      p.s1 = scaleFor(tex, size * (1 + this.rng.next() * 0.4));
      p.a0 = 0.85;
      p.additive = this.glowy() && tex !== 'vfx_smoke_puff';
      p.optional = i > 0;
      this.add(p);
    }
  }
  /** A lightning segment from (x0, y0) to (x1, y1). */
  bolt(x0: number, y0: number, x1: number, y1: number, color: number, life = 0.12): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 2) return;
    const p = spec('vfx_lightning', x0, y0, life);
    p.color = color;
    p.originX = 0;
    p.s0 = p.s1 = scaleFor('vfx_lightning', 32) * 0.9;
    p.scaleX = len / 32;
    p.rot = Math.atan2(y1 - y0, x1 - x0);
    p.additive = this.glowy();
    this.add(p);
  }
  /**
   * One trail puff behind a moving thing (projectile / bolt), pointing back along `angle`; called
   * per frame per projectile (optional particles: thinned first). Skipped on Low.
   */
  trail(
    x: number,
    y: number,
    angle: number,
    length: number,
    color: number,
    tex: VfxTextureKey = 'vfx_arrow_trail',
  ): void {
    if (!this.store.trails) return;
    const p = spec(tex, x, y, 0.12);
    p.color = color;
    p.originX = 1;
    // The streak keeps its height and stretches to `length`; other textures scale uniformly.
    const streak = tex === 'vfx_arrow_trail';
    p.s0 = p.s1 = streak ? 1 : scaleFor(tex, length);
    p.scaleX = streak ? length / VFX_TEXTURE_SIZE[tex][0] : 1;
    p.rot = angle;
    p.a0 = 0.75;
    p.additive = this.glowy();
    p.optional = true;
    this.add(p);
  }
}
