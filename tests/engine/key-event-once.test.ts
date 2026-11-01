import { describe, expect, it } from 'vitest';
import { oncePerKeyEvent } from '../../src/engine/key-event-once';

describe('oncePerKeyEvent', () => {
  it('ignores a replayed event object, as Phaser re-dispatches queued keydowns before POST_STEP', () => {
    let toggles = 0;
    const toggle = oncePerKeyEvent(() => toggles++);
    const pDown = { key: 'p' };
    // Phaser queue scan after P: [pDown]; after the next key in the same step: [pDown, pUp, dDown].
    toggle(pDown);
    toggle(pDown);
    toggle(pDown);
    expect(toggles).toBe(1);
  });
  it('still handles every distinct key press', () => {
    let toggles = 0;
    const toggle = oncePerKeyEvent(() => toggles++);
    for (let i = 0; i < 4; i++) toggle({ key: 'Escape' });
    expect(toggles).toBe(4);
  });
  it('keeps separate state per wrapped handler', () => {
    const event = { key: 'p' };
    let a = 0;
    let b = 0;
    oncePerKeyEvent(() => a++)(event);
    oncePerKeyEvent(() => b++)(event);
    expect([a, b]).toEqual([1, 1]);
  });
});
