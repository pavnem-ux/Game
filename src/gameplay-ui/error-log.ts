/**
 * Task 08.5 §3.2 error log: the last 5 errors in their own localStorage key. It never reads or
 * writes the save keys and never throws (a broken or full storage just keeps nothing).
 */
export const ERROR_LOG_KEY = 'skazki.errors';
export const MAX_ERROR_ENTRIES = 5;
const MAX_MESSAGE = 500;
const MAX_STACK = 2000;
export type ErrorSource = 'render' | 'error' | 'unhandledrejection';
export interface ErrorEntry {
  readonly time: string;
  readonly source: ErrorSource;
  readonly message: string;
  readonly stack: string | null;
  readonly build: string;
}
export interface ErrorLogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
function browserStorage(): ErrorLogStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
const SOURCES: readonly ErrorSource[] = ['render', 'error', 'unhandledrejection'];
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);
function entryFrom(raw: unknown): ErrorEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const time = text(v.time, 64);
  const message = text(v.message, MAX_MESSAGE);
  const build = text(v.build, 64);
  if (!time || message === null || build === null) return null;
  if (!SOURCES.includes(v.source as ErrorSource)) return null;
  return Object.freeze({
    time,
    source: v.source as ErrorSource,
    message,
    stack: text(v.stack, MAX_STACK),
    build,
  });
}
/** Stored errors, oldest first; invalid entries are skipped. */
export function readErrors(storage = browserStorage()): readonly ErrorEntry[] {
  try {
    const raw = storage?.getItem(ERROR_LOG_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return Object.freeze([]);
    return Object.freeze(
      list
        .map(entryFrom)
        .filter((e): e is ErrorEntry => e !== null)
        .slice(-MAX_ERROR_ENTRIES),
    );
  } catch {
    return Object.freeze([]);
  }
}
/** Normalises any thrown value into an entry and keeps the last 5. Never throws. */
export function recordError(
  error: unknown,
  source: ErrorSource,
  options: { storage?: ErrorLogStorage | null; now?: () => string; build?: string } = {},
): ErrorEntry {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  let time: string;
  try {
    time = (options.now ?? (() => new Date().toISOString()))();
  } catch {
    time = 'unknown';
  }
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : (() => {
            try {
              return JSON.stringify(error) ?? String(error);
            } catch {
              return String(error);
            }
          })();
  const entry: ErrorEntry = Object.freeze({
    time,
    source,
    message: message.slice(0, MAX_MESSAGE),
    stack: error instanceof Error && error.stack ? error.stack.slice(0, MAX_STACK) : null,
    build: options.build ?? 'unknown',
  });
  try {
    const next = [...readErrors(storage), entry].slice(-MAX_ERROR_ENTRIES);
    storage?.setItem(ERROR_LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage full/unavailable: the in-memory crash screen still works; nothing else is touched.
  }
  return entry;
}
export function clearErrors(storage = browserStorage()): void {
  try {
    storage?.removeItem(ERROR_LOG_KEY);
  } catch {
    // ignore
  }
}
