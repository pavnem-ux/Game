import { useEffect, useRef } from 'react';
import { createGame } from '../engine/createGame';
export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const game = createGame(ref.current!);
    return () => game.destroy(true);
  }, []);
  return <div className="game-canvas" ref={ref} aria-label="Игровая арена" />;
}
