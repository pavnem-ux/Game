import { describe, expect, it } from 'vitest';
import { CAMPAIGN_MAPS } from '../../src/campaign';
import { levelAfterAllMaps, recommendedLevel, xpToNextLevel } from '../../src/profile';

/** Independent reference: total victory XP of maps 1..n vs the cumulative level cost. */
function reference(mapId: number) {
  let xp = 0;
  for (let id = 1; id < mapId; id++) xp += 100 + 50 * id;
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
    expect(recommendedLevel(11)).toBe(11);
    expect(recommendedLevel(30)).toBe(30);
    expect(recommendedLevel(40)).toBe(40);
    for (const m of CAMPAIGN_MAPS)
      expect(recommendedLevel(m.id), `map ${m.id}`).toBe(reference(m.id));
  });
  it('non-decreasing; the superpower level 30 is first recommended at map 30 (after clearing 1–29)', () => {
    const levels = CAMPAIGN_MAPS.map((m) => recommendedLevel(m.id));
    expect(levels.every((l, i) => i === 0 || l >= levels[i - 1])).toBe(true);
    expect(levels.findIndex((l) => l >= 30) + 1).toBe(30);
    expect(recommendedLevel(29)).toBe(29);
    // After all 40 maps: level 41 (45 000 XP; level 42 needs 45 100).
    expect(levelAfterAllMaps()).toBe(41);
  });
  it('rejects unknown maps', () => {
    expect(() => recommendedLevel(0)).toThrow();
    expect(() => recommendedLevel(41)).toThrow();
  });
});
