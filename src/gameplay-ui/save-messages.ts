import type { SaveErrorCode, SaveFailure, SaveStatus } from '../persistence';

/** Player-facing save messages (no technical details or stack traces). */
export const LOAD_ERROR_TEXT: Record<SaveErrorCode, string> = {
  'malformed-json': 'Файл сохранения повреждён и не читается.',
  'not-an-object': 'Это не файл сохранения игры.',
  'newer-version': 'Сохранение создано более новой версией игры.',
  'unsupported-version': 'Эта версия сохранения не поддерживается.',
  invalid: 'В сохранении есть недопустимые данные.',
};
export const SAVE_FAILURE_TEXT: Record<SaveFailure, string> = {
  quota: 'В хранилище браузера закончилось место.',
  unavailable: 'Хранилище браузера недоступно (например, приватный режим или запрет сайта).',
  blocked: 'Запись отключена, чтобы не повредить существующее сохранение.',
  invalid: 'Данные не прошли проверку и не были записаны.',
};
export function statusText(status: SaveStatus): string {
  switch (status.state) {
    case 'saved':
      return status.load === 'recovered'
        ? 'Сохранено. Основное сохранение было повреждено — загружена резервная копия.'
        : 'Прогресс сохранён.';
    case 'unsaved':
      return `Последние изменения НЕ сохранены. ${status.failure ? SAVE_FAILURE_TEXT[status.failure] : ''}`;
    case 'not-persisted':
      return 'Хранилище браузера недоступно: прогресс живёт только до закрытия страницы.';
    case 'error':
      return `Сохранение не удалось загрузить. ${
        status.loadError ? LOAD_ERROR_TEXT[status.loadError.code] : ''
      } Исходные данные не тронуты; игра их не перезапишет.`;
  }
}
