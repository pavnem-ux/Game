import type { TalentConfig, TalentRanks } from '../talents';
import type { ItemLevels, Loadout } from '../equipment';
import type { PetId } from '../pets';
import type { PetEvent, PetSnapshot } from '../pets/runtime';
import type { CoinEvent, CoinPile } from './coins';
import type { RunStatsSnapshot } from './run-stats';
import type { ExperienceEvent, RunProgression, XpCrystal } from './experience';
import type { SpawnSettings, ViewportSize } from './spawning';
import type { CharacterClass, CharacterStatsSnapshot, CombatAttributes } from '../character-stats';
import type { BossAbilityOutcome, BossCastState } from '../campaign';
import type {
  RunSkillsSnapshot,
  SkillCombatSnapshot,
  SkillEvent,
  SynergyId,
  SynergyLevel,
} from '../skills';
import type { CombatEntity, CombatEvent } from '../combat-core';
import type {
  ArtilleryStrikeSnapshot,
  EnemyEvent,
  EnemySnapshot,
  EnemyProjectileSnapshot,
} from '../enemy-ai';
import type { EnemyKind } from './enemy-types';
import type { BuffId, Chest, ChestContent, ChestEvent, ChestType } from './chests';
import type { ActivityEvent, ActivitySnapshot, ActivityType } from './activities';
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
  /**
   * Task 09: the class's allocated talent ranks, applied at run start (validated; inert while
   * the catalog is not approved). `config` is a test seam (defaults to the shipped catalog).
   */
  readonly talents?: Readonly<{ ranks: TalentRanks; config?: TalentConfig }>;
  /** Task 11: this class's equipped gear (validated: known items, right slot and class). */
  /** Task 11 loadout; Task 19 `itemLevels` (forge upgrade levels, absent = all +0). */
  readonly equipment?: Readonly<{ loadout: Loadout; itemLevels?: ItemLevels }>;
  /** Task 20: the profile's active pet and its level 1–5 (absent / null = no pet). */
  readonly pet?: Readonly<{ id: PetId; level: number }> | null;
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
    | 'campaign'
    | 'chests'
    | 'activities'
    | 'movement'
    | 'pets';
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
    | CampaignEvent
    | CoinEvent
    | ChestEvent
    | ActivityEvent
    | DashEvent
    | PetEvent;
}
export interface GameplaySnapshot {
  readonly time: number;
  /** Task 09.1: talent-spawned entities for rendering (shadow copy, ballistae); positions only. */
  readonly talentEntities?: readonly Readonly<{
    id: string;
    kind: string;
    x: number;
    y: number;
    expiresAt: number;
  }>[];
  /** Task 08.5: the run's base random seed (`options.seed`, default 1337). */
  readonly seed: number;
  /** Task 09: talents applied to this run (fixed for the run). */
  readonly talents: Readonly<{
    ranks: TalentRanks;
    pointsSpent: number;
    activeRanks: number;
    superpower: boolean;
  }>;
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
  /** Task 11: coins collected this run and the piles on the ground (campaign runs only). */
  /** Task 11: coins; Task 20 `petBonus` = coins added by the kitten (already in `collected`). */
  readonly coins: Readonly<{ collected: number; piles: readonly CoinPile[]; petBonus?: number }>;
  /** Task 20: the run's pet for rendering / HUD (null = none). Positions only. */
  readonly pet?: PetSnapshot | null;
  readonly spawning: Readonly<{
    settings: SpawnSettings;
    nextSpawnAt: number;
    waves: number;
    viewport: ViewportSize;
  }>;
  /** Task 12: `kind` = the enemy's normal kind (elites/bosses: their base melee/ranged kind). */
  readonly enemies: readonly (EnemySnapshot & {
    readonly entity: CombatEntity;
    readonly kind: EnemyKind;
  })[];
  readonly playerProjectiles: readonly ProjectileSnapshot[];
  readonly enemyProjectiles: readonly EnemyProjectileSnapshot[];
  /**
   * Task 12: chests on the map (`blinking` in their last 5 s), active buffs with remaining time and
   * the next spawn attempt. Null outside campaign runs.
   */
  readonly chests: Readonly<{
    items: readonly (Chest & { readonly blinking: boolean })[];
    buffs: readonly Readonly<{ id: BuffId; name: string; remaining: number; expiresAt: number }>[];
    nextSpawnAt: number;
    /** The latest opened chest (pickup popup). */
    lastOpened: Readonly<{
      chestType: ChestType;
      content: ChestContent;
      amount: number;
      time: number;
      /** Task 31 (read-only, for the open-chest frame): where the chest stood. */
      x: number;
      y: number;
    }> | null;
  }> | null;
  /**
   * Task 24: map activities (shrine, lantern, thief, nest) with their progress, lanterns kept lit
   * after a successful defence, the next spawn attempt and the Ore banked from activities (paid
   * only with a victory). Null outside campaign runs.
   */
  readonly activities: Readonly<{
    items: readonly ActivitySnapshot[];
    litLanterns: readonly Point[];
    nextSpawnAt: number;
    ore: number;
    /** The latest spawn / success / failure (HUD toast), with its simulation time. */
    notice: Readonly<{
      kind: 'spawned' | 'completed' | 'failed';
      activityType: ActivityType;
      time: number;
    }> | null;
  }> | null;
  /**
   * Task 14 dash: whether a dash is under way (its start, from / to), when the next one is ready,
   * the cooldown length, dashes used and direct hits avoided during dash i-frames.
   */
  readonly dash: Readonly<{
    active: boolean;
    startedAt: number | null;
    from: Point | null;
    to: Point | null;
    readyAt: number;
    cooldown: number;
    used: number;
    hitsAvoided: number;
  }>;
  /** Task 12: pending artillery strikes (telegraph circles of the bombard). */
  readonly artilleryStrikes: readonly ArtilleryStrikeSnapshot[];
  readonly statuses: readonly StatusGroupSnapshot[];
  readonly weapon: WeaponState;
  readonly movement: Point;
  /** Task 15: effective level (0–3) and best pair of each synergy of the class. */
  readonly synergyLevels: readonly Readonly<{
    id: SynergyId;
    level: SynergyLevel;
    pair: readonly [string, string] | null;
    /** A DEV/QA override decides the level. */
    forced: boolean;
  }>[];
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
  /** Task 12: kind of each spawned enemy (same order as `enemyIds`). */
  readonly kinds: readonly EnemyKind[];
  readonly nextSpawnAt: number;
}

/** One notification per gained run level; Combat Core emits positive HP healing separately. */
export interface RunLevelHealingEvent {
  readonly type: 'run-level-healed';
  readonly level: number;
  readonly requestedHealing: number;
  readonly healed: number;
}

/** Task 14: dash events (channel `movement`). */
export type DashEvent =
  | {
      readonly type: 'dash-started';
      readonly from: Point;
      readonly to: Point;
      readonly direction: Point;
      readonly endsAt: number;
    }
  | { readonly type: 'dash-ended'; readonly at: Point }
  | { readonly type: 'dash-ready' }
  | { readonly type: 'dash-hit-avoided'; readonly sourceId: string };
