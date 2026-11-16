/**
 * Task 16 touch input (pure; presentation-side). The floating joystick's offset becomes the same
 * movement vector the keyboard produces, and both go through `GameplayWorld.setMovement` before the
 * frame's `update` — the world samples it at its fixed input steps, so touch and keyboard share one
 * deterministic input path. PROVISIONAL numbers.
 */
export const JOYSTICK = Object.freeze({
  /** Full speed this many CSS px from the origin. */
  radius: 60,
  /** Offsets below this share of the radius are ignored. */
  deadZone: 0.1,
});
export interface Vector {
  readonly x: number;
  readonly y: number;
}
const ZERO: Vector = Object.freeze({ x: 0, y: 0 });
/**
 * Joystick offset (px) → movement vector: 0 inside the dead zone, then rising linearly to length 1
 * at `radius` and clamped beyond it. Direction is the offset's direction.
 */
export function joystickVector(dx: number, dy: number, rules = JOYSTICK): Vector {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return ZERO;
  const length = Math.hypot(dx, dy);
  const dead = rules.deadZone * rules.radius;
  if (length <= dead) return ZERO;
  const magnitude = Math.min(1, (length - dead) / (rules.radius - dead));
  return Object.freeze({ x: (dx / length) * magnitude, y: (dy / length) * magnitude });
}
/** Keyboard axes (−1 / 0 / 1 each) → movement vector, normalised like the world does. */
export function keyboardVector(right: boolean, left: boolean, down: boolean, up: boolean): Vector {
  const x = Number(right) - Number(left),
    y = Number(down) - Number(up);
  const length = Math.hypot(x, y);
  return length > 0 ? Object.freeze({ x: x / length, y: y / length }) : ZERO;
}
/** The frame's movement: an active joystick outside its dead zone wins over the keyboard. */
export function movementInput(keys: Vector, stick: { active: boolean; dx: number; dy: number }) {
  if (!stick.active) return keys;
  const v = joystickVector(stick.dx, stick.dy);
  return v.x === 0 && v.y === 0 ? keys : v;
}
/** «Left-handed»: the joystick zone is the right half and the dash button sits on the left. */
export function inJoystickZone(
  x: number,
  y: number,
  width: number,
  height: number,
  leftHanded: boolean,
): boolean {
  const side = leftHanded ? x > width / 2 : x < width / 2;
  return side && y > height * 0.3;
}
