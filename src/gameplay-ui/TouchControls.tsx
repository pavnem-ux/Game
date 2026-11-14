import type { GameplaySnapshot } from '../gameplay';
import { alphaBridge } from './store';
import { pulse, useTouchDevice } from './touch';
import { EN } from './strings-en';
import { uiSettings } from './ui-settings';
import { useSyncExternalStore } from 'react';

/**
 * Task 16 touch controls (touch devices only; desktop unchanged): the dash button with its
 * cooldown ring. The joystick is drawn by the scene where the thumb lands. «Left-handed» mirrors sides.
 * A tap sends the same `dash` request as Space / Shift.
 */
export function TouchControls({ world, active }: { world: GameplaySnapshot; active: boolean }) {
  const touch = useTouchDevice();
  const settings = useSyncExternalStore(uiSettings.subscribe, uiSettings.get);
  if (!touch || !active) return null;
  const { dash } = world;
  const left = Math.max(0, dash.readyAt - world.time);
  const ready = left <= 0 && !dash.active;
  const done = dash.cooldown > 0 ? 1 - Math.min(1, left / dash.cooldown) : 1;
  return (
    <div className={`touch-controls${settings.leftHanded ? ' left-handed' : ''}`}>
      <button
        type="button"
        className={`touch-dash${ready ? ' is-ready' : ''}`}
        aria-label={ready ? EN.touch.dashReady : EN.touch.dashCooldown(left.toFixed(1))}
        style={{ ['--done' as string]: `${Math.round(done * 360)}deg` }}
        onPointerDown={(e) => {
          e.preventDefault();
          if (!ready) return;
          alphaBridge.send({ type: 'dash' });
          pulse(12);
        }}
      >
        <span>⇢</span>
        <small>{ready ? EN.touch.dash : left.toFixed(1)}</small>
      </button>
    </div>
  );
}
