import { useRef, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import { CLASS_LABELS } from '../gameplay';
import { campaignStore } from './campaign-state';
import { uiSettings } from './ui-settings';
import { uiSound } from './sound';
import { GRAPHICS_QUALITIES } from '../engine/visuals/quality';
import { RU } from './strings-ru';
import { statusText } from './save-messages';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU') : 'ещё не было');

/** Settings → Save Management (export, import with confirmation, status, warnings). */
/** Task 08.5 §5.3: presentation preferences (own key, never the save). */
function GameplaySettings() {
  const settings = useSyncExternalStore(uiSettings.subscribe, uiSettings.get);
  return (
    <section className="gameplay-settings" aria-label={RU.settings.title}>
      <h3>{RU.settings.title}</h3>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.screenShake}
          onChange={(e) => uiSettings.set({ screenShake: e.target.checked })}
        />
        {RU.settings.screenShake}
      </label>
      <p className="faint">{RU.settings.screenShakeHint}</p>
      <h3>{RU.settings.sound}</h3>
      {(['masterVolume', 'sfxVolume', 'musicVolume'] as const).map((key) => (
        <label key={key} className="settings-slider">
          <span>{RU.settings[key]}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings[key]}
            disabled={settings.muted}
            onChange={(e) => {
              uiSettings.set({ [key]: Number(e.target.value) });
              if (key !== 'musicVolume') uiSound('ui-click'); // level preview
            }}
          />
          <output>{settings[key]}</output>
        </label>
      ))}
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.muted}
          onChange={(e) => uiSettings.set({ muted: e.target.checked })}
        />
        {RU.settings.muted}
      </label>
      <p className="faint">{RU.settings.soundHint}</p>
      <h3>{RU.settings.graphics}</h3>
      <label className="settings-slider">
        <span>{RU.settings.graphicsQuality}</span>
        <select
          value={settings.graphicsQuality}
          onChange={(e) =>
            uiSettings.set({ graphicsQuality: e.target.value as typeof settings.graphicsQuality })
          }
        >
          {GRAPHICS_QUALITIES.map((q) => (
            <option key={q} value={q}>
              {RU.settings.graphicsQualityOptions[q]}
            </option>
          ))}
        </select>
      </label>
      <p className="faint">{RU.settings.graphicsHint}</p>
      <h3>{RU.settings.touch}</h3>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.leftHanded}
          onChange={(e) => uiSettings.set({ leftHanded: e.target.checked })}
        />
        {RU.settings.leftHanded}
      </label>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.haptics}
          onChange={(e) => uiSettings.set({ haptics: e.target.checked })}
        />
        {RU.settings.haptics}
      </label>
      <p className="faint">{RU.settings.touchHint}</p>
    </section>
  );
}
export function SettingsPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const file = useRef<HTMLInputElement>(null);
  const { profile, status } = ui.progression;
  const pending = ui.pendingImport;
  return (
    <div className="campaign-page settings-page">
      <h2>Настройки</h2>
      <GameplaySettings />
      <section className="save-management" aria-label="Управление сохранением">
        <h3>Управление сохранением</h3>
        <p className={`save-status save-${status.state}`} role="status">
          {statusText(status)}
        </p>
        <p>Последнее сохранение: {when(status.lastSavedAt)}</p>
        <p className="save-warning">
          Прогресс хранится только в этом браузере. Очистка данных сайта или браузера удалит его —
          регулярно экспортируйте сохранение в файл.
        </p>
        <div className="save-actions">
          <button className="button" disabled={!profile} onClick={() => campaignStore.exportSave()}>
            Экспорт сохранения
          </button>
          <button
            className="button"
            disabled={status.state === 'error'}
            onClick={() => file.current?.click()}
          >
            Импорт сохранения
          </button>
          {status.state === 'unsaved' && (
            <button className="button primary" onClick={() => campaignStore.retrySave()}>
              Повторить сохранение
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            aria-label="Файл сохранения"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              void f.text().then(
                (text) => campaignStore.stageImport(text, f.name),
                () => campaignStore.stageImport('', f.name),
              );
            }}
          />
        </div>
        {ui.saveMessage && (
          <p className={`save-message tone-${ui.saveMessage.tone}`} role="alert">
            {ui.saveMessage.text}
          </p>
        )}
      </section>
      {pending && (
        <div
          className="overlay modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-title"
        >
          <div className="small-modal import-confirm">
            <h2 id="import-title">Заменить сохранение?</h2>
            <p>
              Файл «{pending.fileName}»: золото {pending.profile.gold}, открыто карт{' '}
              {pending.profile.highestUnlockedMap}, пройдено {pending.profile.completedMaps.length}.
            </p>
            <p>
              {CHARACTER_CLASSES.map(
                (c) => `${CLASS_LABELS[c]} ${pending.profile.classes[c].level}`,
              ).join(' · ')}
            </p>
            <p className="save-warning">
              Текущий прогресс будет заменён. Сначала можно экспортировать его в файл.
            </p>
            <button
              className="button"
              disabled={!profile}
              onClick={() => campaignStore.exportSave()}
            >
              Сначала экспортировать текущее
            </button>
            <button className="button primary" onClick={() => campaignStore.confirmImport()}>
              Заменить сохранение
            </button>
            <button className="text-button" onClick={() => campaignStore.cancelImport()}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Visible warning whenever progress is not safely on disk. */
export function SaveWarning() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const { status } = ui.progression;
  if (status.state === 'saved' && status.load !== 'recovered') return null;
  return (
    <div className={`save-banner save-${status.state}`} role="alert">
      ⚠ {statusText(status)}{' '}
      <button className="text-button" onClick={() => campaignStore.setPage('settings')}>
        Управление сохранением
      </button>
    </div>
  );
}
