import { useRef, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES } from '../character-stats';
import { CLASS_LABELS } from '../gameplay';
import { campaignStore } from './campaign-state';
import { uiSettings } from './ui-settings';
import { uiSound } from './sound';
import { GRAPHICS_QUALITIES } from '../engine/visuals/quality';
import { EN } from './strings-en';
import { statusText } from './save-messages';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US') : 'never yet');

/** Settings → Save Management (export, import with confirmation, status, warnings). */
/** Task 08.5 §5.3: presentation preferences (own key, never the save). */
function GameplaySettings() {
  const settings = useSyncExternalStore(uiSettings.subscribe, uiSettings.get);
  return (
    <section className="gameplay-settings" aria-label={EN.settings.title}>
      <h3>{EN.settings.title}</h3>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.screenShake}
          onChange={(e) => uiSettings.set({ screenShake: e.target.checked })}
        />
        {EN.settings.screenShake}
      </label>
      <p className="faint">{EN.settings.screenShakeHint}</p>
      <h3>{EN.settings.sound}</h3>
      {(['masterVolume', 'sfxVolume', 'musicVolume'] as const).map((key) => (
        <label key={key} className="settings-slider">
          <span>{EN.settings[key]}</span>
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
        {EN.settings.muted}
      </label>
      <p className="faint">{EN.settings.soundHint}</p>
      <h3>{EN.settings.graphics}</h3>
      <label className="settings-slider">
        <span>{EN.settings.graphicsQuality}</span>
        <select
          value={settings.graphicsQuality}
          onChange={(e) =>
            uiSettings.set({ graphicsQuality: e.target.value as typeof settings.graphicsQuality })
          }
        >
          {GRAPHICS_QUALITIES.map((q) => (
            <option key={q} value={q}>
              {EN.settings.graphicsQualityOptions[q]}
            </option>
          ))}
        </select>
      </label>
      <p className="faint">{EN.settings.graphicsHint}</p>
      <h3>{EN.settings.touch}</h3>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.leftHanded}
          onChange={(e) => uiSettings.set({ leftHanded: e.target.checked })}
        />
        {EN.settings.leftHanded}
      </label>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={settings.haptics}
          onChange={(e) => uiSettings.set({ haptics: e.target.checked })}
        />
        {EN.settings.haptics}
      </label>
      <p className="faint">{EN.settings.touchHint}</p>
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
      <h2>Settings</h2>
      <GameplaySettings />
      <section className="save-management" aria-label="Save management">
        <h3>Save management</h3>
        <p className={`save-status save-${status.state}`} role="status">
          {statusText(status)}
        </p>
        <p>Last saved: {when(status.lastSavedAt)}</p>
        <p className="save-warning">
          Progress is stored only in this browser. Clearing site or browser data deletes it — export
          your save to a file regularly.
        </p>
        <div className="save-actions">
          <button className="button" disabled={!profile} onClick={() => campaignStore.exportSave()}>
            Export save
          </button>
          <button
            className="button"
            disabled={status.state === 'error'}
            onClick={() => file.current?.click()}
          >
            Import save
          </button>
          {status.state === 'unsaved' && (
            <button className="button primary" onClick={() => campaignStore.retrySave()}>
              Retry save
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            aria-label="Save file"
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
            <h2 id="import-title">Replace your save?</h2>
            <p>
              File “{pending.fileName}”: Gold {pending.profile.gold}, maps unlocked{' '}
              {pending.profile.highestUnlockedMap}, cleared {pending.profile.completedMaps.length}.
            </p>
            <p>
              {CHARACTER_CLASSES.map(
                (c) => `${CLASS_LABELS[c]} ${pending.profile.classes[c].level}`,
              ).join(' · ')}
            </p>
            <p className="save-warning">
              Your current progress will be replaced. You can export it to a file first.
            </p>
            <button
              className="button"
              disabled={!profile}
              onClick={() => campaignStore.exportSave()}
            >
              Export current first
            </button>
            <button className="button primary" onClick={() => campaignStore.confirmImport()}>
              Replace save
            </button>
            <button className="text-button" onClick={() => campaignStore.cancelImport()}>
              Cancel
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
        Save management
      </button>
    </div>
  );
}
