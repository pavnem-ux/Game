import { FLOATING_LIMITS, FloatingNumbers, HitFlashes, shakeFor } from './game-feel';
import type { FloatingKind } from './game-feel';
import { uiSettings } from '../gameplay-ui/ui-settings';
import Phaser from 'phaser';
import { frameStep, isDebugTimeScale } from './time-scale';
import type { DebugTimeScale } from './time-scale';
import { GameplayWorld, ALPHA, CLASS_LABELS } from '../gameplay';
import type { GameplayOptions, GameplaySnapshot, WorldEvent } from '../gameplay';
import { alphaBridge, CLASS_COLORS } from '../gameplay-ui/store';
import type { AlphaCommand } from '../gameplay-ui/store';
import { loadSave, saveRun } from '../progression/save';
import type { TestingController } from '../gameplay/testing';
import { stunIndicator } from './stun-indicator';
import { oncePerKeyEvent } from './key-event-once';
import { OFFHAND_WEAPON } from '../talents';
import { cardKey } from '../skills';
import { soundFrame } from '../gameplay-ui/sound';
import { hapticFrame } from '../gameplay-ui/touch';
import { JOYSTICK, inJoystickZone, keyboardVector, movementInput } from './touch-input';
import { pinToScreen } from './screen-space';
import { buildUnitTextures } from './visuals/texture-factory';
import { BiomeRenderer } from './visuals/BiomeRenderer';
import { BOSS_DARK, LightRenderer, WARM_DARK } from './visuals/LightRenderer';
import { QUALITY_PRESETS } from './visuals/quality';
import type { GraphicsQuality } from './visuals/quality';
import { DEPTH, UnitRenderer } from './visuals/UnitRenderer';
import {
  ART_SCALE,
  chestTextureKey,
  enemyTextureKey,
  playerProjectileKey,
  playerTextureKey,
  unitScale,
} from './visuals/keys';

/** Task 08.5 §5.1: floating-number styles (crit larger and gold, player damage red). */
const FLOAT_STYLES: Record<FloatingKind, { color: string; size: number }> = {
  normal: { color: '#fff3d6', size: 12 },
  crit: { color: '#ffd24a', size: 16 },
  player: { color: '#ff6b6b', size: 14 },
  dodge: { color: '#b9c7c0', size: 11 },
};
/** Seconds the red edge vignette stays after the player loses HP. */
const PLAYER_HIT_VIGNETTE = 0.3;

export class AlphaScene extends Phaser.Scene {
  private world: GameplayWorld | null = null;
  private runId = 0;
  private recordedRun = 0;
  private record = loadSave().bestSeconds;
  private error = '';
  private graphics!: Phaser.GameObjects.Graphics;
  /** Task 18: HP bars, marks and control rings above the unit sprites. */
  private overlay!: Phaser.GameObjects.Graphics;
  private units!: UnitRenderer;
  /** Task 18: the map's biome (ground, decor, particles), rebuilt when the map changes. */
  private biome!: BiomeRenderer;
  private mapId: number | null = null;
  /** Task 18: darkness overlay and light sources («Последний свет»). */
  private lighting!: LightRenderer;
  private revivedAt = Number.NEGATIVE_INFINITY;
  /** Task 18: additive glows on projectiles / light sources (Высокое only). */
  private accentGlow = true;
  /** Task 18: last drawn position of each enemy (death puffs); entries are updated in place. */
  private readonly lastEnemyPos = new Map<string, { x: number; y: number; color: number }>();
  private joystick!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stick = { active: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  private hudTimer = 0;
  private lastEvent = 0;
  /** Task 08.5 §5 game feel (presentation only): pooled numbers, hit flashes, vignette. */
  private readonly floating = new FloatingNumbers();
  private floatLabels: Phaser.GameObjects.Text[] = [];
  private readonly flashes = new HitFlashes();
  private vignette!: Phaser.GameObjects.Graphics;
  private playerHitAt = Number.NEGATIVE_INFINITY;
  private fx: { event: WorldEvent; until: number; x: number; y: number; text?: string }[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private damageLabels: Phaser.GameObjects.Text[] = [];
  private stunLabels: Phaser.GameObjects.Text[] = [];
  /** Task 08: name tags of elites/bosses (pooled). */
  private nameLabels: Phaser.GameObjects.Text[] = [];
  /** Task 08 debug accelerated mode (DEV/QA only): frame time multiplier for the same simulation. */
  private timeScale: DebugTimeScale = 1;
  private testing?: TestingController;
  private testingWorld?: (options: GameplayOptions) => GameplayWorld;
  private testingReady: Promise<void> = Promise.resolve();
  constructor() {
    super('combat-alpha');
  }
  create() {
    this.biome = new BiomeRenderer(this);
    this.graphics = this.add.graphics().setDepth(5);
    buildUnitTextures(this);
    this.units = new UnitRenderer(this);
    this.lighting = new LightRenderer(this);
    // Task 18: quality applies to every visual layer now and whenever the setting changes.
    this.applyQuality();
    const unsubscribeQuality = uiSettings.subscribe(() => this.applyQuality());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeQuality);
    this.overlay = this.add.graphics().setDepth(DEPTH.overlay);
    this.joystick = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.vignette = this.add.graphics().setDepth(90).setScrollFactor(0);
    this.cameras.main.setBounds(0, 0, ALPHA.arenaSize, ALPHA.arenaSize).centerOn(1800, 1800);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as typeof this.keys;
    // DOM controls retain their own key input. Phaser must not capture arrows/space in forms.
    this.input.keyboard!.clearCaptures();
    const toggle = oncePerKeyEvent((e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,select,textarea')) return;
      if (
        this.world &&
        !this.world.survival.getState().requiresWorldPause &&
        this.world.run.pendingChoices === 0 &&
        this.world.run.pendingEnhancedChoice === null
      ) {
        this.world.setPaused(!this.world.paused);
        this.clearInput();
        this.publish();
      }
    });
    this.input.keyboard!.on('keydown-P', toggle).on('keydown-ESC', toggle);
    // Task 14: Space / Shift dash (resolved by the world at its next input sample).
    const dash = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.matches('input,select,textarea')) return;
      if (!this.world || this.world.paused) return;
      e.preventDefault(); // a focused HUD button must not also receive Space during play
      if (this.world.requestDash()) this.publish();
    };
    this.input.keyboard!.on('keydown-SPACE', dash).on('keydown-SHIFT', dash);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Task 16: a floating joystick where the thumb lands (left half; right half for «Левша»).
      if (
        this.world &&
        !this.world.paused &&
        !this.stick.active &&
        inJoystickZone(p.x, p.y, this.scale.width, this.scale.height, uiSettings.get().leftHanded)
      )
        Object.assign(this.stick, { active: true, id: p.id, x: p.x, y: p.y, dx: 0, dy: 0 });
    });
    // Origin in canvas pixels; the offset in CSS px (the joystick's 60 px are CSS px at any DPR).
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.stick.active && p.id === this.stick.id) {
        this.stick.dx = (p.x - this.stick.x) / this.dpr;
        this.stick.dy = (p.y - this.stick.y) / this.dpr;
      }
    });
    // Multi-touch: only the joystick's own finger releases it (a dash tap must not stop movement).
    const release = (p: Phaser.Input.Pointer) => {
      if (this.stick.active && p.id === this.stick.id) {
        this.stick.active = false;
        this.stick.dx = this.stick.dy = 0;
      }
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    const visibility = () => {
      if (document.hidden && this.world) {
        this.world.setPaused(true);
        this.clearInput();
        this.publish();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    const unsubscribe = alphaBridge.onCommand((command) => this.command(command));
    const cleanup = () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      if (import.meta.env.DEV || __QA_BUILD__) delete window.__alpha;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    if (
      (import.meta.env.DEV || __QA_BUILD__) &&
      new URLSearchParams(location.search).has('debug')
    ) {
      this.testingReady = import('../gameplay/testing').then(
        ({ createTestingController, createTestingWorld }) => {
          if (!this.scene.isActive()) return;
          this.testingWorld = createTestingWorld;
          this.testing = createTestingController(
            () => this.world,
            (options) => this.start(options),
          );
          window.__alpha = {
            state: () => alphaBridge.getSnapshot(),
            command: (action) => this.command({ type: 'testing', action }),
            advance: (seconds) => {
              this.world?.update(seconds);
              if (this.world) this.draw(this.world.getSnapshot());
              this.publish();
            },
            presentation: () =>
              Object.freeze({
                stunIndicators: Object.freeze(
                  this.stunLabels
                    .filter((label) => label.visible)
                    .map((label) =>
                      Object.freeze({
                        entityId: label.getData('entityId') as string,
                        text: label.text,
                      }),
                    ),
                ),
              }),
          };
          this.publish();
        },
      );
    }
    this.publish();
  }
  private start(options: GameplayOptions) {
    const input = {
      ...options,
      viewport: this.cssViewport(),
    };
    const next =
      (import.meta.env.DEV || __QA_BUILD__) && this.testingWorld
        ? this.testingWorld(input)
        : new GameplayWorld(input); // Validate before replacing a session.
    this.world = next;
    // Task 18: the run's map decides the biome (same map ⇒ same look).
    this.mapId = options.campaign?.mapId ?? null;
    this.biome.build(this.mapId, this.graphicsQuality());
    this.resetFeel();
    this.runId++;
    this.lastEvent = 0;
    this.fx = [];
    this.lastEnemyPos.clear();
    this.revivedAt = Number.NEGATIVE_INFINITY;
    this.error = '';
    this.clearInput();
    this.keys && this.input.keyboard?.resetKeys();
  }
  private command(command: AlphaCommand) {
    if (
      (import.meta.env.DEV || __QA_BUILD__) &&
      command.type === 'start' &&
      new URLSearchParams(location.search).has('debug') &&
      !this.testingWorld
    ) {
      // A fast initial click waits for the QA factory; later restarts remain synchronous.
      void this.testingReady.then(() => {
        if (this.scene.isActive()) this.command(command);
      });
      return;
    }
    try {
      this.error = '';
      switch (command.type) {
        case 'start':
          this.start(command.options);
          break;
        case 'menu':
          this.world = null;
          this.lastEnemyPos.clear();
          this.resetFeel();
          this.clearInput();
          this.labels.forEach((t) => t.setVisible(false));
          this.damageLabels.forEach((t) => t.setVisible(false));
          this.stunLabels.forEach((t) => t.setVisible(false));
          this.nameLabels.forEach((t) => t.setVisible(false));
          this.joystick.clear();
          break;
        case 'pause':
          this.world?.setPaused(true);
          this.clearInput();
          break;
        case 'resume':
          this.world?.setPaused(false);
          break;
        case 'revive':
          this.world?.decide('revive');
          this.clearInput();
          break;
        case 'finish':
          this.world?.decide('finish-run');
          break;
        case 'abandon':
          // Task 08: quitting a campaign run resolves it as abandoned (no rewards).
          this.world?.abandonRun();
          this.clearInput();
          break;
        case 'choose-skill':
          this.world?.chooseSkill(command.card);
          this.clearInput();
          break;
        case 'choose-enhanced':
          this.world?.chooseEnhancedSkill(command.skillId);
          this.clearInput();
          break;
        case 'reroll':
          this.world?.rerollSkillOffer();
          break;
        case 'banish-skill':
          this.world?.banishSkillCard(command.card);
          break;
        case 'offer-key': {
          // Hotkeys address the offer the world holds now (the UI snapshot may be a frame behind).
          const card = this.world?.run.currentOffer?.cards[command.index];
          if (!card || !this.world) break;
          const key = cardKey(card);
          if (command.banish) {
            if (this.world.run.banishBlockReason(key) === null) this.world.banishSkillCard(key);
          } else {
            this.world.chooseSkill(key);
            this.clearInput();
          }
          break;
        }
        case 'dash':
          // Task 16: the touch dash button = Space / Shift (queued for the next input sample).
          this.world?.requestDash();
          break;
        case 'skip-offer':
          this.world?.skipSkillOffer();
          this.clearInput();
          break;
        case 'time-scale':
          if (import.meta.env.DEV || __QA_BUILD__) {
            if (!isDebugTimeScale(command.scale))
              throw new RangeError('Time scale must be ×1, ×2, ×4 or ×8.');
            this.timeScale = command.scale;
          }
          break;
        case 'testing':
          if (import.meta.env.DEV || __QA_BUILD__) this.testing?.(command.action);
          break;
        case 'kill-on-screen':
          if (import.meta.env.DEV || __QA_BUILD__) {
            const { x, y, width, height } = this.cameras.main.worldView;
            this.testing?.({ type: 'kill-in-view', view: { x, y, width, height } });
          }
          break;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Команда отклонена';
    }
    this.publish();
  }
  private clearInput() {
    this.stick.active = false;
    this.stick.dx = this.stick.dy = 0;
    this.world?.setMovement(0, 0);
    this.input.keyboard?.resetKeys();
  }
  /**
   * Task 18 «Последний свет»: act darkness with a flickering warm light around the player; light
   * sources cut holes in order of importance (telegraphs and enemy shots first, so they are always
   * visible), coloured glows add warmth. Boss phase: deeper, redder darkness and a boss aura.
   */
  private drawLights(s: GameplaySnapshot) {
    const look = this.biome.look;
    const t = s.time;
    const boss = s.campaign?.boss
      ? s.enemies.find((e) => e.alive && e.entityId === s.campaign!.boss!.enemyId)
      : undefined;
    const revive = Math.min(1, Math.max(0, (t - this.revivedAt) / 0.8));
    const darkness = ((look?.biome.darkness ?? 0.45) + (boss ? 0.12 : 0)) * revive;
    const flicker = 1 + 0.03 * Math.sin(t * 7.3) + 0.02 * Math.sin(t * 12.1);
    const { x, y } = s.playerBody;
    this.lighting.begin(this.cameras.main, darkness, boss ? BOSS_DARK : WARM_DARK, {
      x,
      y,
      radius: 260 * flicker * (boss ? 0.92 : 1),
    });
    const L = this.lighting;
    // Telegraphs first: they must never be lost in the dark.
    for (const strike of s.artilleryStrikes) {
      L.add(strike.center.x, strike.center.y, strike.radius * 1.5, 1);
      if (this.accentGlow)
        this.units.glow(strike.center.x, strike.center.y, strike.radius * 1.2, 0xff4d3d, 0.22);
    }
    const cast = s.campaign?.bossCast;
    if (cast?.center) {
      const r = cast.radius ?? (cast.kind === 'charge' ? 180 : 110);
      L.add(cast.center.x, cast.center.y, r * 1.5, 1);
      if (this.accentGlow) this.units.glow(cast.center.x, cast.center.y, r, 0xff4d3d, 0.2);
    }
    for (const p of s.enemyProjectiles) {
      L.add(p.x, p.y, 60, 0.9);
      if (this.accentGlow) this.units.glow(p.x, p.y, 26, 0xff6a4a, 0.5);
    }
    if (boss) {
      L.add(boss.position.x, boss.position.y, 200, 0.85);
      this.units.glow(boss.position.x, boss.position.y, 170, 0xff3b5c, 0.28);
    }
    for (const chest of s.chests?.items ?? []) {
      L.add(chest.x, chest.y, 110, 0.9);
      if (this.accentGlow)
        this.units.glow(
          chest.x,
          chest.y,
          60,
          chest.type === 'enchanted' ? 0xb68cff : 0xf0c862,
          0.3,
        );
    }
    for (const p of s.playerProjectiles) {
      L.add(p.x, p.y, 70, 0.75);
      if (this.accentGlow)
        this.units.glow(
          p.x,
          p.y,
          22,
          p.weaponId.startsWith('skill:') ? skillColor(p.weaponId.slice(6)) : 0xfff0c0,
          0.45,
        );
    }
    for (const z of s.skillCombat.zones) L.add(z.center.x, z.center.y, z.radius * 1.4, 0.8);
    for (const f of this.fx)
      if (f.event.event.type === 'skill-area') {
        const e = f.event.event;
        L.add(f.x, f.y, e.radius * 1.4, Math.max(0, (f.until - t) / 0.25));
      }
    for (const c of s.crystals) L.add(c.x, c.y, 44, 0.6);
    for (const pile of s.coins.piles) L.add(pile.x, pile.y, 40, 0.55);
  }
  /** Task 18 «Качество графики» (UI settings; presentation only). */
  private graphicsQuality(): GraphicsQuality {
    return uiSettings.get().graphicsQuality;
  }
  /** Applies the quality to every visual layer (biome rebuild, light mode, glows). */
  private applyQuality() {
    const q = this.graphicsQuality();
    this.units.glowEnabled = QUALITY_PRESETS[q].glow;
    this.floating.setLimit(QUALITY_PRESETS[q].damageNumbers);
    this.accentGlow = QUALITY_PRESETS[q].accentGlow;
    this.lighting.setQuality(q);
    this.biome.build(this.mapId, q);
  }
  /** Task 16: canvas pixels per CSS pixel (set by AlphaCanvas; capped by quality). */
  private get dpr(): number {
    const v = this.registry.get('dpr');
    return typeof v === 'number' && v >= 1 ? v : 1;
  }
  /** Viewport in CSS pixels: what the world uses for spawning/culling (unchanged by DPR). */
  private cssViewport() {
    return { width: this.scale.width / this.dpr, height: this.scale.height / this.dpr };
  }
  update(time: number, delta: number) {
    // Task 16: the main camera shows the same world area at any DPR (zoom = DPR).
    if (this.cameras.main.zoom !== this.dpr) this.cameras.main.setZoom(this.dpr);
    const dt = frameStep(delta, import.meta.env.DEV || __QA_BUILD__ ? this.timeScale : 1);
    this.biome.update(this.cameras.main.worldView, time / 1000, Math.min(0.05, delta / 1000));
    if (this.world) {
      // Task 16: keyboard and the touch joystick produce one movement vector (same input path).
      const typing = (document.activeElement as HTMLElement)?.matches('input,select,textarea');
      const k = this.keys;
      const keys = typing
        ? keyboardVector(false, false, false, false)
        : keyboardVector(
            k.D.isDown || k.RIGHT.isDown,
            k.A.isDown || k.LEFT.isDown,
            k.S.isDown || k.DOWN.isDown,
            k.W.isDown || k.UP.isDown,
          );
      const move = movementInput(keys, this.stick);
      // The simulation sees the CSS-pixel viewport, as before (DPR never changes spawning).
      const viewport = this.cssViewport();
      this.world.setViewport(viewport.width, viewport.height);
      this.world.setMovement(move.x, move.y);
      this.world.update(dt);
      this.draw(this.world.getSnapshot());
    } else if (this.graphics) {
      this.graphics.clear();
      this.overlay.clear();
      this.units.begin();
      this.units.end();
      this.lighting.hide();
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.publish();
      this.hudTimer = 0.1;
    }
  }
  private draw(s: GameplaySnapshot) {
    const g = this.graphics;
    g.clear();
    const o = this.overlay.clear();
    this.cameras.main.centerOn(s.playerBody.x, s.playerBody.y);
    // Task 18: cull sprites to the camera view (worldView follows centerOn above).
    this.units.setView(this.cameras.main.worldView);
    this.units.begin();
    const frameEvents = this.world!.getEvents(this.lastEvent);
    // Task 14: sound reads the same events (presentation only; nothing flows back).
    soundFrame(frameEvents);
    hapticFrame(frameEvents);
    for (const event of frameEvents) {
      this.lastEvent = event.sequence;
      const e = event.event;
      if (event.channel === 'weapon' && e.type === 'attack-started' && !e.projectileId)
        this.fx.push({ event, until: event.time + 0.18, x: e.origin.x, y: e.origin.y });
      if (event.channel === 'skill' && e.type === 'skill-area')
        this.fx.push({ event, until: event.time + 0.25, x: e.center.x, y: e.center.y });
      // Task 18: revive — a brief bright flash; darkness returns over 0.8 s.
      if (event.channel === 'survival' && e.type === 'player-revived') {
        this.revivedAt = event.time;
        this.cameras.main.flash(450, 255, 236, 200);
      }
      // Task 18: death puff where the enemy was last drawn.
      if (event.channel === 'combat' && e.type === 'death' && e.entityId !== 'player') {
        const last = this.lastEnemyPos.get(e.entityId);
        if (last) {
          this.fx.push({ event, until: event.time + 0.4, x: last.x, y: last.y });
          this.lastEnemyPos.delete(e.entityId);
        }
      }
      if (event.channel === 'skill' && e.type === 'synergy-triggered')
        this.fx.push({
          event,
          until: event.time + 0.8,
          x: e.position.x,
          y: e.position.y - 18,
          // Task 15: the level shows on the label; an awakened trigger gets a gold «✦».
          text: `${SYNERGY_LABELS[e.synergyId] ?? e.synergyId}${e.level && e.level > 1 ? ` ${e.level === 2 ? 'II' : 'III'}` : ''}${e.awakened ? ' ✦' : ''}`,
        });
      if (event.channel === 'campaign' && (e.type === 'boss-spawned' || e.type === 'boss-defeated'))
        this.fx.push({
          event,
          until: event.time + 3,
          x: s.playerBody.x,
          y: s.playerBody.y - 70,
          text: e.type === 'boss-spawned' ? `⚠ Босс: ${e.bossName}` : `✦ ${e.bossName} повержен`,
        });
      if (event.channel === 'skill' && e.type === 'synergy-unlocked')
        this.fx.push({
          event,
          until: event.time + 2.4,
          x: s.playerBody.x,
          y: s.playerBody.y - 46,
          text: `✦ Синергия открыта: ${SYNERGY_LABELS[e.synergyId] ?? e.synergyId}`,
        });
      if (
        event.channel === 'combat' &&
        (e.type === 'damage' || e.type === 'periodic-damage' || e.type === 'dodge')
      ) {
        const player = e.targetId === 'player';
        const target = player
          ? s.playerBody
          : s.enemies.find((v) => v.entityId === e.targetId)?.position;
        const amount = e.type === 'dodge' ? 0 : e.appliedDamage;
        if (target && (e.type === 'dodge' || amount > 0)) {
          const kind =
            e.type === 'dodge'
              ? 'dodge'
              : player
                ? 'player'
                : e.type === 'damage' && e.critical
                  ? 'crit'
                  : 'normal';
          this.floating.spawn(kind, target.x, target.y - 30, amount, event.time);
          if (amount > 0) {
            if (player) this.playerHitAt = event.time;
            else this.flashes.hit(e.targetId, event.time);
          }
        }
      }
      if (event.channel === 'combat' || event.channel === 'campaign') {
        const shake = uiSettings.get().screenShake
          ? shakeFor(e as Parameters<typeof shakeFor>[0])
          : null;
        if (shake) this.cameras.main.shake(shake.duration, shake.intensity);
      }
    }
    this.fx = this.fx.filter((f) => f.until > s.time).slice(-64);
    for (const z of s.skillCombat.zones) {
      const c = skillColor(z.sourceKey);
      const armed = z.armedAt === undefined || z.armedAt <= s.time;
      g.fillStyle(c, armed ? 0.12 : 0.05).fillCircle(z.center.x, z.center.y, z.radius);
      g.lineStyle(1, c, armed ? 0.55 : 0.3).strokeCircle(z.center.x, z.center.y, z.radius);
    }
    // Task 09.1: talent entities (Rogue shadow copy, Archer ballistae) — original simple shapes.
    for (const t of s.talentEntities ?? []) {
      if (t.kind === 'ballista') {
        g.fillStyle(0x8a6a3e, 0.9).fillRect(t.x - 10, t.y - 10, 20, 20);
        g.lineStyle(2, 0xe8c36a, 0.9).strokeRect(t.x - 10, t.y - 10, 20, 20);
      } else {
        g.fillStyle(0x9a8cff, 0.35).fillCircle(t.x, t.y, 13);
        g.lineStyle(1, 0xc9c0ff, 0.6).strokeCircle(t.x, t.y, 13);
      }
    }
    // Task 18: pickups and chests are pooled sprites (textures baked once).
    for (const crystal of s.crystals)
      this.units.item(
        'crystal',
        crystal.x,
        crystal.y,
        0.85 / ART_SCALE,
        1,
        1.5 + Math.sin(s.time * 3 + crystal.x * 0.05) * 1.5,
      );
    // Task 11: Gold coin piles (bigger piles drawn slightly larger).
    for (const pile of s.coins.piles) {
      const r = Math.min(9, 4 + Math.log2(pile.value + 1));
      this.units.item('coin', pile.x, pile.y, r / 6 / ART_SCALE);
    }
    // Task 12: chests (original shapes): wooden — brown box with an iron band; enchanted — violet
    // box with a glowing rune. Blinking (alpha flicker) in the last 5 s of their life.
    for (const chest of s.chests?.items ?? []) {
      const alpha = chest.blinking ? (Math.floor(s.time * 6) % 2 === 0 ? 0.35 : 1) : 1;
      this.units.item(chestTextureKey(chest.type), chest.x, chest.y, 1 / ART_SCALE, alpha);
    }
    // Task 12: bombard telegraphs — a red ground circle that fills up until the strike lands.
    for (const strike of s.artilleryStrikes) {
      const span = strike.landsAt - strike.markedAt;
      const progress = span > 0 ? Math.min(1, Math.max(0, (s.time - strike.markedAt) / span)) : 1;
      const { x, y } = strike.center;
      g.fillStyle(0xff3b3b, 0.1 + 0.18 * progress).fillCircle(x, y, strike.radius);
      g.fillStyle(0xff5a3b, 0.22).fillCircle(x, y, strike.radius * progress);
      g.lineStyle(2, 0xff4d4d, 0.9).strokeCircle(x, y, strike.radius);
    }
    let stunLabel = 0;
    let label = 0,
      damageLabel = 0;
    let nameLabel = 0;
    const elites = s.campaign?.elites;
    for (const enemy of s.enemies) {
      if (!enemy.alive) continue;
      const { x, y } = enemy.position;
      const ranged = enemy.config.behavior === 'ranged';
      const kind = enemy.kind;
      // Task 08: elites are bigger, glow in their profile colour and carry a name + wide HP bar.
      let eliteName: string | null = null;
      const isBoss = s.campaign?.boss?.enemyId === enemy.entityId;
      if (isBoss) eliteName = s.campaign!.boss!.name;
      else if (elites)
        for (const elite of elites) if (elite.enemyId === enemy.entityId) eliteName = elite.name;
      const f = eliteName ? enemy.config.radius / (ranged ? 15 : 14) : 1;
      const hpWidth = isBoss ? 120 : eliteName ? 64 : 34;
      const role = isBoss ? 'boss' : eliteName ? 'elite' : 'normal';
      const special = kind !== 'melee' && kind !== 'ranged';
      const k = special && !eliteName ? enemy.config.radius / 14 : f;
      const barY = y - 25 * (isBoss ? enemy.config.radius / 17 : k);
      // Task 18: the unit is a pooled sprite (shadow, rim glow/aura, body, hit flash).
      if (eliteName)
        g.lineStyle(
          isBoss ? 3 : 2,
          isBoss ? 0xff3b5c : ranged ? 0xb68cff : 0xff8a3d,
          0.55,
        ).strokeCircle(x, y, enemy.config.radius + 7);
      const flash = this.flashes.strength(enemy.entityId, s.time);
      const glowColor = isBoss ? 0xff3b5c : eliteName ? (ranged ? 0xb68cff : 0xff8a3d) : undefined;
      this.units.unit(
        enemy.entityId,
        enemyTextureKey(kind, role, ranged),
        x,
        y,
        role === 'normal' ? k / ART_SCALE : unitScale(role, enemy.config.radius, ranged),
        s.time,
        flash,
        {
          ...(glowColor !== undefined ? { glow: glowColor, glowScale: isBoss ? 1.6 : 1.1 } : {}),
        },
      );
      const last = this.lastEnemyPos.get(enemy.entityId);
      const tone = glowColor ?? (ranged ? 0xb2739b : 0x87996e);
      if (last) {
        last.x = x;
        last.y = y;
        last.color = tone;
      } else this.lastEnemyPos.set(enemy.entityId, { x, y, color: tone });
      o.fillStyle(0x19201b).fillRect(x - hpWidth / 2, barY, hpWidth, eliteName ? 5 : 3);
      o.fillStyle(isBoss ? 0xff4d6d : eliteName ? 0xffb347 : ranged ? 0xe09ac1 : 0xc8d79c).fillRect(
        x - hpWidth / 2,
        barY,
        (hpWidth * enemy.entity.currentHp) / enemy.entity.maxHp,
        eliteName ? 5 : 3,
      );
      if (eliteName)
        this.label(this.nameLabels, nameLabel++)
          .setText(eliteName)
          .setColor(isBoss ? '#ffb3c1' : ranged ? '#d9c4ff' : '#ffd0a8')
          .setPosition(x, barY - 10)
          .setDepth(11)
          .setVisible(true);
      const mark = s.skillCombat.marks.find((m) => m.targetId === enemy.entityId);
      if (mark)
        o.lineStyle(2, mark.kind === 'hunter' ? 0xffd27a : 0xd690ff, 0.9)
          .strokeCircle(x, y, 22)
          .lineBetween(x - 26, y, x - 18, y)
          .lineBetween(x + 18, y, x + 26, y);
      const stun = stunIndicator(enemy);
      if (stun) {
        const index = stunLabel++;
        const badge =
          this.stunLabels[index] ??
          this.label(this.stunLabels, index)
            .setText(stun.text)
            .setColor(stun.color)
            .setBackgroundColor(stun.background)
            .setPadding(4, 2)
            .setDepth(12);
        badge
          .setPosition(x, y + stun.offsetY)
          .setData('entityId', enemy.entityId)
          .setVisible(true);
        o.lineStyle(2, 0xffe88e, 0.95).lineBetween(x - 7, y - 39, x + 7, y - 39);
      } else if (enemy.control && enemy.control.movementMultiplier < 1)
        g.lineStyle(2, 0x9fdcff, 0.7).strokeEllipse(x, y + 14, 34, 10);
      const effects = s.statuses.filter((v) => v.targetId === enemy.entityId);
      if (effects.length) {
        const text = this.label(this.labels, label++);
        text
          .setPosition(x, y - 39)
          .setText(
            effects
              .map((v) => `${v.effectType.slice(0, 2).toUpperCase()}×${v.stacks.length}`)
              .join(' '),
          )
          .setVisible(true);
      }
    }
    for (; stunLabel < this.stunLabels.length; stunLabel++)
      this.stunLabels[stunLabel].setVisible(false);
    for (; nameLabel < this.nameLabels.length; nameLabel++)
      this.nameLabels[nameLabel].setVisible(false);
    // Task 08: boss telegraphs (dangerous attacks are announced before they resolve).
    const cast = s.campaign?.bossCast;
    if (cast && cast.center) {
      const span = Math.max(1e-6, cast.executeAt - cast.startedAt);
      const progress = Math.min(1, Math.max(0, (s.time - cast.startedAt) / span));
      if (cast.kind === 'circle_aoe' && cast.radius) {
        g.fillStyle(0xff4a3d, 0.12 + 0.18 * progress).fillCircle(
          cast.center.x,
          cast.center.y,
          cast.radius * progress,
        );
        g.lineStyle(3, 0xff5a45, 0.95).strokeCircle(cast.center.x, cast.center.y, cast.radius);
      } else if (cast.kind === 'charge' && cast.direction) {
        const len = 320;
        const ex = cast.center.x + cast.direction.x * len,
          ey = cast.center.y + cast.direction.y * len;
        g.lineStyle(14, 0xff5a45, 0.18 + 0.25 * progress).lineBetween(
          cast.center.x,
          cast.center.y,
          ex,
          ey,
        );
        g.lineStyle(2, 0xffb199, 0.9).lineBetween(cast.center.x, cast.center.y, ex, ey);
      } else if (cast.kind === 'radial_burst')
        g.lineStyle(2, 0xd99bff, 0.4 + 0.5 * progress).strokeCircle(
          cast.center.x,
          cast.center.y,
          36 + 40 * progress,
        );
      else if (cast.kind === 'summon')
        g.lineStyle(2, 0x9ad48a, 0.4 + 0.5 * progress).strokeCircle(
          cast.center.x,
          cast.center.y,
          60,
        );
    }
    const { x, y } = s.playerBody,
      color = CLASS_COLORS[s.character.characterClass];
    // Task 14: dash afterimages (fading ghosts along the dash line) and the cooldown ring.
    const dash = s.dash;
    if (dash.startedAt !== null && dash.from) {
      const age = s.time - dash.startedAt;
      if (age >= 0 && age < 0.4) {
        const fade = 1 - age / 0.4;
        for (let i = 0; i < 4; i++) {
          const t = i / 4;
          const gx = dash.from.x + (x - dash.from.x) * t,
            gy = dash.from.y + (y - dash.from.y) * t;
          this.units.item(
            playerTextureKey(s.character.characterClass),
            gx,
            gy,
            1 / ART_SCALE,
            0.12 + 0.2 * t * fade,
          );
        }
      }
    }
    if (s.time < dash.readyAt && dash.cooldown > 0) {
      const done = 1 - (dash.readyAt - s.time) / dash.cooldown;
      g.lineStyle(3, 0x0b1222, 0.6).strokeCircle(x, y, 34);
      g.lineStyle(3, 0xecc46f, 0.85)
        .beginPath()
        .arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, done))
        .strokePath();
    }
    // Task 18: the player is a pooled sprite (class silhouette baked once); hit flash on damage.
    const hitAge = s.time - this.playerHitAt;
    this.units.unit(
      'player',
      playerTextureKey(s.character.characterClass),
      x,
      y,
      1 / ART_SCALE,
      s.time,
      hitAge >= 0 && hitAge < 0.15 ? 1 - hitAge / 0.15 : 0,
      { alpha: s.player.alive ? 1 : 0.4 },
    );
    if (s.survival.directProtected)
      g.lineStyle(
        s.survival.fullyProtected ? 3 : 1,
        s.survival.fullyProtected ? 0xffe4a6 : 0xd5fff2,
        0.8,
      ).strokeCircle(x, y, 26);
    if (s.skillCombat.barrier > 0) g.lineStyle(2, 0xbfe4ff, 0.75).strokeCircle(x, y, 30);
    for (const p of s.playerProjectiles) {
      const skill = p.weaponId.startsWith('skill:');
      const key = playerProjectileKey(p.weaponId, s.character.characterClass);
      this.units.projectile(
        key,
        p.x,
        p.y,
        p.direction.x,
        p.direction.y,
        Math.max(0.8, p.radius / 5) / ART_SCALE,
        key === 'proj-arrow' ? null : skill ? skillColor(p.weaponId.slice(6)) : color,
      );
    }
    for (const p of s.enemyProjectiles)
      this.units.projectile(
        'proj-enemy',
        p.x,
        p.y,
        p.direction.x,
        p.direction.y,
        Math.max(0.8, p.radius / 5) / ART_SCALE,
        null,
      );
    for (const f of this.fx) {
      const e = f.event.event;
      if (e.type === 'attack-started' && !e.projectileId) {
        // Task 09.1 G6: the off-hand sword draws its own (shorter, narrower) swing.
        const w =
          e.weaponId === OFFHAND_WEAPON.id
            ? { ...OFFHAND_WEAPON, pattern: 'melee_arc' as const }
            : s.weapon.weapon;
        if (w.pattern !== 'projectile') {
          const a = Math.atan2(e.direction.y, e.direction.x),
            half = (w.arcDegrees * Math.PI) / 360;
          g.fillStyle(color, 0.14)
            .beginPath()
            .moveTo(f.x, f.y)
            .arc(f.x, f.y, w.attackRange, a - half, a + half)
            .closePath()
            .fillPath();
          g.lineStyle(2, color, 0.7)
            .beginPath()
            .arc(f.x, f.y, w.attackRange, a - half, a + half)
            .strokePath();
        }
      }
      if (e.type === 'skill-area') {
        const c = skillColor(e.sourceKey),
          alpha = Math.max(0, (f.until - s.time) / 0.25);
        if (e.shape === 'cone' && e.direction) {
          const a = Math.atan2(e.direction.y, e.direction.x),
            half = ((e.arcDegrees ?? 90) * Math.PI) / 360;
          g.fillStyle(c, 0.18 * alpha)
            .beginPath()
            .moveTo(f.x, f.y)
            .arc(f.x, f.y, e.radius, a - half, a + half)
            .closePath()
            .fillPath();
        } else {
          g.fillStyle(c, 0.16 * alpha).fillCircle(f.x, f.y, e.radius);
          g.lineStyle(2, c, 0.6 * alpha).strokeCircle(f.x, f.y, e.radius);
          if (e.shape === 'ring' && e.innerRadius) g.strokeCircle(f.x, f.y, e.innerRadius);
        }
      }
      if (e.type === 'death') {
        // Task 18: death puff — an expanding ring and a few motes, fading in 0.4 s.
        const life = Math.max(0, (f.until - s.time) / 0.4);
        const grow = 1 - life;
        g.lineStyle(2, 0xdfe8d0, 0.55 * life).strokeCircle(f.x, f.y, 8 + grow * 22);
        g.fillStyle(0xcfd8c0, 0.5 * life);
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 + f.x * 0.01;
          g.fillCircle(
            f.x + Math.cos(a) * (6 + grow * 20),
            f.y + Math.sin(a) * (6 + grow * 20) - grow * 8,
            2.2 * life + 0.4,
          );
        }
      }
      if (e.type === 'synergy-triggered') {
        // Task 15: per-synergy flash; an awakened trigger draws a larger gold double ring.
        const life = Math.max(0, (f.until - s.time) / 0.8);
        const c = SYNERGY_COLORS[e.synergyId] ?? 0xbfe9ff;
        const grow = 1 - life;
        const y = f.y + 18;
        if (e.awakened) {
          g.fillStyle(0xffd877, 0.12 * life).fillCircle(f.x, y, 30 + grow * 40);
          g.lineStyle(3, 0xffd877, 0.85 * life).strokeCircle(f.x, y, 30 + grow * 40);
          g.lineStyle(2, c, 0.7 * life).strokeCircle(f.x, y, 18 + grow * 24);
        } else g.lineStyle(2, c, 0.75 * life).strokeCircle(f.x, y, 12 + grow * 18);
      }
      if (f.text)
        this.label(this.damageLabels, damageLabel++)
          .setPosition(f.x, f.y - 40 - (0.6 - (f.until - s.time)) * 20)
          .setText(f.text)
          .setColor(f.event.channel === 'skill' ? '#bfe9ff' : '#ffe4ba')
          .setVisible(true);
    }
    this.drawLights(s);
    this.units.end();
    this.labels.slice(label).forEach((t) => t.setVisible(false));
    this.damageLabels.slice(damageLabel).forEach((t) => t.setVisible(false));
    this.drawFeel(s);
    this.joystick.clear();
    pinToScreen(this.joystick, this.cameras.main);
    if (this.stick.active) {
      // Task 16: drawn in canvas pixels; the ring is the full-speed radius, the inner circle the
      // dead zone (both CSS px × DPR).
      const k = this.dpr;
      const d = Math.hypot(this.stick.dx, this.stick.dy),
        r = Math.min(JOYSTICK.radius, d) * k,
        a = Math.atan2(this.stick.dy, this.stick.dx);
      this.joystick
        .fillStyle(0x0b1222, 0.25)
        .fillCircle(this.stick.x, this.stick.y, JOYSTICK.radius * k)
        .lineStyle(2 * k, 0xc6edce, 0.45)
        .strokeCircle(this.stick.x, this.stick.y, JOYSTICK.radius * k)
        .lineStyle(k, 0xc6edce, 0.25)
        .strokeCircle(this.stick.x, this.stick.y, JOYSTICK.radius * JOYSTICK.deadZone * k);
      this.joystick
        .fillStyle(0xc6edce, 0.5)
        .fillCircle(this.stick.x + Math.cos(a) * r, this.stick.y + Math.sin(a) * r, 22 * k);
    }
  }
  /** Task 08.5 §5: floating numbers (pooled, capped) and the player-hit vignette. */
  private drawFeel(s: GameplaySnapshot) {
    for (let i = 0; i < this.floating.capacity; i++) this.floatLabels[i]?.setVisible(false);
    this.floating.forEachActive(s.time, (entry, progress, i) => {
      const t =
        this.floatLabels[i] ??
        (this.floatLabels[i] = this.add
          .text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#17251c',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(13));
      const style = FLOAT_STYLES[entry.kind];
      const pop = entry.kind === 'crit' && progress < 0.15 ? 1.35 - progress * 2.3 : 1;
      t.setText(entry.text)
        .setColor(style.color)
        .setFontSize(style.size)
        .setScale(pop)
        .setAlpha(progress > 0.6 ? (1 - progress) / 0.4 : 1)
        .setPosition(entry.x + entry.drift, entry.y - progress * FLOATING_LIMITS.rise)
        .setVisible(true);
    });
    const v = this.vignette.clear();
    pinToScreen(v, this.cameras.main);
    const hitAge = s.time - this.playerHitAt;
    if (hitAge >= 0 && hitAge < PLAYER_HIT_VIGNETTE) {
      const strength = 1 - hitAge / PLAYER_HIT_VIGNETTE;
      const w = this.scale.width,
        h = this.scale.height,
        k = this.dpr; // canvas pixels per CSS pixel
      for (let i = 0; i < 6; i++)
        v.lineStyle(14 * k, 0xd8323c, 0.32 * strength * (1 - i / 6)).strokeRect(
          (7 + i * 14) * k,
          (7 + i * 14) * k,
          w - (14 + i * 28) * k,
          h - (14 + i * 28) * k,
        );
    }
  }
  private resetFeel() {
    this.floating.clear();
    this.flashes.clear();
    this.playerHitAt = Number.NEGATIVE_INFINITY;
    this.floatLabels.forEach((t) => t.setVisible(false));
    this.vignette?.clear();
  }
  private label(pool: Phaser.GameObjects.Text[], i: number) {
    return (
      pool[i] ??
      (pool[i] = this.add
        .text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#dbefd0',
          stroke: '#17251c',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(10))
    );
  }
  private publish() {
    const world = this.world?.getSnapshot() ?? null;
    const run = world?.survival.runState;
    const outcome = world?.campaign?.status;
    const screen = !world
      ? 'menu'
      : outcome === 'victory' || outcome === 'defeat'
        ? 'results'
        : run === 'awaiting-revival-choice'
          ? 'revival'
          : run === 'ended'
            ? 'ended'
            : world.skills.enhancedChoice
              ? 'enhanced-skill'
              : world.skills.offer
                ? 'level-up'
                : world.paused
                  ? 'paused'
                  : 'playing';
    if (screen === 'ended' && !world?.campaign && this.recordedRun !== this.runId) {
      this.record = saveRun(world!.time, world!.kills).bestSeconds;
      this.recordedRun = this.runId;
    }
    alphaBridge.publish({
      ...(import.meta.env.DEV || __QA_BUILD__
        ? {
            qa: this.testing?.snapshot() ?? null,
            timeScale: this.timeScale,
            fps: Math.round(this.game.loop.actualFps),
          }
        : {}),
      screen,
      world,
      runId: this.runId,
      events: this.world?.getEvents() ?? [],
      record: this.record,
      error: this.error,
    });
  }
}
const SKILL_COLORS: Record<string, number> = {
  fire: 0xff8a4c,
  ice: 0x9fdcff,
  poison: 0x9fe07a,
  bleed: 0xe0607a,
  physical: 0xf1e3b8,
  shadow: 0xb08cff,
};
const SKILL_FAMILY: Record<string, keyof typeof SKILL_COLORS> = {
  fireball: 'fire',
  flame_burst: 'fire',
  inferno: 'fire',
  frost_nova: 'ice',
  ice_shards: 'ice',
  blizzard: 'ice',
  toxic_volley: 'poison',
  poison_trap: 'poison',
  blood_blades: 'bleed',
  lacerate: 'bleed',
  shadow_strike: 'shadow',
  seismic_impact: 'physical',
};
function skillColor(key: string): number {
  const id = key.split(/[#:]/)[0];
  if (SYNERGY_COLORS[id] !== undefined) return SYNERGY_COLORS[id]; // Task 15 synergy areas
  return SKILL_COLORS[SKILL_FAMILY[id] ?? 'physical'];
}
/** Task 15: synergy flash colours (element of each synergy). */
const SYNERGY_COLORS: Record<string, number> = {
  thermal_shock: 0xffb36b,
  wildfire: 0xff8a4c,
  shattered_ice: 0x9fdcff,
  skull_crusher: 0xf1e3b8,
  battle_momentum: 0xffd27a,
  seismic_impact: 0xd8b98a,
  toxic_barrage: 0x9fe07a,
  plague_chain: 0x7fd06a,
  deadly_precision: 0xcff5a0,
  blood_frenzy: 0xe0607a,
  deep_wounds: 0xc84a66,
  final_cut: 0xff5470,
};
const SYNERGY_LABELS: Record<string, string> = {
  thermal_shock: 'ТЕРМОШОК',
  wildfire: 'ЛЕСНОЙ ПОЖАР',
  shattered_ice: 'РАСКОЛ',
  skull_crusher: 'СОКРУШЕНИЕ',
  battle_momentum: 'НАПОР',
  seismic_impact: 'СЕЙСМИКА',
  toxic_barrage: 'ТОКСИН',
  plague_chain: 'ЧУМА',
  deadly_precision: 'ТОЧНОСТЬ',
  blood_frenzy: 'БЕЗУМИЕ',
  deep_wounds: 'ГЛУБОКИЕ РАНЫ',
  final_cut: 'РАЗРЕЗ',
};
declare global {
  interface Window {
    __alpha?: {
      state: () => ReturnType<typeof alphaBridge.getSnapshot>;
      command: (action: unknown) => void;
      advance: (seconds: number) => void;
      presentation: () => {
        readonly stunIndicators: readonly { readonly entityId: string; readonly text: string }[];
      };
    };
  }
}
