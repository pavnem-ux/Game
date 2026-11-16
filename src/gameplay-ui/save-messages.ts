import type { SaveErrorCode, SaveFailure, SaveStatus } from '../persistence';

/** Player-facing save messages (no technical details or stack traces). */
export const LOAD_ERROR_TEXT: Record<SaveErrorCode, string> = {
  'malformed-json': 'The save file is damaged and cannot be read.',
  'not-an-object': 'This is not a save file of this game.',
  'newer-version': 'The save was made by a newer version of the game.',
  'unsupported-version': 'This save version is not supported.',
  invalid: 'The save contains invalid data.',
};
export const SAVE_FAILURE_TEXT: Record<SaveFailure, string> = {
  quota: 'Browser storage is full.',
  unavailable: 'Browser storage is unavailable (for example, private mode or blocked site data).',
  blocked: 'Saving is disabled so the existing save is not damaged.',
  invalid: 'The data failed validation and was not written.',
};
export function statusText(status: SaveStatus): string {
  switch (status.state) {
    case 'saved':
      return status.load === 'recovered'
        ? 'Saved. The main save was damaged — the backup copy was loaded.'
        : 'Progress saved.';
    case 'unsaved':
      return `Latest changes were NOT saved. ${status.failure ? SAVE_FAILURE_TEXT[status.failure] : ''}`;
    case 'not-persisted':
      return 'Browser storage is unavailable: progress lasts only until the page is closed.';
    case 'error':
      return `The save could not be loaded. ${
        status.loadError ? LOAD_ERROR_TEXT[status.loadError.code] : ''
      } The original data is untouched; the game will not overwrite it.`;
  }
}
