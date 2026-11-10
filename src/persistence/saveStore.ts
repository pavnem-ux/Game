import { createProfile } from '../profile';
import type { PlayerProfile } from '../profile';
import { parseProfile, parseProfileJson, SaveDataError } from './saveSchema';

/**
 * Task 08 `saveStore`: the only module that touches storage. localStorage today; a cloud adapter
 * can replace it later behind the same `load()` / `save()` contract.
 * - The whole profile is one JSON document under SAVE_KEY.
 * - Before each write the previous VALID snapshot is copied to BACKUP_KEY.
 * - A save that cannot be used (malformed, invalid, newer version) is never overwritten: its raw
 *   text is preserved under QUARANTINE_KEY, the backup is tried, else loading reports an error and
 *   writes are blocked so the original data stays untouched.
 * - Write failures (quota/unavailable) are reported; the caller keeps its in-memory state.
 */
export const SAVE_KEY = 'skazki.profile';
export const BACKUP_KEY = 'skazki.profile.backup';
export const QUARANTINE_KEY = 'skazki.profile.quarantine';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type SaveFailure = 'quota' | 'unavailable' | 'blocked' | 'invalid';
export type SaveResult =
  | { readonly ok: true; readonly profile: PlayerProfile }
  | { readonly ok: false; readonly reason: SaveFailure };
export type LoadResult =
  /** Nothing stored yet: a brand-new profile (written on the first save). */
  | { readonly status: 'new'; readonly profile: PlayerProfile }
  | { readonly status: 'loaded'; readonly profile: PlayerProfile }
  /** Main save unusable; the last valid backup was loaded and the original quarantined. */
  | { readonly status: 'recovered'; readonly profile: PlayerProfile; readonly error: SaveDataError }
  /** Neither the save nor its backup is usable: nothing is overwritten, writes are blocked. */
  | { readonly status: 'error'; readonly profile: null; readonly error: SaveDataError }
  /** Storage cannot be accessed: an in-memory profile only (progress will not persist). */
  | { readonly status: 'unavailable'; readonly profile: PlayerProfile };

export interface SaveStoreOptions {
  /** Storage backend; `undefined` → window.localStorage if accessible. */
  readonly storage?: StorageLike | null;
  /** ISO timestamp source (injected; the simulation never reads it). */
  readonly now?: () => string;
  /** Profile id source for brand-new profiles. */
  readonly newProfileId?: () => string;
}
export interface SaveStore {
  load(): LoadResult;
  save(profile: PlayerProfile): SaveResult;
  /** True after a load error: writes are refused to protect the stored data. */
  readonly writesBlocked: boolean;
  /** Dev tools only (Phase 6): removes the profile, backup and quarantine. */
  clearForDev(): boolean;
}

function browserStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = '__skazki_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
const defaultId = () =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
function failure(error: unknown): SaveFailure {
  const e = error as { name?: string; code?: number } | null;
  return e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)
    ? 'quota'
    : 'unavailable';
}

export function createSaveStore(options: SaveStoreOptions = {}): SaveStore {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? (() => new Date().toISOString());
  const newProfileId = options.newProfileId ?? defaultId;
  let blocked = false;
  const fresh = () => createProfile(newProfileId(), now());
  const read = (key: string): string | null => storage!.getItem(key);

  const store: SaveStore = {
    get writesBlocked() {
      return blocked;
    },
    load(): LoadResult {
      if (!storage) return Object.freeze({ status: 'unavailable', profile: fresh() });
      let main: string | null, backup: string | null;
      try {
        main = read(SAVE_KEY);
        backup = read(BACKUP_KEY);
      } catch {
        return Object.freeze({ status: 'unavailable', profile: fresh() });
      }
      if (main === null) {
        if (backup !== null) {
          const b = parseProfileJson(backup);
          if (b.ok) return Object.freeze({ status: 'loaded', profile: b.profile });
        }
        blocked = false;
        return Object.freeze({ status: 'new', profile: fresh() });
      }
      const m = parseProfileJson(main);
      if (m.ok) {
        blocked = false;
        return Object.freeze({ status: 'loaded', profile: m.profile });
      }
      const b = backup !== null ? parseProfileJson(backup) : null;
      if (b?.ok) {
        // Keep the unusable original before anything can overwrite the main key.
        try {
          if (read(QUARANTINE_KEY) !== main) storage.setItem(QUARANTINE_KEY, main);
        } catch {
          blocked = true;
          return Object.freeze({ status: 'error', profile: null, error: m.error });
        }
        blocked = false;
        return Object.freeze({ status: 'recovered', profile: b.profile, error: m.error });
      }
      blocked = true;
      return Object.freeze({ status: 'error', profile: null, error: m.error });
    },
    save(profile: PlayerProfile): SaveResult {
      if (blocked) return Object.freeze({ ok: false, reason: 'blocked' });
      if (!storage) return Object.freeze({ ok: false, reason: 'unavailable' });
      const stamped = { ...profile, lastSavedAt: now() };
      const checked = parseProfile(stamped);
      if (!checked.ok) return Object.freeze({ ok: false, reason: 'invalid' });
      try {
        const previous = read(SAVE_KEY);
        if (previous !== null && parseProfileJson(previous).ok)
          storage.setItem(BACKUP_KEY, previous);
        storage.setItem(SAVE_KEY, JSON.stringify(checked.profile));
      } catch (error) {
        return Object.freeze({ ok: false, reason: failure(error) });
      }
      return Object.freeze({ ok: true, profile: checked.profile });
    },
    clearForDev(): boolean {
      if (!storage) return false;
      try {
        for (const key of [SAVE_KEY, BACKUP_KEY, QUARANTINE_KEY]) storage.removeItem(key);
        blocked = false;
        return true;
      } catch {
        return false;
      }
    },
  };
  return store;
}
