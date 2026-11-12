/**
 * Task 16: device-pixel-ratio rendering. The game canvas is CSS size × DPR and the main camera is
 * zoomed by DPR, so the world looks the same, only sharper. Screen-space objects (scrollFactor 0:
 * joystick, hit vignette, light map) are still affected by camera zoom around the camera origin;
 * these helpers cancel that so they can be drawn in canvas pixels.
 */
export interface CameraLike {
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
}
interface Pinnable {
  setScale(x: number, y?: number): unknown;
  setPosition(x: number, y: number): unknown;
}
/** World position that lands on canvas pixel (sx, sy) for a scrollFactor-0 object. */
export function screenToZoomed(cam: CameraLike, sx: number, sy: number) {
  const ox = cam.width * cam.originX,
    oy = cam.height * cam.originY;
  return { x: (sx - ox) / cam.zoom + ox, y: (sy - oy) / cam.zoom + oy };
}
/** Pins a scrollFactor-0 object whose own coordinates are canvas pixels (scale 1 = 1 pixel). */
export function pinToScreen(obj: Pinnable, cam: CameraLike, scale = 1): void {
  const p = screenToZoomed(cam, 0, 0);
  obj.setScale(scale / cam.zoom);
  obj.setPosition(p.x, p.y);
}
/** DPR used for the canvas: device ratio capped (≥ 1). */
export const effectiveDpr = (deviceRatio: number, cap: number) =>
  Math.max(1, Math.min(Number.isFinite(deviceRatio) ? deviceRatio : 1, cap));
