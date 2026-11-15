/**
 * Task 24: off-screen activity pointers. Pure geometry (no Phaser): given the camera's world
 * rectangle and an activity position, where the pointer sits on the screen edge (CSS pixels from
 * the top-left of the view), which way it points and how far the activity is from the player.
 */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface EdgeArrow {
  /** Pointer position in view pixels (0..width, 0..height), inset from the edge. */
  readonly x: number;
  readonly y: number;
  /** Direction from the view centre to the target (radians, 0 = right). */
  readonly angle: number;
  /** World distance from the player to the target. */
  readonly distance: number;
}
/** Null when the target (with `margin` world units around it) is inside the view. */
export function edgeArrow(
  view: ViewRect,
  target: Readonly<{ x: number; y: number }>,
  player: Readonly<{ x: number; y: number }>,
  inset = 34,
  margin = 24,
): EdgeArrow | null {
  if (
    target.x >= view.x - margin &&
    target.x <= view.x + view.width + margin &&
    target.y >= view.y - margin &&
    target.y <= view.y + view.height + margin
  )
    return null;
  const cx = view.x + view.width / 2,
    cy = view.y + view.height / 2;
  const dx = target.x - cx,
    dy = target.y - cy;
  const angle = Math.atan2(dy, dx);
  // Scale the direction until it touches the inset rectangle around the centre.
  const hw = Math.max(1, view.width / 2 - inset),
    hh = Math.max(1, view.height / 2 - inset);
  const t = Math.min(
    dx !== 0 ? hw / Math.abs(dx) : Infinity,
    dy !== 0 ? hh / Math.abs(dy) : Infinity,
  );
  return Object.freeze({
    x: view.width / 2 + dx * t,
    y: view.height / 2 + dy * t,
    angle,
    distance: Math.hypot(target.x - player.x, target.y - player.y),
  });
}
/** Distance label for a pointer: rounded to 10 world units («620»). */
export const arrowDistanceLabel = (distance: number) => String(Math.round(distance / 10) * 10);
