import { useState } from 'react';
import type { GameplaySnapshot } from '../gameplay';
import { damageSourceLabel } from './strings-ru';
import { RU_DEBUG } from './strings-ru-debug';

const whole = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * Task 08.5 §2.3 debug overlay (`/?debug`, DEV/QA builds only; lazy-loaded). Reads the throttled
 * world snapshot only: live DPS over the last 5 s and total damage per source.
 */
export default function DebugOverlay({ world, fps }: { world: GameplaySnapshot; fps?: number }) {
  const [open, setOpen] = useState(true);
  const t = RU_DEBUG.overlay;
  const stats = world.runStats;
  if (!open)
    return (
      <button className="debug-overlay-toggle" onClick={() => setOpen(true)}>
        {t.show}
      </button>
    );
  return (
    <aside className="debug-overlay" aria-label={t.label}>
      <header>
        <strong>{t.title}</strong>
        <button onClick={() => setOpen(false)}>{t.hide}</button>
      </header>
      <dl>
        <dt>{t.fps}</dt>
        <dd data-testid="debug-fps">{fps ?? '—'}</dd>
        <dt>{t.enemies}</dt>
        <dd data-testid="debug-enemies">{world.enemies.filter((e) => e.alive).length}</dd>
        <dt>{t.seed}</dt>
        <dd data-testid="debug-seed">{world.seed}</dd>
        <dt>{t.dps}</dt>
        <dd data-testid="debug-dps">{whole(stats.dps)}</dd>
        <dt>{t.total}</dt>
        <dd>{whole(stats.damageDealt)}</dd>
        <dt>{t.coinsPerMinute}</dt>
        <dd data-testid="debug-coins">
          {world.coins.collected} ·{' '}
          {whole(world.time > 0 ? (world.coins.collected * 60) / world.time : 0)}/мин
        </dd>
      </dl>
      <h4>{t.bySource}</h4>
      {stats.bySource.length === 0 ? (
        <p>{t.none}</p>
      ) : (
        <ol>
          {stats.bySource.map((s) => (
            <li key={s.source}>
              <span>{damageSourceLabel(s.source)}</span>
              <b>{whole(s.damage)}</b>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
