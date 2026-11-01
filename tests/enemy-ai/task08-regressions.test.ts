import { describe, expect, it } from 'vitest';
import { futureCrossings } from '../../src/enemy-ai/movement';
import { GameplayWorld } from '../../src/gameplay';

describe('Task 08 EnemyAI regressions', () => {
  it('drops crossing roots closer than the clock resolution (no zero-length boundaries)', () => {
    const clock = 367.79222624212065;
    expect(futureCrossings(clock, [2.5e-14, 1e-3, 0.5])).toEqual([1e-3, 0.5]);
    expect(futureCrossings(0, [2.5e-14])).toEqual([2.5e-14]); // representable near zero
  });
  it('a melee elite on the player centre with separation pressure no longer stalls the world', () => {
    // Exact deterministic scenario that previously looped forever at t ≈ 367.79 s.
    const w = new GameplayWorld({
      characterClass: 'mage',
      seed: 21,
      initialEnemies: false,
      spawning: { enabled: false },
      onHit: [],
      campaign: { mapId: 1 },
    });
    w.setTestProtection(true);
    w.weapons.setAttackSpeed('player', 0.01);
    while (w.time < 400) w.update(5);
    expect(w.time).toBe(400);
  });
});
