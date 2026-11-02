import { useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES, calculateCharacterStats } from '../character-stats';
import { CAMPAIGN_MAPS } from '../campaign';
import { CLASS_LABELS, WEAPON_LABELS } from '../gameplay';
import { isMapUnlocked, talentPoints, xpToNextLevel } from '../profile';
import { campaignStore } from './campaign-state';
import { CLASS_SYMBOLS, clock, factor, minutes } from './campaign-format';
import { displayHp } from './format';

const useCampaign = () => useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);

/** Per-class permanent progress and the stats it feeds (existing Character Stats formulas). */
export function CharacterPage() {
  const { progression } = useCampaign();
  const profile = progression.profile;
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  return (
    <div className="campaign-page character-page">
      <h2>Персонаж</h2>
      <div className="character-grid">
        {CHARACTER_CLASSES.map((c) => {
          const p = profile.classes[c];
          const stats = calculateCharacterStats(c, p.level).combatAttributes;
          const next = xpToNextLevel(p.level);
          const hp = displayHp(stats.maxHp, stats.maxHp).max;
          return (
            <article
              key={c}
              className={`character-card class-${c} ${profile.selectedClass === c ? 'selected' : ''}`}
              aria-label={`${CLASS_LABELS[c]}: уровень ${p.level}`}
            >
              <header>
                <span className="class-symbol">{CLASS_SYMBOLS[c]}</span>
                <div>
                  <strong>{CLASS_LABELS[c]}</strong>
                  <small>Оружие: {WEAPON_LABELS[c]}</small>
                </div>
              </header>
              <p className="character-level">
                Уровень <b>{p.level}</b> / 50 ·{' '}
                {next === null ? 'максимум' : `XP ${p.xp} / ${next}`}
              </p>
              <div
                className="campaign-bar"
                role="progressbar"
                aria-label={`Опыт класса ${CLASS_LABELS[c]}`}
                aria-valuemin={0}
                aria-valuemax={next ?? 1}
                aria-valuenow={next === null ? 1 : p.xp}
              >
                <div style={{ width: `${next === null ? 100 : (p.xp / next) * 100}%` }} />
              </div>
              <dl className="character-stats">
                <dt>HP</dt>
                <dd>{hp}</dd>
                <dt>Физ. урон</dt>
                <dd>{Math.round(stats.physicalDamage)}</dd>
                <dt>Маг. урон</dt>
                <dd>{Math.round(stats.magicalDamage)}</dd>
                <dt>Скорость атаки</dt>
                <dd>{Math.round(stats.attackSpeed)}</dd>
                <dt>Крит</dt>
                <dd>{Math.round(stats.criticalChance)}%</dd>
                <dt>Сопротивление</dt>
                <dd>{Math.round(stats.resistance)}</dd>
                <dt>Очки талантов</dt>
                <dd>{talentPoints(p.level)}</dd>
              </dl>
              <button
                className="button"
                aria-pressed={profile.selectedClass === c}
                onClick={() => campaignStore.selectClass(c)}
              >
                {profile.selectedClass === c ? 'Выбран' : 'Выбрать'}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** All 10 maps: lock state, difficulty, rewards, best result, boss (if unlocked). */
export function MapsPage() {
  const ui = useCampaign();
  const profile = ui.progression.profile;
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  return (
    <div className="campaign-page maps-page">
      <h2>Карты</h2>
      <ol className="map-list">
        {CAMPAIGN_MAPS.map((m) => {
          const unlocked = isMapUnlocked(profile, m.id);
          const best = profile.bestResults[String(m.id)];
          const done = profile.completedMaps.includes(m.id);
          return (
            <li
              key={m.id}
              className={`map-card ${unlocked ? 'unlocked' : 'locked'} ${
                ui.selectedMapId === m.id ? 'selected' : ''
              }`}
              data-map-id={m.id}
              aria-label={`Карта ${m.id}: ${m.name}${unlocked ? '' : ', закрыта'}`}
            >
              <div className="map-head">
                <span className="map-number">{m.id}</span>
                <strong>{m.name}</strong>
                <span className="map-state">
                  {done ? '✓ Пройдена' : unlocked ? 'Открыта' : '🔒 Закрыта'}
                </span>
              </div>
              <p className="map-meta">
                {minutes(m.durationSeconds)} · HP врагов {factor(m.difficulty.hp)} · урон{' '}
                {factor(m.difficulty.damage)} · волны {factor(m.difficulty.spawnRate)}
              </p>
              <p className="map-meta">
                Награда: {m.victoryXp} XP · {m.victoryGold} золота · Босс:{' '}
                {unlocked ? m.bossName : '???'}
              </p>
              <p className="map-best">
                {best
                  ? `Лучшее: побед ${best.victories}${
                      best.bestClearTime !== null ? ` · победа за ${clock(best.bestClearTime)}` : ''
                    } · выжить ${clock(best.bestSurvivalTime)} · ${best.bestKills} повержено`
                  : 'Ещё не пройдена'}
              </p>
              <div className="map-actions">
                <button
                  className="button"
                  disabled={!unlocked}
                  onClick={() => campaignStore.selectMap(m.id)}
                >
                  Выбрать
                </button>
                <button
                  className="button primary"
                  disabled={!unlocked}
                  aria-label={`Играть: карта ${m.id}`}
                  onClick={() => campaignStore.startRun(m.id)}
                >
                  Играть →
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
