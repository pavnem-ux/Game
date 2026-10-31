import Phaser from 'phaser';
import { bridge } from '../core/bridge';
import { addExperience, xpForLevel } from '../core/progression';
import type { Command, Phase, Upgrade } from '../core/types';
import { ENEMY, GAME, UPGRADES } from '../config/game';
import { loadSave, saveRun } from '../progression/save';
import { createWorld } from './World';
import { Player } from './systems/Player';
import { Enemies } from './systems/Enemies';
import { Combat } from './systems/Combat';
import { Experience } from './systems/Experience';
export class GameScene extends Phaser.Scene {
  readonly player = new Player();
  readonly enemies = new Enemies();
  readonly combat = new Combat();
  readonly experience = new Experience();
  phase: Phase = 'menu';
  seconds = 0;
  kills = 0;
  xp = 0;
  pendingLevels = 0;
  choices: Upgrade[] = [];
  private hudTimer = 0;
  private visualTime = 0;
  private record = loadSave().bestSeconds;
  private graphics!: Phaser.GameObjects.Graphics;
  private joystick!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stick = { active: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  constructor() {
    super('arena');
  }
  create() {
    createWorld(this);
    this.graphics = this.add.graphics().setDepth(5);
    this.joystick = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.cameras.main.setBounds(0, 0, GAME.arenaSize, GAME.arenaSize);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as typeof this.keys;
    const keyboard = this.input.keyboard!;
    const toggle = () => {
      if (this.phase === 'playing') this.command({ type: 'pause' });
      else if (this.phase === 'paused') this.command({ type: 'resume' });
    };
    keyboard.on('keydown-ESC', toggle);
    keyboard.on('keydown-P', toggle);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (
        this.phase === 'playing' &&
        p.x < this.scale.width * 0.5 &&
        p.y > this.scale.height * 0.3
      ) {
        Object.assign(this.stick, { active: true, id: p.id, x: p.x, y: p.y, dx: 0, dy: 0 });
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.stick.active && p.id === this.stick.id) {
        this.stick.dx = p.x - this.stick.x;
        this.stick.dy = p.y - this.stick.y;
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id === this.stick.id) this.clearInput();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    const visibility = () => {
      if (document.hidden && this.phase === 'playing') this.command({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', visibility);
    const unsubscribe = bridge.onCommand((c) => this.command(c));
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      keyboard.off('keydown-ESC', toggle);
      keyboard.off('keydown-P', toggle);
      if (import.meta.env.DEV) delete window.__survivors;
    };
    // Destroying the React-owned game can bypass scene shutdown.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug'))
      window.__survivors = {
        state: () => ({
          phase: this.phase,
          x: this.player.x,
          y: this.player.y,
          hp: this.player.hp,
          level: this.player.level,
          xp: this.xp,
          kills: this.kills,
          enemies: this.enemies.count,
          seconds: this.seconds,
          pending: this.pendingLevels,
          gem: this.experience.pool.find((g) => g.active)
            ? { ...this.experience.pool.find((g) => g.active)! }
            : null,
        }),
        grantXp: (n: number) => this.collect(n),
        hurt: (n: number) => {
          this.player.invulnerable = 0;
          this.contact(n);
        },
        spawnEnemies: (n: number) => {
          for (let i = 0; i < Math.min(n, GAME.enemyCap + 1); i++)
            this.enemies.spawn(this.player, this.seconds, 400);
        },
        advance: (seconds: number) => {
          for (let i = 0; i < Math.ceil(seconds * 60); i++)
            if (this.phase === 'playing') this.step(1 / 60);
        },
      };
    this.publish();
    this.draw();
  }
  private clearInput() {
    this.stick.active = false;
    this.stick.dx = this.stick.dy = 0;
  }
  private command(c: Command) {
    if (c.type === 'start' || c.type === 'restart') {
      if (this.phase !== 'menu' && this.phase !== 'dead') return;
      this.reset();
      return;
    }
    if (c.type === 'pause' && this.phase === 'playing') {
      this.phase = 'paused';
      this.clearInput();
    } else if (c.type === 'resume' && this.phase === 'paused') this.phase = 'playing';
    else if (c.type === 'menu' && this.phase === 'dead') {
      this.phase = 'menu';
      this.clearInput();
    } else if (
      c.type === 'upgrade' &&
      this.phase === 'upgrade' &&
      this.choices.some((u) => u.id === c.id)
    ) {
      this.player.ranks[c.id]++;
      this.player.recalculate();
      if (c.id === 'vitality')
        this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + 35);
      this.pendingLevels--;
      this.choices = [];
      if (this.pendingLevels > 0) this.offer();
      else this.phase = 'playing';
      this.clearInput();
    }
    this.publish();
  }
  private reset() {
    this.player.reset();
    this.enemies.reset();
    this.combat.reset();
    this.experience.reset();
    this.seconds = 0;
    this.kills = 0;
    this.xp = 0;
    this.pendingLevels = 0;
    this.choices = [];
    this.hudTimer = 0;
    this.phase = 'playing';
    this.clearInput();
    this.input.keyboard?.resetKeys();
    for (let i = 0; i < 5; i++) this.enemies.spawn(this.player, 0, 400);
    this.publish();
  }
  private offer() {
    const options = UPGRADES.filter((u) => u.id !== 'multishot' || this.player.ranks.multishot < 5);
    Phaser.Utils.Array.Shuffle(options);
    this.choices = options.slice(0, 3);
    this.phase = 'upgrade';
    this.clearInput();
  }
  private collect = (gain: number) => {
    const result = addExperience(this.player.level, this.xp, gain);
    this.xp = result.xp;
    this.player.level = result.level;
    this.pendingLevels += result.levels;
    if (result.levels) {
      const oldMax = this.player.stats.maxHp;
      this.player.recalculate();
      this.player.hp = Math.min(
        this.player.stats.maxHp,
        this.player.hp + this.player.stats.maxHp - oldMax,
      );
      if (this.phase === 'playing') this.offer();
      this.publish();
    }
  };
  private contact = (damage: number) => {
    if (this.phase !== 'playing') return;
    if (this.player.hurt(damage)) {
      this.cameras.main.shake(100, 0.002);
      if (this.player.hp <= 0) {
        this.phase = 'dead';
        this.clearInput();
        this.record = saveRun(this.seconds, this.kills).bestSeconds;
        this.publish();
      }
    }
  };
  private killed = (e: { x: number; y: number }) => {
    this.kills++;
    this.experience.drop(e.x, e.y, ENEMY.xp);
  };
  private step(dt: number) {
    this.seconds += dt;
    let dx =
        Number(this.keys.D.isDown || this.keys.RIGHT.isDown) -
        Number(this.keys.A.isDown || this.keys.LEFT.isDown),
      dy =
        Number(this.keys.S.isDown || this.keys.DOWN.isDown) -
        Number(this.keys.W.isDown || this.keys.UP.isDown);
    if (this.stick.active && Math.hypot(this.stick.dx, this.stick.dy) > 8) {
      dx = this.stick.dx;
      dy = this.stick.dy;
    }
    this.player.update(dt, dx, dy);
    const radius = Math.max(
      GAME.spawnRadius,
      Math.hypot(this.scale.width, this.scale.height) / 2 + 100,
    );
    this.enemies.update(dt, this.seconds, this.player, radius, this.contact);
    if (this.phase !== 'playing') return;
    this.combat.update(dt, this.player, this.enemies, this.killed);
    this.experience.update(dt, this.player, this.collect);
  }
  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.visualTime += dt;
    if (this.phase === 'playing') this.step(dt);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.draw();
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.publish();
      this.hudTimer = GAME.hudInterval;
    }
  }
  private draw() {
    const g = this.graphics;
    g.clear();
    this.experience.draw(g, this.visualTime);
    this.enemies.draw(g, this.visualTime);
    this.player.draw(g, this.visualTime);
    this.combat.draw(g);
    // Fireflies are purely cosmetic and never participate in simulation.
    for (let i = 0; i < 16; i++) {
      const x = this.player.x + Math.sin(i * 17.3) * 550 + Math.sin(this.visualTime * 0.2 + i) * 20,
        y = this.player.y + Math.cos(i * 13.7) * 360 + Math.sin(this.visualTime + i) * 10;
      g.fillStyle(0xcddf97, 0.18 + Math.sin(this.visualTime + i) * 0.13).fillCircle(x, y, 1.5);
    }
    this.joystick.clear();
    if (this.stick.active) {
      const s = this.stick,
        d = Math.hypot(s.dx, s.dy),
        r = Math.min(45, d),
        a = Math.atan2(s.dy, s.dx);
      this.joystick.lineStyle(2, 0xc6edce, 0.2).strokeCircle(s.x, s.y, 55);
      this.joystick
        .fillStyle(0xc6edce, 0.25)
        .fillCircle(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 22);
    }
  }
  private publish() {
    bridge.publish({
      phase: this.phase,
      hp: this.player.hp,
      maxHp: this.player.stats.maxHp,
      xp: this.xp,
      nextXp: xpForLevel(this.player.level),
      level: this.player.level,
      seconds: this.seconds,
      kills: this.kills,
      enemies: this.enemies.count,
      choices: this.choices,
      ranks: { ...this.player.ranks },
      record: this.record,
    });
  }
}
declare global {
  interface Window {
    __survivors?: {
      state: () => {
        phase: Phase;
        x: number;
        y: number;
        hp: number;
        level: number;
        xp: number;
        kills: number;
        enemies: number;
        seconds: number;
        pending: number;
        gem: { x: number; y: number; value: number } | null;
      };
      grantXp: (n: number) => void;
      hurt: (n: number) => void;
      spawnEnemies: (n: number) => void;
      advance: (seconds: number) => void;
    };
  }
}
