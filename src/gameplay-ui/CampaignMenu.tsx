import { useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES, calculateCharacterStats } from '../character-stats';
import { CAMPAIGN_MAPS } from '../campaign';
import { CLASS_LABELS, WEAPON_LABELS } from '../gameplay';
import { isMapUnlocked } from '../profile';
import { campaignStore } from './campaign-state';
import type { MenuPage } from './campaign-state';
import { displayHp } from './format';
import { CLASS_SYMBOLS, minutes } from './campaign-format';
import { CharacterPage, MapsPage, ProgressionPage } from './CampaignPages';
import { SaveWarning, SettingsPage } from './SaveManagement';

const PAGES: readonly { id: MenuPage; label: string }[] = [
  { id: 'play', label: 'Играть' },
  { id: 'character', label: 'Персонаж' },
  { id: 'maps', label: 'Карты' },
  { id: 'progression', label: 'Прогресс' },
  { id: 'settings', label: 'Настройки' },
];

/** Main menu: navigation, Gold and the campaign pages. Reads state; calls store actions only. */
export function CampaignMenu() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  return (
    <section className="overlay alpha-menu campaign-menu" aria-labelledby="alpha-title">
      <nav className="campaign-nav" aria-label="Главное меню">
        {PAGES.map((p) => (
          <button
            key={p.id}
            className={`campaign-tab ${ui.page === p.id ? 'active' : ''}`}
            aria-current={ui.page === p.id ? 'page' : undefined}
            onClick={() => campaignStore.setPage(p.id)}
          >
            {p.label}
          </button>
        ))}
        <span className="campaign-gold" aria-label={`Золото: ${profile?.gold ?? 0}`}>
          ◎ {profile?.gold ?? 0}
        </span>
      </nav>
      <SaveWarning />
      {ui.page === 'play' && <PlayPage />}
      {ui.page === 'character' && <CharacterPage />}
      {ui.page === 'maps' && <MapsPage />}
      {ui.page === 'progression' && <ProgressionPage />}
      {ui.page === 'settings' && <SettingsPage />}
    </section>
  );
}

function PlayPage() {
  const ui = useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);
  const profile = ui.progression.profile;
  const selected = profile?.selectedClass ?? 'warrior';
  const map = CAMPAIGN_MAPS[ui.selectedMapId - 1];
  return (
    <div className="campaign-play">
      <div className="alpha-intro">
        <div className="eyebrow">КАМПАНИЯ · 10 КАРТ</div>
        <h1 id="alpha-title">
          Выберите
          <br />
          <em>свой свет.</em>
        </h1>
        <p>
          Переживите карту до конца и победите босса.
          <br />
          Победа открывает следующую карту.
        </p>
        <p className="alpha-help">
          WASD / стрелки · P / Esc — пауза
          <br />
          На телефоне — джойстик слева внизу
        </p>
        <p className="alpha-note campaign-forfeit-note">
          Сохранения внутри забега нет: выход в меню или перезагрузка страницы во время забега
          засчитывается как отказ — без награды.
        </p>
      </div>
      <div className="alpha-selection">
        <div className="class-grid" role="group" aria-label="Выбор класса">
          {CHARACTER_CLASSES.map((c) => {
            const level = profile?.classes[c].level ?? 1;
            const stats = calculateCharacterStats(c, level).combatAttributes;
            return (
              <button
                key={c}
                className={`class-choice class-${c} ${selected === c ? 'selected' : ''}`}
                aria-pressed={selected === c}
                disabled={!profile}
                onClick={() => campaignStore.selectClass(c)}
              >
                <span className="class-symbol">{CLASS_SYMBOLS[c]}</span>
                <strong>{CLASS_LABELS[c]}</strong>
                <small>{WEAPON_LABELS[c]}</small>
                <span>
                  Ур. {level} · {displayHp(stats.maxHp, stats.maxHp).max} HP ·{' '}
                  {c === 'mage' ? stats.magicalDamage : stats.physicalDamage} урона
                </span>
              </button>
            );
          })}
        </div>
        <label className="campaign-map-select">
          Карта
          <select
            aria-label="Карта"
            value={ui.selectedMapId}
            disabled={!profile}
            onChange={(e) => campaignStore.selectMap(Number(e.target.value))}
          >
            {CAMPAIGN_MAPS.map((m) => (
              <option key={m.id} value={m.id} disabled={!profile || !isMapUnlocked(profile, m.id)}>
                {m.id}. {m.name}
                {profile && !isMapUnlocked(profile, m.id) ? ' · закрыта' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          disabled={!profile}
          onClick={() => campaignStore.startRun()}
        >
          Начать забег · {CLASS_LABELS[selected]} →
        </button>
        <p className="alpha-note">
          {map.name} · {minutes(map.durationSeconds)} · награда {map.victoryXp} XP /{' '}
          {map.victoryGold} золота
          <br />
          Опыт забега растёт от кристаллов и сбрасывается после забега; постоянный уровень класса
          растёт от наград за карты.
        </p>
      </div>
    </div>
  );
}
