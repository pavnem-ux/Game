import { useSyncExternalStore } from 'react';
import { CAMPAIGN_MAPS } from '../campaign';
import { CLASS_LABELS } from '../gameplay';
import { talentPoints, xpToNextLevel } from '../profile';
import { campaignStore } from './campaign-state';
import { clock } from './campaign-format';
import { Button, Panel } from './kit';

const useCampaign = () => useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);

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
      <h2 className="meta-title">Прогресс</h2>
      <div className="progression-grid">
        <Panel className="progression-card" aria-label="Класс" title={CLASS_LABELS[cls]}>
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
        </Panel>
        <Panel className="progression-card" aria-label="Кампания" title="Кампания">
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
        </Panel>
        <Panel className="progression-card" aria-label="Развитие" title="Развитие">
          <p>Снаряжение и таланты героя — на своих экранах.</p>
          <div className="progression-links">
            <Button onClick={() => campaignStore.setPage('equipment')}>⛨ Экипировка</Button>
            <Button onClick={() => campaignStore.setPage('talents')}>❖ Таланты</Button>
          </div>
        </Panel>
      </div>
      <Panel className="recent-runs" aria-label="Последние забеги" title="Последние забеги">
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
      </Panel>
    </div>
  );
}
export const OUTCOME_LABELS = {
  victory: 'Победа',
  defeat: 'Поражение',
  abandoned: 'Отказ',
} as const;
