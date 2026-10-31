import Phaser from 'phaser';
import { GameScene } from './GameScene';
export function createGame(parent: HTMLDivElement) {
  return new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    backgroundColor: '#18231f',
    antialias: true,
    powerPreference: 'high-performance',
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    fps: { target: 60, smoothStep: true },
    audio: { noAudio: true },
    banner: false,
    scene: [GameScene],
    input: { activePointers: 2 },
  });
}
