import {
  lazy,
  Suspense,
  useState,
  useSyncExternalStore,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS, WEAPON_LABELS } from '../gameplay';
import { alphaBridge } from './store';
import { AlphaCanvas } from './AlphaCanvas';
import { EnhancedSkillDialog, LevelUpDialog, PauseDialog, SkillBar } from './SkillPanels';
import { CampaignMenu } from './CampaignMenu';
import { ResultsScreen } from './ResultsScreen';
import { CampaignHud } from './CampaignHud';
import { displayHp } from './format';
import { installSound } from './sound';
import { SynergyBanners } from './SynergyBanners';
import './alpha.css';
const DeveloperPanel =
  import.meta.env.DEV || __QA_BUILD__ ? lazy(() => import('./DeveloperPanel')) : null;
const DebugOverlay =
  import.meta.env.DEV || __QA_BUILD__ ? lazy(() => import('./DebugOverlay')) : null;
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
  const [debugOpen, setDebugOpen] = useState(false);
  useEffect(installSound, []);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const skillsOpener = useRef<HTMLElement | null>(null);
  const openSkills = useCallback(() => {
    skillsOpener.current = document.activeElement as HTMLElement | null;
    setSkillsOpen(true);
  }, []);
  const closeSkills = useCallback(() => {
    setSkillsOpen(false);
    requestAnimationFrame(() => {
      if (skillsOpener.current?.isConnected) skillsOpener.current.focus();
    });
  }, []);
  useEffect(() => {
    setSkillsOpen(false);
  }, [state.runId]);
  // The Pause screen shows Skills inline; a quick-look overview opened during play is folded into it.
  // This only changes UI state, never the simulation's pause ownership.
  useEffect(() => {
    if (state.screen === 'paused') setSkillsOpen(false);
  }, [state.screen]);
  const debug =
    (import.meta.env.DEV || __QA_BUILD__) && new URLSearchParams(location.search).has('debug');
  const s = state.world;
  const hp = s ? displayHp(s.player.currentHp, s.player.maxHp) : null;
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
          {__QA_BUILD__ ? 'QA PREVIEW' : 'COMBAT ALPHA'} <span>08 CAMPAIGN</span>
        </span>
      </header>
      <main className={`arena alpha-arena screen-${state.screen}`}>
        <AlphaCanvas />
        <div className="vignette" />
        {state.screen === 'menu' && <CampaignMenu />}
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
                      {CLASS_LABELS[s.character.characterClass]} · ур. класса{' '}
                      {s.character.permanentLevel}
                    </strong>
                    <span>
                      {hp!.current} / {hp!.max} HP
                    </span>
                  </div>
                  <div
                    className="health-track"
                    role="progressbar"
                    aria-label="Здоровье"
                    aria-valuemin={0}
                    aria-valuemax={hp!.max}
                    aria-valuenow={hp!.current}
                  >
                    <div style={{ width: `${(s.player.currentHp / s.player.maxHp) * 100}%` }} />
                  </div>
                  <div className="alpha-run-xp">
                    <span className="run-level-label">
                      Уровень забега {s.progression.level} · опыт забега {s.progression.xp} /{' '}
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
            <CampaignHud world={s} />
            <SynergyBanners
              events={state.events}
              runId={state.runId}
              active={state.screen === 'playing'}
            />
            <SkillBar
              world={s}
              open={skillsOpen}
              onOpen={openSkills}
              onClose={closeSkills}
              context={state.screen}
            />
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
                {s.campaign ? s.campaign.mapName.toUpperCase() : 'ЗАБЫТАЯ РОЩА'} <i />{' '}
                <small>ВОЛНА {s.spawning.waves + 1}</small>
              </span>
              <span className="pause-hint">
                <kbd>P</kbd> ПАУЗА
              </span>
            </div>
          </>
        )}
        {state.screen === 'enhanced-skill' && s && <EnhancedSkillDialog world={s} />}
        {state.screen === 'level-up' && s?.skills.offer && (
          <LevelUpDialog world={s} onOpenSkills={openSkills} hiddenBehindSkills={skillsOpen} />
        )}
        {state.screen === 'paused' && s && <PauseDialog world={s} />}
        {state.screen === 'results' && s?.campaign && <ResultsScreen world={s} />}
        {(state.screen === 'revival' || state.screen === 'ended') && (
          <section
            className="overlay modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alpha-dialog-title"
            inert={skillsOpen}
            aria-hidden={skillsOpen || undefined}
          >
            <div className="small-modal">
              <div className="modal-sigil">◇</div>
              <div className="eyebrow centered">
                {state.screen === 'revival' ? 'МИР ЖДЁТ ВАШЕГО РЕШЕНИЯ' : 'ЗАБЕГ ЗАВЕРШЁН'}
              </div>
              <h2 id="alpha-dialog-title">
                {state.screen === 'revival' ? 'Ещё одна искра.' : 'Искра погасла.'}
              </h2>
              <p>
                {state.screen === 'revival'
                  ? 'Вернитесь с 50% HP и защитой на 3 секунды. Арена и враги останутся прежними.'
                  : `${time(s?.time ?? 0)} в руинах · ${s?.kills ?? 0} повержено`}
              </p>
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
            {__QA_BUILD__ ? 'QA' : 'DEV'} · {debugOpen ? 'Закрыть' : 'Тестирование'}
          </button>
        )}
        {debug && s && DebugOverlay && (
          <Suspense fallback={null}>
            <DebugOverlay world={s} fps={state.fps} />
          </Suspense>
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
