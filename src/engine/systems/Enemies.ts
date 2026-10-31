import Phaser from 'phaser';
import { ENEMY, GAME } from '../../config/game';
import { difficulty } from '../../core/progression';
import type { Player } from './Player';
export interface Enemy {
  active: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  flash: number;
  seed: number;
}
export class Enemies {
  readonly pool: Enemy[] = Array.from({ length: GAME.enemyCap }, (_, i) => ({
    active: false,
    x: 0,
    y: 0,
    hp: 0,
    maxHp: 0,
    speed: 0,
    damage: 0,
    flash: 0,
    seed: i * 3.79,
  }));
  timer = 0;
  count = 0;
  reset() {
    this.pool.forEach((e) => {
      e.active = false;
    });
    this.timer = 0.3;
    this.count = 0;
  }
  spawn(player: Player, seconds: number, radius: number) {
    const enemy = this.pool.find((e) => !e.active);
    if (!enemy) return;
    const angle = Math.random() * Math.PI * 2;
    const x = Phaser.Math.Clamp(player.x + Math.cos(angle) * radius, 25, GAME.arenaSize - 25);
    const y = Phaser.Math.Clamp(player.y + Math.sin(angle) * radius, 25, GAME.arenaSize - 25);
    if ((x - player.x) ** 2 + (y - player.y) ** 2 < 250 ** 2) return;
    const d = difficulty(seconds);
    Object.assign(enemy, {
      active: true,
      x,
      y,
      hp: ENEMY.hp * d.health,
      maxHp: ENEMY.hp * d.health,
      speed: ENEMY.speed * d.speed * (0.9 + Math.random() * 0.2),
      damage: ENEMY.damage * d.damage,
      flash: 0,
    });
    this.count++;
  }
  update(
    dt: number,
    seconds: number,
    player: Player,
    spawnRadius: number,
    onContact: (damage: number) => void,
  ) {
    const d = difficulty(seconds);
    this.timer -= dt;
    if (this.timer <= 0) {
      for (let i = 0; i < d.batch; i++) this.spawn(player, seconds, spawnRadius);
      this.timer = d.spawnInterval;
    }
    for (const e of this.pool) {
      if (!e.active) continue;
      let dx = player.x - e.x,
        dy = player.y - e.y;
      const distance = Math.hypot(dx, dy);
      if (distance > GAME.arenaSize) {
        e.active = false;
        this.count--;
        continue;
      }
      if (distance > ENEMY.radius + GAME.playerRadius - 4) {
        e.x += (dx / distance) * e.speed * dt;
        e.y += (dy / distance) * e.speed * dt;
      }
      if (distance < ENEMY.radius + GAME.playerRadius) onContact(e.damage);
      e.flash = Math.max(0, e.flash - dt);
    }
  }
  draw(g: Phaser.GameObjects.Graphics, seconds: number) {
    for (const e of this.pool) {
      if (!e.active) continue;
      const x = e.x,
        y = e.y + Math.sin(seconds * 4 + e.seed) * 2;
      g.fillStyle(0x000000, 0.23).fillEllipse(e.x, e.y + 15, 31, 11);
      g.fillStyle(e.flash > 0 ? 0xffffff : 0x684450).fillTriangle(
        x,
        y - 16,
        x - 16,
        y + 15,
        x + 16,
        y + 15,
      );
      g.fillStyle(e.flash > 0 ? 0xffffff : 0x9b5e69).fillCircle(x, y - 5, 12);
      g.fillStyle(0x342c36)
        .fillTriangle(x - 11, y - 13, x - 18, y - 21, x - 7, y - 16)
        .fillTriangle(x + 11, y - 13, x + 18, y - 21, x + 7, y - 16);
      g.fillStyle(0xffc39f)
        .fillRect(x - 7, y - 7, 4, 3)
        .fillRect(x + 3, y - 7, 4, 3);
      g.lineStyle(2, 0xa66b73, 0.6)
        .lineBetween(x - 13, y + 1, x - 23, y + 7)
        .lineBetween(x + 13, y + 1, x + 23, y + 7);
      if (e.hp < e.maxHp) {
        g.fillStyle(0x17231d).fillRect(x - 15, y - 25, 30, 3);
        g.fillStyle(0xd88886).fillRect(x - 15, y - 25, (30 * e.hp) / e.maxHp, 3);
      }
    }
  }
}
