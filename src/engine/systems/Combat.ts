import Phaser from 'phaser';
import { ENEMY, GAME, WEAPON } from '../../config/game';
import type { Player } from './Player';
import type { Enemies, Enemy } from './Enemies';
export class Combat {
  readonly bullets = Array.from({ length: GAME.projectileCap }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    damage: 0,
  }));
  readonly hits = Array.from({ length: GAME.hitCap }, () => ({ life: 0, x: 0, y: 0, kill: false }));
  timer = 0;
  private targets: Enemy[] = [];
  reset() {
    this.timer = 0;
    this.bullets.forEach((b) => {
      b.active = false;
    });
    this.hits.forEach((h) => {
      h.life = 0;
    });
  }
  effect(x: number, y: number, kill: boolean) {
    const h = this.hits.find((h) => h.life <= 0);
    if (h) Object.assign(h, { life: 0.25, x, y, kill });
  }
  update(dt: number, player: Player, enemies: Enemies, onKill: (e: Enemy) => void) {
    this.timer -= dt;
    if (this.timer <= 0) {
      // Select targets without sorting/copying the entity pool on every frame.
      const targets = this.targets;
      targets.length = 0;
      for (let shot = 0; shot < player.stats.projectiles; shot++) {
        let nearest: Enemy | undefined,
          best = WEAPON.range ** 2;
        for (const e of enemies.pool) {
          if (!e.active || targets.includes(e)) continue;
          const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
          if (d < best) {
            nearest = e;
            best = d;
          }
        }
        if (!nearest) nearest = targets[0];
        if (!nearest) break;
        targets.push(nearest);
        const b = this.bullets.find((b) => !b.active);
        if (!b) break;
        const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        Object.assign(b, {
          active: true,
          x: player.x,
          y: player.y - 8,
          vx: Math.cos(angle) * WEAPON.speed,
          vy: Math.sin(angle) * WEAPON.speed,
          life: WEAPON.lifetime,
          damage: player.stats.damage,
        });
      }
      if (targets.length) this.timer = player.stats.interval;
    }
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      for (const e of enemies.pool) {
        if (!e.active || (e.x - b.x) ** 2 + (e.y - b.y) ** 2 > (ENEMY.radius + WEAPON.radius) ** 2)
          continue;
        b.active = false;
        e.hp -= b.damage;
        e.flash = 0.1;
        this.effect(e.x, e.y, e.hp <= 0);
        if (e.hp <= 0) {
          e.active = false;
          enemies.count--;
          onKill(e);
        }
        break;
      }
    }
    for (const hit of this.hits) hit.life = Math.max(0, hit.life - dt);
  }
  draw(g: Phaser.GameObjects.Graphics) {
    for (const b of this.bullets) {
      if (!b.active) continue;
      g.lineStyle(5, 0xa8f5d1, 0.15).lineBetween(b.x, b.y, b.x - b.vx * 0.025, b.y - b.vy * 0.025);
      g.fillStyle(0xa6f9d5, 0.14).fillCircle(b.x, b.y, 12);
      g.fillStyle(0xd9ffe9).fillCircle(b.x, b.y, 4);
    }
    for (const h of this.hits) {
      if (h.life <= 0) continue;
      const t = 1 - h.life / 0.25;
      g.lineStyle(2, h.kill ? 0xeed5a5 : 0xaddfcb, 1 - t).strokeCircle(
        h.x,
        h.y,
        5 + t * (h.kill ? 24 : 14),
      );
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + 0.5;
        g.fillStyle(0xd9e8b7, 1 - t).fillCircle(
          h.x + Math.cos(a) * t * 25,
          h.y + Math.sin(a) * t * 25,
          2,
        );
      }
    }
  }
}
