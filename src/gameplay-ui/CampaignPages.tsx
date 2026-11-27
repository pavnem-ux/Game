import { useSyncExternalStore } from 'react';
import { CAMPAIGN_MAPS } from '../campaign';
import { CLASS_LABELS } from '../gameplay';
import { talentPoints, xpToNextLevel } from '../profile';
import { campaignStore } from './campaign-state';
import { clock } from './campaign-format';
import { Button, Panel } from './kit';
import { EN, formatNumber } from './strings-en';

const useCampaign = () => useSyncExternalStore(campaignStore.subscribe, campaignStore.getSnapshot);

/** Selected class progress, Gold, campaign progress, stats, recent runs, future placeholders. */
export function ProgressionPage() {
  const { progression } = useCampaign();
  const profile = progression.profile;
  if (!profile) return <p className="campaign-empty">Profile unavailable.</p>;
  const cls = profile.selectedClass;
  const p = profile.classes[cls];
  const next = xpToNextLevel(p.level);
  return (
    <div className="campaign-page progression-page">
      <h2 className="meta-title">Progress</h2>
      <div className="progression-grid">
        <Panel className="progression-card" aria-label="Class" title={CLASS_LABELS[cls]}>
          <p>
            Level <b>{p.level}</b> / 50 · {next === null ? 'max' : `XP ${p.xp} / ${next}`}
          </p>
          <div
            className="campaign-bar"
            role="progressbar"
            aria-label="Class XP"
            aria-valuemin={0}
            aria-valuemax={next ?? 1}
            aria-valuenow={next === null ? 1 : p.xp}
          >
            <div style={{ width: `${next === null ? 100 : (p.xp / next) * 100}%` }} />
          </div>
          <p>
            Talent points: <b>{talentPoints(p.level)}</b> · Lifetime XP:{' '}
            {formatNumber(p.lifetimeXp)}
          </p>
          <p>
            Gold: <b>◎ {formatNumber(profile.gold)}</b>
          </p>
        </Panel>
        <Panel className="progression-card" aria-label="Campaign" title="Campaign">
          <p>
            Maps cleared: <b>{profile.completedMaps.length}</b> / {CAMPAIGN_MAPS.length} · unlocked
            up to map {profile.highestUnlockedMap}
          </p>
          <div
            className="campaign-bar"
            role="progressbar"
            aria-label="Campaign progress"
            aria-valuemin={0}
            aria-valuemax={CAMPAIGN_MAPS.length}
            aria-valuenow={profile.completedMaps.length}
          >
            <div
              style={{ width: `${(profile.completedMaps.length / CAMPAIGN_MAPS.length) * 100}%` }}
            />
          </div>
          <p>
            Runs {profile.stats.runs} · victories {profile.stats.wins} · defeats{' '}
            {profile.stats.defeats} · defeated {formatNumber(profile.stats.enemiesKilled)} · best
            time {clock(profile.stats.bestSurvivalTime)}
          </p>
        </Panel>
        <Panel className="progression-card" aria-label="Development" title="Development">
          <p>Hero equipment and talents have their own screens.</p>
          <div className="progression-links">
            <Button onClick={() => campaignStore.setPage('equipment')}>⛨ Equipment</Button>
            <Button onClick={() => campaignStore.setPage('talents')}>❖ Talents</Button>
          </div>
        </Panel>
      </div>
      <Panel className="recent-runs" aria-label="Recent runs" title="Recent runs">
        {profile.recentRuns.length === 0 ? (
          <p>No runs yet.</p>
        ) : (
          <ol>
            {profile.recentRuns.map((r) => (
              <li key={r.runId} className={`recent-run outcome-${r.outcome}`}>
                <b>{OUTCOME_LABELS[r.outcome]}</b> · map {r.mapId}
                {r.difficulty ? ` (${EN.meta.maps.tierNames[r.difficulty]})` : ''} ·{' '}
                {CLASS_LABELS[r.characterClass]} · {clock(r.elapsed)} · {r.kills} defeated · +{r.xp}{' '}
                XP · +{r.gold} Gold
                {r.unlockedMap ? ` · unlocked map ${r.unlockedMap}` : ''}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
export const OUTCOME_LABELS = {
  victory: 'Victory',
  defeat: 'Defeat',
  abandoned: 'Abandoned',
} as const;
