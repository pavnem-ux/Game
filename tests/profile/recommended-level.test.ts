import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MAPS } from '../../src/campaign';
import { levelAfterAllMaps, recommendedLevel, xpToNextLevel } from '../../src/profile';

/** Independent reference: total victory XP of maps 1..n vs the cumulative level cost. */
function reference(mapId: number) {
  let xp = 0;
  for (let id = 1; id < mapId; id++) xp += 100 + 50 * id; // victory XP of maps 1 … n − 1
  let level = 1;
  for (let cost = xpToNextLevel(level); cost !== null && xp >= cost; cost = xpToNextLevel(level)) {
    xp -= cost;
    level++;
  }
  return level;
}

describe('Task 10 §1.4 — recommended level', () => {
  it('maps 1, 11, 30, 40 (and every map) match the XP-curve reference', () => {
    expect(recommendedLevel(1)).toBe(1);
    // Task 40: the steeper curve (100 + 6·L²) — map 11 → 11, map 30 → 22, map 40 → 27.
    expect(recommendedLevel(11)).toBe(11);
    expect(recommendedLevel(30)).toBe(22);
    expect(recommendedLevel(40)).toBe(27);
    for (const m of CAMPAIGN_MAPS)
      expect(recommendedLevel(m.id), `map ${m.id}`).toBe(reference(m.id));
  });
  it('non-decreasing; one clear of every map reaches level 28 (Task 40 curve)', () => {
    const levels = CAMPAIGN_MAPS.map((m) => recommendedLevel(m.id));
    expect(levels.every((l, i) => i === 0 || l >= levels[i - 1])).toBe(true);
    // Task 40: no map recommends the superpower level 30 any more (was map 30 on the old curve).
    expect(levels.some((l) => l >= 30)).toBe(false);
    // After all 40 maps (45 000 XP): level 28, 720 XP into it (level 29 needs 4 804).
    expect(levelAfterAllMaps()).toBe(28);
  });
  it('rejects unknown maps', () => {
    expect(() => recommendedLevel(0)).toThrow();
    expect(() => recommendedLevel(41)).toThrow();
  });
});
