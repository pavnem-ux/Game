/**
 * Task 08.5 §5.3 UI settings (presentation preferences only), in their own localStorage key —
 * never part of the progress save. Missing/invalid data falls back to defaults; storage errors
 * keep the setting for this session only.
 */
export const UI_SETTINGS_KEY = 'skazki.settings';
export interface UiSettings {
  /** «Тряска экрана»: camera shake on player hits and boss heavy attacks (default on). */
  readonly screenShake: boolean;
  /** Task 14 sound: «Общая громкость», «Эффекты», «Музыка» (0–100) and «Без звука». */
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly musicVolume: number;
  readonly muted: boolean;
}
export const DEFAULT_UI_SETTINGS: UiSettings = Object.freeze({
  screenShake: true,
  masterVolume: 80,
  sfxVolume: 80,
  musicVolume: 50,
  muted: false,
});
const volume = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(100, Math.max(0, Math.round(v)))
    : fallback;
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
      masterVolume: volume(s.masterVolume, DEFAULT_UI_SETTINGS.masterVolume),
      sfxVolume: volume(s.sfxVolume, DEFAULT_UI_SETTINGS.sfxVolume),
      musicVolume: volume(s.musicVolume, DEFAULT_UI_SETTINGS.musicVolume),
      muted: typeof s.muted === 'boolean' ? s.muted : DEFAULT_UI_SETTINGS.muted,
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
      current = parseUiSettings(JSON.stringify({ ...current, ...patch }));
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
