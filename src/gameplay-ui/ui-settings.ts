/**
 * Task 08.5 §5.3 UI settings (presentation preferences only), in their own localStorage key —
 * never part of the progress save. Missing/invalid data falls back to defaults; storage errors
 * keep the setting for this session only.
 */
export const UI_SETTINGS_KEY = 'skazki.settings';
export interface UiSettings {
  /** «Тряска экрана»: camera shake on player hits and boss heavy attacks (default on). */
  readonly screenShake: boolean;
}
export const DEFAULT_UI_SETTINGS: UiSettings = Object.freeze({ screenShake: true });
interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function browserStorage(): SettingsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
export function parseUiSettings(raw: string | null): UiSettings {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return DEFAULT_UI_SETTINGS;
    const s = v as Record<string, unknown>;
    return Object.freeze({
      screenShake:
        typeof s.screenShake === 'boolean' ? s.screenShake : DEFAULT_UI_SETTINGS.screenShake,
    });
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}
export function createUiSettings(storage: SettingsStorage | null = browserStorage()) {
  let current: UiSettings = (() => {
    try {
      return parseUiSettings(storage?.getItem(UI_SETTINGS_KEY) ?? null);
    } catch {
      return DEFAULT_UI_SETTINGS;
    }
  })();
  const listeners = new Set<() => void>();
  return {
    get: (): UiSettings => current,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    /** Updates and persists; returns false if storage refused (kept for this session). */
    set(patch: Partial<UiSettings>): boolean {
      current = Object.freeze({ ...current, ...patch });
      listeners.forEach((fn) => fn());
      try {
        storage?.setItem(UI_SETTINGS_KEY, JSON.stringify(current));
        return !!storage;
      } catch {
        return false;
      }
    },
  };
}
/** App-wide settings instance (read by the scene, edited on the Settings page). */
export const uiSettings = createUiSettings();
