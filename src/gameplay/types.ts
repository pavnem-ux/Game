import type { ExperienceEvent, RunProgression, XpCrystal } from './experience';
import type { SpawnSettings, ViewportSize } from './spawning';
import type { CharacterClass, CharacterStatsSnapshot } from '../character-stats';
import type { CombatEntity, CombatEvent } from '../combat-core';
import type { EnemyEvent, EnemySnapshot, EnemyProjectileSnapshot } from '../enemy-ai';
import type { PlayerSurvivalState, SurvivalEvent } from '../player-survival';
import type { StatusEvent, StatusGroupSnapshot, EffectDefinition } from '../status-effects';
import type {
  WeaponEvent,
  CombatBody,
  Point,
  ProjectileSnapshot,
  WeaponState,
} from '../weapon-attacks';
export interface GameplayOptions {
  readonly characterClass: CharacterClass;
  readonly level?: number;
  readonly seed?: number;
  readonly initialEnemies?: boolean;
  readonly enemyCount?: number;
  readonly spawnDistance?: number;
  readonly spawning?: Partial<SpawnSettings>;
  readonly viewport?: ViewportSize;
  readonly onHit?: readonly EffectDefinition[];
}
export interface WorldEvent {
  readonly sequence: number;
  readonly time: number;
  readonly channel:
    | 'combat'
    | 'weapon'
    | 'enemy'
    | 'status'
    | 'survival'
    | 'progression'
    | 'spawning';
  readonly event:
    | CombatEvent
    | WeaponEvent
    | EnemyEvent
    | StatusEvent
    | SurvivalEvent
    | ExperienceEvent
    | RewardEvent
    | WaveEvent;
}
export interface GameplaySnapshot {
  readonly time: number;
  readonly paused: boolean;
  readonly player: CombatEntity;
  readonly playerBody: CombatBody;
  readonly character: CharacterStatsSnapshot;
  readonly survival: PlayerSurvivalState;
  readonly kills: number;
  readonly progression: RunProgression;
  readonly crystals: readonly XpCrystal[];
  readonly spawning: Readonly<{
    settings: SpawnSettings;
    nextSpawnAt: number;
    waves: number;
    viewport: ViewportSize;
  }>;
  readonly enemies: readonly (EnemySnapshot & { readonly entity: CombatEntity })[];
  readonly playerProjectiles: readonly ProjectileSnapshot[];
  readonly enemyProjectiles: readonly EnemyProjectileSnapshot[];
  readonly statuses: readonly StatusGroupSnapshot[];
  readonly weapon: WeaponState;
  readonly movement: Point;
}

export interface RewardEvent {
  readonly type: 'enemy-rewarded';
  readonly enemyId: string;
  readonly sourceId: string;
  readonly contributors: readonly string[];
  readonly cause: 'direct' | 'periodic';
  readonly effectId?: string;
  readonly xp: number;
  readonly crystalId: string;
  readonly position: Point;
}
export interface WaveEvent {
  readonly type: 'wave-spawned';
  readonly wave: number;
  readonly stage: number;
  readonly enemyIds: readonly string[];
  readonly positions: readonly Point[];
  readonly nextSpawnAt: number;
}
