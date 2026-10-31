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
  readonly onHit?: readonly EffectDefinition[];
}
export interface WorldEvent {
  readonly sequence: number;
  readonly time: number;
  readonly channel: 'combat' | 'weapon' | 'enemy' | 'status' | 'survival';
  readonly event: CombatEvent | WeaponEvent | EnemyEvent | StatusEvent | SurvivalEvent;
}
export interface GameplaySnapshot {
  readonly time: number;
  readonly paused: boolean;
  readonly player: CombatEntity;
  readonly playerBody: CombatBody;
  readonly character: CharacterStatsSnapshot;
  readonly survival: PlayerSurvivalState;
  readonly kills: number;
  readonly enemies: readonly (EnemySnapshot & { readonly entity: CombatEntity })[];
  readonly playerProjectiles: readonly ProjectileSnapshot[];
  readonly enemyProjectiles: readonly EnemyProjectileSnapshot[];
  readonly statuses: readonly StatusGroupSnapshot[];
  readonly weapon: WeaponState;
  readonly movement: Point;
}
