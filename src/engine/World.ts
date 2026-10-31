import Phaser from 'phaser';
import { GAME } from '../config/game';
export function createWorld(scene: Phaser.Scene) {
  const tile = scene.add.graphics();
  tile.fillStyle(0x18231f).fillRect(0, 0, 160, 160);
  // Deterministic ground texture: no external art or asset downloads.
  let seed = 71;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 90; i++) {
    const x = rand() * 160,
      y = rand() * 160;
    tile
      .fillStyle(i % 3 ? 0x26372c : 0x0f1a18, 0.45)
      .fillRect(x, y, rand() * 3 + 1, rand() * 2 + 1);
  }
  tile.lineStyle(1, 0x23372a, 0.25).strokeRect(0, 0, 160, 160);
  tile.generateTexture('ground', 160, 160);
  tile.destroy();
  scene.add.tileSprite(0, 0, GAME.arenaSize, GAME.arenaSize, 'ground').setOrigin(0).setDepth(-10);
  const g = scene.add.graphics().setDepth(-5);
  for (let i = 0; i < 190; i++) {
    const x = rand() * GAME.arenaSize,
      y = rand() * GAME.arenaSize;
    if (Math.hypot(x - 1800, y - 1800) < 125) continue;
    g.fillStyle(0x07110f, 0.35).fillEllipse(x + 4, y + 14, 45, 17);
    if (i % 4 === 0) {
      g.fillStyle(0x33413a).fillRoundedRect(x - 10, y - 14, 20, 30, 5);
      g.lineStyle(1, 0x68735b, 0.4)
        .lineBetween(x - 3, y - 7, x - 3, y + 5)
        .lineBetween(x - 7, y - 3, x + 2, y - 3);
      g.fillStyle(0x31492e).fillEllipse(x + 6, y + 12, 24, 6);
    } else if (i % 4 === 1) {
      g.fillStyle(0x23372c).fillTriangle(x, y - 30, x - 24, y + 13, x + 24, y + 13);
      g.fillStyle(0x2b4330).fillTriangle(x, y - 35, x - 16, y - 4, x + 16, y - 4);
    } else if (i % 4 === 2) {
      g.fillStyle(0x33433c).fillEllipse(x, y, 24, 14);
      g.fillStyle(0x405046, 0.4).fillEllipse(x - 3, y - 3, 14, 5);
    } else {
      g.fillStyle(0x9b9e5f, 0.5).fillCircle(x, y, 2);
      g.lineStyle(1, 0x425d3e, 0.6).lineBetween(x, y + 2, x + 3, y + 9);
    }
  }
  g.lineStyle(2, 0x849279, 0.2).strokeCircle(1800, 1800, 100).strokeCircle(1800, 1800, 110);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    g.lineStyle(2, 0xb0b78a, 0.18).lineBetween(
      1800 + Math.cos(a) * 90,
      1800 + Math.sin(a) * 90,
      1800 + Math.cos(a) * 102,
      1800 + Math.sin(a) * 102,
    );
  }
  g.lineStyle(12, 0x3a4b3c).strokeRect(10, 10, GAME.arenaSize - 20, GAME.arenaSize - 20);
}
