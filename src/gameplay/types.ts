import type { ExperienceEvent, RunProgression, XpCrystal } from './experience';
import type { SpawnSettings, ViewportSize } from './spawning';
import type { CharacterClass, CharacterStatsSnapshot, CombatAttributes } from '../character-stats';
import type { RunSkillsSnapshot, SkillCombatSnapshot, SkillEvent } from '../skills';
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
    | 'spawning'
    | 'skill';
  readonly event:
    | CombatEvent
    | WeaponEvent
    | EnemyEvent
    | StatusEvent
    | SurvivalEvent
    | ExperienceEvent
    | RunLevelHealingEvent
    | RewardEvent
    | WaveEvent
    | SkillEvent;
}
export interface GameplaySnapshot {
  readonly time: number;
  readonly paused: boolean;
  readonly player: CombatEntity;
  readonly playerBody: CombatBody;
  readonly character: CharacterStatsSnapshot;
  /** Task 07: permanent stats combined with run passives/buffs (central caps applied once). */
  readonly stats: CombatAttributes;
  readonly skills: RunSkillsSnapshot;
  readonly skillCombat: SkillCombatSnapshot;
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

/** One notification per gained run level; Combat Core emits positive HP healing separately. */
export interface RunLevelHealingEvent {
  readonly type: 'run-level-healed';
  readonly level: number;
  readonly requestedHealing: number;
  readonly healed: number;
}
