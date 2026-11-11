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
import { createWorld } from './World';
import type { TestingController } from '../gameplay/testing';
import { stunIndicator } from './stun-indicator';
import { oncePerKeyEvent } from './key-event-once';
import { OFFHAND_WEAPON } from '../talents';
import { cardKey } from '../skills';

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
    createWorld(this);
    this.graphics = this.add.graphics().setDepth(5);
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
      if (
        this.world &&
        !this.world.paused &&
        p.x < this.scale.width / 2 &&
        p.y > this.scale.height * 0.3
      )
        Object.assign(this.stick, { active: true, id: p.id, x: p.x, y: p.y, dx: 0, dy: 0 });
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.stick.active && p.id === this.stick.id) {
        this.stick.dx = p.x - this.stick.x;
        this.stick.dy = p.y - this.stick.y;
      }
    });
    this.input.on('pointerup', () => this.clearInput());
    this.input.on('pointerupoutside', () => this.clearInput());
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
      viewport: { width: this.scale.width, height: this.scale.height },
    };
    const next =
      (import.meta.env.DEV || __QA_BUILD__) && this.testingWorld
        ? this.testingWorld(input)
        : new GameplayWorld(input); // Validate before replacing a session.
    this.world = next;
    this.resetFeel();
    this.runId++;
    this.lastEvent = 0;
    this.fx = [];
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
  update(_time: number, delta: number) {
    const dt = frameStep(delta, import.meta.env.DEV || __QA_BUILD__ ? this.timeScale : 1);
    if (this.world) {
      let dx =
        Number(this.keys.D.isDown || this.keys.RIGHT.isDown) -
        Number(this.keys.A.isDown || this.keys.LEFT.isDown);
      let dy =
        Number(this.keys.S.isDown || this.keys.DOWN.isDown) -
        Number(this.keys.W.isDown || this.keys.UP.isDown);
      if ((document.activeElement as HTMLElement)?.matches('input,select,textarea')) dx = dy = 0;
      if (this.stick.active && Math.hypot(this.stick.dx, this.stick.dy) > 8) {
        dx = this.stick.dx;
        dy = this.stick.dy;
      }
      this.world.setViewport(this.scale.width, this.scale.height);
      this.world.setMovement(dx, dy);
      this.world.update(dt);
      this.draw(this.world.getSnapshot());
    } else this.graphics?.clear();
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.publish();
      this.hudTimer = 0.1;
    }
  }
  private draw(s: GameplaySnapshot) {
    const g = this.graphics;
    g.clear();
    this.cameras.main.centerOn(s.playerBody.x, s.playerBody.y);
    for (const event of this.world!.getEvents(this.lastEvent)) {
      this.lastEvent = event.sequence;
      const e = event.event;
      if (event.channel === 'weapon' && e.type === 'attack-started' && !e.projectileId)
        this.fx.push({ event, until: event.time + 0.18, x: e.origin.x, y: e.origin.y });
      if (event.channel === 'skill' && e.type === 'skill-area')
        this.fx.push({ event, until: event.time + 0.25, x: e.center.x, y: e.center.y });
      if (event.channel === 'skill' && e.type === 'synergy-triggered')
        this.fx.push({
          event,
          until: event.time + 0.8,
          x: e.position.x,
          y: e.position.y - 18,
          text: SYNERGY_LABELS[e.synergyId] ?? e.synergyId,
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
    for (const crystal of s.crystals) {
      const { x, y } = crystal;
      g.fillStyle(0xb4f1aa, 0.13).fillCircle(x, y, 12);
      g.fillStyle(0xa7eaa7)
        .fillTriangle(x, y - 5, x - 4, y, x + 4, y)
        .fillTriangle(x - 4, y, x + 4, y, x, y + 6);
      g.lineStyle(1, 0xe4ffe1, 0.7).lineBetween(x, y - 4, x - 2, y);
    }
    // Task 11: Gold coin piles (original simple shapes; bigger piles drawn slightly larger).
    for (const pile of s.coins.piles) {
      const r = Math.min(9, 4 + Math.log2(pile.value + 1));
      g.fillStyle(0xf0c862, 0.18).fillCircle(pile.x, pile.y, r + 6);
      g.fillStyle(0xf0c862).fillCircle(pile.x, pile.y, r);
      g.lineStyle(1, 0xfff1c4, 0.8).strokeCircle(pile.x, pile.y, r);
    }
    // Task 12: chests (original shapes): wooden — brown box with an iron band; enchanted — violet
    // box with a glowing rune. Blinking (alpha flicker) in the last 5 s of their life.
    for (const chest of s.chests?.items ?? []) {
      const alpha = chest.blinking ? (Math.floor(s.time * 6) % 2 === 0 ? 0.35 : 1) : 1;
      const { x, y } = chest;
      const enchanted = chest.type === 'enchanted';
      g.fillStyle(enchanted ? 0xb68cff : 0xf0c862, 0.16 * alpha).fillCircle(x, y, 26);
      g.fillStyle(0x060c0c, 0.35 * alpha).fillEllipse(x, y + 12, 34, 9);
      g.fillStyle(enchanted ? 0x4b2f86 : 0x7a4b25, alpha).fillRoundedRect(
        x - 15,
        y - 11,
        30,
        22,
        4,
      );
      g.fillStyle(enchanted ? 0x6a46b8 : 0x9a6232, alpha).fillRoundedRect(x - 15, y - 13, 30, 9, 4);
      g.fillStyle(enchanted ? 0xd8c4ff : 0x3a3d40, alpha)
        .fillRect(x - 15, y - 5, 30, 3)
        .fillRect(x - 3, y - 6, 6, 8);
      if (enchanted)
        g.lineStyle(1, 0xf1e6ff, 0.8 * alpha)
          .strokeCircle(x, y + 4, 4)
          .lineBetween(x - 9, y + 6, x - 5, y + 2)
          .lineBetween(x + 5, y + 2, x + 9, y + 6);
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
      const barY = y - 25 * f;
      if (eliteName)
        g.lineStyle(isBoss ? 4 : 3, isBoss ? 0xff3b5c : ranged ? 0xb68cff : 0xff8a3d, 0.85)
          .strokeCircle(x, y, enemy.config.radius + 7)
          .lineStyle(1, 0xfff0c4, 0.5)
          .strokeCircle(x, y, enemy.config.radius + 11);
      // Task 12: the new normal kinds have their own shapes (elites/bosses keep theirs).
      const special = eliteName ? null : kind === 'melee' || kind === 'ranged' ? null : kind;
      const k = special ? enemy.config.radius / 14 : f;
      g.fillStyle(0x060c0c, 0.4).fillEllipse(x, y + 15 * k, 34 * k, 12 * k);
      const shape = () => {
        if (special === 'swift')
          g.fillTriangle(x, y - 17 * k, x - 12 * k, y + 13 * k, x + 12 * k, y + 13 * k)
            .fillTriangle(x - 12 * k, y - 4 * k, x - 4 * k, y - 15 * k, x - 3 * k, y - 4 * k)
            .fillTriangle(x + 12 * k, y - 4 * k, x + 4 * k, y - 15 * k, x + 3 * k, y - 4 * k);
        else if (special === 'brute')
          g.fillRoundedRect(x - 16 * k, y - 15 * k, 32 * k, 30 * k, 9 * k);
        else if (special === 'bombard')
          g.fillTriangle(x, y - 19 * k, x - 15 * k, y + 15 * k, x + 15 * k, y + 15 * k).fillRect(
            x - 15 * k,
            y + 6 * k,
            30 * k,
            9 * k,
          );
        else if (ranged)
          g.fillTriangle(x, y - 18 * f, x - 17 * f, y + 14 * f, x + 17 * f, y + 14 * f);
        else g.fillEllipse(x, y, 30 * f, 33 * f);
      };
      g.fillStyle(
        isBoss
          ? 0x8e1f3a
          : eliteName
            ? ranged
              ? 0x7d4fc0
              : 0xb5532b
            : special === 'swift'
              ? 0xc94f3d
              : special === 'brute'
                ? 0x7f7a6c
                : special === 'bombard'
                  ? 0x3f5fa8
                  : ranged
                    ? 0xb2739b
                    : 0x87996e,
      );
      shape();
      if (special === 'brute')
        g.lineStyle(2, 0x4d493f, 0.9)
          .lineBetween(x - 10 * k, y + 8 * k, x - 2 * k, y + 2 * k)
          .lineBetween(x + 4 * k, y + 10 * k, x + 11 * k, y + 3 * k);
      if (special === 'bombard')
        g.fillStyle(0xff7a4d, 0.95)
          .fillCircle(x, y - 22 * k, 4 * k)
          .fillStyle(0xffd2a8, 0.5)
          .fillCircle(x, y - 22 * k, 7 * k);
      g.fillStyle(0x18231f).fillEllipse(x, y - 3 * k, 18 * k, 11 * k);
      g.fillStyle(
        special === 'swift'
          ? 0xfff07a
          : special === 'bombard'
            ? 0x9fd8ff
            : ranged
              ? 0xffbebf
              : 0xe9d497,
      )
        .fillRect(x - 6 * k, y - 6 * k, 4 * k, 3 * k)
        .fillRect(x + 3 * k, y - 6 * k, 4 * k, 3 * k);
      const flash = this.flashes.strength(enemy.entityId, s.time);
      if (flash > 0) {
        g.fillStyle(0xffffff, 0.6 * flash);
        shape();
      }
      g.fillStyle(0x19201b).fillRect(x - hpWidth / 2, barY, hpWidth, eliteName ? 5 : 3);
      g.fillStyle(isBoss ? 0xff4d6d : eliteName ? 0xffb347 : ranged ? 0xe09ac1 : 0xc8d79c).fillRect(
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
        g.lineStyle(2, mark.kind === 'hunter' ? 0xffd27a : 0xd690ff, 0.9)
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
        g.lineStyle(2, 0xffe88e, 0.95).lineBetween(x - 7, y - 39, x + 7, y - 39);
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
          g.fillStyle(color, 0.12 + 0.12 * t * fade).fillTriangle(
            gx,
            gy - 12,
            gx - 15,
            gy + 17,
            gx + 15,
            gy + 17,
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
    g.fillStyle(0x030d0c, 0.45).fillEllipse(x, y + 17, 38, 13);
    g.fillStyle(color, s.player.alive ? 1 : 0.4).fillTriangle(
      x,
      y - 12,
      x - 15,
      y + 17,
      x + 15,
      y + 17,
    );
    g.fillStyle(0x203b38).fillCircle(x, y - 7, 10);
    g.fillStyle(0xe6ffe3)
      .fillRect(x - 6, y - 9, 4, 3)
      .fillRect(x + 3, y - 9, 4, 3);
    const weapon = s.character.characterClass;
    g.lineStyle(3, color);
    if (weapon === 'warrior')
      g.lineBetween(x + 15, y + 8, x + 28, y - 19).lineBetween(x + 12, y, x + 24, y + 5);
    if (weapon === 'mage') {
      g.lineBetween(x + 19, y + 12, x + 19, y - 25);
      g.fillStyle(color).fillCircle(x + 19, y - 27, 6);
    }
    if (weapon === 'archer')
      g.beginPath()
        .arc(x + 16, y, 20, -1.3, 1.3)
        .strokePath();
    if (weapon === 'rogue')
      g.lineBetween(x - 17, y + 7, x - 24, y - 6).lineBetween(x + 17, y + 7, x + 24, y - 6);
    if (s.survival.directProtected)
      g.lineStyle(
        s.survival.fullyProtected ? 3 : 1,
        s.survival.fullyProtected ? 0xffe4a6 : 0xd5fff2,
        0.8,
      ).strokeCircle(x, y, 26);
    if (s.skillCombat.barrier > 0) g.lineStyle(2, 0xbfe4ff, 0.75).strokeCircle(x, y, 30);
    for (const p of s.playerProjectiles) {
      const pc = p.weaponId.startsWith('skill:') ? skillColor(p.weaponId.slice(6)) : color;
      g.lineStyle(weapon === 'archer' ? 3 : 5, pc, 0.4).lineBetween(
        p.x,
        p.y,
        p.x - p.direction.x * 18,
        p.y - p.direction.y * 18,
      );
      g.fillStyle(pc).fillCircle(p.x, p.y, p.radius);
    }
    for (const p of s.enemyProjectiles) {
      g.lineStyle(3, 0xf3968c, 0.3).lineBetween(
        p.x,
        p.y,
        p.x - p.direction.x * 15,
        p.y - p.direction.y * 15,
      );
      g.fillStyle(0xffa391).fillCircle(p.x, p.y, p.radius);
    }
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
      if (f.text)
        this.label(this.damageLabels, damageLabel++)
          .setPosition(f.x, f.y - 40 - (0.6 - (f.until - s.time)) * 20)
          .setText(f.text)
          .setColor(f.event.channel === 'skill' ? '#bfe9ff' : '#ffe4ba')
          .setVisible(true);
    }
    this.labels.slice(label).forEach((t) => t.setVisible(false));
    this.damageLabels.slice(damageLabel).forEach((t) => t.setVisible(false));
    this.drawFeel(s);
    this.joystick.clear();
    if (this.stick.active) {
      const d = Math.hypot(this.stick.dx, this.stick.dy),
        r = Math.min(45, d),
        a = Math.atan2(this.stick.dy, this.stick.dx);
      this.joystick.lineStyle(2, 0xc6edce, 0.3).strokeCircle(this.stick.x, this.stick.y, 55);
      this.joystick
        .fillStyle(0xc6edce, 0.3)
        .fillCircle(this.stick.x + Math.cos(a) * r, this.stick.y + Math.sin(a) * r, 20);
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
    const hitAge = s.time - this.playerHitAt;
    if (hitAge >= 0 && hitAge < PLAYER_HIT_VIGNETTE) {
      const strength = 1 - hitAge / PLAYER_HIT_VIGNETTE;
      const w = this.scale.width,
        h = this.scale.height;
      for (let i = 0; i < 6; i++)
        v.lineStyle(14, 0xd8323c, 0.32 * strength * (1 - i / 6)).strokeRect(
          7 + i * 14,
          7 + i * 14,
          w - 14 - i * 28,
          h - 14 - i * 28,
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
  return SKILL_COLORS[SKILL_FAMILY[id] ?? 'physical'];
}
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
