import { lazy, Suspense, useState, useSyncExternalStore, useEffect } from 'react';
import type { CharacterClass } from '../character-stats';
import { CLASS_LABELS, WEAPON_LABELS } from '../gameplay';
import { alphaBridge } from './store';
import { AlphaCanvas } from './AlphaCanvas';
import {
  ActiveSkills,
  EnhancedSkillDialog,
  LevelUpDialog,
  PauseDialog,
  SkillBar,
} from './SkillPanels';
import { CampaignMenu } from './CampaignMenu';
import { ResultsScreen } from './ResultsScreen';
import { CampaignHud } from './CampaignHud';
import { displayHp } from './format';
import { installSound } from './sound';
import { preloadSkillIcons } from './kit';
import { SynergyBanners } from './SynergyBanners';
import { TouchControls } from './TouchControls';
import { GameSpeedButton } from './GameSpeed';
import { FullscreenButton, OrientationNotice, useBlockGestures } from './DeviceChrome';
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
  // Task 27: the skill icons are fetched up front so offers / HUD never wait for them.
  useEffect(preloadSkillIcons, []);
  useBlockGestures(state.screen !== 'menu');
  const debug =
    (import.meta.env.DEV || __QA_BUILD__) && new URLSearchParams(location.search).has('debug');
  const s = state.world;
  const hp = s ? displayHp(s.player.currentHp, s.player.maxHp) : null;
  return (
    <div className={`app-shell alpha-shell${state.screen === 'menu' ? '' : ' in-run'}`}>
      {/* Task 37: no top bar; QA builds keep a small corner badge (never in production). */}
      {__QA_BUILD__ && (
        <span className="qa-corner-badge" aria-label="QA preview build">
          QA PREVIEW
        </span>
      )}
      <main
        className={`arena alpha-arena screen-${state.screen}`}
        // Task 16: no long-press menu over the arena during play.
        onContextMenu={(e) => {
          if (state.screen !== 'menu') e.preventDefault();
        }}
      >
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
                      {CLASS_LABELS[s.character.characterClass]} · class lv.{' '}
                      {s.character.permanentLevel}
                    </strong>
                    <span>
                      {hp!.current} / {hp!.max} HP
                    </span>
                  </div>
                  <div
                    className="health-track"
                    role="progressbar"
                    aria-label="Health"
                    aria-valuemin={0}
                    aria-valuemax={hp!.max}
                    aria-valuenow={hp!.current}
                  >
                    <div style={{ width: `${(s.player.currentHp / s.player.maxHp) * 100}%` }} />
                  </div>
                  <div className="alpha-run-xp">
                    <span className="run-level-label">
                      Run level {s.progression.level} · run XP {s.progression.xp} /{' '}
                      {s.progression.nextXp}
                    </span>
                    <div
                      className="alpha-xp-track"
                      role="progressbar"
                      aria-label="Run XP"
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
                    <span>{s.survival.revivalUsed ? 'REVIVAL USED' : 'REVIVAL 1 / 1'}</span>
                  </div>
                </div>
              </div>
              <div className="timer">
                <span>TIME IN THE RUINS</span>
                <strong data-testid="alpha-timer">{time(s.time)}</strong>
                <GameSpeedButton />
              </div>
              <div className="hud-right">
                <div className="kill-count">
                  <span>DEFEATED</span>
                  <strong>{s.kills.toString().padStart(3, '0')}</strong>
                </div>
                <FullscreenButton />
                <button
                  className="icon-button"
                  aria-label="Pause"
                  disabled={state.screen !== 'playing'}
                  onClick={() => alphaBridge.send({ type: 'pause' })}
                >
                  Ⅱ
                </button>
              </div>
            </div>
            <CampaignHud world={s} />
            <TouchControls world={s} active={state.screen === 'playing'} />
            <SynergyBanners
              events={state.events}
              runId={state.runId}
              active={state.screen === 'playing'}
            />
            <SkillBar world={s} />
            <div className="alpha-mobile-summary">
              {time(s.time)} · {s.kills} defeated
            </div>
            <div className="alpha-effects" aria-label="Player effects">
              {s.survival.fullyProtected && (
                <span className="full-protection">
                  FULL PROTECTION ·{' '}
                  {Math.max(0, s.survival.fullInvulnerableUntil! - s.time).toFixed(1)} s
                </span>
              )}
              {s.statuses
                .filter((g) => g.targetId === 'player')
                .map((g) => (
                  <span key={g.id} className={`effect-${g.effectType}`}>
                    {g.effectType.toUpperCase()} ×{g.stacks.length} ·{' '}
                    {Math.max(0, g.expiresAt - s.time).toFixed(1)} s
                  </span>
                ))}
            </div>
            <ActiveSkills world={s} />
            <div className="bottom-hud">
              <div className="weapon">
                <span className="weapon-icon">{symbols[s.character.characterClass]}</span>
                <div>
                  <strong>{WEAPON_LABELS[s.character.characterClass]}</strong>
                  <span>AUTO-ATTACK · {s.enemies.filter((e) => e.alive).length} ENEMIES</span>
                </div>
              </div>
              <span className="pause-hint">
                <kbd>P</kbd> PAUSE
              </span>
            </div>
          </>
        )}
        {state.screen === 'enhanced-skill' && s && <EnhancedSkillDialog world={s} />}
        {state.screen === 'level-up' && s?.skills.offer && <LevelUpDialog world={s} />}
        {state.screen === 'paused' && s && <PauseDialog world={s} />}
        {state.screen === 'results' && s?.campaign && <ResultsScreen world={s} />}
        {(state.screen === 'revival' || state.screen === 'ended') && (
          <section
            className="overlay modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alpha-dialog-title"
          >
            <div className="small-modal">
              <div className="modal-sigil">◇</div>
              <div className="eyebrow centered">
                {state.screen === 'revival' ? 'THE WORLD AWAITS YOUR DECISION' : 'RUN OVER'}
              </div>
              <h2 id="alpha-dialog-title">
                {state.screen === 'revival' ? 'One more spark.' : 'The spark has faded.'}
              </h2>
              <p>
                {state.screen === 'revival'
                  ? 'Return with 50% HP and 3 seconds of protection. The arena and enemies stay as they are.'
                  : `${time(s?.time ?? 0)} in the ruins · ${s?.kills ?? 0} defeated`}
              </p>
              {state.screen === 'revival' && (
                <>
                  <button
                    className="button primary"
                    onClick={() => alphaBridge.send({ type: 'revive' })}
                  >
                    Revive
                  </button>
                  <button
                    className="text-button"
                    onClick={() => alphaBridge.send({ type: 'finish' })}
                  >
                    End run
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
                  New run →
                </button>
              )}
              {state.screen !== 'revival' && (
                <button className="text-button" onClick={() => alphaBridge.send({ type: 'menu' })}>
                  Choose class
                </button>
              )}
            </div>
          </section>
        )}
        <OrientationNotice inRun={state.screen !== 'menu'} playing={state.screen === 'playing'} />
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
            {__QA_BUILD__ ? 'QA' : 'DEV'} · {debugOpen ? 'Close' : 'Testing'}
          </button>
        )}
        {debug && s && DebugOverlay && (
          <Suspense fallback={null}>
            <DebugOverlay world={s} fps={state.fps} />
          </Suspense>
        )}
        {debug && debugOpen && DeveloperPanel && (
          <Suspense fallback={<div className="developer-panel">Loading…</div>}>
            <DeveloperPanel state={state} />
          </Suspense>
        )}
      </main>
      <footer className="page-footer">
        <span>✦ KEEP YOUR LIGHT</span>
        <span>WASD / ARROWS · AUTOMATIC ATTACKS</span>
      </footer>
    </div>
  );
}
