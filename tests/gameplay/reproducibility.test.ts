import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import type { CharacterClass } from '../../src/character-stats';

/**
 * Task 08.5 §4: same seed + same inputs → identical spawn and level-up card sequences for the
 * first 2 minutes of a campaign run (normal waves, scheduled elites, real offers).
 */
function record(seed: number, cls: CharacterClass = 'archer', mapId = 3, seconds = 120) {
  const w = new GameplayWorld({ characterClass: cls, seed, campaign: { mapId, runId: 'repro' } });
  w.setTestProtection(true);
  const spawns: string[] = [];
  const cards: string[] = [];
  let seq = 0;
  const step = 0.05; // the scene's capped frame step
  while (w.time < seconds && w.getSnapshot().campaign!.status === 'active') {
    // Scripted input: a slow circle that changes every 2 s (same for every run).
    const phase = Math.floor(w.time / 2);
    w.setMovement(Math.cos(phase), Math.sin(phase));
    w.update(step);
    for (const e of w.getEvents(seq)) {
      seq = e.sequence;
      const ev = e.event;
      if (ev.type === 'wave-spawned')
        spawns.push(
          `${e.time.toFixed(6)}:${ev.positions.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';')}`,
        );
      else if (ev.type === 'elite-spawned') spawns.push(`${e.time.toFixed(6)}:elite:${ev.enemyId}`);
      else if (ev.type === 'skill-offer')
        cards.push(`${e.time.toFixed(6)}:${ev.cardIds.join(',')}`);
    }
    // Deterministic player choice: first card of each offer.
    while (w.run.currentOffer) {
      const c = w.run.currentOffer.cards[0];
      w.chooseSkill(c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`);
    }
  }
  return { spawns, cards, kills: w.getSnapshot().kills, time: w.time };
}

describe('Task 08.5 §4 reproducibility', () => {
  it.each<[CharacterClass, number]>([
    ['archer', 3],
    ['mage', 1],
  ])(
    '%s map %s: same seed + inputs → identical spawns and cards for 2 min',
    (cls, mapId) => {
      const a = record(2_718_281_828, cls, mapId);
      const b = record(2_718_281_828, cls, mapId);
      expect(a.time).toBeGreaterThanOrEqual(120);
      expect(a.spawns.length).toBeGreaterThan(10);
      expect(a.cards.length).toBeGreaterThan(1);
      expect(b.spawns).toEqual(a.spawns);
      expect(b.cards).toEqual(a.cards);
      expect(b.kills).toBe(a.kills);
    },
    60_000,
  );
  it('a different seed gives a different spawn sequence', () => {
    expect(record(11, 'archer', 3, 30).spawns).not.toEqual(record(12, 'archer', 3, 30).spawns);
  }, 60_000);
});
