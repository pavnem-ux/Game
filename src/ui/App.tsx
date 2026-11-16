import { useSyncExternalStore } from 'react';
import { bridge } from '../core/bridge';
import { CLASS } from '../config/game';
import { GameCanvas } from './GameCanvas';
import { Portrait } from './Portrait';
import { Icon } from './Icon';
import type { Snapshot } from '../core/types';
export const timeLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
function Keyboard() {
  return (
    <div className="controls">
      <span>
        <kbd>W</kbd>
        <span className="key-row">
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd>
        </span>
      </span>
      <div>
        <strong>Keep moving to survive</strong>
        <p>Attacks are automatic · P / Esc to pause</p>
        <p className="touch-hint">On a phone: drag on the left side of the arena</p>
      </div>
    </div>
  );
}
function Menu({ state }: { state: Snapshot }) {
  return (
    <section className="overlay menu-overlay" aria-labelledby="game-title">
      <div className="menu-layout">
        <div className="intro">
          <div className="eyebrow">
            <i /> FANTASY SURVIVORS <span>01 / ARENA</span>
          </div>
          <h1 id="game-title">
            The Last
            <br />
            <em>Light.</em>
          </h1>
          <p className="intro-copy">
            The ruins have awoken. The darkness draws near.
            <br />
            Keep the spark alive — and never stop.
          </p>
          <div className="run-details">
            <span>
              <Icon name="clock" /> ENDLESS RUN
            </span>
            <span>✧ XP AND UPGRADES</span>
          </div>
          <button
            className="button primary start-button"
            onClick={() => bridge.send({ type: 'start' })}
          >
            Enter the ruins <Icon name="arrow" />
          </button>
          <Keyboard />
          {state.record > 0 && (
            <p className="record">
              YOUR RECORD <strong>{timeLabel(state.record)}</strong>
            </p>
          )}
        </div>
        <div className="character-card">
          <div className="character-top">
            <span>YOUR HERO</span>
            <span className="class-tag">MAGE</span>
          </div>
          <Portrait />
          <div className="character-info">
            <div className="tiny">KEEPER I</div>
            <h2>{CLASS.name}</h2>
            <p>Their staff remembers the warmth of a vanished sun.</p>
            <div className="character-stats">
              <div>
                <b>100</b>
                <span>HEALTH</span>
              </div>
              <div>
                <b>20</b>
                <span>DAMAGE</span>
              </div>
              <div>
                <b>✦</b>
                <span>SPARK</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="menu-foot">
        <span>ONE KEEPER. ONE SPARK. COUNTLESS DARKNESS.</span>
        <span>PROTOTYPE · STAGE 1</span>
      </div>
    </section>
  );
}
function Hud({ state: s }: { state: Snapshot }) {
  return (
    <>
      <div
        className="xp-track"
        role="progressbar"
        aria-label="XP"
        aria-valuemin={0}
        aria-valuemax={s.nextXp}
        aria-valuenow={s.xp}
      >
        <div style={{ width: `${(s.xp / s.nextXp) * 100}%` }} />
      </div>
      <div className="hud">
        <div className="health-panel">
          <div className="avatar">✦</div>
          <div className="health-details">
            <div className="health-label">
              <strong>Keeper</strong>
              <span>
                {Math.ceil(s.hp)} <small>/ {s.maxHp} HP</small>
              </span>
            </div>
            <div
              className="health-track"
              role="progressbar"
              aria-label="Health"
              aria-valuemin={0}
              aria-valuemax={s.maxHp}
              aria-valuenow={s.hp}
            >
              <div style={{ width: `${(s.hp / s.maxHp) * 100}%` }} />
            </div>
            <div className="level-label">
              <span>LEVEL {s.level}</span>
              <span>
                {s.xp} / {s.nextXp} XP
              </span>
            </div>
          </div>
        </div>
        <div className="timer">
          <span>TIME IN THE RUINS</span>
          <strong data-testid="timer">{timeLabel(s.seconds)}</strong>
        </div>
        <div className="hud-right">
          <div className="kill-count">
            <span>DEFEATED</span>
            <strong>{s.kills.toString().padStart(3, '0')}</strong>
          </div>
          <button
            className="icon-button"
            aria-label="Pause"
            disabled={s.phase !== 'playing'}
            onClick={() => bridge.send({ type: 'pause' })}
          >
            <Icon name="pause" />
          </button>
        </div>
      </div>
      <div className="bottom-hud">
        <div className="weapon">
          <span className="weapon-icon">✦</span>
          <div>
            <strong>Spark</strong>
            <span>POWER {s.ranks.power + 1} · AUTO-ATTACK</span>
          </div>
          {s.ranks.multishot > 0 && <b>×{s.ranks.multishot + 1}</b>}
        </div>
        <span className="arena-caption">
          FORGOTTEN GROVE <i /> <small>WAVE {1 + Math.floor(s.seconds / 60)}</small>
        </span>
        <span className="pause-hint">
          <kbd>P</kbd> PAUSE
        </span>
      </div>
    </>
  );
}
function LevelUp({ state: s }: { state: Snapshot }) {
  return (
    <section
      className="overlay modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
    >
      <div className="upgrade-panel">
        <div className="modal-sigil">✧</div>
        <div className="eyebrow centered">THE SPARK GROWS STRONGER</div>
        <h2 id="upgrade-title">
          Level up<span>.</span>
        </h2>
        <p className="modal-description">Level {s.level} · Choose a blessing for this run</p>
        <div className="upgrade-grid">
          {s.choices.map((u, i) => (
            <button
              className="upgrade-card"
              autoFocus={i === 0}
              key={u.id}
              onClick={() => bridge.send({ type: 'upgrade', id: u.id })}
            >
              <div className="card-top">
                <span>{u.tag}</span>
                <small>0{i + 1}</small>
              </div>
              <div className="upgrade-icon">{u.icon}</div>
              <h3>{u.name}</h3>
              <p>{u.description}</p>
              <div className="card-bottom">
                <span>RANK {s.ranks[u.id] + 1}</span>
                <b>
                  Choose <Icon name="arrow" />
                </b>
              </div>
            </button>
          ))}
        </div>
        <p className="faint">Time is frozen. Take your time.</p>
      </div>
    </section>
  );
}
function Pause() {
  return (
    <section
      className="overlay modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div className="small-modal">
        <div className="modal-sigil">
          <Icon name="pause" />
        </div>
        <div className="eyebrow centered">A MOMENT OF SILENCE</div>
        <h2 id="pause-title">Catch your breath.</h2>
        <p>The ruins will wait. The run is paused.</p>
        <button
          autoFocus
          className="button primary"
          onClick={() => bridge.send({ type: 'resume' })}
        >
          Continue <Icon name="arrow" />
        </button>
        <p className="faint">P / Esc to return to the game</p>
      </div>
    </section>
  );
}
function Death({ state: s }: { state: Snapshot }) {
  return (
    <section
      className="overlay modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="death-title"
    >
      <div className="small-modal death-modal">
        <div className="modal-sigil">◇</div>
        <div className="eyebrow centered">EVERY FIRE LEAVES A MARK</div>
        <h2 id="death-title">The spark has faded.</h2>
        <p>But the light will return to these ruins.</p>
        <div className="result-grid">
          <div>
            <strong>{timeLabel(s.seconds)}</strong>
            <span>SURVIVAL</span>
          </div>
          <div>
            <strong>{s.kills}</strong>
            <span>DEFEATED</span>
          </div>
          <div>
            <strong>{s.level}</strong>
            <span>LEVEL</span>
          </div>
        </div>
        <div className="best-result">
          Personal record <strong>{timeLabel(s.record)}</strong>
        </div>
        <button
          autoFocus
          className="button primary"
          onClick={() => bridge.send({ type: 'restart' })}
        >
          Light it again <Icon name="retry" />
        </button>
        <button className="text-button" onClick={() => bridge.send({ type: 'menu' })}>
          Back to menu
        </button>
      </div>
    </section>
  );
}
export function App() {
  const state = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✳</span>
          <span>
            FANTASY <b>SURVIVORS</b>
          </span>
        </div>
        <div className="header-caption">CHRONICLES OF THE LAST LIGHT</div>
        <div className="build-badge">
          <i /> STAGE 1 <span>v0.1</span>
        </div>
      </header>
      <main className={`arena phase-${state.phase}`}>
        <GameCanvas />
        <div className="vignette" />
        {state.phase === 'menu' ? <Menu state={state} /> : <Hud state={state} />}
        {state.phase === 'upgrade' && <LevelUp state={state} />}
        {state.phase === 'paused' && <Pause />}
        {state.phase === 'dead' && <Death state={state} />}
      </main>
      <footer className="page-footer">
        <span>✦ KEEP YOUR LIGHT</span>
        <span>
          WASD / ARROWS <i>·</i> AUTOMATIC ATTACKS
        </span>
      </footer>
    </div>
  );
}
