import { useState, useSyncExternalStore } from 'react';
import { CHARACTER_CLASSES, calculateCharacterStats } from '../character-stats';
import { CAMPAIGN_ACTS, CAMPAIGN_MAPS, actOf } from '../campaign';
import { CLASS_LABELS, WEAPON_LABELS } from '../gameplay';
import { isMapUnlocked, recommendedLevel, talentPoints, xpToNextLevel } from '../profile';
import { campaignStore } from './campaign-state';
import { CLASS_SYMBOLS, clock, factor, minutes } from './campaign-format';
import { displayHp } from './format';
import { TalentsPanel } from './TalentsPanel';

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
              <dl className="class-stats">
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

/**
 * Task 10: 40 maps in 4 act tabs (the selected map's act opens first): lock state and reason,
 * recommended level, modifiers, difficulty, rewards, best result, boss (if unlocked).
 */
export function MapsPage() {
  const ui = useCampaign();
  const profile = ui.progression.profile;
  const [act, setAct] = useState(() => actOf(ui.selectedMapId).id);
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  const shown = CAMPAIGN_MAPS.filter((m) => m.act === act);
  const current = CAMPAIGN_ACTS[act - 1];
  return (
    <div className="campaign-page maps-page">
      <h2>Карты</h2>
      <div className="act-tabs" role="group" aria-label="Акты кампании">
        {CAMPAIGN_ACTS.map((a) => {
          const open = isMapUnlocked(profile, a.firstMap);
          return (
            <button
              key={a.id}
              className={`act-tab ${a.id === act ? 'active' : ''}`}
              aria-pressed={a.id === act}
              onClick={() => setAct(a.id)}
            >
              Акт {a.roman} · {a.name}
              {!open && ' 🔒'}
            </button>
          );
        })}
      </div>
      <h3 className="act-title">
        Акт {current.roman} · {current.name}{' '}
        <small>
          карты {current.firstMap}–{current.lastMap}
        </small>
      </h3>
      <ol className="map-list" start={current.firstMap}>
        {shown.map((m) => {
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
              <p className="map-recommended">
                Рекомендуемый уровень {recommendedLevel(m.id)}
                {!unlocked && m.id > 1 && <> · Победите на карте {m.id - 1}</>}
              </p>
              {m.modifiers.length > 0 && (
                <ul className="map-modifiers" aria-label="Особенности карты">
                  {m.modifiers.map((x) => (
                    <li key={x.id}>{x.label}</li>
                  ))}
                </ul>
              )}
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

/** Selected class progress, Gold, campaign progress, stats, recent runs, future placeholders. */
export function ProgressionPage() {
  const { progression } = useCampaign();
  const profile = progression.profile;
  if (!profile) return <p className="campaign-empty">Профиль недоступен.</p>;
  const cls = profile.selectedClass;
  const p = profile.classes[cls];
  const next = xpToNextLevel(p.level);
  return (
    <div className="campaign-page progression-page">
      <h2>Прогресс</h2>
      <div className="progression-grid">
        <section className="progression-card" aria-label="Класс">
          <h3>
            {CLASS_SYMBOLS[cls]} {CLASS_LABELS[cls]}
          </h3>
          <p>
            Уровень <b>{p.level}</b> / 50 · {next === null ? 'максимум' : `XP ${p.xp} / ${next}`}
          </p>
          <div
            className="campaign-bar"
            role="progressbar"
            aria-label="Опыт класса"
            aria-valuemin={0}
            aria-valuemax={next ?? 1}
            aria-valuenow={next === null ? 1 : p.xp}
          >
            <div style={{ width: `${next === null ? 100 : (p.xp / next) * 100}%` }} />
          </div>
          <p>
            Очки талантов: <b>{talentPoints(p.level)}</b> · Всего опыта: {p.lifetimeXp}
          </p>
          <p>
            Золото: <b>◎ {profile.gold}</b>
          </p>
        </section>
        <section className="progression-card" aria-label="Кампания">
          <h3>Кампания</h3>
          <p>
            Пройдено карт: <b>{profile.completedMaps.length}</b> / {CAMPAIGN_MAPS.length} · открыта
            до карты {profile.highestUnlockedMap}
          </p>
          <div
            className="campaign-bar"
            role="progressbar"
            aria-label="Прогресс кампании"
            aria-valuemin={0}
            aria-valuemax={CAMPAIGN_MAPS.length}
            aria-valuenow={profile.completedMaps.length}
          >
            <div
              style={{ width: `${(profile.completedMaps.length / CAMPAIGN_MAPS.length) * 100}%` }}
            />
          </div>
          <p>
            Забегов {profile.stats.runs} · побед {profile.stats.wins} · поражений{' '}
            {profile.stats.defeats} · повержено {profile.stats.enemiesKilled} · лучшее время{' '}
            {clock(profile.stats.bestSurvivalTime)}
          </p>
        </section>
        <section className="progression-card coming-soon" aria-label="Скоро">
          <h3>Снаряжение</h3>
          <p>Скоро.</p>
          <button className="button" disabled>
            Снаряжение — скоро
          </button>
        </section>
      </div>
      <TalentsPanel />
      <section className="recent-runs" aria-label="Последние забеги">
        <h3>Последние забеги</h3>
        {profile.recentRuns.length === 0 ? (
          <p>Пока нет забегов.</p>
        ) : (
          <ol>
            {profile.recentRuns.map((r) => (
              <li key={r.runId} className={`recent-run outcome-${r.outcome}`}>
                <b>{OUTCOME_LABELS[r.outcome]}</b> · карта {r.mapId} ·{' '}
                {CLASS_LABELS[r.characterClass]} · {clock(r.elapsed)} · {r.kills} повержено · +
                {r.xp} XP · +{r.gold} золота
                {r.unlockedMap ? ` · открыта карта ${r.unlockedMap}` : ''}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
export const OUTCOME_LABELS = {
  victory: 'Победа',
  defeat: 'Поражение',
  abandoned: 'Отказ',
} as const;
