import type { CharacterClass } from '../character-stats';
import type { GameplayOptions, GameplaySnapshot, WorldEvent } from '../gameplay';
import type { QaSnapshot } from '../gameplay/qa';
export type AlphaCommand =
  | { type: 'start'; options: GameplayOptions }
  | {
      type:
        | 'pause'
        | 'resume'
        | 'menu'
        | 'revive'
        | 'finish'
        | 'reroll'
        | 'abandon'
        | 'kill-on-screen';
    }
  | { type: 'choose-skill'; card: string }
  | { type: 'time-scale'; scale: number }
  | { type: 'testing'; action: unknown };
export interface AlphaState {
  readonly screen: 'menu' | 'playing' | 'paused' | 'revival' | 'ended' | 'level-up' | 'results';
  readonly world: GameplaySnapshot | null;
  readonly events: readonly WorldEvent[];
  readonly runId: number;
  readonly record: number;
  readonly error: string;
  readonly qa?: QaSnapshot | null;
  /** DEV/QA only: current debug time scale (×1/×2/×4/×8). */
  readonly timeScale?: number;
}
const INITIAL_STATE: AlphaState = Object.freeze({
  screen: 'menu',
  world: null,
  events: [],
  runId: 0,
  record: 0,
  error: '',
});
let snapshot: AlphaState = INITIAL_STATE;
const listeners = new Set<() => void>(),
  commands = new Set<(command: AlphaCommand) => void>();
export const alphaBridge = {
  getSnapshot: () => snapshot,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  publish: (state: AlphaState) => {
    snapshot = Object.freeze(state);
    listeners.forEach((fn) => fn());
  },
  send: (command: AlphaCommand) => commands.forEach((fn) => fn(command)),
  /** Task 08.5 crash recovery: drop the stale run snapshot (the remounted scene publishes anew). */
  reset: () => {
    snapshot = INITIAL_STATE;
    listeners.forEach((fn) => fn());
  },
  onCommand: (fn: (command: AlphaCommand) => void) => {
    commands.add(fn);
    return () => {
      commands.delete(fn);
    };
  },
};
export const CLASS_COLORS: Record<CharacterClass, number> = {
  warrior: 0xe8b16c,
  mage: 0x91d7e7,
  archer: 0xb2d58a,
  rogue: 0xc6a2ef,
};
