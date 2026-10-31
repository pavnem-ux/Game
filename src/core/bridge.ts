import type { Command, Snapshot } from './types';
import { freshRanks, xpForLevel } from './progression';
import { loadSave } from '../progression/save';
type Listener = () => void;
export class GameBridge {
  private state: Snapshot = {
    phase: 'menu',
    hp: 100,
    maxHp: 100,
    xp: 0,
    nextXp: xpForLevel(1),
    level: 1,
    seconds: 0,
    kills: 0,
    enemies: 0,
    choices: [],
    ranks: freshRanks(),
    record: loadSave().bestSeconds,
  };
  private listeners = new Set<Listener>();
  private commands = new Set<(command: Command) => void>();
  getSnapshot = () => this.state;
  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  publish(state: Snapshot) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  send(command: Command) {
    this.commands.forEach((fn) => fn(command));
  }
  onCommand(fn: (command: Command) => void) {
    this.commands.add(fn);
    return () => {
      this.commands.delete(fn);
    };
  }
}
export const bridge = new GameBridge();
