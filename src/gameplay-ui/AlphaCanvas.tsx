import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { AlphaScene } from '../engine/AlphaScene';
export function AlphaCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = ref.current!;
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent,
      backgroundColor: '#18231f',
      antialias: true,
      powerPreference: 'high-performance',
      scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
      fps: { target: 60, smoothStep: true },
      audio: { noAudio: true },
      banner: false,
      scene: [AlphaScene],
      input: { activePointers: 2 },
    });
    return () => game.destroy(true);
  }, []);
  return <div className="game-canvas" ref={ref} aria-label="Боевая арена" />;
}
