import Phaser from 'phaser';
import { GameplayWorld, ALPHA, CLASS_LABELS } from '../gameplay';
import type { GameplayOptions, GameplaySnapshot, WorldEvent } from '../gameplay';
import { alphaBridge, CLASS_COLORS } from '../gameplay-ui/store';
import type { AlphaCommand } from '../gameplay-ui/store';
import { loadSave, saveRun } from '../progression/save';
import { createWorld } from './World';

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
  private testing?: (action: unknown) => void;
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
    const toggle = (e: KeyboardEvent) => {
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
    };
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
      void import('../gameplay/testing').then(({ createTestingController }) => {
        if (!this.scene.isActive()) return;
        this.testing = createTestingController(
          () => this.world,
          (options) => this.start(options),
        );
        window.__alpha = {
          state: () => alphaBridge.getSnapshot(),
          command: (action) => this.command({ type: 'testing', action }),
          advance: (seconds) => {
            this.world?.update(seconds);
            this.publish();
          },
        };
        this.publish();
      });
    }
    this.publish();
  }
  private start(options: GameplayOptions) {
    const next = new GameplayWorld({
      ...options,
      viewport: { width: this.scale.width, height: this.scale.height },
    }); // Validate before replacing a running session.
    this.world = next;
    this.runId++;
    this.lastEvent = 0;
    this.fx = [];
    this.error = '';
    this.clearInput();
    this.keys && this.input.keyboard?.resetKeys();
  }
  private command(command: AlphaCommand) {
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
        case 'choose-skill':
          this.world?.chooseSkill(command.card);
          this.clearInput();
          break;
        case 'reroll':
          this.world?.rerollSkillOffer();
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
    const dt = Math.min(0.05, delta / 1000);
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
    let label = 0,
      damageLabel = 0;
    for (const enemy of s.enemies) {
      if (!enemy.alive) continue;
      const { x, y } = enemy.position;
      const ranged = enemy.config.behavior === 'ranged';
      g.fillStyle(0x060c0c, 0.4).fillEllipse(x, y + 15, 34, 12);
      g.fillStyle(ranged ? 0xb2739b : 0x87996e);
      if (ranged) g.fillTriangle(x, y - 18, x - 17, y + 14, x + 17, y + 14);
      else g.fillEllipse(x, y, 30, 33);
      g.fillStyle(0x18231f).fillEllipse(x, y - 3, 18, 11);
      g.fillStyle(ranged ? 0xffbebf : 0xe9d497)
        .fillRect(x - 6, y - 6, 4, 3)
        .fillRect(x + 3, y - 6, 4, 3);
      g.fillStyle(0x19201b).fillRect(x - 17, y - 25, 34, 3);
      g.fillStyle(ranged ? 0xe09ac1 : 0xc8d79c).fillRect(
        x - 17,
        y - 25,
        (34 * enemy.entity.currentHp) / enemy.entity.maxHp,
        3,
      );
      const mark = s.skillCombat.marks.find((m) => m.targetId === enemy.entityId);
      if (mark)
        g.lineStyle(2, mark.kind === 'hunter' ? 0xffd27a : 0xd690ff, 0.9)
          .strokeCircle(x, y, 22)
          .lineBetween(x - 26, y, x - 18, y)
          .lineBetween(x + 18, y, x + 26, y);
      if (enemy.control?.stunned) g.fillStyle(0xfff2a8, 0.9).fillCircle(x, y - 30, 4);
      else if (enemy.control && enemy.control.movementMultiplier < 1)
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
    const screen = !world
      ? 'menu'
      : run === 'awaiting-revival-choice'
        ? 'revival'
        : run === 'ended'
          ? 'ended'
          : world.skills.offer
            ? 'level-up'
            : world.paused
              ? 'paused'
              : 'playing';
    if (screen === 'ended' && this.recordedRun !== this.runId) {
      this.record = saveRun(world!.time, world!.kills).bestSeconds;
      this.recordedRun = this.runId;
    }
    alphaBridge.publish({
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
    };
  }
}
