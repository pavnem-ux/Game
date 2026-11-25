import { useSyncExternalStore } from 'react';
import { GAME_SPEEDS, gameSpeedLabel, nextGameSpeed } from '../engine/time-scale';
import type { GameSpeed } from '../engine/time-scale';
import { uiSettings } from './ui-settings';
import { EN } from './strings-en';

/**
 * Task 36 / 38 «Game speed» controls, ×1 … ×5 (presentation only: they change a UI setting; the
 * scene reads it each frame and simulates that many more fixed steps). The choice is kept in the settings, so the
 * next run starts at it. While the game is paused / on an offer / revive / results nothing advances,
 * whatever the speed.
 */
const useGameSpeed = (): GameSpeed =>
  useSyncExternalStore(uiSettings.subscribe, () => uiSettings.get().gameSpeed);
const setGameSpeed = (gameSpeed: GameSpeed) => uiSettings.set({ gameSpeed });

/** In-run HUD button next to the timer: shows the current multiplier, cycles ×1 → ×1.5 → ×2 → ×3 → ×4 → ×5 → ×1. */
export function GameSpeedButton() {
  const speed = useGameSpeed();
  return (
    <button
      type="button"
      className="game-speed-button"
      data-testid="game-speed-button"
      data-speed={speed}
      aria-label={EN.settings.gameSpeedButton(gameSpeedLabel(speed))}
      title={EN.settings.gameSpeedHint}
      // A click must not leave focus on the button (Space / Enter are game keys for some players).
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setGameSpeed(nextGameSpeed(speed))}
    >
      {gameSpeedLabel(speed)}
    </button>
  );
}

/** «Game speed» choice for the pause menu and Settings (×1 / ×1.5 / ×2 / ×3 / ×4 / ×5). */
export function GameSpeedChoice({ className = '' }: { className?: string }) {
  const speed = useGameSpeed();
  return (
    <fieldset className={`game-speed-choice ${className}`} data-testid="game-speed-choice">
      <legend>{EN.settings.gameSpeed}</legend>
      <div className="game-speed-options" role="radiogroup" aria-label={EN.settings.gameSpeed}>
        {GAME_SPEEDS.map((s) => (
          <label key={s} className={s === speed ? 'is-selected' : ''}>
            <input
              type="radio"
              name="game-speed"
              value={s}
              checked={s === speed}
              onChange={() => setGameSpeed(s)}
            />
            {gameSpeedLabel(s)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
