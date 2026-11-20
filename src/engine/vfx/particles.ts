import type { VfxCaps } from './caps';
import type { VfxTextureKey } from './textures';

/**
 * Task 33: the VFX particle store (pure; no Phaser). Every effect — sparks, rings, slash arcs,
 * flashes, shards, trail puffs — is a short-lived particle with a texture, motion and a
 * scale / alpha curve. Fixed capacity (the High cap), swap-remove on expiry: no allocation after
 * construction. Clock = the snapshot's simulation time (effects freeze with the game on pause and
 * follow `advance` in tests); nothing here is ever read by the simulation.
 */
export interface Particle {
  tex: VfxTextureKey;
  /** Baked tint (0xffffff = untinted). */
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Velocity kept per second (1 = no drag, 0.05 = stops quickly). */
  drag: number;
  /** Downward acceleration (world px / s²; shards, droplets). */
  gravity: number;
  born: number;
  life: number;
  /** Display scale at birth / death (linear; `scaleX` multiplies the horizontal axis). */
  s0: number;
  s1: number;
  scaleX: number;
  a0: number;
  a1: number;
  rot: number;
  spin: number;
  additive: boolean;
  /** Optional detail: skipped while the layer is thinned. */
  optional: boolean;
  /** Horizontal origin (0.5 = centred; trails / arcs pin one end). */
  originX: number;
}
/** What `spawn` copies (missing fields take the defaults). */
export type ParticleSpec = Partial<Particle> & Pick<Particle, 'tex' | 'x' | 'y' | 'life'>;

const DEFAULTS: Omit<Particle, 'tex' | 'x' | 'y' | 'life'> = Object.freeze({
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

export class ParticleStore {
  private readonly items: Particle[] = [];
  private n = 0;
  /** Spawns refused (cap reached or thinned) since construction: diagnostics / tests. */
  dropped = 0;
  private skip = false;
  constructor(
    readonly capacity: number,
    private currentCaps: VfxCaps,
  ) {
    for (let i = 0; i < capacity; i++)
      this.items.push({ ...DEFAULTS, tex: 'vfx_glow_soft', x: 0, y: 0, life: 0 });
  }
  get caps(): VfxCaps {
    return this.currentCaps;
  }
  setCaps(caps: VfxCaps): void {
    this.currentCaps = caps;
    // A lower quality takes effect at once: the newest particles beyond the new cap go.
    if (this.n > this.limit) this.n = this.limit;
  }
  get limit(): number {
    return Math.min(this.capacity, this.caps.particles);
  }
  get count(): number {
    return this.n;
  }
  /** More live particles than `thinAbove`: lower alpha, every other optional particle skipped. */
  get thinned(): boolean {
    return this.n > this.caps.thinAbove;
  }
  get alphaScale(): number {
    return this.thinned ? this.caps.thinAlpha : 1;
  }
  get additive(): boolean {
    return this.caps.additive;
  }
  get trails(): boolean {
    return this.caps.trails;
  }
  clear(): void {
    this.n = 0;
  }
  /** Adds a particle born at `now`; false when it was dropped (cap / thinning). */
  spawn(spec: ParticleSpec, now: number): boolean {
    if (spec.optional && this.thinned) {
      this.skip = !this.skip;
      if (this.skip) {
        this.dropped++;
        return false;
      }
    }
    if (this.n >= this.limit) {
      this.dropped++;
      return false;
    }
    const p = this.items[this.n++];
    Object.assign(p, DEFAULTS, spec);
    p.born = now;
    return true;
  }
  /** Advances motion by `dt` and removes particles whose life has ended at `now`. */
  update(now: number, dt: number): void {
    for (let i = 0; i < this.n; ) {
      const p = this.items[i];
      if (now - p.born >= p.life || now < p.born) {
        // Swap-remove (order does not matter: depth is per layer).
        const lastIndex = --this.n;
        this.items[i] = this.items[lastIndex];
        this.items[lastIndex] = p;
        continue;
      }
      if (dt > 0) {
        const k = p.drag === 1 ? 1 : p.drag ** dt;
        p.vx *= k;
        p.vy = p.vy * k + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
      i++;
    }
  }
  /** Live particles (read-only use; valid until the next spawn / update). */
  at(i: number): Particle {
    return this.items[i];
  }
}

/** 0–1 progress of a particle at `now`. */
export const progress = (p: Particle, now: number): number =>
  p.life > 0 ? Math.min(1, Math.max(0, (now - p.born) / p.life)) : 1;
export const scaleAt = (p: Particle, t: number): number => p.s0 + (p.s1 - p.s0) * t;
export const alphaAt = (p: Particle, t: number): number => p.a0 + (p.a1 - p.a0) * t;

/**
 * A small render-only random sequence (never the simulation's seeded streams). Seeded per scene so
 * the same frames draw the same sparks in tests.
 */
export class VfxRandom {
  private s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}
