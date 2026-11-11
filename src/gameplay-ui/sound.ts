import { actOf } from '../campaign';
import type { GameplaySnapshot, WorldEvent } from '../gameplay';
import { AudioDirector, busGains } from '../audio';
import type { CueContext, SoundCue } from '../audio';
import { WebAudioEngine } from '../audio/engine';
import { alphaBridge } from './store';
import type { AlphaState } from './store';
import { uiSettings } from './ui-settings';

/**
 * Task 14 sound wiring (browser, presentation only): one Web Audio engine + director, fed by the
 * scene's per-frame world events and the throttled bridge state; volumes from `uiSettings`; the
 * AudioContext is created on the first user gesture. Nothing here reaches the simulation.
 */
const engine = new WebAudioEngine();
export const audioDirector = new AudioDirector(engine);
const applySettings = () => {
  const s = uiSettings.get();
  audioDirector.setMuted(s.muted);
  audioDirector.volumes(busGains(s));
};
applySettings();
uiSettings.subscribe(applySettings);

const EMPTY: ReadonlySet<string> = new Set();
let cueContext: CueContext = { playerId: 'player', eliteIds: EMPTY, bossId: null };
function musicState(state: AlphaState) {
  const w = state.world;
  const c = w?.campaign ?? null;
  cueContext = {
    playerId: 'player',
    eliteIds: c ? new Set(c.eliteEnemyIds) : EMPTY,
    bossId: c?.bossEnemyId ?? null,
  };
  audioDirector.state({
    screen: state.screen,
    runId: state.runId,
    act: c ? actOf(c.mapId).id : null,
    bossAlive: bossAlive(w),
    hpShare: w && w.player.maxHp > 0 ? w.player.currentHp / w.player.maxHp : null,
  });
}
const bossAlive = (w: GameplaySnapshot | null) => {
  const id = w?.campaign?.bossEnemyId;
  return !!id && !!w?.enemies.some((e) => e.entityId === id && e.alive);
};
let installed = false;
/** Installs the gesture unlock, UI sounds and bridge listener once (AlphaApp mount). */
export function installSound() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const unlock = () => {
    if (engine.unlock() && engine.live) {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    }
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  let hovered: Element | null = null;
  document.addEventListener('pointerover', (e) => {
    const b = (e.target as Element | null)?.closest?.('button:not(:disabled)') ?? null;
    if (b && b !== hovered && !b.closest('[data-sound="none"]')) audioDirector.cue('ui-hover');
    hovered = b;
  });
  document.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (!b || b.disabled) return;
    const tagged = b.closest('[data-sound]')?.getAttribute('data-sound');
    if (tagged === 'none' || performance.now() - explicitAt < 80) return;
    if (tagged) return void audioDirector.cue(tagged as SoundCue);
    const primary = b.matches('.kit-button-primary, .button.primary');
    audioDirector.cue(primary ? 'ui-confirm' : 'ui-click');
  });
  alphaBridge.subscribe(() => musicState(alphaBridge.getSnapshot()));
  musicState(alphaBridge.getSnapshot());
}
/** Scene hook: the frame's new world events (read-only) and the heartbeat clock. */
export function soundFrame(events: readonly WorldEvent[]) {
  if (events.length) audioDirector.worldEvents(events, cueContext);
  audioDirector.frame();
}
let explicitAt = -Infinity;
/** Explicit UI cue (buy / error / …); suppresses the generic click sound of the same click. */
export const uiSound = (cue: SoundCue) => {
  explicitAt = performance.now();
  return audioDirector.cue(cue);
};
