import { useEffect, useState } from 'react';
import type { WorldEvent } from '../gameplay';
import { uiSettings } from './ui-settings';

/**
 * Task 16: touch-device detection (coarse pointer, or the first real touch) and light haptics.
 * Presentation only: haptics read the frame's world events and never feed back.
 */
function coarse(): boolean {
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}
let touched = false;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined')
  window.addEventListener(
    'touchstart',
    () => {
      if (touched) return;
      touched = true;
      listeners.forEach((fn) => fn());
    },
    { passive: true, once: true },
  );
export const isTouchDevice = () => touched || coarse();
/** React: true on touch devices (re-renders when the first touch arrives). */
export function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(isTouchDevice);
  useEffect(() => {
    const update = () => setTouch(isTouchDevice());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return touch;
}
/** One light vibration where supported and enabled (touch devices only). */
export function pulse(ms: number): void {
  if (!uiSettings.get().haptics || !isTouchDevice()) return;
  try {
    globalThis.navigator?.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
/** Scene hook: light haptic on dash and run level-up (same events as sound/VFX). */
export function hapticFrame(events: readonly WorldEvent[]): void {
  for (const e of events) {
    if (e.event.type === 'dash-started') pulse(12);
    else if (e.event.type === 'run-level-up') pulse(25);
  }
}
