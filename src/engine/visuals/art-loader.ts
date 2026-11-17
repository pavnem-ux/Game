import Phaser from 'phaser';
import { artUrl, loadArtManifest } from './art-pack';
import { ArtRegistry, artTextureKey } from './art-registry';
import { loadingBarRects } from './art-display';
import { pinToScreen } from '../screen-space';

/**
 * Task 25: loads the pack's unit images into Phaser textures in the background, with a thin
 * progress bar at the bottom of the canvas. The scene is usable at once: until an image is ready
 * (or if it fails) `ArtRegistry.texture` returns the procedural texture, so a run started
 * mid-load simply switches look when the art arrives. Rendering only — never touches the world.
 * Textures stay in the game's texture manager, so a scene restart reuses them.
 */
export function startArtLoad(scene: Phaser.Scene, onRegistry: (registry: ArtRegistry) => void) {
  let alive = true;
  const stop = () => {
    alive = false;
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
  scene.events.once(Phaser.Scenes.Events.DESTROY, stop);
  void loadArtManifest().then((manifest) => {
    if (!alive || !manifest) return;
    const registry = new ArtRegistry(manifest);
    const queue = [];
    for (const entry of registry.sceneEntries()) {
      const key = artTextureKey(entry.key);
      if (scene.textures.exists(key)) registry.markLoaded(entry.key);
      else queue.push(entry);
    }
    onRegistry(registry);
    if (!queue.length) return;
    // Screen space: the camera is zoomed by the DPR, so the bar is pinned (zoom cancelled) and
    // drawn in canvas pixels; it is redrawn every frame so zoom / resize changes are followed.
    const bar = scene.add.graphics().setScrollFactor(0).setDepth(200);
    let progress = 0;
    const draw = () => {
      if (!alive || !bar.active) return;
      const cam = scene.cameras.main;
      pinToScreen(bar, cam);
      const { track, fill } = loadingBarRects(
        scene.scale.width,
        scene.scale.height,
        cam.zoom,
        progress,
      );
      bar.clear();
      bar
        .fillStyle(0x000000, 0.45)
        .fillRoundedRect(track.x, track.y, track.width, track.height, track.height / 2);
      bar
        .fillStyle(0xe8c46b, 0.9)
        .fillRoundedRect(fill.x, fill.y, fill.width, fill.height, fill.height / 2);
    };
    draw();
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, draw);
    const loader = scene.load;
    for (const entry of queue) loader.image(artTextureKey(entry.key), artUrl(entry.file));
    loader.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      progress = p;
    });
    loader.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string, type: string) => {
      if (type === 'image' && key.startsWith('art:')) registry.markLoaded(key.slice(4));
    });
    loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`[art] ${file.key} failed to load; keeping the procedural look`);
    });
    loader.once(Phaser.Loader.Events.COMPLETE, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, draw);
      bar.destroy();
    });
    loader.start();
  });
}
