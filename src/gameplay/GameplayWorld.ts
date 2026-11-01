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
  defaultOnHit,
} from './config';
import type { CampaignSnapshot, GameplayOptions, GameplaySnapshot, WorldEvent } from './types';

import { RunExperience, XP_RULES } from './experience';
import type { ExperienceEvent } from './experience';
import { RunSkills, SkillEngine, SYNERGY_RULES, completedPairs } from '../skills';
import type { SkillEvent } from '../skills';
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
  BossHost,
  CampaignMap,
  CampaignRunState,
  RunInput,
} from '../campaign';
import type { DirectDamageObserver, DirectDamagePolicy } from '../enemy-ai';
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
  private spawnSettings: SpawnSettings;
  private nextSpawnAt: number;
  private waveSequence = 0;
  private autoSpawnSequence = 0;
  private viewport: ViewportSize;
  private readonly spawnRandom: () => number;
  private readonly history: WorldEvent[] = [];
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
    let seed = options.seed ?? 1337;
    if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('Invalid random seed.');
    this.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let skillSeed = ((options.seed ?? 1337) ^ 0x5bd1e995) >>> 0;
    const skillRandom = () => {
      skillSeed = (Math.imul(skillSeed, 1664525) + 1013904223) >>> 0;
      return skillSeed / 4294967296;
    };
    let spawnSeed = (options.seed ?? 1337) ^ 0x9e3779b9;
    this.spawnRandom = () => {
      spawnSeed = (Math.imul(spawnSeed, 1664525) + 1013904223) >>> 0;
      return spawnSeed / 4294967296;
    };
    this.campaignMap = options.campaign ? getCampaignMap(options.campaign.mapId) : null;
    this.director = this.campaignMap ? new CampaignDirector(this.campaignMap) : null;
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
    this.core = createCore(this.random);
    this.core.addEntity({
      id: this.playerId,
      affiliation: 'player',
      stats: this.character.combatAttributes,
    });
    this.survival = new PlayerSurvival(this.core, this.playerId);
    const emit = (events: readonly SurvivalEvent[]) => this.record('survival', events);
    const statusPolicies = createStatusSurvivalPolicies(this.survival, emit);
    this.statuses = new StatusEffects(this.core, {
      random: this.random,
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
    });
    this.weapons = new WeaponAttacks(this.core, {
      damageModifier: (context) => this.skills.damageModifier(context),
    });
    this.weapons.setBody(this.playerId, this.body);
    const weapon = ALPHA_WEAPONS[options.characterClass];
    this.weapons.equipWeapon({
      entityId: this.playerId,
      characterClass: options.characterClass,
      weapon,
      attackSpeedPercent: this.character.combatAttributes.attackSpeed,
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
        basicWeaponId: weapon.id,
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
  setPaused(paused: boolean): void {
    if (typeof paused !== 'boolean') throw new TypeError('paused must be boolean.');
    this.manualPause = paused;
    this.setMovement(0, 0);
  }
  getSnapshot(): GameplaySnapshot {
    return Object.freeze({
      time: this.clock,
      paused: this.paused,
      player: this.core.getEntity(this.playerId),
      playerBody: this.body,
      character: this.character,
      stats: this.skills.effectiveStats,
      skills: this.run.getState(),
      skillCombat: this.skills.snapshot(),
      survival: this.survival.getState(),
      kills: this.kills,
      progression: this.experience.getState(),
      crystals: this.experience.getCrystals(),
      spawning: Object.freeze({
        settings: this.spawnSettings,
        nextSpawnAt: this.nextSpawnAt,
        waves: this.waveSequence,
        viewport: this.viewport,
      }),
      enemies: Object.freeze(
        this.enemies
          .getEnemies()
          .map((e) => Object.freeze({ ...e, entity: this.core.getEntity(e.entityId) })),
      ),
      playerProjectiles: this.weapons.getProjectiles(),
      enemyProjectiles: this.enemies.getProjectiles(),
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
      durationReached: clock.durationReached,
      nextEvent: (() => {
        const next = this.director!.peek();
        return next ? Object.freeze({ id: next.id, kind: next.kind, time: next.time }) : null;
      })(),
      firedEvents: this.director!.firedIds(),
      firedLog: this.director!.firedLog(),
      bossTime: CAMPAIGN_BALANCE.boss.spawnTime,
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
      else if (next.kind === 'weapon') this.consumeWeapons(this.weapons.resolveBoundary());
      else if (next.kind === 'status') this.consumeStatuses(this.statuses.resolveBoundary());
      else if (next.kind === 'enemy') this.consumeEnemies(this.enemies.resolveBoundary());
      else if (next.kind === 'spawn') this.spawnWave();
      else if (next.kind === 'skill') this.skills.resolveBoundary();
      else if (next.kind === 'campaign') this.resolveCampaignEvent();
      else if (next.kind === 'boss') this.resolveBossAbility();
      this.skills.endStep();
      if (
        (this.survival.getState().requiresWorldPause ||
          this.run.pendingChoices > 0 ||
          this.campaignRun.status !== 'active') &&
        pauseAt === null
      ) {
        pauseAt = this.clock;
        this.timeCompensation = 0;
        this.input = Object.freeze({ x: 0, y: 0 });
      }
    }
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
  spawnEnemy(
    kind: 'melee' | 'ranged',
    distance = 240,
    angle?: number,
    config?: EnemyConfig,
  ): string {
    if (kind !== 'melee' && kind !== 'ranged') throw new TypeError('Invalid enemy kind.');
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
    const profile = enemyConfig(config ?? ALPHA_ENEMIES[kind]);
    if (profile.behavior !== kind) throw new TypeError('Enemy kind/profile mismatch.');
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
  private registerEnemy(
    kind: 'melee' | 'ranged',
    position: Point,
    profile: EnemyConfig = ALPHA_ENEMIES[kind],
    stats: CombatAttributes = this.enemyStats,
  ): string {
    const id = `enemy-${++this.enemySequence}`;
    this.core.addEntity({ id, affiliation: 'enemy', stats });
    this.enemies.registerEnemy({ entityId: id, config: profile, position });
    this.enemyIds.add(id);
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
    this.skills.applyChoice(this.run.grantForTesting(skillId, rank));
    this.record('skill', [Object.freeze({ type: 'skill-chosen', skillId, rank })]);
    this.recordSynergyUnlocks(unlockedBefore, skillId);
    this.rebuildOnHit();
    this.prepare();
  }
  /** Spend one of the run's three rerolls on the current offer; never grants an extra choice. */
  rerollSkillOffer(): void {
    this.record('skill', this.run.reroll());
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
      dodgeChance: player.dodgeChance,
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
  private spawnOffscreen(count: number, stage: number) {
    const enemyIds: string[] = [],
      positions: Point[] = [];
    for (let i = 0; i < count && this.enemyIds.size < this.spawnSettings.maxActive; i++) {
      const share = this.spawnSettings.rangedShare;
      const kind =
        Math.floor((this.autoSpawnSequence + 1) * share) >
        Math.floor(this.autoSpawnSequence * share)
          ? 'ranged'
          : 'melee';
      const position = offscreenPosition(
        this.body,
        this.viewport,
        ALPHA_ENEMIES[kind].radius,
        this.spawnSettings,
        this.spawnRandom,
      );
      if (!position) break;
      this.autoSpawnSequence++;
      enemyIds.push(this.registerEnemy(kind, position));
      positions.push(position);
    }
    this.record('spawning', [
      Object.freeze({
        type: 'wave-spawned',
        wave: this.waveSequence,
        stage,
        enemyIds: Object.freeze(enemyIds),
        positions: Object.freeze(positions),
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
      if (!this.hostilePolicies.canResolveDirectDamage({ ...context, attack: null })) return false;
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
    const map = this.campaignMap;
    if (!event || !map) return;
    if (event.kind === 'elite') {
      const { hpMultiplier, damageMultiplier } = CAMPAIGN_BALANCE.elite;
      const enemyId = this.spawnScheduled(
        event.profile,
        hpMultiplier,
        damageMultiplier,
        eliteEnemyConfig(ALPHA_ENEMIES[event.profile], event.profile),
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
    for (const id of this.enemyIds) {
      if (this.core.getEntity(id).alive) {
        const raw = Number.MAX_SAFE_INTEGER;
        const result = this.core.applyPeriodicDamage({
          operationId: `clear-${id}`,
          targetId: id,
          effectId: 'test-clear',
          rawDamage: raw,
          sources: [{ applicationId: 'test-clear', sourceId: this.playerId, rawDamage: raw }],
        });
        this.forwardCombat(result.events);
      }
    }
    this.prepare();
  }
  private clamp(value: number, radius: number) {
    return Math.max(radius, Math.min(ALPHA.arenaSize - radius, value));
  }
  private makeAdapter(definitions: readonly EffectDefinition[]) {
    // Player basic-weapon effects receive run modifiers (Toxic Mastery, Lingering, Elemental Mastery).
    const player = this.skills ? definitions.map((d) => this.skills.playerEffect(d)) : definitions;
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
    const speed = scaleMovementSpeed(
      ALPHA.baseMovementSpeed,
      this.skills.effectiveStats.movementSpeed,
    );
    this.body = Object.freeze({
      ...this.body,
      x: this.clamp(this.body.x + this.input.x * speed * ALPHA.controlStep, this.body.radius),
      y: this.clamp(this.body.y + this.input.y * speed * ALPHA.controlStep, this.body.radius),
    });
    this.controlIndex++;
    this.progression(this.experience.collect(this.body, this.body.radius));
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
          | 'advance';
      }[] = [];
      const add = (time: number, rank: number, kind: (typeof candidates)[number]['kind']) => {
        if (time < horizon || sameInstant(time, horizon))
          candidates.push({ time: Math.max(this.clock, Math.min(time, horizon)), rank, kind });
      };
      if (this.survival.getState().canPlayerAct)
        add(this.controlIndex * ALPHA.controlStep, 0, 'control');
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
      } else if (event.type === 'attack-started') this.skills.onBasicAttack(event);
      else if (event.type === 'projectile-expired') this.skills.handleProjectileExpired(event);
  }
  private consumeEnemies(events: readonly EnemyEvent[]) {
    this.record('enemy', events);
    for (const event of events)
      if (
        (event.type === 'contact-attempt' || event.type === 'enemy-projectile-impact') &&
        event.result
      ) {
        const attack = event.type === 'contact-attempt' ? event.attack! : event.projectile.attack;
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
          this.skills.handlePeriodicKill(death.entityId, effects, death.periodic.sources);
        }
      }
  }
  private forwardCombat(events: readonly CombatEvent[]) {
    this.record('combat', events);
    for (const event of events)
      if (
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
            (enemy.config.behavior === 'melee' ? XP_RULES.meleeReward : XP_RULES.rangedReward) +
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
    for (const event of events)
      this.history.push(
        Object.freeze({ sequence: ++this.eventSequence, time: this.clock, channel, event }),
      );
    if (this.history.length > ALPHA.eventHistoryLimit)
      this.history.splice(0, this.history.length - ALPHA.eventHistoryLimit);
  }
}
