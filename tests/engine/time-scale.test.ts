import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import {
  DEBUG_TIME_SCALES,
  MAX_FRAME_STEP,
  frameStep,
  isDebugTimeScale,
} from '../../src/engine/time-scale';
import type { DebugTimeScale } from '../../src/engine/time-scale';
import { resolveOffers } from '../skills/helpers';

/** Task 08.5 §1.1: the debug time scale only makes frame steps larger. */
function playAt(scale: DebugTimeScale, until: number) {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed: 21,
    spawning: { enabled: false },
    campaign: { mapId: 1, runId: `scale-${scale}` },
  });
  w.setTestProtection(true);
  const order: string[] = [];
  let frames = 0;
  let seq = 0;
  while (w.time < until && w.getSnapshot().campaign!.status === 'active') {
    w.update(frameStep(1000 / 60, scale));
    frames++;
    for (const e of w.getEvents(seq)) {
      order.push(`${e.event.type}@${e.time.toFixed(6)}`);
      seq = e.sequence;
    }
    resolveOffers(w);
  }
  return { w, order, frames };
}

describe('debug time scale ×1/×2/×4/×8 (Task 08.5 §1.1)', () => {
  it('only the four presets are accepted; the step is the capped frame delta × scale', () => {
    expect(DEBUG_TIME_SCALES).toEqual([1, 2, 4, 8]);
    for (const bad of [0, 3, 16, 20, 1.5, '8', NaN]) expect(isDebugTimeScale(bad)).toBe(false);
    expect(frameStep(16, 8)).toBeCloseTo(0.128);
    expect(frameStep(500, 8)).toBe(MAX_FRAME_STEP * 8); // a long frame is capped before scaling
    expect(frameStep(-5, 4)).toBe(0);
  });
  it('at ×8 the scheduled campaign events fire once, in order, at the same times', () => {
    const normal = playAt(1, 250);
    const fast = playAt(8, 250);
    expect(fast.frames).toBeLessThan(normal.frames / 7);
    const log = fast.w.getSnapshot().campaign!.firedLog;
    const reference = normal.w.getSnapshot().campaign!.firedLog;
    expect(log.map((e) => e.id)).toEqual(['elite-1', 'elite-2']);
    expect(reference.map((e) => e.id)).toEqual(['elite-1', 'elite-2']);
    // Same instants up to the clock's float accumulation (×1 sums many more small steps).
    log.forEach((e, i) => expect(e.time).toBeCloseTo(reference[i].time, 9));
    const spawns = (order: string[]) => order.filter((e) => e.startsWith('elite-spawned'));
    expect(spawns(fast.order)).toHaveLength(2);
    expect(spawns(normal.order)).toHaveLength(2);
  });
});
