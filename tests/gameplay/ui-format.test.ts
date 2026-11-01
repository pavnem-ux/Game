import { describe, it, expect } from 'vitest';
import { displayHp } from '../../src/gameplay-ui/format';

describe('whole-HP presentation', () => {
  it.each([
    [40.25, 200.25, 40, 200],
    [199.9, 199.9, 200, 200],
    [200.49, 200.4, 200, 200],
    [0, 100.5, 0, 101],
    [0.75, 1, 1, 1],
  ])('formats %s/%s as %s/%s', (hp, maxHp, current, max) => {
    expect(displayHp(hp, maxHp)).toEqual({ current, max });
  });
});
