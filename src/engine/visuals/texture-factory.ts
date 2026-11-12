import type Phaser from 'phaser';
import { drawArt } from './art';
import type { Pen } from './art';
import { TEXTURE_KEYS } from './keys';

/**
 * Task 18: bakes every unit/item look into a texture once per game (procedural art, no files).
 * Idempotent: keys that already exist (scene restart) are kept.
 */
export function buildUnitTextures(scene: Phaser.Scene): void {
  for (const key of TEXTURE_KEYS) {
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({}, false);
    const pen: Pen = g; // Phaser Graphics implements the Pen subset
    const size = drawArt(key, pen);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
