/**
 * Task 25: how owner art is sized, anchored and flipped in a run (pure; no Phaser). Rendering only:
 * hitboxes never change. One table for tuning.
 */

/** Visible body width of a unit ≈ this × its collision radius (players and enemies). */
export const ART_BODY_WIDTH_PER_RADIUS = 2.4;

export interface ArtDisplayTuning {
  /** Extra size factor on top of the radius rule (1 = exactly 2.4 × radius). */
  readonly scale: number;
  /** The image is drawn facing left (it is mirrored so "facing right" stays the convention). */
  readonly facesLeft: boolean;
  /** False: never mirrored (stationary things whose look should not jump). */
  readonly flip: boolean;
}
const DEFAULT_TUNING: ArtDisplayTuning = Object.freeze({ scale: 1, facesLeft: false, flip: true });
/**
 * Per art key tuning (provisional, for the owner to adjust after a playtest). Keys not listed use
 * the defaults. The thief's image runs toward the left; the nest is stationary.
 */
export const ART_DISPLAY: Readonly<Record<string, Partial<ArtDisplayTuning>>> = Object.freeze({
  enemy_treasure_thief: { facesLeft: true },
  nest_blight: { flip: false },
});
/**
 * Task 32: a boss sprite's visible body ≈ this × the boss collision radius (one value, provisional;
 * the boss hitbox never changes). Applied to every `boss_<id>` key through its tuning scale.
 */
export const BOSS_BODY_WIDTH_PER_RADIUS = 2.6;
const BOSS_TUNING: Partial<ArtDisplayTuning> = Object.freeze({
  scale: BOSS_BODY_WIDTH_PER_RADIUS / ART_BODY_WIDTH_PER_RADIUS,
});
export const artTuning = (artKey: string): ArtDisplayTuning =>
  ({
    ...DEFAULT_TUNING,
    ...(artKey.startsWith('boss_') ? BOSS_TUNING : null),
    ...ART_DISPLAY[artKey],
  }) as ArtDisplayTuning;

/** Opaque bounding box of an image in px (inclusive); the whole image if nothing is opaque. */
export interface ArtBounds {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}
/**
 * Bounds of the pixels with alpha > `threshold` in RGBA data (`data.length = width × height × 4`).
 * Used once per image when it loads (the "visible body", independent of transparent padding).
 */
export function visibleBounds(
  data: ArrayLike<number>,
  width: number,
  height: number,
  threshold = 24,
): ArtBounds {
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] <= threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return { width, height, left: 0, right: width - 1, top: 0, bottom: height - 1 };
  return { width, height, left, right, top, bottom };
}

export interface ArtLayout {
  /** Display scale of the image (positive; the flip is applied separately). */
  readonly scale: number;
  /** Phaser origin: horizontal centre of the visible body, bottom of the visible body. */
  readonly originX: number;
  readonly originY: number;
  /** Height of the drawn body above the feet (world px): HP bars and labels go above it. */
  readonly height: number;
}
/** Size and anchor of a unit's art for its collision radius (feet at position.y + radius). */
export function artLayout(bounds: ArtBounds, radius: number, tuning: ArtDisplayTuning): ArtLayout {
  const visibleWidth = bounds.right - bounds.left + 1;
  const visibleHeight = bounds.bottom - bounds.top + 1;
  const scale = (ART_BODY_WIDTH_PER_RADIUS * radius * tuning.scale) / visibleWidth;
  return {
    scale,
    originX: (bounds.left + bounds.right + 1) / 2 / bounds.width,
    originY: (bounds.bottom + 1) / bounds.height,
    height: visibleHeight * scale,
  };
}

/** Facing: 1 = right, -1 = left. Changes only when |dx| exceeds the threshold (no flip jitter). */
export type Facing = 1 | -1;
export function nextFacing(current: Facing, dx: number, threshold: number): Facing {
  if (dx > threshold) return 1;
  if (dx < -threshold) return -1;
  return current;
}
/** Enemies turn toward the player once the horizontal offset exceeds this (world px). */
export const ENEMY_FACING_THRESHOLD = 8;
/** The player turns with the movement input once |input.x| exceeds this (input is −1…1). */
export const PLAYER_FACING_THRESHOLD = 0.2;
/**
 * Loading bar geometry in **canvas pixels** (the graphic is pinned to screen space with
 * `pinToScreen`, which cancels the DPR camera zoom): centred, near the bottom edge, sized in CSS px
 * × zoom so it looks the same at any DPR. `track` is the background, `fill` the progress (0–1).
 */
export function loadingBarRects(
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  p: number,
) {
  const width = Math.min(320 * zoom, canvasWidth * 0.4);
  const x = (canvasWidth - width) / 2;
  const y = canvasHeight - 14 * zoom;
  const h = 4 * zoom;
  const pad = 2 * zoom;
  return {
    track: { x: x - pad, y: y - pad, width: width + pad * 2, height: h + pad * 2 },
    fill: { x, y, width: Math.max(h, width * Math.min(1, Math.max(0, p))), height: h },
  };
}
/** Horizontal mirror sign of the drawn image for a facing (an image facing left is mirrored). */
export const flipSign = (facing: Facing, tuning: ArtDisplayTuning): 1 | -1 =>
  !tuning.flip ? 1 : ((tuning.facesLeft ? -facing : facing) as 1 | -1);

/**
 * Task 26: pickup art sizes from the existing pickup radii (world px, largest visible side; a
 * config table for tuning, provisional). Hit / pickup radii themselves never change.
 *  - XP crystal: 3.6 × the crystal radius (5) = 18;
 *  - coin pile: 2.2 × the pile's drawn radius, which keeps the Task 11 value scaling of merged
 *    piles (`coinPileRadius`, 4–9);
 *  - chest (closed): 2.4 × the chest radius (16) ≈ 38.
 */
export const PICKUP_SIZE_PER_RADIUS = Object.freeze({ crystal: 3.6, coin: 2.2, chest: 2.4 });
/** Drawn radius of a coin pile by value (Task 11 scaling: bigger piles a little larger). */
export const coinPileRadius = (value: number): number => Math.min(9, 4 + Math.log2(value + 1));
export function pickupArtSize(kind: keyof typeof PICKUP_SIZE_PER_RADIUS, radius: number): number {
  return PICKUP_SIZE_PER_RADIUS[kind] * radius;
}

/**
 * Task 31: displayed size (world px, largest side) of the pack-7 activity objects; the open chest
 * uses the closed chest's size. Provisional, for the owner to tune. Rings, progress arcs and the
 * lantern's light radius stay drawn in code on top.
 */
export const OBJECT_ART_SIZE = Object.freeze({ shrine: 96, lantern: 84 });
/** Task 31: how long (s) the open chest stays visible after opening, fading over the last third. */
export const CHEST_OPEN_SHOW = 0.8;
