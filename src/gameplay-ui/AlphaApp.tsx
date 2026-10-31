import { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import type { CharacterClass } from '../character-stats';
import { CHARACTER_CLASSES, calculateCharacterStats } from '../character-stats';
import { CLASS_LABELS, WEAPON_LABELS } from '../gameplay';
import { alphaBridge } from './store';
import { AlphaCanvas } from './AlphaCanvas';
import './alpha.css';
const DeveloperPanel = import.meta.env.DEV ? lazy(() => import('./DeveloperPanel')) : null;
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
const symbols: Record<CharacterClass, string> = {
  warrior: '⚔',
  mage: '✦',
  archer: '➶',
  rogue: '⟐',
};
export function AlphaApp() {
  const state = useSyncExternalStore(alphaBridge.subscribe, alphaBridge.getSnapshot);
  const [selected, setSelected] = useState<CharacterClass>('warrior');
  const [level, setLevel] = useState(1);
  const [debugOpen, setDebugOpen] = useState(false);
  const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');
  const s = state.world;
  const start = () =>
    alphaBridge.send({ type: 'start', options: { characterClass: selected, level } });
  return (
    <div className="app-shell alpha-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✳</span>
          <span>
            FANTASY <b>SURVIVORS</b>
          </span>
        </div>
        <span className="header-caption">ХРОНИКИ ПОСЛЕДНЕГО СВЕТА</span>
        <span className="build-badge">
          COMBAT ALPHA <span>06</span>
        </span>
      </header>
      <main className={`arena alpha-arena screen-${state.screen}`}>
        <AlphaCanvas />
        <div className="vignette" />
        {state.screen === 'menu' && (
          <section className="overlay alpha-menu" aria-labelledby="alpha-title">
            <div className="alpha-intro">
              <div className="eyebrow">ИСПЫТАНИЕ В РУИНАХ · COMBAT ALPHA</div>
              <h1 id="alpha-title">
                Выберите
                <br />
                <em>свой свет.</em>
              </h1>
              <p>
                Четыре героя. Одно воскрешение.
                <br />
                Двигайтесь свободно — оружие атакует само.
              </p>
              <p className="alpha-help">
                WASD / стрелки · P / Esc — пауза
                <br />
                На телефоне — джойстик слева внизу
              </p>
              <p className="alpha-note">
                Тестовая арена · предварительный баланс
                <br />
                Собирайте XP-кристаллы · новые группы врагов приходят постоянно.
              </p>
            </div>
            <div className="alpha-selection">
              <div className="class-grid" role="group" aria-label="Выбор класса">
                {CHARACTER_CLASSES.map((c) => {
                  const stats = calculateCharacterStats(c, level).combatAttributes;
                  return (
                    <button
                      key={c}
                      className={`class-choice class-${c} ${selected === c ? 'selected' : ''}`}
                      aria-pressed={selected === c}
                      onClick={() => setSelected(c)}
                    >
                      <span className="class-symbol">{symbols[c]}</span>
                      <strong>{CLASS_LABELS[c]}</strong>
                      <small>{WEAPON_LABELS[c]}</small>
                      <span>
                        {stats.maxHp} HP ·{' '}
                        {c === 'mage' ? stats.magicalDamage : stats.physicalDamage} урона
                      </span>
                    </button>
                  );
                })}
              </div>
              <button className="button primary" onClick={start}>
                Начать забег · {CLASS_LABELS[selected]} →
              </button>
              <p className="alpha-note">
                Постоянный уровень {level} · melee + ranged волны
                <br />
                Уровень забега растёт от XP; постоянные характеристики сохраняются.
              </p>
              {debug && (
                <label className="alpha-level">
                  Тестовый уровень (1–50)
                  <input
                    aria-label="Стартовый уровень"
                    type="number"
                    min="1"
                    max="50"
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
          </section>
        )}
        {s && (
          <>
            <div className="hud alpha-hud">
              <div className="health-panel">
                <div className={`avatar class-${s.character.characterClass}`}>
                  {symbols[s.character.characterClass]}
                </div>
                <div className="health-details">
                  <div className="health-label">
                    <strong>
                      {CLASS_LABELS[s.character.characterClass]} · забег {s.progression.level}
                    </strong>
                    <span>
                      {s.player.currentHp.toFixed(s.player.currentHp % 1 ? 1 : 0)} /{' '}
                      {s.player.maxHp} HP
                    </span>
                  </div>
                  <div
                    className="health-track"
                    role="progressbar"
                    aria-label="Здоровье"
                    aria-valuemin={0}
                    aria-valuemax={s.player.maxHp}
                    aria-valuenow={s.player.currentHp}
                  >
                    <div style={{ width: `${(s.player.currentHp / s.player.maxHp) * 100}%` }} />
                  </div>
                  <div className="alpha-run-xp">
                    <span>
                      Пост. ур. {s.character.permanentLevel} · XP {s.progression.xp} /{' '}
                      {s.progression.nextXp}
                    </span>
                    <div
                      className="alpha-xp-track"
                      role="progressbar"
                      aria-label="Опыт забега"
                      aria-valuemin={0}
                      aria-valuemax={s.progression.nextXp}
                      aria-valuenow={s.progression.xp}
                    >
                      <div
                        style={{ width: `${(s.progression.xp / s.progression.nextXp) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="level-label">
                    <span>
                      {s.survival.revivalUsed ? 'ВОСКРЕШЕНИЕ ИСПОЛЬЗОВАНО' : 'ВОСКРЕШЕНИЕ 1 / 1'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="timer">
                <span>ВРЕМЯ В РУИНАХ</span>
                <strong data-testid="alpha-timer">{time(s.time)}</strong>
              </div>
              <div className="hud-right">
                <div className="kill-count">
                  <span>ПОВЕРЖЕНО</span>
                  <strong>{s.kills.toString().padStart(3, '0')}</strong>
                </div>
                <button
                  className="icon-button"
                  aria-label="Пауза"
                  disabled={state.screen !== 'playing'}
                  onClick={() => alphaBridge.send({ type: 'pause' })}
                >
                  Ⅱ
                </button>
              </div>
            </div>
            <div className="alpha-mobile-summary">
              {time(s.time)} · {s.kills} повержено
            </div>
            <div className="alpha-effects" aria-label="Эффекты игрока">
              {s.survival.fullyProtected && (
                <span className="full-protection">
                  ПОЛНАЯ ЗАЩИТА ·{' '}
                  {Math.max(0, s.survival.fullInvulnerableUntil! - s.time).toFixed(1)} с
                </span>
              )}
              {s.statuses
                .filter((g) => g.targetId === 'player')
                .map((g) => (
                  <span key={g.id} className={`effect-${g.effectType}`}>
                    {g.effectType.toUpperCase()} ×{g.stacks.length} ·{' '}
                    {Math.max(0, g.expiresAt - s.time).toFixed(1)} с
                  </span>
                ))}
            </div>
            <div className="bottom-hud">
              <div className="weapon">
                <span className="weapon-icon">{symbols[s.character.characterClass]}</span>
                <div>
                  <strong>{WEAPON_LABELS[s.character.characterClass]}</strong>
                  <span>АВТОАТАКА · {s.enemies.filter((e) => e.alive).length} ВРАГОВ</span>
                </div>
              </div>
              <span className="arena-caption">
                ЗАБЫТАЯ РОЩА <i /> <small>ВОЛНА {s.spawning.waves + 1}</small>
              </span>
              <span className="pause-hint">
                <kbd>P</kbd> ПАУЗА
              </span>
            </div>
          </>
        )}
        {(state.screen === 'paused' || state.screen === 'revival' || state.screen === 'ended') && (
          <section
            className="overlay modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alpha-dialog-title"
          >
            <div className="small-modal">
              <div className="modal-sigil">{state.screen === 'paused' ? 'Ⅱ' : '◇'}</div>
              <div className="eyebrow centered">
                {state.screen === 'revival'
                  ? 'МИР ЖДЁТ ВАШЕГО РЕШЕНИЯ'
                  : state.screen === 'ended'
                    ? 'ЗАБЕГ ЗАВЕРШЁН'
                    : 'МИГ ТИШИНЫ'}
              </div>
              <h2 id="alpha-dialog-title">
                {state.screen === 'paused'
                  ? 'Перевести дух.'
                  : state.screen === 'revival'
                    ? 'Ещё одна искра.'
                    : 'Искра погасла.'}
              </h2>
              <p>
                {state.screen === 'revival'
                  ? 'Вернитесь с 50% HP и защитой на 3 секунды. Арена и враги останутся прежними.'
                  : state.screen === 'paused'
                    ? 'Всё игровое время остановлено.'
                    : `${time(s?.time ?? 0)} в руинах · ${s?.kills ?? 0} повержено`}
              </p>
              {state.screen === 'paused' && (
                <button
                  className="button primary"
                  onClick={() => alphaBridge.send({ type: 'resume' })}
                >
                  Продолжить →
                </button>
              )}
              {state.screen === 'revival' && (
                <>
                  <button
                    className="button primary"
                    onClick={() => alphaBridge.send({ type: 'revive' })}
                  >
                    Воскреснуть · Revive
                  </button>
                  <button
                    className="text-button"
                    onClick={() => alphaBridge.send({ type: 'finish' })}
                  >
                    Завершить забег · End Run
                  </button>
                </>
              )}
              {state.screen === 'ended' && (
                <button
                  className="button primary"
                  onClick={() =>
                    alphaBridge.send({
                      type: 'start',
                      options: {
                        characterClass: s!.character.characterClass,
                        level: s!.character.permanentLevel,
                      },
                    })
                  }
                >
                  Новый забег →
                </button>
              )}
              {state.screen !== 'revival' && (
                <button className="text-button" onClick={() => alphaBridge.send({ type: 'menu' })}>
                  Выбрать класс
                </button>
              )}
            </div>
          </section>
        )}
        {state.error && (
          <div className="alpha-error" role="alert">
            {state.error}
          </div>
        )}
        {debug && (
          <button
            className="developer-toggle"
            aria-expanded={debugOpen}
            onClick={() => setDebugOpen(!debugOpen)}
          >
            DEV · {debugOpen ? 'Закрыть' : 'Тестирование'}
          </button>
        )}
        {debug && debugOpen && DeveloperPanel && (
          <Suspense fallback={<div className="developer-panel">Загрузка…</div>}>
            <DeveloperPanel state={state} />
          </Suspense>
        )}
      </main>
      <footer className="page-footer">
        <span>✦ СОХРАНИТЕ СВОЙ СВЕТ</span>
        <span>WASD / СТРЕЛКИ · АТАКА АВТОМАТИЧЕСКАЯ</span>
      </footer>
    </div>
  );
}
