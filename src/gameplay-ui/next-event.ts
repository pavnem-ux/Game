/**
 * Task 22 §1.1: the single in-run countdown to the nearest scheduled campaign event. Pure:
 * `next` is the world's earliest unfired schedule entry (`campaign.nextEvent`, which already
 * accounts for 2-elite events and the act's elite interval); `now` is simulation time, so the
 * countdown freezes with the world (pause, level-up, death). Hidden when the next entry is the end
 * marker or nothing is scheduled any more (after the map duration).
 */
export interface NextEventCountdown {
  readonly kind: 'elite' | 'boss';
  /** Whole seconds left, rounded up (0:01 until the event fires). */
  readonly seconds: number;
  readonly label: string;
}
export const countdownClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
export function nextEventCountdown(
  next: Readonly<{ kind: 'elite' | 'boss' | 'end'; time: number }> | null | undefined,
  now: number,
): NextEventCountdown | null {
  if (!next || next.kind === 'end' || !Number.isFinite(now)) return null;
  const seconds = Math.max(0, Math.ceil(next.time - now - 1e-9));
  const what = next.kind === 'elite' ? 'Элита' : 'Босс';
  return Object.freeze({
    kind: next.kind,
    seconds,
    label: `${what} через ${countdownClock(seconds)}`,
  });
}
