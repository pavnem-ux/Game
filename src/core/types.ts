export type Phase = 'menu' | 'playing' | 'paused' | 'upgrade' | 'dead';
export type UpgradeId = 'power' | 'haste' | 'vitality' | 'stride' | 'magnet' | 'multishot';
export interface Stats {
  maxHp: number;
  armor: number;
  speed: number;
  damage: number;
  interval: number;
  pickup: number;
  projectiles: number;
}
export interface Upgrade {
  id: UpgradeId;
  icon: string;
  name: string;
  description: string;
  tag: string;
}
export interface Snapshot {
  phase: Phase;
  hp: number;
  maxHp: number;
  xp: number;
  nextXp: number;
  level: number;
  seconds: number;
  kills: number;
  enemies: number;
  choices: Upgrade[];
  ranks: Record<UpgradeId, number>;
  record: number;
}
export type Command =
  | { type: 'start' | 'restart' | 'pause' | 'resume' | 'menu' }
  | { type: 'upgrade'; id: UpgradeId };
