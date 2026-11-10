import type { PlayerProfile } from '../profile';
import { parseProfile, parseProfileJson, SaveDataError } from './saveSchema';
import type { ParseResult } from './saveSchema';

/**
 * Task 08 save export/import (pure; the UI performs the actual download/upload and the
 * confirmation). Export is read-only. Import is parse → validate → migrate and returns a profile
 * WITHOUT applying it; the caller replaces the current profile only after the player confirms
 * (offering an export of the current save first). Any failure leaves the current save unchanged.
 */
export const MAX_IMPORT_BYTES = 1_000_000;

export type ExportResult =
  | { readonly ok: true; readonly filename: string; readonly json: string }
  | { readonly ok: false; readonly error: SaveDataError };

/** `skazki-save-YYYY-MM-DD.json` for the given ISO timestamp (UTC date). */
export function exportFilename(isoNow: string): string {
  const t = Date.parse(isoNow);
  if (Number.isNaN(t)) throw new TypeError('Export needs an ISO timestamp.');
  return `skazki-save-${new Date(t).toISOString().slice(0, 10)}.json`;
}
export function exportProfile(profile: PlayerProfile, isoNow: string): ExportResult {
  const checked = parseProfile(profile);
  if (!checked.ok) return Object.freeze({ ok: false, error: checked.error });
  return Object.freeze({
    ok: true,
    filename: exportFilename(isoNow),
    json: JSON.stringify(checked.profile, null, 2),
  });
}
export function prepareImport(text: string): ParseResult {
  if (typeof text !== 'string')
    return Object.freeze({ ok: false, error: new SaveDataError('invalid', 'No file content.') });
  if (text.length > MAX_IMPORT_BYTES)
    return Object.freeze({
      ok: false,
      error: new SaveDataError('invalid', 'The file is too large to be a save.'),
    });
  return parseProfileJson(text);
}
