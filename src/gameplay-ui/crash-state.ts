import { BUILD_LABEL } from './build-label';
import { campaignStore } from './campaign-state';
import { recordError } from './error-log';
import type { ErrorEntry, ErrorSource } from './error-log';
import { alphaBridge } from './store';

/**
 * Task 08.5 §3.2 crash state (framework-free). The first error shows the crash screen; the
 * active campaign run is discarded WITHOUT any save write (the save stays exactly as it was).
 */
let crash: ErrorEntry | null = null;
let generation = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export const crashState = {
  get: (): ErrorEntry | null => crash,
  /** Increments on every recovery (remount key). */
  generation: (): number => generation,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Records the error (own key only) and shows the crash screen. Never throws. */
  report(error: unknown, source: ErrorSource): void {
    const entry = recordError(error, source, { build: BUILD_LABEL });
    try {
      campaignStore.discardActiveRun();
    } catch {
      // never let crash handling crash
    }
    if (!crash) {
      crash = entry;
      emit();
    }
  },
  /** «Вернуться в меню»: fresh menu state; the game remounts from scratch. */
  recover(): void {
    crash = null;
    generation++;
    alphaBridge.reset();
    campaignStore.setPage('hub');
    emit();
  },
};

/** Global handlers for errors outside React rendering (game loop, promises). Returns cleanup. */
export function installGlobalErrorHandlers(target: Window = window): () => void {
  const onError = (e: ErrorEvent) => crashState.report(e.error ?? e.message, 'error');
  const onRejection = (e: PromiseRejectionEvent) =>
    crashState.report(e.reason, 'unhandledrejection');
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
