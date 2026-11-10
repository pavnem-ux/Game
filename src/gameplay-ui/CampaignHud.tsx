import type { GameplaySnapshot } from '../gameplay';
import { clock } from './campaign-format';

const ELITE_WARNING = 10;
const ELITE_FRESH = 5;

/** Task 08 campaign HUD (reads the throttled snapshot only; no logic beyond formatting). */
export function CampaignHud({ world }: { world: GameplaySnapshot }) {
  const c = world.campaign;
  if (!c) return null;
  const next = c.nextEvent;
  const lastElite = [...c.firedLog].reverse().find((e) => e.id.startsWith('elite-'));
  const freshElite =
    lastElite && world.time - lastElite.time < ELITE_FRESH
      ? c.elites.find((_, i) => `elite-${i + 1}` === lastElite.id)
      : null;
  const eliteSoon =
    next?.kind === 'elite' && next.time - world.time <= ELITE_WARNING
      ? next.time - world.time
      : null;
  const boss = c.boss;
  return (
    <>
      <div className="campaign-hud" aria-label="Кампания">
        <strong className="campaign-hud-map">
          {c.mapId}. {c.mapName}
        </strong>
        <span className="campaign-hud-stage">Этап: {c.stage.name}</span>
        <span className="campaign-hud-time" aria-label="Осталось времени">
          {c.durationReached ? 'Время вышло — добейте босса' : `Осталось ${clock(c.remaining)}`}
        </span>
        {!boss && world.time < c.bossTime && (
          <span className="campaign-hud-boss-countdown">
            Босс через {clock(c.bossTime - world.time)}
          </span>
        )}
      </div>
      {(freshElite || eliteSoon !== null) && (
        <div className="campaign-alert" role="status">
          {freshElite
            ? `⚠ Элита: ${freshElite.name}!`
            : `⚠ Элита через ${Math.ceil(eliteSoon!)} с`}
        </div>
      )}
      {boss && boss.alive && (
        <div className="boss-bar" aria-label={`Босс: ${boss.name}`}>
          <span>{boss.name}</span>
          <div
            className="boss-bar-track"
            role="progressbar"
            aria-label="Здоровье босса"
            aria-valuemin={0}
            aria-valuemax={Math.ceil(boss.maxHp)}
            aria-valuenow={Math.ceil(boss.hp)}
          >
            <div style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
          </div>
          <small>
            {Math.ceil(boss.hp)} / {Math.ceil(boss.maxHp)}
          </small>
        </div>
      )}
    </>
  );
}
