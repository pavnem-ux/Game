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
        <strong>Двигайтесь, чтобы выжить</strong>
        <p>Атака автоматическая · P / Esc — пауза</p>
        <p className="touch-hint">На телефоне: потяните по левой части арены</p>
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
            <i /> FANTASY SURVIVORS <span>01 / АРЕНА</span>
          </div>
          <h1 id="game-title">
            Последний
            <br />
            <em>свет.</em>
          </h1>
          <p className="intro-copy">
            Руины пробудились. Тьма приближается.
            <br />
            Сохраните искру — и не останавливайтесь.
          </p>
          <div className="run-details">
            <span>
              <Icon name="clock" /> БЕСКОНЕЧНЫЙ ЗАБЕГ
            </span>
            <span>✧ ОПЫТ И УЛУЧШЕНИЯ</span>
          </div>
          <button
            className="button primary start-button"
            onClick={() => bridge.send({ type: 'start' })}
          >
            Войти в руины <Icon name="arrow" />
          </button>
          <Keyboard />
          {state.record > 0 && (
            <p className="record">
              ВАШ РЕКОРД <strong>{timeLabel(state.record)}</strong>
            </p>
          )}
        </div>
        <div className="character-card">
          <div className="character-top">
            <span>ВАШ ГЕРОЙ</span>
            <span className="class-tag">МАГ</span>
          </div>
          <Portrait />
          <div className="character-info">
            <div className="tiny">ХРАНИТЕЛЬ I</div>
            <h2>{CLASS.name}</h2>
            <p>Его посох помнит тепло ушедшего солнца.</p>
            <div className="character-stats">
              <div>
                <b>100</b>
                <span>ЗДОРОВЬЕ</span>
              </div>
              <div>
                <b>20</b>
                <span>УРОН</span>
              </div>
              <div>
                <b>✦</b>
                <span>ИСКРА</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="menu-foot">
        <span>ОДИН ХРАНИТЕЛЬ. ОДНА ИСКРА. НЕСЧЁТНАЯ ТЬМА.</span>
        <span>ПРОТОТИП · ЭТАП 1</span>
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
        aria-label="Опыт"
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
              <strong>Хранитель</strong>
              <span>
                {Math.ceil(s.hp)} <small>/ {s.maxHp} HP</small>
              </span>
            </div>
            <div
              className="health-track"
              role="progressbar"
              aria-label="Здоровье"
              aria-valuemin={0}
              aria-valuemax={s.maxHp}
              aria-valuenow={s.hp}
            >
              <div style={{ width: `${(s.hp / s.maxHp) * 100}%` }} />
            </div>
            <div className="level-label">
              <span>УРОВЕНЬ {s.level}</span>
              <span>
                {s.xp} / {s.nextXp} ОПЫТА
              </span>
            </div>
          </div>
        </div>
        <div className="timer">
          <span>ВРЕМЯ В РУИНАХ</span>
          <strong data-testid="timer">{timeLabel(s.seconds)}</strong>
        </div>
        <div className="hud-right">
          <div className="kill-count">
            <span>ПОВЕРЖЕНО</span>
            <strong>{s.kills.toString().padStart(3, '0')}</strong>
          </div>
          <button
            className="icon-button"
            aria-label="Пауза"
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
            <strong>Искра</strong>
            <span>СИЛА {s.ranks.power + 1} · АВТОАТАКА</span>
          </div>
          {s.ranks.multishot > 0 && <b>×{s.ranks.multishot + 1}</b>}
        </div>
        <span className="arena-caption">
          ЗАБЫТАЯ РОЩА <i /> <small>ВОЛНА {1 + Math.floor(s.seconds / 60)}</small>
        </span>
        <span className="pause-hint">
          <kbd>P</kbd> ПАУЗА
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
        <div className="eyebrow centered">ИСКРА СТАНОВИТСЯ СИЛЬНЕЕ</div>
        <h2 id="upgrade-title">
          Новый уровень<span>.</span>
        </h2>
        <p className="modal-description">
          Уровень {s.level} · Выберите благословение для этого забега
        </p>
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
                <span>РАНГ {s.ranks[u.id] + 1}</span>
                <b>
                  Выбрать <Icon name="arrow" />
                </b>
              </div>
            </button>
          ))}
        </div>
        <p className="faint">Время остановлено. Выбирайте без спешки.</p>
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
        <div className="eyebrow centered">МИГ ТИШИНЫ</div>
        <h2 id="pause-title">Перевести дух.</h2>
        <p>Руины подождут. Забег на паузе.</p>
        <button
          autoFocus
          className="button primary"
          onClick={() => bridge.send({ type: 'resume' })}
        >
          Продолжить <Icon name="arrow" />
        </button>
        <p className="faint">P / Esc — вернуться в игру</p>
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
        <div className="eyebrow centered">КАЖДЫЙ ОГОНЬ ОСТАВЛЯЕТ СЛЕД</div>
        <h2 id="death-title">Искра погасла.</h2>
        <p>Но свет ещё вернётся в эти руины.</p>
        <div className="result-grid">
          <div>
            <strong>{timeLabel(s.seconds)}</strong>
            <span>ВЫЖИВАНИЕ</span>
          </div>
          <div>
            <strong>{s.kills}</strong>
            <span>ПОВЕРЖЕНО</span>
          </div>
          <div>
            <strong>{s.level}</strong>
            <span>УРОВЕНЬ</span>
          </div>
        </div>
        <div className="best-result">
          Личный рекорд <strong>{timeLabel(s.record)}</strong>
        </div>
        <button
          autoFocus
          className="button primary"
          onClick={() => bridge.send({ type: 'restart' })}
        >
          Зажечь снова <Icon name="retry" />
        </button>
        <button className="text-button" onClick={() => bridge.send({ type: 'menu' })}>
          Вернуться в меню
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
        <div className="header-caption">ХРОНИКИ ПОСЛЕДНЕГО СВЕТА</div>
        <div className="build-badge">
          <i /> ЭТАП 1 <span>v0.1</span>
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
        <span>✦ СОХРАНИТЕ СВОЙ СВЕТ</span>
        <span>
          WASD / СТРЕЛКИ <i>·</i> АТАКА АВТОМАТИЧЕСКАЯ
        </span>
      </footer>
    </div>
  );
}
