/**
 * Task 18 «Качество графики» (presentation only). PROVISIONAL numbers.
 */
export type GraphicsQuality = 'high' | 'medium' | 'low';
export const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = Object.freeze([
  'high',
  'medium',
  'low',
]);
export interface QualityPreset {
  /** Light/darkness render-texture scale (1 = screen resolution); 0 = cheap gradient mode. */
  readonly lightResolution: number;
  /** Ambient particles on screen. */
  readonly particles: number;
  /** Decor density multiplier. */
  readonly decorDensity: number;
  /** Glow sprites (elite rims, boss aura, light halos). */
  readonly glow: boolean;
  /** Additive glows on every projectile and light source (costly on Canvas: Высокое only). */
  readonly accentGlow: boolean;
  /** Task 16: canvas device-pixel-ratio cap (sharpness vs. pixels to fill). */
  readonly dprCap: number;
  /** Task 16: floating damage numbers on screen at once. */
  readonly damageNumbers: number;
}
export const QUALITY_PRESETS: Readonly<Record<GraphicsQuality, QualityPreset>> = Object.freeze({
  high: Object.freeze({
    lightResolution: 0.5,
    particles: 40,
    decorDensity: 1,
    glow: true,
    accentGlow: true,
    dprCap: 2,
    damageNumbers: 40,
  }),
  medium: Object.freeze({
    lightResolution: 0.25,
    particles: 18,
    decorDensity: 0.55,
    glow: true,
    accentGlow: false,
    dprCap: 1.5,
    damageNumbers: 24,
  }),
  low: Object.freeze({
    lightResolution: 0,
    particles: 10,
    decorDensity: 0.3,
    glow: false,
    accentGlow: false,
    dprCap: 1,
    damageNumbers: 12,
  }),
});
/** Default: Высокое on desktop, Среднее on touch devices. */
export function defaultQuality(touch: boolean): GraphicsQuality {
  return touch ? 'medium' : 'high';
}
export const isGraphicsQuality = (v: unknown): v is GraphicsQuality =>
  v === 'high' || v === 'medium' || v === 'low';
/** Most lights cut per frame (nearest/most important first); the rest only glow. */
export const MAX_LIGHTS: Readonly<Record<GraphicsQuality, number>> = Object.freeze({
  high: 48,
  medium: 24,
  low: 0,
});
