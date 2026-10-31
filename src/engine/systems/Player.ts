import Phaser from 'phaser';
import { GAME } from '../../config/game';
import { calculateStats, damageAfterArmor, freshRanks } from '../../core/progression';
import type { Stats } from '../../core/types';
export class Player {
  x = GAME.arenaSize / 2;
  y = GAME.arenaSize / 2;
  facing = 1;
  hp = 100;
  level = 1;
  ranks = freshRanks();
  stats: Stats = calculateStats(1, this.ranks);
  invulnerable = 0;
  moving = false;
  reset() {
    this.x = this.y = GAME.arenaSize / 2;
    this.facing = 1;
    this.hp = 100;
    this.level = 1;
    this.ranks = freshRanks();
    this.stats = calculateStats(1, this.ranks);
    this.invulnerable = 0;
    this.moving = false;
  }
  update(dt: number, dx: number, dy: number) {
    const length = Math.hypot(dx, dy);
    this.moving = length > 0;
    if (length) {
      this.x = Phaser.Math.Clamp(
        this.x + (dx / length) * this.stats.speed * dt,
        35,
        GAME.arenaSize - 35,
      );
      this.y = Phaser.Math.Clamp(
        this.y + (dy / length) * this.stats.speed * dt,
        35,
        GAME.arenaSize - 35,
      );
      if (dx) this.facing = dx > 0 ? 1 : -1;
    }
    this.invulnerable = Math.max(0, this.invulnerable - dt);
  }
  hurt(amount: number) {
    if (this.invulnerable > 0) return false;
    this.hp = Math.max(0, this.hp - damageAfterArmor(amount, this.stats.armor));
    this.invulnerable = GAME.invulnerability;
    return true;
  }
  recalculate() {
    this.stats = calculateStats(this.level, this.ranks);
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }
  draw(g: Phaser.GameObjects.Graphics, time: number) {
    const { x, y } = this;
    const bob = this.moving ? Math.sin(time * 14) * 2 : Math.sin(time * 2) * 1.5;
    g.fillStyle(0x000000, 0.3).fillEllipse(x, y + 14, 40, 14);
    g.lineStyle(1, 0x9defcb, 0.17).strokeCircle(x, y + 4, 29 + Math.sin(time * 2) * 2);
    const flash = this.invulnerable > 0 && Math.sin(this.invulnerable * 50) > 0;
    g.fillStyle(flash ? 0xffffff : 0x3d675a).fillTriangle(
      x,
      y - 12 + bob,
      x - 17,
      y + 15 + bob,
      x + 16,
      y + 15 + bob,
    );
    g.fillStyle(0x97c8ae).fillTriangle(
      x - 2,
      y - 5 + bob,
      x - 10,
      y + 13 + bob,
      x + 1,
      y + 9 + bob,
    );
    g.fillStyle(0x223f36).fillCircle(x, y - 9 + bob, 11);
    g.fillStyle(0x10251f).fillEllipse(x, y - 7 + bob, 13, 11);
    g.fillStyle(0xe4ffe5)
      .fillRect(x - 5, y - 10 + bob, 3, 2)
      .fillRect(x + 2, y - 10 + bob, 3, 2);
    g.lineStyle(3, 0xa89a72).lineBetween(
      x + this.facing * 19,
      y + 12,
      x + this.facing * 24,
      y - 20,
    );
    const fx = x + this.facing * 24;
    const fy = y - 23 + bob;
    g.fillStyle(0xa8ffd0, 0.08).fillCircle(fx, fy, 20);
    g.fillStyle(0xa8ffd0, 0.18).fillCircle(fx, fy, 12);
    g.fillStyle(0xc5ffe2).fillTriangle(fx, fy - 8, fx - 5, fy + 4, fx + 5, fy + 4);
  }
}
