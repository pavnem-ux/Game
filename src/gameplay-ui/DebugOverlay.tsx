import { useState } from 'react';
import type { GameplaySnapshot } from '../gameplay';
import { damageSourceLabel } from './strings-en';
import { EN_DEBUG } from './strings-en-debug';
import { audioDirector } from './sound';
import { uiSettings } from './ui-settings';

const whole = (n: number) => Math.round(n).toLocaleString('en-US');
/** Run level reached by 5:00, 10:00 and 15:00 of simulation time ('—' = not reached yet). */
export function levelMarks(world: GameplaySnapshot): string {
  return [300, 600, 900]
    .map((at) => {
      if (world.time < at) return '—';
      let level = 1;
      for (const step of world.runStats.levelTimeline) if (step.time <= at) level = step.level;
      return String(level);
    })
    .join(' / ');
}

/**
 * Task 08.5 §2.3 debug overlay (`/?debug`, DEV/QA builds only; lazy-loaded). Reads the throttled
 * world snapshot only: live DPS over the last 5 s and total damage per source.
 */
export default function DebugOverlay({ world, fps }: { world: GameplaySnapshot; fps?: number }) {
  const [open, setOpen] = useState(true);
  const t = EN_DEBUG.overlay;
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
          {whole(world.time > 0 ? (world.coins.collected * 60) / world.time : 0)}/min
        </dd>
        {/* Task 12 §1.5: run-level timeline (level reached by 5:00 / 10:00 / 15:00). */}
        <dt>{t.levelTimeline}</dt>
        <dd data-testid="debug-level-timeline">{levelMarks(world)}</dd>
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
      {/* Task 14 §1.4: mute toggle + audio event log (latest decisions, newest first). */}
      <h4>{t.audio}</h4>
      <label className="debug-audio-mute">
        <input
          type="checkbox"
          checked={uiSettings.get().muted}
          onChange={(e) => uiSettings.set({ muted: e.target.checked })}
        />
        {t.mute} · {t.voices} {audioDirector.activeVoices}
      </label>
      <ol className="debug-audio-log" data-testid="debug-audio-log">
        {audioDirector
          .getLog()
          .slice(-10)
          .reverse()
          .map((entry, i) => (
            <li key={i} className={`audio-${entry.result}`}>
              <span>{entry.cue}</span>
              <b>{entry.result}</b>
            </li>
          ))}
      </ol>
    </aside>
  );
}
