import type { RunStatsSnapshot } from '../gameplay';
import { clock } from './campaign-format';
import { RU, damageSourceLabel, enemyTypeLabel } from './strings-ru';

const whole = (n: number) => Math.round(n).toLocaleString('ru-RU');

/** Task 08.5 §2.2 compact results statistics: top damage sources, damage taken, death time. */
export function RunStatsPanel({ stats }: { stats: RunStatsSnapshot }) {
  const t = RU.stats;
  const top = stats.bySource.slice(0, 5);
  const worst = stats.takenByType[0];
  return (
    <section className="run-stats" aria-label={t.title}>
      <h3>{t.title}</h3>
      <div className="run-stats-sources" aria-label={t.topSources}>
        <h4>{t.topSources}</h4>
        {top.length === 0 ? (
          <p>{t.noDamage}</p>
        ) : (
          <ol>
            {top.map((s) => {
              const share = stats.damageDealt > 0 ? (s.damage / stats.damageDealt) * 100 : 0;
              return (
                <li key={s.source}>
                  <span className="run-stats-name">{damageSourceLabel(s.source)}</span>
                  <span className="run-stats-bar" aria-hidden="true">
                    <i style={{ width: `${share}%` }} />
                  </span>
                  <b>{whole(s.damage)}</b> <small>{Math.round(share)}%</small>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <dl className="run-stats-grid">
        <dt>{t.damageDealt}</dt>
        <dd>{whole(stats.damageDealt)}</dd>
        <dt>{t.damageTaken}</dt>
        <dd>
          {whole(stats.damageTaken)}
          {worst ? ` · ${t.takenFrom}: ${enemyTypeLabel(worst.type)}` : ''}
        </dd>
        <dt>{t.deathTime}</dt>
        <dd>{stats.deathTime === null ? t.noDeath : clock(stats.deathTime)}</dd>
        <dt>{t.revive}</dt>
        <dd>
          {stats.reviveTime === null ? t.reviveUnused : t.reviveUsed(clock(stats.reviveTime))}
        </dd>
        <dt>{t.lowHp}</dt>
        <dd>{stats.lowHpMoments}</dd>
      </dl>
    </section>
  );
}
