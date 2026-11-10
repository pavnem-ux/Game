import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import { arena, autoSkills, play, ring, skillEvents } from './helpers';

describe('every automatic skill runs at rank I and V for its class', () => {
  for (const c of CHARACTER_CLASSES)
    for (const id of autoSkills(c))
      for (const rank of [1, 5])
        it(`${c} · ${id} · rank ${rank}`, () => {
          const w = arena(c, { level: 10 });
          ring(w, 6, 90);
          ring(w, 6, 220);
          w.grantTestSkill(id, rank);
          play(w, 12);
          const activations = skillEvents(w, 'skill-activated').filter(
            (e) => (e.event as { skillId: string }).skillId === id,
          );
          expect(activations.length).toBeGreaterThan(0);
        });
});
