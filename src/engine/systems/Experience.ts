import Phaser from 'phaser';
import { GAME } from '../../config/game';
import type { Player } from './Player';
export class Experience {
  readonly pool = Array.from({ length: GAME.gemCap }, () => ({
    active: false,
    x: 0,
    y: 0,
    value: 0,
    attracted: false,
  }));
  reset() {
    this.pool.forEach((g) => {
      g.active = false;
    });
  }
  drop(x: number, y: number, value: number) {
    let gem = this.pool.find((g) => !g.active);
    if (!gem) {
      let nearest = this.pool[0],
        best = Infinity;
      for (const g of this.pool) {
        const d = (g.x - x) ** 2 + (g.y - y) ** 2;
        if (d < best) {
          best = d;
          nearest = g;
        }
      }
      nearest.value += value;
      return;
    }
    Object.assign(gem, { active: true, x, y, value, attracted: false });
  }
  update(dt: number, player: Player, collect: (value: number) => void) {
    for (const g of this.pool) {
      if (!g.active) continue;
      const dx = player.x - g.x,
        dy = player.y - g.y,
        d2 = dx * dx + dy * dy;
      if (d2 < player.stats.pickup ** 2) g.attracted = true;
      if (d2 < 22 ** 2) {
        g.active = false;
        collect(g.value);
        continue;
      }
      if (g.attracted) {
        const d = Math.sqrt(d2),
          step = Math.min(d, (350 + player.stats.speed) * dt);
        g.x += (dx / d) * step;
        g.y += (dy / d) * step;
      }
    }
  }
  draw(g: Phaser.GameObjects.Graphics, time: number) {
    for (const gem of this.pool) {
      if (!gem.active) continue;
      const { x, y } = gem;
      g.fillStyle(0x8ce4d0, 0.08).fillCircle(x, y, 13);
      g.fillStyle(0x96dfcb)
        .fillTriangle(x, y - 6, x - 4, y, x + 4, y)
        .fillTriangle(x, y + 6, x - 4, y, x + 4, y);
      g.fillStyle(0xe8fff3, 0.6 + Math.sin(time * 3 + x) * 0.3).fillTriangle(
        x,
        y - 4,
        x - 2,
        y,
        x,
        y + 2,
      );
    }
  }
}
