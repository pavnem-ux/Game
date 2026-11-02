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
    this.cameras.main.setBounds(0, 0, ALPHA.arenaSize, ALPHA.arenaSize).centerOn(1800, 1800);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as typeof this.keys;
    // DOM controls retain their own key input. Phaser must not capture arrows/space in forms.
    this.input.keyboard!.clearCaptures();
    const toggle = oncePerKeyEvent((e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,select,textarea')) return;
      if (
        this.world &&
        !this.world.survival.getState().requiresWorldPause &&
        this.world.run.pendingChoices === 0
      ) {
        this.world.setPaused(!this.world.paused);
        this.clearInput();
        this.publish();
      }
    });
    this.input.keyboard!.on('keydown-P', toggle).on('keydown-ESC', toggle);
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
        case 'reroll':
          this.world?.rerollSkillOffer();
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
        const target =
          e.targetId === 'player'
            ? s.playerBody
            : s.enemies.find((v) => v.entityId === e.targetId)?.position;
        if (target)
          this.fx.push({
            event,
            until: event.time + 0.6,
            ...target,
            text:
              e.type === 'dodge'
                ? 'DODGE'
                : `${e.type === 'damage' && e.critical ? 'CRIT ' : ''}−${e.appliedDamage}`,
          });
      }
    }
    this.fx = this.fx.filter((f) => f.until > s.time).slice(-64);
    for (const z of s.skillCombat.zones) {
      const c = skillColor(z.sourceKey);
      const armed = z.armedAt === undefined || z.armedAt <= s.time;
      g.fillStyle(c, armed ? 0.12 : 0.05).fillCircle(z.center.x, z.center.y, z.radius);
      g.lineStyle(1, c, armed ? 0.55 : 0.3).strokeCircle(z.center.x, z.center.y, z.radius);
    }
    for (const crystal of s.crystals) {
      const { x, y } = crystal;
      g.fillStyle(0xb4f1aa, 0.13).fillCircle(x, y, 12);
      g.fillStyle(0xa7eaa7)
        .fillTriangle(x, y - 5, x - 4, y, x + 4, y)
        .fillTriangle(x - 4, y, x + 4, y, x, y + 6);
      g.lineStyle(1, 0xe4ffe1, 0.7).lineBetween(x, y - 4, x - 2, y);
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
      g.fillStyle(0x060c0c, 0.4).fillEllipse(x, y + 15 * f, 34 * f, 12 * f);
      g.fillStyle(
        isBoss
          ? 0x8e1f3a
          : eliteName
            ? ranged
              ? 0x7d4fc0
              : 0xb5532b
            : ranged
              ? 0xb2739b
              : 0x87996e,
      );
      if (ranged) g.fillTriangle(x, y - 18 * f, x - 17 * f, y + 14 * f, x + 17 * f, y + 14 * f);
      else g.fillEllipse(x, y, 30 * f, 33 * f);
      g.fillStyle(0x18231f).fillEllipse(x, y - 3 * f, 18 * f, 11 * f);
      g.fillStyle(ranged ? 0xffbebf : 0xe9d497)
        .fillRect(x - 6 * f, y - 6 * f, 4 * f, 3 * f)
        .fillRect(x + 3 * f, y - 6 * f, 4 * f, 3 * f);
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
        const w = s.weapon.weapon;
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
        ? { qa: this.testing?.snapshot() ?? null, timeScale: this.timeScale }
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
