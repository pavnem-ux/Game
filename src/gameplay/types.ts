import type { RunStatsSnapshot } from './run-stats';
import type { ExperienceEvent, RunProgression, XpCrystal } from './experience';
import type { SpawnSettings, ViewportSize } from './spawning';
import type { CharacterClass, CharacterStatsSnapshot, CombatAttributes } from '../character-stats';
import type { BossAbilityOutcome, BossCastState } from '../campaign';
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
  /** Task 08: play a campaign map (scaled enemies/spawning, timer, scheduled events). */
  readonly campaign?: Readonly<{ mapId: number; runId?: string }>;
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
    | 'skill'
    | 'campaign';
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
    | SkillEvent
    | CampaignEvent;
}
export interface GameplaySnapshot {
  readonly time: number;
  /** Task 08.5: in-memory statistics of this run (reset with every new world). */
  readonly runStats: RunStatsSnapshot;
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
  /** Task 08: campaign run state (null outside campaign runs). */
  readonly campaign: CampaignSnapshot | null;
}
/** Task 08 scheduled campaign events (channel `campaign`), each emitted exactly once. */
export type CampaignEvent =
  | {
      readonly type: 'elite-spawned';
      readonly eventId: string;
      readonly enemyId: string;
      readonly profile: 'melee' | 'ranged';
    }
  | {
      readonly type: 'boss-spawned';
      readonly eventId: 'boss';
      readonly enemyId: string;
      readonly bossId: string;
      readonly bossName: string;
    }
  | { readonly type: 'duration-reached'; readonly eventId: 'end' }
  | BossAbilityOutcome
  | {
      readonly type: 'boss-defeated';
      readonly enemyId: string;
      readonly bossId: string;
      readonly bossName: string;
    }
  | {
      readonly type: 'run-resolved';
      readonly outcome: 'victory' | 'defeat' | 'abandoned';
      readonly runId: string | null;
      readonly elapsed: number;
    };
export interface CampaignSnapshot {
  readonly mapId: number;
  readonly mapName: string;
  readonly duration: number;
  readonly elapsed: number;
  readonly remaining: number;
  readonly durationReached: boolean;
  readonly stage: Readonly<{ id: string; name: string; index: number }>;
  /** Next scheduled event (elite/boss/end) or null when all fired. */
  readonly nextEvent: Readonly<{ id: string; kind: 'elite' | 'boss' | 'end'; time: number }> | null;
  readonly firedEvents: readonly string[];
  /** Fired events with their simulation fire time. */
  readonly firedLog: readonly Readonly<{ id: string; time: number }>[];
  readonly bossTime: number;
  readonly bossEnemyId: string | null;
  readonly eliteEnemyIds: readonly string[];
  /** Elites spawned this run (alive or dead) with profile and display name. */
  readonly elites: readonly Readonly<{
    enemyId: string;
    profile: 'melee' | 'ranged';
    name: string;
  }>[];
  readonly runId: string | null;
  /** Run state machine (exactly-once resolution). */
  readonly status: 'active' | 'victory' | 'defeat' | 'abandoned';
  readonly bossKilled: boolean;
  readonly eliteKills: number;
  readonly resolvedAt: number | null;
  /** Boss status for the HP bar (null before the boss spawns). */
  readonly boss: Readonly<{
    enemyId: string;
    bossId: string;
    name: string;
    hp: number;
    maxHp: number;
    alive: boolean;
  }> | null;
  /** Current boss telegraph (null when idle) and active boss movement effects. */
  readonly bossCast: BossCastState | null;
  readonly bossEffects: readonly Readonly<{
    abilityId: string;
    until: number;
    multiplier: number;
  }>[];
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
