import { useEffect, useState } from 'react';
import { alphaBridge } from './store';
import { RU } from './strings-ru';
import { useTouchDevice } from './touch';

/**
 * Task 16 device helpers (presentation only): the portrait-phone notice during a run (pauses the
 * run while shown) and the fullscreen toggle where the Fullscreen API exists (incl. Safari prefix).
 */
const PORTRAIT_PHONE = '(orientation: portrait) and (max-width: 600px)';
function useMedia(query: string): boolean {
  const get = () => {
    try {
      return globalThis.matchMedia?.(query).matches ?? false;
    } catch {
      return false;
    }
  };
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const list = globalThis.matchMedia?.(query);
    if (!list) return;
    const update = () => setMatch(list.matches);
    list.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      list.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, [query]);
  return match;
}
/** «Поверните устройство»: shown during a run on a portrait phone; the run pauses meanwhile. */
export function OrientationNotice({ inRun, playing }: { inRun: boolean; playing: boolean }) {
  const portrait = useMedia(PORTRAIT_PHONE);
  // Phones only: a narrow desktop window keeps playing in any shape.
  const touch = useTouchDevice();
  const show = inRun && portrait && touch;
  useEffect(() => {
    if (show && playing) alphaBridge.send({ type: 'pause' });
  }, [show, playing]);
  if (!show) return null;
  return (
    <div
      className="rotate-notice"
      role="alertdialog"
      aria-live="assertive"
      aria-label={RU.device.rotate}
    >
      <div className="rotate-icon" aria-hidden="true">
        ⟳
      </div>
      <strong>{RU.device.rotate}</strong>
      <span>{RU.device.rotateHint}</span>
    </div>
  );
}
type FullscreenDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const fsDoc = () => document as FullscreenDoc;
export const fullscreenSupported = () =>
  typeof document !== 'undefined' &&
  !!(fsDoc().fullscreenEnabled || fsDoc().webkitFullscreenEnabled);
const fullscreenActive = () => !!(fsDoc().fullscreenElement || fsDoc().webkitFullscreenElement);
/** Fullscreen toggle (hidden where the API does not exist, e.g. iPhone Safari). */
export function FullscreenButton() {
  const [active, setActive] = useState(fullscreenActive);
  useEffect(() => {
    const update = () => setActive(fullscreenActive());
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);
  if (!fullscreenSupported()) return null;
  const toggle = async () => {
    try {
      if (fullscreenActive())
        await (document.exitFullscreen?.() ?? fsDoc().webkitExitFullscreen?.());
      else {
        const el = document.documentElement as FullscreenEl;
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      /* refused by the browser: stay windowed */
    }
  };
  return (
    <button
      type="button"
      className="icon-button fullscreen-button"
      aria-label={active ? RU.device.exitFullscreen : RU.device.fullscreen}
      aria-pressed={active}
      onClick={() => void toggle()}
    >
      {active ? '⤡' : '⤢'}
    </button>
  );
}
/** Blocks pinch-zoom (iOS `gesture*`) and multi-finger page moves while a run is on screen. */
export function useBlockGestures(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const stop = (e: Event) => e.preventDefault();
    const multi = (e: TouchEvent) => {
      if (e.touches.length > 1 && e.target instanceof HTMLCanvasElement) e.preventDefault();
    };
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    document.addEventListener('touchmove', multi, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('gesturechange', stop);
      document.removeEventListener('touchmove', multi);
    };
  }, [active]);
}
