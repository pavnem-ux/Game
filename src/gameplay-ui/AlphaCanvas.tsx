import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { AlphaScene } from '../engine/AlphaScene';
import { effectiveDpr } from '../engine/screen-space';
import { QUALITY_PRESETS } from '../engine/visuals/quality';
import { uiSettings } from './ui-settings';

/**
 * The Phaser canvas. Task 16: the canvas has CSS size × DPR pixels (DPR capped by «Graphics
 * quality») and is displayed at CSS size; the scene zooms its camera by DPR (same world area, sharper
 * picture). Resizes (rotation, fullscreen, address bar) and quality changes are applied live.
 */
export function AlphaCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = ref.current!;
    const measure = () => {
      const dpr = effectiveDpr(
        globalThis.devicePixelRatio ?? 1,
        QUALITY_PRESETS[uiSettings.get().graphicsQuality].dprCap,
      );
      const w = Math.max(1, parent.clientWidth),
        h = Math.max(1, parent.clientHeight);
      return { dpr, width: Math.round(w * dpr), height: Math.round(h * dpr) };
    };
    const first = measure();
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent,
      backgroundColor: '#18231f',
      antialias: true,
      powerPreference: 'high-performance',
      scale: {
        mode: Phaser.Scale.NONE,
        width: first.width,
        height: first.height,
        zoom: 1 / first.dpr,
      },
      fps: { target: 60, smoothStep: true },
      audio: { noAudio: true },
      banner: false,
      scene: [AlphaScene],
      input: { activePointers: 3 },
    });
    game.registry.set('dpr', first.dpr);
    let last = first;
    const apply = () => {
      const next = measure();
      if (next.width === last.width && next.height === last.height && next.dpr === last.dpr) return;
      last = next;
      game.scale.resize(next.width, next.height);
      game.scale.setZoom(1 / next.dpr);
      game.registry.set('dpr', next.dpr);
    };
    const observer = new ResizeObserver(apply);
    observer.observe(parent);
    const unsubscribe = uiSettings.subscribe(apply);
    return () => {
      observer.disconnect();
      unsubscribe();
      game.destroy(true);
    };
  }, []);
  return <div className="game-canvas" ref={ref} aria-label="Battle arena" />;
}
