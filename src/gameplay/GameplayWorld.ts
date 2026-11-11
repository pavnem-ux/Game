import { OFFHAND_WEAPON, talentLoadout } from '../talents';
import { talentWeaponRangeFactor } from '../talents/handlers';
import type { TalentLoadout } from '../talents';
import { composeRunStats } from '../skills/stats';
import type { RunStatModifiers } from '../skills/stats';
import { DEFAULT_SEED, createRunRandom } from './rng';
import { RunStats } from './run-stats';
import type { EnemyType } from './run-stats';
import { calculateCharacterStats, scaleMovementSpeed } from '../character-stats';
import { CombatCore, calculateSuccessfulDamage } from '../combat-core';
import type { CombatEvent, RandomSource } from '../combat-core';
import { WeaponAttacks } from '../weapon-attacks';
import type { WeaponEvent, CombatBody, Point } from '../weapon-attacks';
import { StatusEffects, WeaponStatusAdapter } from '../status-effects';
import type {
  EffectApplication,
  EffectDefinition,
  StatusEvent,
  OnHitEffectMapping,
} from '../status-effects';
import { EnemyAI } from '../enemy-ai';
import { enemyConfig } from '../enemy-ai/validation';
import type { EnemyConfig, EnemyEvent } from '../enemy-ai';
import {
  PlayerSurvival,
  createEnemySurvivalPolicies,
  createStatusSurvivalPolicies,
} from '../player-survival';
import type { RevivalDecision, SurvivalEvent } from '../player-survival';
import { sameInstant } from '../simulation-boundary';
import {
  ALPHA,
  ALPHA_BALANCE,
  ALPHA_ENEMIES,
  ALPHA_ENEMY_STATS,
  ALPHA_WEAPONS,
  DASH_RULES,
  defaultOnHit,
} from './config';
import type { CampaignSnapshot, GameplayOptions, GameplaySnapshot, WorldEvent } from './types';

import { RunExperience, XP_RULES } from './experience';
import type { ExperienceEvent } from './experience';
import { RunSkills, SkillEngine, SYNERGY_RULES, completedPairs } from '../skills';
import type { SkillEvent, SynergyId, SynergyLevel } from '../skills';
import type { CombatAttributes } from '../character-stats';
import type { EffectType } from '../status-effects';
import { spawningSettings, wavePressure, offscreenPosition, viewportSize } from './spawning';
import type { SpawnSettings, ViewportSize } from './spawning';
import {
  CAMPAIGN_BALANCE,
  CampaignDirector,
  INITIAL_RUN_STATE,
  campaignSpawning,
  eliteEnemyConfig,
  eliteProfile,
  getBossDefinition,
  reduceRun,
  getCampaignMap,
  runClock,
  scaleEnemyStats,
} from '../campaign';
import { BossController } from '../campaign';
import type {
  BossAbilityOutcome,
  BossDefinition,
  ScheduledEvent,
  BossHost,
  CampaignMap,
  CampaignRunState,
  RunInput,
} from '../campaign';
import type { DirectDamageObserver, DirectDamagePolicy } from '../enemy-ai';
import { addModifiers, gearModifiers, validateLoadout } from '../equipment';
import type { Loadout } from '../equipment';
import { RunCoins } from './coins';
import { BUFFS, CHEST_RULES, RunChests, buffModifiers, chestGold } from './chests';
const CHEST_HEAL_FRACTION = CHEST_RULES.healFraction;
const CHEST_BLINK_FOR = CHEST_RULES.blinkFor;
import type { BuffId, Chest, ChestContent, ChestType } from './chests';
import {
  ENEMY_KINDS,
  NEW_ENEMY_KINDS,
  enemyKindConfig,
  enemyKindStats,
  enemyKindXp,
  enemyMix,
  isEnemyKind,
} from './enemy-types';
import type { EnemyKind, NewEnemyKind } from './enemy-types';
import { coinValue, normalChance, skipCoins } from '../equipment/economy';
/** The sole world scheduler. All damage is resolved by existing modules, one boundary at a time. */
export class GameplayWorld {
  readonly core: CombatCore;
  readonly weapons: WeaponAttacks;
  readonly statuses: StatusEffects;
  readonly enemies: EnemyAI;
  readonly survival: PlayerSurvival;
  readonly character;
  readonly playerId = 'player';
  private clock = 0;
  private timeCompensation = 0;
  private controlIndex = 1;
  private body: CombatBody = Object.freeze({ x: 1800, y: 1800, radius: ALPHA.playerRadius });
  private input: Point = Object.freeze({ x: 0, y: 0 });
  private manualPause = false;
  private enemySequence = 0;
  private eventSequence = 0;
  private kills = 0;
  private readonly experience = new RunExperience();
  /** Task 11: Gold coins of this run (campaign only) and their seeded drop stream. */
  private readonly coins = new RunCoins();
  /** Task 12: chests and their buffs (campaign runs only; own seeded stream). */
  private readonly chests: RunChests | null;
  private readonly coinRandom: () => number;
  private spawnSettings: SpawnSettings;
  private nextSpawnAt: number;
  private waveSequence = 0;
  private autoSpawnSequence = 0;
  private viewport: ViewportSize;
  private readonly spawnRandom: () => number;
  private readonly history: WorldEvent[] = [];
  /** Task 09.1: enemies that received statuses during the current boundary. */
  private readonly statusTargets = new Set<string>();
  /** Task 11: this run's equipped gear (fixed for the run; changes apply to the next run). */
  readonly loadout: Loadout | null;
  /** Task 09/11: talent + gear stat layer composed with the class attributes (caps once). */
  readonly permanentModifiers: RunStatModifiers;
  /** Task 09: this run's talent loadout (fixed for the run; allocation changes affect the next). */
  readonly talents: TalentLoadout;
  /** Task 08.5 run statistics: read-only consumer of every recorded event (new per world). */
  private readonly runStats = new RunStats({
    playerId: 'player',
    attackSource: (attackId) => this.skills?.attackSource(attackId),
    enemyType: (id) => this.enemyType(id),
    playerHp: () => {
      const p = this.core.getEntity(this.playerId);
      return { hp: p.currentHp, maxHp: p.maxHp };
    },
  });
  private readonly enemyIds = new Set<string>();
  private adapter: WeaponStatusAdapter;
  private testingProtection = false;
  private readonly random: () => number;
  /** Task 07: run skills and their boundary module. Separate seeded stream for offers/procs. */
  readonly run: RunSkills;
  readonly skills: SkillEngine;
  private readonly baseOnHit: readonly EffectDefinition[];
  private onHitDefinitions: readonly EffectDefinition[];
  private facing: Point = Object.freeze({ x: 1, y: 0 });
  /** Task 08: campaign map of this run (null = classic alpha) and its scaled enemy stats. */
  readonly campaignMap: CampaignMap | null;
  private readonly enemyStats: CombatAttributes;
  private readonly director: CampaignDirector | null;
  private bossEnemyId: string | null = null;
  private readonly eliteEnemyIds: string[] = [];
  /** Elite enemy id → profile (kept after death for results/rewards). */
  private readonly eliteProfiles = new Map<string, 'melee' | 'ranged'>();
  private campaignRun: CampaignRunState = INITIAL_RUN_STATE;
  /** Task 08 boss ability controller (boundary module), created when the boss spawns. */
  private bossController: BossController | null = null;
  private bossDefinition: BossDefinition | null = null;
  private bossDefeated = false;
  /** Hostile direct-damage policies shared by EnemyAI and boss abilities (survival + test guard). */
  private hostilePolicies!: {
    readonly canResolveDirectDamage: DirectDamagePolicy;
    readonly onDirectDamageResolved: DirectDamageObserver;
  };
  constructor(
    readonly options: GameplayOptions,
    createCore: (random: RandomSource) => CombatCore = (random) => new CombatCore(random),
  ) {
    if (typeof createCore !== 'function') throw new TypeError('createCore must be a function.');
    this.character = calculateCharacterStats(options.characterClass, options.level ?? 1);
    // Task 08.5 §4.1: all gameplay randomness comes from the seeded run streams.
    const rng = createRunRandom(options.seed ?? DEFAULT_SEED);
    this.random = rng.combat;
    const skillRandom = rng.skills;
    this.spawnRandom = rng.spawn;
    this.coinRandom = rng.coins;
    this.campaignMap = options.campaign ? getCampaignMap(options.campaign.mapId) : null;
    this.director = this.campaignMap ? new CampaignDirector(this.campaignMap) : null;
    this.chests = this.campaignMap ? new RunChests(rng.chests, ALPHA.arenaSize) : null;
    this.kindShares = this.campaignMap
      ? enemyMix(this.campaignMap.id)
      : Object.freeze({ swift: 0, brute: 0, bombard: 0 });
    this.enemyStats = this.campaignMap
      ? scaleEnemyStats(ALPHA_ENEMY_STATS, this.campaignMap.difficulty)
      : ALPHA_ENEMY_STATS;
    // Campaign scaling goes through the existing spawner; explicit options still win (tests/QA).
    this.spawnSettings = spawningSettings(
      this.campaignMap
        ? {
            ...campaignSpawning(this.campaignMap, spawningSettings(), ALPHA.enemyCap),
            ...options.spawning,
          }
        : options.spawning,
    );
    this.viewport = viewportSize(options.viewport ?? { width: 1280, height: 720 });
    this.nextSpawnAt = this.spawnSettings.interval;
    // Task 09: validated talent loadout for this class/level (inert while the catalog is not
    // approved). Its stat layer is composed with the permanent stats once, caps included.
    this.talents = talentLoadout(
      options.characterClass,
      options.level ?? 1,
      options.talents?.ranks ?? {},
      options.talents?.config,
    );
    // Task 11: gear joins the talent stat layer (one permanent layer, caps applied once).
    if (options.equipment) validateLoadout(options.characterClass, options.equipment.loadout);
    this.loadout = options.equipment?.loadout ?? null;
    this.permanentModifiers = addModifiers(this.talents.modifiers, gearModifiers(this.loadout));
    const startStats = composeRunStats(this.character.primaryAttributes, this.permanentModifiers);
    this.core = createCore(this.random);
    this.core.addEntity({
      id: this.playerId,
      affiliation: 'player',
      stats: startStats,
    });
    this.survival = new PlayerSurvival(this.core, this.playerId);
    const emit = (events: readonly SurvivalEvent[]) => this.record('survival', events);
    const statusPolicies = createStatusSurvivalPolicies(this.survival, emit);
    this.statuses = new StatusEffects(this.core, {
      random: this.random,
      // Task 09.1: talent «DoT damage taken» multipliers on enemies (1 when none apply).
      damageMultiplier: (group) =>
        group.targetId === this.playerId || !this.skills
          ? 1
          : this.skills.talentCombat.dotTakenMultiplier(group.targetId),
      ...statusPolicies,
      canDamage: (ctx) =>
        !(this.testingProtection && ctx.group.targetId === this.playerId) &&
        statusPolicies.canDamage!(ctx),
      canApply: (ctx) =>
        !(this.testingProtection && ctx.application.targetId === this.playerId) &&
        statusPolicies.canApply!(ctx),
    });
    const enemyPolicies = createEnemySurvivalPolicies(this.survival, emit);
    this.hostilePolicies = Object.freeze({
      canResolveDirectDamage: (ctx) =>
        !this.testingProtection && enemyPolicies.canResolveDirectDamage!(ctx),
      onDirectDamageResolved: enemyPolicies.onDirectDamageResolved!,
    });
    this.enemies = new EnemyAI(this.core, {
      playerId: this.playerId,
      movementStep: 1 / 30,
      separation: { cellSize: 64, padding: 8, strength: 0.8 },
      ...this.hostilePolicies,
      // Task 09.1 G12: talent-only reduction of enemy direct hits on the player.
      playerDamageMultiplier: () => this.skills?.talentCombat.playerDamageTakenMultiplier() ?? 1,
    });
    this.weapons = new WeaponAttacks(this.core, {
      damageModifier: (context) => this.skills.damageModifier(context),
      // Task 09.1: talent crit-chance bonus for the player's weapon (category, at strike start).
      attackModifier: (context) =>
        context.entityId === this.playerId ? this.skills.weaponAttackBonus(context.weaponId) : {},
    });
    this.weapons.setBody(this.playerId, this.body);
    // Task 09.1: a talent may extend the basic weapon's range for this run (Archer 2.1).
    const rangeFactor = talentWeaponRangeFactor(
      options.characterClass,
      this.talents.ranks,
      options.talents?.config,
    );
    const baseWeapon = ALPHA_WEAPONS[options.characterClass];
    const weapon =
      rangeFactor === 1
        ? baseWeapon
        : { ...baseWeapon, attackRange: baseWeapon.attackRange * rangeFactor };
    this.weapons.equipWeapon({
      entityId: this.playerId,
      characterClass: options.characterClass,
      weapon,
      attackSpeedPercent: startStats.attackSpeed,
      fallbackDirection: { x: 1, y: 0 },
    });
    this.run = new RunSkills(options.characterClass, skillRandom);
    const world = this;
    this.skills = new SkillEngine(
      {
        core: this.core,
        statuses: this.statuses,
        weapons: this.weapons,
        enemies: this.enemies,
        playerId: this.playerId,
        characterClass: options.characterClass,
        primary: this.character.primaryAttributes,
        talentModifiers: this.permanentModifiers,
        talents: {
          ranks: this.talents.ranks,
          ...(options.talents?.config ? { config: options.talents.config } : {}),
          random: rng.talents,
        },
        basicWeaponId: weapon.id,
        playerMoving: () =>
          Math.hypot(world.input.x, world.input.y) > 0 && world.survival.getState().canPlayerAct,
        activationStep: ALPHA.controlStep,
        playerBody: () => world.body,
        facing: () => world.facing,
        enemyIds: () => [...world.enemyIds].filter((id) => world.core.getEntity(id).alive),
        forwardCombat: (events) => world.forwardCombat(events),
        recordStatus: (events) => world.record('status', events),
        recordSkill: (events) => world.record('skill', events),
        statsChanged: (stats) => world.applyStats(stats),
        controlLimits: (targetId) =>
          targetId === world.bossEnemyId && world.bossDefinition
            ? world.bossDefinition.control
            : null,
      },
      this.run,
      skillRandom,
    );
    // Task 09.1 C1: a talent may add a real automatic slot (Mage superpower) for this run.
    if (this.skills.talentCombat.extraAutoSlots() > 0) this.run.enableExtraAutoSlot();
    // Task 09.1 G6/G7: the Warrior superpower's off-hand sword (own timer from run start).
    const offhand = this.skills.talentCombat.offhand();
    if (offhand)
      this.weapons.equipSecondaryWeapon({
        entityId: this.playerId,
        characterClass: options.characterClass,
        weapon: {
          id: OFFHAND_WEAPON.id,
          category: 'sword',
          allowedClass: 'warrior',
          damageType: 'physical',
          pattern: 'melee_arc',
          damageCoefficient: offhand.coefficient,
          baseAttackInterval: OFFHAND_WEAPON.baseAttackInterval / (1 + offhand.speed / 100),
          attackRange: OFFHAND_WEAPON.attackRange,
          arcDegrees: OFFHAND_WEAPON.arcDegrees,
        },
        attackSpeedPercent: startStats.attackSpeed,
        fallbackDirection: { x: 1, y: 0 },
      });
    this.baseOnHit = Object.freeze([...(options.onHit ?? defaultOnHit(options.characterClass))]);
    this.onHitDefinitions = this.baseOnHit;
    this.adapter = this.makeAdapter(this.baseOnHit);
    if (options.initialEnemies !== false) {
      const count = options.enemyCount ?? 12;
      if (!Number.isInteger(count) || count < 1 || count > 24)
        throw new RangeError('Initial enemy count must be 1–24.');
      if (options.spawnDistance !== undefined)
        this.spawnGroup(Math.min(count, this.spawnSettings.maxActive), options.spawnDistance);
      else this.spawnOffscreen(Math.min(count, this.spawnSettings.maxActive), 0);
    }
    this.prepare();
  }
  get time() {
    return this.clock;
  }
  get paused() {
    return (
      this.manualPause ||
      this.survival.getState().requiresWorldPause ||
      this.run.pendingChoices > 0 ||
      this.run.pendingEnhancedChoice !== null ||
      this.campaignRun.status !== 'active'
    );
  }
  /** Effective run stats: permanent Character Stats + passives/buffs, capped centrally. */
  get stats(): CombatAttributes {
    return this.skills.effectiveStats;
  }
  getEvents(afterSequence = 0): readonly WorldEvent[] {
    return Object.freeze(this.history.filter((e) => e.sequence > afterSequence));
  }
  setMovement(x: number, y: number): void {
    if (![x, y].every(Number.isFinite)) throw new RangeError('Movement must be finite.');
    const length = Math.hypot(x, y);
    this.input = Object.freeze(
      length > 0 ? { x: x / Math.max(1, length), y: y / Math.max(1, length) } : { x: 0, y: 0 },
    );
    if (Math.hypot(this.input.x, this.input.y) > 0 && this.survival.getState().canPlayerAct) {
      this.weapons.setFallbackDirection(this.playerId, this.input);
      const l = Math.hypot(this.input.x, this.input.y);
      this.facing = Object.freeze({ x: this.input.x / l, y: this.input.y / l });
    }
  }
  // ── Task 14 dash ──
  private dash: Readonly<{
    startedAt: number;
    endsAt: number;
    from: Point;
    to: Point;
    direction: Point;
    distance: number;
  }> | null = null;
  private dashReadyAt = 0;
  private dashReadyPending = false;
  private dashRequested = false;
  /** End of the latest dash's i-frame window (hits blocked before it count as avoided). */
  private dashGuardUntil = -1;
  private dashCooldownOverride: number | null = null;
  /** Start of the running cooldown (the latest dash start). */
  private dashCooldownFrom = 0;
  /** Why a dash cannot start now (null = it can). */
  dashBlockReason(): 'dead' | 'paused' | 'dashing' | 'cooldown' | null {
    if (!this.survival.getState().canPlayerAct) return 'dead';
    if (this.paused) return 'paused';
    if (this.dash) return 'dashing';
    if (this.clock < this.dashReadyAt && !sameInstant(this.clock, this.dashReadyAt))
      return 'cooldown';
    return null;
  }
  /**
   * Task 14: request a dash (Space / Shift). It starts at the next input sample, like movement
   * input; returns false (nothing queued) while dead, paused, in an offer or revive prompt,
   * dashing or on cooldown.
   */
  requestDash(): boolean {
    if (this.dashBlockReason() !== null) return false;
    this.dashRequested = true;
    return true;
  }
  /**
   * DEV/QA: dash cooldown override in seconds (null = `DASH_RULES.cooldown`). Also applies to a
   * running cooldown (measured from the latest dash start; never earlier than now).
   */
  setDebugDashCooldown(seconds: number | null): void {
    if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0 || seconds > 60))
      throw new RangeError('Dash cooldown override must be 0–60 s.');
    this.dashCooldownOverride = seconds;
    if (this.dashReadyPending)
      this.dashReadyAt = Math.max(this.clock, this.dashCooldownFrom + this.dashCooldown);
  }
  private get dashCooldown(): number {
    return this.dashCooldownOverride ?? DASH_RULES.cooldown;
  }
  private startDash() {
    const moving = Math.hypot(this.input.x, this.input.y) > 0;
    const raw = moving ? this.input : this.facing;
    const l = Math.hypot(raw.x, raw.y) || 1;
    const direction = Object.freeze({ x: raw.x / l, y: raw.y / l });
    // Stop at the arena bounds along the dash direction (no sliding along a wall).
    const r = this.body.radius,
      max = ALPHA.arenaSize - r;
    let distance: number = DASH_RULES.distance;
    for (const [p, d] of [
      [this.body.x, direction.x],
      [this.body.y, direction.y],
    ] as const) {
      if (d > 0) distance = Math.min(distance, (max - p) / d);
      else if (d < 0) distance = Math.min(distance, (r - p) / d);
    }
    distance = Math.max(0, distance);
    const from = Object.freeze({ x: this.body.x, y: this.body.y });
    const to = Object.freeze({
      x: this.clamp(from.x + direction.x * distance, r),
      y: this.clamp(from.y + direction.y * distance, r),
    });
    this.dash = Object.freeze({
      startedAt: this.clock,
      endsAt: this.clock + DASH_RULES.duration,
      from,
      to,
      direction,
      distance,
    });
    this.dashCooldownFrom = this.clock;
    this.dashReadyAt = this.clock + this.dashCooldown;
    this.dashReadyPending = this.dashReadyAt > this.clock;
    this.dashGuardUntil = this.clock + DASH_RULES.invulnerability;
    this.dashesUsed++;
    this.record(
      'survival',
      this.survival.grantProtection(DASH_RULES.invulnerability, 'dash').events,
    );
    this.record('movement', [
      Object.freeze({ type: 'dash-started', from, to, direction, endsAt: this.dash.endsAt }),
    ]);
  }
  private dashPosition(time: number): Point {
    const d = this.dash!;
    const speed = DASH_RULES.distance / DASH_RULES.duration;
    const travelled = Math.min(d.distance, Math.max(0, time - d.startedAt) * speed);
    if (travelled >= d.distance) return d.to;
    return {
      x: this.clamp(d.from.x + d.direction.x * travelled, this.body.radius),
      y: this.clamp(d.from.y + d.direction.y * travelled, this.body.radius),
    };
  }
  private endDash() {
    const d = this.dash!;
    this.body = Object.freeze({ ...this.body, x: d.to.x, y: d.to.y });
    this.dash = null;
    this.record('movement', [Object.freeze({ type: 'dash-ended', at: d.to })]);
  }
  private dashesUsed = 0;
  private dashHitsAvoided = 0;
  private noteBlockedHit(sourceId: string) {
    if (this.clock < this.dashGuardUntil && !sameInstant(this.clock, this.dashGuardUntil)) {
      this.dashHitsAvoided++;
      this.record('movement', [Object.freeze({ type: 'dash-hit-avoided', sourceId })]);
    }
  }
  setPaused(paused: boolean): void {
    if (typeof paused !== 'boolean') throw new TypeError('paused must be boolean.');
    this.manualPause = paused;
    this.setMovement(0, 0);
  }
  private talentSnapshotCache: GameplaySnapshot['talents'] | null = null;
  private get talentSnapshot(): GameplaySnapshot['talents'] {
    return (this.talentSnapshotCache ??= Object.freeze({
      ranks: this.talents.ranks,
      pointsSpent: this.talents.pointsSpent,
      activeRanks: this.talents.activeRanks,
      superpower: this.talents.superpower,
    }));
  }
  getSnapshot(): GameplaySnapshot {
    return Object.freeze({
      time: this.clock,
      seed: this.options.seed ?? DEFAULT_SEED,
      talents: this.talentSnapshot,
      runStats: this.runStats.snapshot(this.clock),
      paused: this.paused,
      player: this.core.getEntity(this.playerId),
      playerBody: this.body,
      character: this.character,
      stats: this.skills.effectiveStats,
      skills: this.run.getState(),
      skillCombat: this.skills.snapshot(),
      talentEntities: Object.freeze(
        this.skills.talents
          .list()
          .map((e) =>
            Object.freeze({ id: e.id, kind: e.kind, x: e.x, y: e.y, expiresAt: e.expiresAt }),
          ),
      ),
      survival: this.survival.getState(),
      kills: this.kills,
      progression: this.experience.getState(),
      crystals: this.experience.getCrystals(),
      coins: Object.freeze({ collected: this.coins.collected, piles: this.coins.getPiles() }),
      spawning: Object.freeze({
        settings: this.spawnSettings,
        nextSpawnAt: this.nextSpawnAt,
        waves: this.waveSequence,
        viewport: this.viewport,
      }),
      enemies: Object.freeze(
        this.enemies.getEnemies().map((e) =>
          Object.freeze({
            ...e,
            entity: this.core.getEntity(e.entityId),
            kind: this.enemyKinds.get(e.entityId) ?? ('melee' as EnemyKind),
          }),
        ),
      ),
      playerProjectiles: this.weapons.getProjectiles(),
      enemyProjectiles: this.enemies.getProjectiles(),
      artilleryStrikes: this.enemies.getStrikes(),
      dash: Object.freeze({
        active: this.dash !== null,
        startedAt: this.dash?.startedAt ?? null,
        from: this.dash?.from ?? null,
        to: this.dash?.to ?? null,
        readyAt: this.dashReadyAt,
        cooldown: this.dashCooldown,
        used: this.dashesUsed,
        hitsAvoided: this.dashHitsAvoided,
      }),
      chests: this.chests
        ? Object.freeze({
            items: Object.freeze(
              this.chests.getChests().map((c) =>
                Object.freeze({
                  ...c,
                  blinking: c.expiresAt - this.clock <= CHEST_BLINK_FOR + 1e-9,
                }),
              ),
            ),
            buffs: Object.freeze(
              this.chests.getBuffs().map((b) =>
                Object.freeze({
                  id: b.id,
                  name: BUFFS[b.id].name,
                  remaining: Math.max(0, b.expiresAt - this.clock),
                  expiresAt: b.expiresAt,
                }),
              ),
            ),
            nextSpawnAt: this.chests.nextSpawnAt,
            lastOpened: this.lastChestOpened,
          })
        : null,
      statuses: this.statuses.getGroups(),
      weapon: this.weapons.getWeaponState(this.playerId),
      movement: this.input,
      campaign: this.campaignSnapshot(),
    });
  }
  private campaignSnapshot(): CampaignSnapshot | null {
    const map = this.campaignMap;
    if (!map) return null;
    const clock = runClock(map, this.clock);
    return Object.freeze({
      mapId: map.id,
      mapName: map.name,
      duration: clock.duration,
      elapsed: clock.elapsed,
      remaining: clock.remaining,
      durationReached: clock.durationReached || this.campaignRun.durationReached,
      nextEvent: (() => {
        const next = this.director!.peek();
        return next ? Object.freeze({ id: next.id, kind: next.kind, time: next.time }) : null;
      })(),
      firedEvents: this.director!.firedIds(),
      firedLog: this.director!.firedLog(),
      bossTime: this.campaignMap!.durationSeconds,
      bossEnemyId: this.bossEnemyId,
      eliteEnemyIds: Object.freeze([...this.eliteEnemyIds]),
      elites: Object.freeze(
        this.eliteEnemyIds.map((enemyId) => {
          const profile = eliteProfile(this.eliteProfiles.get(enemyId)!);
          return Object.freeze({ enemyId, profile: profile.id, name: profile.name });
        }),
      ),
      runId: this.options.campaign?.runId ?? null,
      status: this.campaignRun.status,
      bossKilled: this.campaignRun.bossKilled,
      eliteKills: this.campaignRun.eliteKills,
      resolvedAt: this.campaignRun.resolvedAt,
      boss: this.bossEnemyId
        ? Object.freeze({
            enemyId: this.bossEnemyId,
            bossId: map.bossId,
            name: map.bossName,
            hp: this.core.getEntity(this.bossEnemyId).currentHp,
            maxHp: this.core.getEntity(this.bossEnemyId).maxHp,
            alive: this.core.getEntity(this.bossEnemyId).alive,
          })
        : null,
      bossCast: this.bossController?.currentCast() ?? null,
      bossEffects: this.bossController?.activeEffects() ?? Object.freeze([]),
      stage: Object.freeze({
        id: clock.stage.id,
        name: clock.stage.name,
        index: clock.stage.index,
      }),
    });
  }
  /** Never carry unconsumed frame time across death or manual pause. */
  update(delta: number): void {
    if (!Number.isFinite(delta) || delta < 0 || !Number.isFinite(this.clock + delta))
      throw new RangeError('delta must be finite and non-negative.');
    this.cleanupTalentEntities(); // also while frozen (death, revival choice, resolved run)
    if (this.paused) return;
    let end = this.clock;
    if (delta > 0) {
      const correctedDelta = delta - this.timeCompensation;
      end = Math.max(this.clock, this.clock + correctedDelta);
      this.timeCompensation = end - this.clock - correctedDelta;
    }
    let pauseAt: number | null = null;
    for (;;) {
      this.prepare();
      const limit = pauseAt ?? end;
      const next = this.nextBoundary(limit);
      if (!next) {
        this.advanceAll(limit);
        break;
      }
      this.advanceAll(next.time);
      if (next.kind === 'control') this.movePlayer();
      else if (next.kind === 'dash-end') this.endDash();
      else if (next.kind === 'dash-ready') {
        this.dashReadyPending = false;
        this.record('movement', [Object.freeze({ type: 'dash-ready' })]);
      } else if (next.kind === 'weapon') this.consumeWeapons(this.weapons.resolveBoundary());
      else if (next.kind === 'status') this.consumeStatuses(this.statuses.resolveBoundary());
      else if (next.kind === 'enemy') this.consumeEnemies(this.enemies.resolveBoundary());
      else if (next.kind === 'spawn') this.spawnWave();
      else if (next.kind === 'skill') this.skills.resolveBoundary();
      else if (next.kind === 'campaign') this.resolveCampaignEvent();
      else if (next.kind === 'boss') this.resolveBossAbility();
      else if (next.kind === 'chest-spawn')
        this.record('chests', [this.chests!.spawnDue(this.clock, this.body)]);
      else if (next.kind === 'chest-expire') this.expireChests();
      // Task 09.1: status applications of this boundary (Rogue Deadly Synthesis check).
      if (this.statusTargets.size) {
        const targets = [...this.statusTargets];
        this.statusTargets.clear();
        this.skills.talentCombat.onStatusesApplied(targets);
      }
      this.skills.endStep();
      this.cleanupTalentEntities();
      if (
        (this.survival.getState().requiresWorldPause ||
          this.run.pendingChoices > 0 ||
          this.run.pendingEnhancedChoice !== null ||
          this.campaignRun.status !== 'active') &&
        pauseAt === null
      ) {
        pauseAt = this.clock;
        this.timeCompensation = 0;
        this.input = Object.freeze({ x: 0, y: 0 });
      }
    }
  }
  /** Task 09.1: talent entities never outlive the player's life or the run. */
  private cleanupTalentEntities(): void {
    if (
      !this.core.getEntity(this.playerId).alive ||
      this.survival.getState().runState === 'ended' ||
      this.campaignRun.status !== 'active'
    )
      this.skills.talents.clearEntities();
  }
  decide(decision: RevivalDecision): void {
    const result = this.survival.decide(decision, this.statuses);
    this.record('survival', result.events);
    if (this.survival.getState().runState === 'ended') {
      this.run.clearPending();
      this.syncDefeat();
    }
    if (result.revival) this.forwardCombat(result.revival.events);
    if (result.removedEffects) this.record('status', result.removedEffects);
    this.manualPause = false;
    this.prepare();
  }
  spawnEnemy(kind: EnemyKind, distance = 240, angle?: number, config?: EnemyConfig): string {
    if (!isEnemyKind(kind)) throw new TypeError('Invalid enemy kind.');
    if (
      !Number.isFinite(distance) ||
      distance < 0 ||
      distance > 1500 ||
      (angle !== undefined && !Number.isFinite(angle))
    )
      throw new RangeError('Invalid spawn geometry.');
    if (this.enemies.getEnemies().filter((e) => e.alive).length >= this.spawnSettings.maxActive)
      throw new RangeError('Alpha enemy cap reached.');
    // Validate the optional test profile before changing RNG, IDs or authoritative entities.
    const profile = enemyConfig(config ?? this.enemyProfile(kind));
    if (profile.behavior !== enemyKindConfig(kind).behavior)
      throw new TypeError('Enemy kind/profile mismatch.');
    const a = angle ?? this.spawnRandom() * Math.PI * 2;
    return this.registerEnemy(
      kind,
      {
        x: this.clamp(this.body.x + Math.cos(a) * distance, 20),
        y: this.clamp(this.body.y + Math.sin(a) * distance, 20),
      },
      profile,
    );
  }
  /** Task 08.5 stats: type of a registered enemy (null = not a registered enemy). */
  private enemyType(id: string): EnemyType | null {
    if (!this.enemyIds.has(id)) return null;
    if (id === this.bossEnemyId) return 'boss';
    const elite = this.eliteProfiles.get(id);
    if (elite) return elite === 'melee' ? 'elite-melee' : 'elite-ranged';
    return this.enemyKinds.get(id) ?? 'melee';
  }
  /** Task 12: normal kind of each registered enemy (elites/bosses keep their base kind). */
  private readonly enemyKinds = new Map<string, EnemyKind>();
  /** Task 12: shares of the new kinds in automatic waves (campaign map mix; 0 elsewhere). */
  private readonly kindShares: Readonly<Record<NewEnemyKind, number>>;
  private readonly autoSpawnedByKind: Record<EnemyKind, number> = {
    melee: 0,
    ranged: 0,
    swift: 0,
    brute: 0,
    bombard: 0,
  };
  /** Task 12: automatic (wave) spawns of this run per kind. */
  autoSpawnCounts(): Readonly<Record<EnemyKind, number>> {
    return Object.freeze({ ...this.autoSpawnedByKind });
  }
  /**
   * Task 10 §1.2: enemy profiles of this run — the alpha profiles, with the map's movement-speed
   * modifier (campaign only). Used for automatic waves, boss adds and as the elite base.
   */
  private enemyProfiles: Readonly<Record<EnemyKind, EnemyConfig>> | null = null;
  private enemyProfile(kind: EnemyKind): EnemyConfig {
    if (!this.enemyProfiles) {
      const scale = this.campaignMap?.enemySpeedScale ?? 1;
      const scaled = (c: EnemyConfig) =>
        scale === 1 ? c : Object.freeze({ ...c, movementSpeed: c.movementSpeed * scale });
      this.enemyProfiles = Object.freeze(
        Object.fromEntries(ENEMY_KINDS.map((k) => [k, scaled(enemyKindConfig(k))])) as Record<
          EnemyKind,
          EnemyConfig
        >,
      );
    }
    return this.enemyProfiles[kind];
  }
  private registerEnemy(
    kind: EnemyKind,
    position: Point,
    profile: EnemyConfig = this.enemyProfile(kind),
    stats: CombatAttributes = enemyKindStats(kind, this.enemyStats),
  ): string {
    const id = `enemy-${++this.enemySequence}`;
    this.core.addEntity({ id, affiliation: 'enemy', stats });
    this.enemies.registerEnemy({ entityId: id, config: profile, position });
    this.enemyIds.add(id);
    this.enemyKinds.set(id, kind);
    this.prepare();
    return id;
  }
  spawnGroup(count = 8, distance = 260): void {
    if (!Number.isInteger(count) || count < 1 || count > 24)
      throw new RangeError('Group count must be 1–24.');
    if (
      this.enemies.getEnemies().filter((e) => e.alive).length + count >
      this.spawnSettings.maxActive
    )
      throw new RangeError('Group exceeds alpha enemy cap.');
    if (!Number.isFinite(distance) || distance < 0 || distance + (count > 1 ? 45 : 0) > 1500)
      throw new RangeError('Invalid group distance including the 45-unit ring offset.');
    for (let i = 0; i < count; i++)
      this.spawnEnemy(
        i % 3 === 0 ? 'ranged' : 'melee',
        distance + (i % 2) * 45,
        (i * Math.PI * 2) / count,
      );
  }
  setViewport(width: number, height: number): void {
    this.viewport = viewportSize({ width, height });
  }
  setSpawning(input: Partial<SpawnSettings>): void {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new TypeError('Invalid spawning settings.');
    const next = spawningSettings({ ...this.spawnSettings, ...input });
    if (next.maxActive < this.enemyIds.size)
      throw new RangeError(
        'Clear enemies before lowering the active cap below the current population.',
      );
    const nextAt = this.clock + wavePressure(this.clock, next).interval;
    if (!Number.isFinite(nextAt) || sameInstant(nextAt, this.clock))
      throw new RangeError('Spawn schedule is not representable.');
    this.spawnSettings = next;
    this.nextSpawnAt = nextAt;
  }
  grantTestXp(amount: number): void {
    if (!this.survival.getState().canPlayerAct)
      throw new Error('XP testing requires a living active player.');
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000)
      throw new RangeError('Test XP must be 0–1000000.');
    this.progression(this.experience.grantForTesting(amount));
  }
  /** Choose one card of the pending level-up offer (skill ID or `bonus:<id>`). */
  chooseSkill(cardKey: string): void {
    if (typeof cardKey !== 'string') throw new TypeError('Card key must be a string.');
    if (this.survival.getState().runState === 'ended') throw new Error('The run has ended.');
    const unlockedBefore = new Set(this.skills.synergies.unlockedIds());
    const { result, events } = this.run.choose(cardKey);
    this.record('skill', events);
    this.skills.applyChoice(result);
    if (result.type === 'skill') this.recordSynergyUnlocks(unlockedBefore, result.skillId);
    this.rebuildOnHit();
    this.prepare();
  }
  /** Emit `synergy-unlocked` for rules opened by this acquisition (a rule unlocks only once). */
  private recordSynergyUnlocks(before: ReadonlySet<string>, skillId: string): void {
    const owned = this.run.ownedIds();
    const events: SkillEvent[] = [];
    for (const rule of SYNERGY_RULES) {
      if (before.has(rule.id) || !this.skills.synergies.isEligible(rule.id)) continue;
      const pair = completedPairs(rule, owned).find((p) => p.includes(skillId));
      if (pair)
        events.push(
          Object.freeze({
            type: 'synergy-unlocked',
            synergyId: rule.id,
            pair: Object.freeze([pair[0], pair[1]] as const),
            skillId,
          }),
        );
    }
    if (events.length > 0) this.record('skill', events);
  }
  /** DEV/tests only: equip a class/universal skill at a rank without an offer (limits still apply). */
  grantTestSkill(skillId: string, rank = 1): void {
    if (typeof skillId !== 'string') throw new TypeError('skillId must be a string.');
    const unlockedBefore = new Set(this.skills.synergies.unlockedIds());
    const granted = this.run.grantWithEvents(skillId, rank);
    this.skills.applyChoice(granted.result);
    this.record('skill', [
      Object.freeze({ type: 'skill-chosen', skillId, rank }),
      ...granted.events,
    ]);
    this.recordSynergyUnlocks(unlockedBefore, skillId);
    this.rebuildOnHit();
    this.prepare();
  }
  /** Task 09.1 C1: the one-time choice of the enhanced skill among the five actives. */
  chooseEnhancedSkill(skillId: string): void {
    if (typeof skillId !== 'string') throw new TypeError('skillId must be a string.');
    if (this.survival.getState().runState === 'ended') throw new Error('The run has ended.');
    this.record('skill', this.run.chooseEnhanced(skillId));
    this.prepare();
  }
  /** Spend one of the run's three rerolls on the current offer; never grants an extra choice. */
  rerollSkillOffer(): void {
    this.record('skill', this.run.reroll());
  }
  /** Task 14 debug (DEV/QA controller only): extra rerolls / banishes for this run. */
  debugGrantChoiceControls(rerolls: number, banishes: number): void {
    this.run.grantChoiceControls(rerolls, banishes);
  }
  /** Task 15 debug (DEV/QA controller and tests): force a synergy level (null = from ranks). */
  setTestSynergyLevel(id: SynergyId, level: SynergyLevel | null): void {
    this.skills.synergies.setLevelOverride(id, level);
  }
  /** Task 14 «Изгнать»: remove an offered skill from the run pool; only that card is replaced. */
  banishSkillCard(cardKey: string): void {
    if (typeof cardKey !== 'string') throw new TypeError('Card key must be a string.');
    if (this.survival.getState().runState === 'ended') throw new Error('The run has ended.');
    this.record('skill', this.run.banish(cardKey));
  }
  /**
   * Task 14 «Пропустить»: close the offer without a card. Campaign runs add skip coins
   * (`skipCoins`, 2% of the map's victory Gold, at least 3) to the collected coins, so the normal
   * payout applies (victory: all, defeat: 50%, abandon: nothing).
   */
  skipSkillOffer(): void {
    if (this.survival.getState().runState === 'ended') throw new Error('The run has ended.');
    this.record('skill', this.run.skip());
    if (this.campaignMap)
      this.record('progression', [this.coins.grant(skipCoins(this.campaignMap.id), 'skip')]);
    this.prepare();
  }
  private progression(events: readonly ExperienceEvent[]) {
    this.record('progression', events);
    for (const event of events)
      if (event.type === 'run-level-up') {
        for (let level = event.previousLevel + 1; level <= event.level; level++) {
          const player = this.core.getEntity(this.playerId);
          const requestedHealing = player.maxHp * ALPHA_BALANCE.runLevelHealingFraction;
          // Preserve no-op entity identity at full HP; only Core may actually change HP.
          const result =
            player.currentHp < player.maxHp
              ? this.core.heal(this.playerId, requestedHealing)
              : null;
          if (result) this.forwardCombat(result.events);
          // Record every gained level, including a capped zero heal. Core owns actual HP/events.
          this.record('progression', [
            Object.freeze({
              type: 'run-level-healed',
              level,
              requestedHealing,
              healed: result?.healed ?? 0,
            }),
          ]);
        }
        this.record('skill', this.run.queueLevelUps(event.level - event.previousLevel));
      }
  }
  private applyStats(stats: CombatAttributes) {
    const player = this.core.getEntity(this.playerId);
    const core = {
      maxHp: stats.maxHp,
      physicalDamage: stats.physicalDamage,
      magicalDamage: stats.magicalDamage,
      resistance: stats.resistance,
      criticalChance: stats.criticalChance,
      criticalDamage: stats.criticalDamage,
      dodgeChance: stats.dodgeChance,
    };
    // Only Core-owned fields go to Core; attack/movement speed stay with Weapons/World.
    if ((Object.keys(core) as (keyof typeof core)[]).some((k) => core[k] !== player[k]))
      this.forwardCombat(this.core.updateEntityStats(this.playerId, core).events);
    if (this.weapons.getWeaponState(this.playerId).attackSpeedPercent !== stats.attackSpeed)
      this.weapons.setAttackSpeed(this.playerId, stats.attackSpeed);
  }
  private rebuildOnHit() {
    this.adapter = this.makeAdapter(this.onHitDefinitions);
  }
  dropTestCrystal(value: number, distance = 60): void {
    if (
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > 1_000_000 ||
      !Number.isFinite(distance) ||
      distance < 0 ||
      distance > 1500
    )
      throw new RangeError('Invalid test crystal.');
    this.experience.drop(
      { x: this.clamp(this.body.x + distance, XP_RULES.crystalRadius), y: this.body.y },
      value,
    );
  }
  /**
   * Kind of the next automatic spawn, deterministic like the Task 06 ranged share:
   * 1. ranged keeps its existing rule (⌊(n+1)·s⌋ > ⌊n·s⌋), so maps without new kinds keep their
   *    exact sequence;
   * 2. otherwise the new kind furthest behind (n + 1)·share by at least ½ spawns (rounding rule;
   *    ties in the order swift, brute, bombard);
   * 3. otherwise melee.
   * Every kind stays within ±1 of n·share over any prefix of spawns (≤ 0.64 for the new kinds).
   */
  private nextSpawnKind(): EnemyKind {
    const next = this.autoSpawnSequence + 1;
    const share = this.spawnSettings.rangedShare; // the exact Task 06 expression
    if (Math.floor(next * share) > Math.floor((next - 1) * share)) return 'ranged';
    let best: EnemyKind = 'melee',
      lead = -1e-9;
    for (const kind of NEW_ENEMY_KINDS) {
      const d = next * this.kindShares[kind] - this.autoSpawnedByKind[kind] - 0.5;
      if (d > lead) {
        best = kind;
        lead = d;
      }
    }
    return best;
  }
  private spawnOffscreen(count: number, stage: number) {
    const enemyIds: string[] = [],
      positions: Point[] = [],
      kinds: EnemyKind[] = [];
    for (let i = 0; i < count && this.enemyIds.size < this.spawnSettings.maxActive; i++) {
      const kind = this.nextSpawnKind();
      const position = offscreenPosition(
        this.body,
        this.viewport,
        this.enemyProfile(kind).radius,
        this.spawnSettings,
        this.spawnRandom,
      );
      if (!position) break;
      this.autoSpawnSequence++;
      this.autoSpawnedByKind[kind]++;
      enemyIds.push(this.registerEnemy(kind, position));
      positions.push(position);
      kinds.push(kind);
    }
    this.record('spawning', [
      Object.freeze({
        type: 'wave-spawned',
        wave: this.waveSequence,
        stage,
        enemyIds: Object.freeze(enemyIds),
        positions: Object.freeze(positions),
        kinds: Object.freeze(kinds),
        nextSpawnAt: this.nextSpawnAt,
      }),
    ]);
  }
  private bossActive(): boolean {
    return (
      !!this.bossController &&
      !!this.bossEnemyId &&
      this.campaignRun.status === 'active' &&
      this.core.getEntity(this.bossEnemyId).alive
    );
  }
  private resolveBossAbility() {
    if (!this.bossActive()) return;
    const outcomes = this.bossController!.resolve(this.clock, this.bossHost);
    this.record('campaign', outcomes as readonly BossAbilityOutcome[]);
  }
  /** World implementation of the boss ability host: Core damage, survival policies, EnemyAI. */
  private readonly bossHost: BossHost = {
    bossPosition: () => this.enemies.getEnemy(this.bossEnemyId!).position,
    bossRadius: () => this.enemies.getEnemy(this.bossEnemyId!).config.radius,
    playerBody: () => this.body,
    strikePlayer: (_abilityId, coefficient) => {
      const boss = this.bossEnemyId!;
      const context = {
        time: this.clock,
        sourceId: boss,
        targetId: this.playerId,
        kind: 'contact' as const,
      };
      if (!this.core.getEntity(this.playerId).alive) return false;
      if (!this.hostilePolicies.canResolveDirectDamage({ ...context, attack: null })) {
        this.noteBlockedHit(boss);
        return false;
      }
      const attack = this.core.createAttack({
        attackerId: boss,
        damageType: 'physical',
        coefficient,
      });
      const result = this.core.resolveAttack(attack, this.playerId);
      this.hostilePolicies.onDirectDamageResolved({ ...context, attack }, result);
      this.forwardCombat(result.events);
      return result.status === 'hit';
    },
    launchRadial: (_abilityId, count, coefficient, speed) => {
      if (!this.core.getEntity(this.playerId).alive) return 0;
      const boss = this.enemies.getEnemy(this.bossEnemyId!);
      const events = [];
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        events.push(
          this.enemies.launchProjectile({
            sourceId: boss.entityId,
            origin: boss.position,
            target: {
              x: boss.position.x + direction.x * 200,
              y: boss.position.y + direction.y * 200,
              radius: 1,
            },
            damageType: 'magical',
            coefficient,
            projectile: { speed, radius: 7, maxTravelDistance: 650 },
            fallbackDirection: direction,
          }),
        );
      }
      this.record('enemy', events);
      return events.length;
    },
    setSpeedBoost: (multiplier) => {
      if (this.bossEnemyId && this.core.getEntity(this.bossEnemyId).alive)
        this.enemies.setSpeedBoost(this.bossEnemyId, multiplier);
    },
    summon: (_abilityId, count, profile) => {
      const boss = this.enemies.getEnemy(this.bossEnemyId!);
      let spawned = 0;
      for (let i = 0; i < count; i++) {
        if (this.enemyIds.size >= this.spawnSettings.maxActive) break; // never touches reserved slots
        const angle = (i * Math.PI * 2) / count;
        const distance = boss.config.radius + 40;
        this.registerEnemy(profile, {
          x: this.clamp(boss.position.x + Math.cos(angle) * distance, 20),
          y: this.clamp(boss.position.y + Math.sin(angle) * distance, 20),
        });
        spawned++;
      }
      return spawned;
    },
  };
  /** Fires exactly one due scheduled event (state-based; see CampaignDirector). */
  private resolveCampaignEvent() {
    const event = this.director?.fire(this.clock);
    if (event) this.applyCampaignEvent(event);
  }
  private applyCampaignEvent(event: ScheduledEvent) {
    const map = this.campaignMap;
    if (!map) return;
    if (event.kind === 'elite') {
      const { hpMultiplier, damageMultiplier } = map.elite;
      const enemyId = this.spawnScheduled(
        event.profile,
        hpMultiplier,
        damageMultiplier,
        eliteEnemyConfig(this.enemyProfile(event.profile), event.profile),
      );
      this.eliteEnemyIds.push(enemyId);
      this.eliteProfiles.set(enemyId, event.profile);
      this.record('campaign', [
        Object.freeze({
          type: 'elite-spawned',
          eventId: event.id,
          enemyId,
          profile: event.profile,
        }),
      ]);
    } else if (event.kind === 'boss') {
      const def = getBossDefinition(map.bossId);
      const base = ALPHA_ENEMIES[def.behavior];
      const enemyId = this.spawnScheduled(
        def.behavior,
        def.hpMultiplier,
        def.damageMultiplier,
        Object.freeze({
          ...base,
          radius: base.radius * def.radiusScale,
          movementSpeed: base.movementSpeed * def.speedScale,
        }),
      );
      this.bossEnemyId = enemyId;
      this.bossDefinition = def;
      this.bossController = new BossController(def.abilities, this.clock);
      this.record('campaign', [
        Object.freeze({
          type: 'boss-spawned',
          eventId: 'boss',
          enemyId,
          bossId: map.bossId,
          bossName: map.bossName,
        }),
      ]);
    } else {
      this.record('campaign', [Object.freeze({ type: 'duration-reached', eventId: 'end' })]);
      this.campaignInput({ type: 'duration-reached', time: this.clock });
    }
  }
  /** Feeds the pure run state machine; records `run-resolved` exactly once. */
  private campaignInput(input: RunInput) {
    if (!this.campaignMap) return;
    const { state, resolved } = reduceRun(this.campaignRun, input);
    this.campaignRun = state;
    if (resolved) {
      this.input = Object.freeze({ x: 0, y: 0 });
      this.record('campaign', [
        Object.freeze({
          type: 'run-resolved',
          outcome: resolved,
          runId: this.options.campaign?.runId ?? null,
          elapsed: Math.min(this.clock, this.campaignMap.durationSeconds),
        }),
      ]);
      // Task 12: buffs end with the run.
      if (this.chests) {
        const ended = this.chests.endRun(this.clock);
        if (ended.length) {
          this.record('chests', ended);
          this.syncBuffs();
        }
      }
      // Task 11: a victory pays the coins still on the ground. On maps 1–10 the boss appears at
      // the end of the timer, so its pile drops at the very moment of victory.
      if (resolved === 'victory') this.collectRemainingCoins();
    }
  }
  private collectRemainingCoins() {
    const events = this.coins.collectAll();
    if (events.length) this.record('progression', events);
  }
  // ── Task 08 debug helpers (reachable only through the DEV/QA testing controller) ──
  /** Fires a pending scheduled campaign event now ('boss', 'elite-N', 'end'); exactly once. */
  debugFireCampaignEvent(id: string): boolean {
    if (!this.director || this.campaignRun.status !== 'active') return false;
    const event = this.director.fireNow(id, this.clock);
    if (!event) return false;
    this.applyCampaignEvent(event);
    this.prepare();
    return true;
  }
  /** Lowers the boss to `fraction` of its max HP through Combat Core (never heals). */
  debugSetBossHpFraction(fraction: number): boolean {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
      throw new RangeError('fraction must be 0–1.');
    const id = this.bossEnemyId;
    if (!id || !this.core.getEntity(id).alive) return false;
    const boss = this.core.getEntity(id);
    const loss = boss.currentHp - boss.maxHp * fraction;
    if (loss <= 0) return true;
    // Core applies Resistance to periodic damage: pre-scale so the boss lands at the target HP.
    const raw = fraction === 0 ? Number.MAX_SAFE_INTEGER : (loss * (100 + boss.resistance)) / 100;
    this.forwardCombat(
      this.core.applyPeriodicDamage({
        operationId: `debug-boss-${this.clock}`,
        targetId: id,
        effectId: 'debug',
        rawDamage: raw,
        sources: [{ applicationId: 'debug-boss', sourceId: this.playerId, rawDamage: raw }],
      }).events,
    );
    return true;
  }
  /**
   * Forces a campaign outcome through the normal pipeline: victory = the boss dies (spawned first
   * if needed) and the duration is marked reached; defeat = the player dies and the run is
   * finished without revival. The run then resolves exactly once as usual.
   */
  // ── Task 12 debug helpers (reachable only through the DEV/QA testing controller) ──
  /** Contents forced by `debugSpawnChest` (chest id → content). */
  private readonly forcedChestContent = new Map<string, ChestContent>();
  private lastChestOpened: Readonly<{
    chestType: ChestType;
    content: ChestContent;
    amount: number;
    time: number;
  }> | null = null;
  /**
   * Spawns a chest of `type` now (normal placement rules and limit); `content` forces what it
   * gives when opened. Returns the chest id, or null if the limit/space skipped it.
   */
  debugSpawnChest(type: ChestType, content?: ChestContent): string | null {
    if (!this.chests || this.campaignRun.status !== 'active') return null;
    if (type !== 'wooden' && type !== 'enchanted') throw new TypeError('Invalid chest type.');
    const event = this.chests.spawnAt(this.clock, this.body, type);
    this.record('chests', [event]);
    if (event.type !== 'chest-spawned') return null;
    if (content) this.forcedChestContent.set(event.chest.id, content);
    this.prepare();
    return event.chest.id;
  }
  /** Grants (or refreshes) a chest buff now, like opening an enchanted chest. */
  debugGrantBuff(id: BuffId): boolean {
    if (!this.chests || this.campaignRun.status !== 'active') return false;
    if (!(id in BUFFS)) throw new TypeError('Invalid buff.');
    this.record('chests', [this.chests.grantBuff(id, this.clock)]);
    this.syncBuffs();
    this.prepare();
    return true;
  }
  /** Debug auto-collect (pacing measurement): pulls every crystal and coin once per second. */
  private autoCollectAt: number | null = null;
  setDebugAutoCollect(enabled: boolean): void {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be boolean.');
    this.autoCollectAt = enabled ? this.clock + 1 : null;
  }
  get debugAutoCollect(): boolean {
    return this.autoCollectAt !== null;
  }
  debugForceOutcome(outcome: 'victory' | 'defeat'): void {
    if (!this.campaignMap || this.campaignRun.status !== 'active') return;
    if (outcome === 'defeat') {
      if (this.core.getEntity(this.playerId).alive) this.setPlayerHp(0);
      if (this.survival.getState().runState === 'awaiting-revival-choice')
        this.decide('finish-run');
      return;
    }
    if (!this.bossEnemyId) this.debugFireCampaignEvent('boss');
    this.debugSetBossHpFraction(0);
    if (this.campaignRun.status === 'active' && !this.campaignRun.durationReached) {
      this.director?.fireNow('end', this.clock);
      this.record('campaign', [Object.freeze({ type: 'duration-reached', eventId: 'end' })]);
      this.campaignInput({ type: 'duration-reached', time: this.clock });
    }
  }
  /** Quit/reload during a campaign run: resolves as abandoned (no rewards); false if not active. */
  abandonRun(): boolean {
    if (!this.campaignMap || this.campaignRun.status !== 'active') return false;
    this.campaignInput({ type: 'abandon', time: this.clock });
    return true;
  }
  private syncDefeat() {
    if (this.campaignMap && this.survival.getState().runState === 'ended')
      this.campaignInput({ type: 'player-defeated', time: this.clock });
  }
  /**
   * Scheduled elite/boss spawn: off-screen like waves (spawn RNG stream), stats = map difficulty ×
   * extra multipliers. Reserved slots guarantee the 120-enemy cap is never exceeded.
   */
  private spawnScheduled(
    kind: 'melee' | 'ranged',
    hp: number,
    damage: number,
    profile: EnemyConfig = ALPHA_ENEMIES[kind],
  ): string {
    const position = offscreenPosition(
      this.body,
      this.viewport,
      profile.radius,
      this.spawnSettings,
      this.spawnRandom,
    ) ?? {
      x: this.clamp(this.body.x + 420, 20),
      y: this.clamp(this.body.y, 20),
    };
    return this.registerEnemy(
      kind,
      position,
      profile,
      scaleEnemyStats(this.enemyStats, { hp, damage }),
    );
  }
  private spawnWave() {
    const pressure = wavePressure(this.clock, this.spawnSettings);
    this.nextSpawnAt = this.clock + pressure.interval;
    this.waveSequence++;
    this.spawnOffscreen(pressure.count, pressure.stage);
  }
  setOnHit(definitions: readonly EffectDefinition[]): void {
    this.adapter = this.makeAdapter(definitions);
    this.onHitDefinitions = Object.freeze([...definitions]);
  }
  applyEffect(input: EffectApplication, stacks = 1): void {
    if (!Number.isInteger(stacks) || stacks < 1 || stacks > 20)
      throw new RangeError('Stacks must be 1–20.');
    for (const result of this.statuses.applyBatch(Array.from({ length: stacks }, () => input)))
      this.record('status', result.events);
  }
  cleanse(targetId: string): void {
    this.record('status', this.statuses.clearNegativeEffects(targetId));
  }
  healPlayer(): void {
    this.forwardCombat(
      this.core.heal(this.playerId, this.core.getEntity(this.playerId).maxHp).events,
    );
  }
  /** Controlled test HP decrease still delegates HP loss to Core; never writes entity internals. */
  setPlayerHp(hp: number): void {
    const player = this.core.getEntity(this.playerId);
    if (!Number.isFinite(hp) || hp < 0 || hp > player.maxHp)
      throw new RangeError('HP outside current maximum.');
    if (!player.alive) throw new Error('Dead character requires revival or a new session.');
    if (hp >= player.currentHp)
      this.forwardCombat(this.core.heal(this.playerId, hp - player.currentHp).events);
    else {
      // Core has no arbitrary HP setter. A controlled periodic loss keeps Core as HP authority,
      // avoiding direct immunity/RNG while exercising the normal death event path.
      const loss = player.currentHp - hp;
      if (hp !== 0 && !Number.isInteger(loss))
        throw new Error('A test damage decrease must be whole HP; healing preserves fractions.');
      // Find a raw input using the existing calculator; no second damage/resistance formula.
      let low = 0,
        high = Number.MAX_SAFE_INTEGER,
        raw = high;
      if (hp !== 0)
        for (let i = 0; i < 100; i++) {
          raw = (low + high) / 2;
          const damage = calculateSuccessfulDamage(raw, player.resistance);
          if (damage === loss) break;
          if (damage < loss) low = raw;
          else high = raw;
          if (i === 99) throw new RangeError('Requested test HP is not representable.');
        }
      const result = this.core.applyPeriodicDamage({
        operationId: `test-death-${this.eventSequence + 1}`,
        targetId: this.playerId,
        rawDamage: raw,
        effectId: 'test',
        sources: [{ applicationId: 'test', sourceId: this.playerId, rawDamage: raw }],
      });
      this.record('survival', this.survival.consumeCombatEvents(this.clock, result.events).events);
      this.forwardCombat(result.events);
    }
  }
  setTestProtection(enabled: boolean): void {
    if (typeof enabled !== 'boolean') throw new TypeError('Protection must be boolean.');
    this.testingProtection = enabled;
  }
  clearEnemies(): void {
    this.killEnemies([...this.enemyIds], 'clear', 'test-clear');
  }
  /**
   * Debug (Task 08.5 §1.2): kills every live enemy overlapping the visible area through Combat
   * Core, so deaths, crystals, kill counts, elite/boss kills and campaign events are the normal
   * ones. `view` is the camera's world rectangle; default = the player-centred viewport (the
   * same view off-screen spawning uses). Returns the number of enemies killed.
   */
  debugKillInView(
    view?: Readonly<{ x: number; y: number; width: number; height: number }>,
  ): number {
    const v = view ?? {
      x: this.body.x - this.viewport.width / 2,
      y: this.body.y - this.viewport.height / 2,
      width: this.viewport.width,
      height: this.viewport.height,
    };
    if (![v.x, v.y, v.width, v.height].every(Number.isFinite) || v.width <= 0 || v.height <= 0)
      throw new RangeError('View must be a finite rectangle with a positive size.');
    const ids = [...this.enemyIds].filter((id) => {
      const enemy = this.enemies.getEnemy(id);
      const r = enemy.config.radius;
      const { x, y } = enemy.position;
      return x + r >= v.x && x - r <= v.x + v.width && y + r >= v.y && y - r <= v.y + v.height;
    });
    return this.killEnemies(ids, 'debug-kill', 'debug-kill');
  }
  private killEnemies(ids: readonly string[], operation: string, effectId: string): number {
    let killed = 0;
    for (const id of ids) {
      if (this.core.getEntity(id).alive) {
        const raw = Number.MAX_SAFE_INTEGER;
        const result = this.core.applyPeriodicDamage({
          operationId: `${operation}-${id}`,
          targetId: id,
          effectId,
          rawDamage: raw,
          sources: [{ applicationId: effectId, sourceId: this.playerId, rawDamage: raw }],
        });
        this.forwardCombat(result.events);
        if (!this.core.getEntity(id).alive) killed++;
      }
    }
    this.prepare();
    return killed;
  }
  private clamp(value: number, radius: number) {
    return Math.max(radius, Math.min(ALPHA.arenaSize - radius, value));
  }
  private makeAdapter(definitions: readonly EffectDefinition[]) {
    // Player basic-weapon effects receive run modifiers (Toxic Mastery, Lingering, Elemental Mastery).
    const player = this.skills
      ? definitions.map((d) => this.skills.playerEffect(d, { basic: true }))
      : definitions;
    return this.createStatusAdapter({
      [ALPHA_WEAPONS[this.character.characterClass].id]: player,
      'alpha-enemy': [
        { effectType: 'poison', probabilityPercent: 25, duration: 4, rawDamagePerTick: 2 },
      ],
    });
  }
  protected createStatusAdapter(mapping: OnHitEffectMapping): WeaponStatusAdapter {
    return new WeaponStatusAdapter(this.statuses, mapping);
  }
  private movePlayer() {
    // Task 14: a requested dash starts at this input sample (if still allowed).
    if (this.dashRequested) {
      this.dashRequested = false;
      if (this.dashBlockReason() === null) this.startDash();
    }
    if (this.dash) {
      // During a dash the position is a pure function of time (no input; enemies are passed).
      this.body = Object.freeze({ ...this.body, ...this.dashPosition(this.clock) });
    } else {
      const speed = scaleMovementSpeed(
        ALPHA.baseMovementSpeed,
        this.skills.effectiveStats.movementSpeed,
      );
      this.body = Object.freeze({
        ...this.body,
        x: this.clamp(this.body.x + this.input.x * speed * ALPHA.controlStep, this.body.radius),
        y: this.clamp(this.body.y + this.input.y * speed * ALPHA.controlStep, this.body.radius),
      });
    }
    this.controlIndex++;
    this.progression(this.experience.collect(this.body, this.body.radius));
    const coins = this.coins.collect(this.body, this.body.radius);
    if (coins.length) this.record('progression', coins);
    // Task 12 debug: auto-collect everything once per second (measurement only; off by default).
    if (this.autoCollectAt !== null && this.clock >= this.autoCollectAt - 1e-9) {
      this.autoCollectAt += 1;
      this.progression(this.experience.collectAll());
      const all = this.coins.collectAll();
      if (all.length) this.record('progression', all);
    }
    // Task 12: chests open by touch (player radius + chest radius), as a pickup of this step.
    if (this.chests && this.campaignRun.status === 'active')
      for (const chest of this.chests.touched(this.body)) this.openChest(chest);
  }
  private expireChests() {
    const events = this.chests!.expireDue(this.clock);
    for (const e of events)
      if (e.type === 'chest-expired') this.forcedChestContent.delete(e.chest.id);
    this.record('chests', events);
    if (events.some((e) => e.type === 'buff-ended')) this.syncBuffs();
  }
  /** Task 12: chest buffs are temporary run modifiers composed with the stats (caps once). */
  private syncBuffs() {
    this.skills.setExternalModifiers(buffModifiers(this.chests!.activeBuffIds()));
  }
  /**
   * Task 12 §1.4: opens a touched chest. Wooden: heal 15% Max HP through Combat Core (never
   * revives) or a coin pile at the chest; enchanted: «Магнит» (all crystals and coins through the
   * normal collection path) or a 20 s buff. `forced` is the debug path.
   */
  private openChest(chest: Chest, forced?: ChestContent) {
    const player = this.core.getEntity(this.playerId);
    const preset = forced ?? this.forcedChestContent.get(chest.id);
    this.forcedChestContent.delete(chest.id);
    const content = this.chests!.open(
      chest,
      player.alive && player.currentHp < player.maxHp,
      preset,
    );
    let amount = 0;
    const extra: Parameters<typeof this.record>[1][number][] = [];
    if (content === 'heal') {
      if (player.alive) {
        const result = this.core.heal(this.playerId, player.maxHp * CHEST_HEAL_FRACTION);
        amount = result.healed;
        this.forwardCombat(result.events);
      }
    } else if (content === 'gold') {
      amount = chestGold(this.campaignMap!.victoryGold);
      const pile = this.coins.drop(chest, amount);
      this.record('progression', [
        Object.freeze({ type: 'coins-dropped', pileId: pile.id, amount }),
      ]);
    } else if (content === 'magnet') {
      const xp = this.experience.collectAll();
      const coins = this.coins.collectAll();
      for (const e of xp) if (e.type === 'xp-collected') amount += e.amount;
      for (const e of coins) if (e.type === 'coins-collected') amount += e.amount;
      this.progression(xp);
      if (coins.length) this.record('progression', coins);
    } else extra.push(this.chests!.grantBuff(content, this.clock));
    this.record('chests', [
      Object.freeze({ type: 'chest-opened', chest, content, amount }),
      ...extra,
    ]);
    this.lastChestOpened = Object.freeze({
      chestType: chest.type,
      content,
      amount,
      time: this.clock,
    });
    if (extra.length) this.syncBuffs();
  }
  /**
   * Task 11 §1.4: campaign coin drop of one rewarded death — boss: large pile, elite: guaranteed
   * pile, normal enemy: one seeded roll for a small pile. Values scale with the map.
   */
  private dropCoins(enemyId: string, position: Point) {
    const map = this.campaignMap;
    if (!map) return;
    const kind =
      enemyId === this.bossEnemyId ? 'boss' : this.eliteProfiles.has(enemyId) ? 'elite' : 'normal';
    if (kind === 'normal' && !(this.coinRandom() < normalChance(map.id))) return;
    const pile = this.coins.drop(position, coinValue(kind, map.id));
    this.record('progression', [
      Object.freeze({ type: 'coins-dropped', pileId: pile.id, amount: coinValue(kind, map.id) }),
    ]);
    // A death resolved in the same step after the victory still pays (nothing stays on the ground).
    if (this.campaignRun.status === 'victory') this.collectRemainingCoins();
  }
  private prepare() {
    this.skills.invalidateGeometry();
    this.record('enemy', this.enemies.prepareBoundary(this.body));
    this.weapons.setBody(this.playerId, this.body);
    for (const enemy of this.enemies.getEnemies())
      this.weapons.setBody(
        enemy.entityId,
        { ...enemy.position, radius: enemy.config.radius },
        enemy.velocity,
      );
  }
  private nextBoundary(end: number) {
    let horizon = end;
    for (;;) {
      const candidates: {
        time: number;
        rank: number;
        kind:
          | 'control'
          | 'weapon'
          | 'status'
          | 'enemy'
          | 'spawn'
          | 'skill'
          | 'boss'
          | 'campaign'
          | 'chest-spawn'
          | 'chest-expire'
          | 'dash-end'
          | 'dash-ready'
          | 'advance';
      }[] = [];
      const add = (time: number, rank: number, kind: (typeof candidates)[number]['kind']) => {
        if (time < horizon || sameInstant(time, horizon))
          candidates.push({ time: Math.max(this.clock, Math.min(time, horizon)), rank, kind });
      };
      if (this.survival.getState().canPlayerAct) {
        add(this.controlIndex * ALPHA.controlStep, 0, 'control');
        // Task 14: dash end and cooldown end resolve just before the input sample at equal time.
        if (this.dash) add(this.dash.endsAt, -0.5, 'dash-end');
        if (this.dashReadyPending) add(this.dashReadyAt, -0.4, 'dash-ready');
      }
      const w = this.weapons.peekBoundary(horizon),
        s = this.statuses.peekBoundary(horizon),
        e = this.enemies.peekBoundary(horizon);
      // Task 08: no new waves at or after the campaign duration (existing enemies keep acting).
      if (
        this.spawnSettings.enabled &&
        this.survival.getState().canPlayerAct &&
        (!this.campaignMap || this.nextSpawnAt < this.campaignMap.durationSeconds)
      )
        add(this.nextSpawnAt, 9, 'spawn');
      if (w) add(w.time, w.priority <= 1 ? 2 : 5, 'weapon');
      if (s) add(s.time, s.priority === 0 ? 3 : 8, 'status');
      if (e) add(e.time, e.priority <= 1 ? 1 : e.priority < 4 ? 4 : 6, 'enemy');
      // Task 07: skill actions after player strikes, before enemy attacks; expirations after statuses.
      const k = this.skills.peekBoundary(horizon);
      if (k) add(k.time, k.priority === 0 ? 5.5 : 8.5, 'skill');
      // Task 08: boss ability actions rank with enemy attacks (after skill actions and enemy attacks).
      if (this.bossActive() && this.survival.getState().canPlayerAct) {
        const bossAt = this.bossController!.peek();
        if (bossAt !== null) add(bossAt, 6.5, 'boss');
      }
      // Task 12 (owner-approved slots): chest/buff expiry with the skill expirations (after them);
      // chest spawn right after reinforcement spawning (before the scheduled campaign events).
      if (
        this.chests &&
        this.campaignRun.status === 'active' &&
        this.survival.getState().canPlayerAct
      ) {
        const expiry = this.chests.nextExpiryAt();
        if (expiry !== null) add(expiry, 8.6, 'chest-expire');
        add(this.chests.nextSpawnAt, 9.25, 'chest-spawn');
      }
      // Task 08: scheduled elite/boss/end events resolve last at equal time (after reinforcements).
      const scheduled = this.director?.peek();
      if (scheduled) add(scheduled.time, 9.5, 'campaign');
      const next = candidates.sort((a, b) =>
        sameInstant(a.time, b.time) ? a.rank - b.rank : a.time - b.time,
      )[0];
      if (!next)
        return horizon < end ? { time: horizon, rank: -1, kind: 'advance' as const } : null;
      // Geometry roots can move a few ULPs when a peek horizon is shortened. Revalidate
      // every module against the actual chosen horizon before advancing any clocks/HP.
      if (next.time < horizon && !sameInstant(next.time, horizon)) {
        horizon = next.time;
        continue;
      }
      return next;
    }
  }
  private advanceAll(time: number) {
    if (time === this.clock) return;
    this.survival.advanceTo(time);
    this.weapons.advanceToBoundary(time);
    this.statuses.advanceToBoundary(time);
    this.enemies.advanceToBoundary(time);
    this.skills.advanceToBoundary(time);
    this.clock = time;
    // Moving enemy hitboxes must be sampled at the boundary, before collision resolution.
    for (const enemy of this.enemies.getEnemies())
      this.weapons.setBody(
        enemy.entityId,
        { ...enemy.position, radius: enemy.config.radius },
        enemy.velocity,
      );
  }
  private consumeWeapons(events: readonly WeaponEvent[]) {
    this.record('weapon', events);
    for (const event of events)
      if (event.type === 'impact') {
        // Capture the target before this hit's own effects/death cleanup (deterministic snapshot).
        const pre = this.enemyIds.has(event.targetId) ? this.skills.preHit(event.targetId) : null;
        this.record('status', this.adapter.consumeImpact(event).events);
        this.forwardCombat(event.result.events);
        if (pre) this.skills.handleImpact(event, pre);
      } else if (event.type === 'attack-started') {
        // Task 09.1: off-hand damage is its own talent source in run stats.
        if (event.weaponId === OFFHAND_WEAPON.id)
          this.skills.tagTalentAttack(event.attack.id, 'warrior.b3.n01');
        this.skills.onBasicAttack(event);
      } else if (event.type === 'projectile-expired') this.skills.handleProjectileExpired(event);
  }
  private consumeEnemies(events: readonly EnemyEvent[]) {
    this.record('enemy', events);
    // Task 14: direct hits blocked inside a dash's i-frame window count as avoided by the dash.
    for (const event of events)
      if (
        (event.type === 'contact-attempt' ||
          event.type === 'enemy-projectile-impact' ||
          event.type === 'artillery-strike') &&
        event.blocked
      )
        this.noteBlockedHit(
          event.type === 'enemy-projectile-impact'
            ? event.projectile.sourceId
            : event.type === 'artillery-strike'
              ? event.strike.sourceId
              : event.sourceId,
        );
    for (const event of events)
      if (
        (event.type === 'contact-attempt' ||
          event.type === 'enemy-projectile-impact' ||
          event.type === 'artillery-strike') &&
        event.result
      ) {
        const attack =
          event.type === 'enemy-projectile-impact' ? event.projectile.attack : event.attack!;
        this.record(
          'status',
          this.adapter.consumeImpact({
            type: 'impact',
            time: this.clock,
            weaponId: 'alpha-enemy',
            attack,
            targetId: this.playerId,
            result: event.result,
          }).events,
        );
        this.forwardCombat(event.result.events);
        // Task 09.1: a dodged enemy direct attack (counterattack, shadow copy, Elusive).
        if (event.result.status === 'dodged') this.skills.onPlayerDodged(attack.attackerId);
      }
  }
  private consumeStatuses(events: readonly StatusEvent[]) {
    this.record('status', events);
    for (const event of events)
      if (event.type === 'status-tick' && event.result) {
        this.forwardCombat(event.result.events);
        const death = event.result.events.find((e) => e.type === 'death');
        if (death && death.type === 'death' && death.periodic && death.entityId !== this.playerId) {
          // Effects present immediately before death = groups removed because the target died.
          const effects = new Set<EffectType>(
            events
              .filter(
                (e) =>
                  e.type === 'status-removed' &&
                  e.reason === 'target-dead' &&
                  e.group.targetId === death.entityId,
              )
              .map((e) => e.group.effectType),
          );
          effects.add(event.group.effectType);
          // Task 15: stack counts just before death (Plague Chain III «Мор»).
          const stacks = new Map<EffectType, number>(
            events
              .filter(
                (e) =>
                  e.type === 'status-removed' &&
                  e.reason === 'target-dead' &&
                  e.group.targetId === death.entityId,
              )
              .map((e) => [e.group.effectType, e.group.stacks.length]),
          );
          if (!stacks.has(event.group.effectType))
            stacks.set(event.group.effectType, event.group.stacks.length);
          this.skills.handlePeriodicKill(death.entityId, effects, death.periodic.sources, stacks);
        }
      }
  }
  private forwardCombat(events: readonly CombatEvent[]) {
    this.record('combat', events);
    // Task 09.1: player HP changes feed HP-threshold talents (after Core resolved them).
    if (this.skills)
      for (const event of events)
        if (
          ((event.type === 'damage' || event.type === 'periodic-damage') &&
            event.targetId === this.playerId) ||
          ((event.type === 'healing' ||
            event.type === 'revived' ||
            event.type === 'max-hp-changed') &&
            event.entityId === this.playerId)
        )
          this.skills.onPlayerHpChanged(
            event.type === 'damage' || event.type === 'periodic-damage',
          );
    for (const event of events)
      if (event.type === 'damage' && event.targetId === this.playerId) {
        // Task 09.1: real direct damage taken (after mitigation/barrier), e.g. Mage Protective Seal.
        if (event.appliedDamage > 0 && this.skills)
          this.skills.onPlayerDirectDamage(event.sourceId);
      } else if (
        event.type === 'death' &&
        event.entityId !== this.playerId &&
        this.enemyIds.has(event.entityId)
      ) {
        const enemy = this.enemies.getEnemy(event.entityId);
        const contributors = Object.freeze([
          ...new Set(
            event.periodic?.sources
              .filter((source) => source.rawDamage > 0)
              .map((source) => source.sourceId) ?? [event.sourceId],
          ),
        ]);
        if (contributors.includes(this.playerId)) {
          this.kills++;
          const elite = this.eliteProfiles.get(event.entityId);
          // Task 08: elites drop their normal crystal plus the profile's extra run XP.
          const xp =
            enemyKindXp(this.enemyKinds.get(event.entityId) ?? 'melee') +
            (elite ? eliteProfile(elite).extraXp : 0) +
            (event.entityId === this.bossEnemyId && this.bossDefinition
              ? this.bossDefinition.xpReward
              : 0);
          const crystal = this.experience.drop(enemy.position, xp);
          this.record('progression', [
            Object.freeze({
              type: 'enemy-rewarded',
              enemyId: event.entityId,
              sourceId: event.sourceId,
              contributors,
              cause: event.periodic ? 'periodic' : 'direct',
              ...(event.periodic ? { effectId: event.periodic.effectId } : {}),
              xp,
              crystalId: crystal.id,
              position: enemy.position,
            }),
          ]);
          // Task 11: coins drop here too — inside the once-per-death reward (dedup by design).
          this.dropCoins(event.entityId, enemy.position);
        }
        this.skills.noteDeath(event.entityId, enemy.position);
        if (event.entityId === this.bossEnemyId && !this.bossDefeated) {
          this.bossDefeated = true;
          this.record('campaign', [
            Object.freeze({
              type: 'boss-defeated',
              enemyId: event.entityId,
              bossId: this.campaignMap!.bossId,
              bossName: this.campaignMap!.bossName,
            }),
          ]);
          this.campaignInput({ type: 'boss-killed', time: this.clock });
        } else if (this.eliteEnemyIds.includes(event.entityId))
          this.campaignInput({ type: 'elite-killed', time: this.clock });
        this.enemyIds.delete(event.entityId);
        this.enemyKinds.delete(event.entityId);
        this.enemies.unregisterEnemy(event.entityId);
        this.weapons.removeBody(event.entityId);
      }
    this.record('status', this.statuses.consumeCombatEvents(events));
    this.record('enemy', this.enemies.consumeCombatEvents(events));
    this.record('weapon', this.weapons.update(0, { paused: true }));
    if (
      events.some((e) => e.type === 'death' && e.entityId === this.playerId) &&
      this.survival.getState().runState === 'ended'
    ) {
      this.run.clearPending();
      this.syncDefeat();
    }
  }
  protected record(channel: WorldEvent['channel'], events: readonly WorldEvent['event'][]) {
    for (const event of events) {
      const entry: WorldEvent = Object.freeze({
        sequence: ++this.eventSequence,
        time: this.clock,
        channel,
        event,
      });
      this.history.push(entry);
      if (
        channel === 'status' &&
        event.type === 'status-applied' &&
        event.group.targetId !== this.playerId
      )
        this.statusTargets.add(event.group.targetId);
      if (
        channel === 'combat' ||
        channel === 'weapon' ||
        channel === 'progression' ||
        channel === 'chests' ||
        channel === 'skill' ||
        channel === 'movement'
      )
        this.runStats.consume(entry);
    }
    if (this.history.length > ALPHA.eventHistoryLimit)
      this.history.splice(0, this.history.length - ALPHA.eventHistoryLimit);
  }
}
