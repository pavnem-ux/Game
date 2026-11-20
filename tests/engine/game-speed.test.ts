import { describe, expect, it } from 'vitest';
import type { CharacterClass } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import {
  DEFAULT_GAME_SPEED,
  GAME_SPEEDS,
  MAX_FRAME_STEP,
  MAX_STEPS_PER_FRAME,
  SIM_STEP,
  SimStepper,
  frameStep,
  gameSpeedLabel,
  isGameSpeed,
  nextGameSpeed,
} from '../../src/engine/time-scale';
import type { GameSpeed } from '../../src/engine/time-scale';
import {
  DEFAULT_UI_SETTINGS,
  UI_SETTINGS_KEY,
  createUiSettings,
  parseUiSettings,
} from '../../src/gameplay-ui/ui-settings';

/** Task 36: the player's game speed (×1 / ×1.5 / ×2) on the simulation-time path. */
describe('Task 36 — speeds and the frame step', () => {
  it('×1 (default), ×1.5, ×2; the HUD button cycles ×1 → ×1.5 → ×2 → ×1', () => {
    expect(GAME_SPEEDS).toEqual([1, 1.5, 2]);
    expect(DEFAULT_GAME_SPEED).toBe(1);
    expect([1, 1.5, 2].map((s) => nextGameSpeed(s as GameSpeed))).toEqual([1.5, 2, 1]);
    expect(GAME_SPEEDS.map(gameSpeedLabel)).toEqual(['×1', '×1.5', '×2']);
    expect([1, 1.5, 2].every(isGameSpeed)).toBe(true);
    expect([0, 3, 4, '2', null].some(isGameSpeed)).toBe(false);
  });
  it('scales the simulated seconds of a frame; the real-time cap applies before scaling', () => {
    expect(frameStep(16, 1)).toBeCloseTo(0.016, 12);
    expect(frameStep(16, 1.5)).toBeCloseTo(0.024, 12);
    expect(frameStep(16, 2)).toBeCloseTo(0.032, 12);
    // A long stall (tab in background) still advances at most the cap × speed.
    expect(frameStep(1000, 2)).toBeCloseTo(MAX_FRAME_STEP * 2, 12);
    expect(frameStep(-5, 2)).toBe(0);
  });
});

describe('Task 36 — the setting persists (settings, not the save profile)', () => {
  it('parses the saved speed; anything else falls back to ×1', () => {
    expect(DEFAULT_UI_SETTINGS.gameSpeed).toBe(1);
    expect(parseUiSettings(JSON.stringify({ gameSpeed: 1.5 })).gameSpeed).toBe(1.5);
    expect(parseUiSettings(JSON.stringify({ gameSpeed: 2 })).gameSpeed).toBe(2);
    for (const bad of [3, 0, '2', null, -1])
      expect(parseUiSettings(JSON.stringify({ gameSpeed: bad })).gameSpeed).toBe(1);
    expect(parseUiSettings(null).gameSpeed).toBe(1);
  });
  it('a choice is stored and the next session (run) starts at it', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    const first = createUiSettings(storage);
    expect(first.get().gameSpeed).toBe(1);
    expect(first.set({ gameSpeed: 2 })).toBe(true);
    expect(JSON.parse(data.get(UI_SETTINGS_KEY)!).gameSpeed).toBe(2);
    expect(createUiSettings(storage).get().gameSpeed).toBe(2);
    // Other settings are untouched.
    expect(createUiSettings(storage).get().screenShake).toBe(DEFAULT_UI_SETTINGS.screenShake);
  });
});

describe('Task 36 — fixed simulation steps', () => {
  it('a frame becomes whole 1/120 s steps; the remainder carries over', () => {
    const st = new SimStepper();
    expect(SIM_STEP).toBeCloseTo(1 / 120, 15);
    expect(st.steps(frameStep(1000 / 60, 1))).toBe(2);
    expect(st.steps(frameStep(1000 / 60, 1.5))).toBe(3);
    expect(st.steps(frameStep(1000 / 60, 2))).toBe(4);
    expect(st.steps(0.004)).toBe(0); // < 1 step: carried
    expect(st.steps(0.005)).toBe(1); // 0.009 s → 1 step, 0.000667 carried
    expect(st.steps(0)).toBe(0);
    expect(st.steps(-1)).toBe(0);
    st.reset();
    expect(st.steps(SIM_STEP * 0.5)).toBe(0);
    expect(st.steps(10)).toBe(MAX_STEPS_PER_FRAME); // a huge step is capped
  });
  it('over many uneven frames, the total steps = total time / step (nothing lost)', () => {
    const st = new SimStepper();
    let steps = 0,
      t = 0;
    for (let i = 0; i < 1000; i++) {
      const dt = frameStep(7 + ((i * 37) % 23), 1.5);
      t += dt;
      steps += st.steps(dt);
    }
    expect(Math.abs(steps - t / SIM_STEP)).toBeLessThan(1);
  });
});

/**
 * Same seed + same inputs ⇒ identical results at every speed (owner decision: fixed steps). The
 * scene's loop is reproduced exactly: real 1/60 s frames, the frame step scaled by the speed, whole
 * `SIM_STEP`s fed to the world. Inputs (movement, level-up choices) change every 0.1 s of simulation
 * (12 steps = 6 / 4 / 3 frames at ×1 / ×1.5 / ×2). Everything — positions included — must be equal.
 */
const FRAME_MS = 1000 / 60;
const SYNC_STEPS = 12;
const SYNCS = 600; // 60 s of simulation
function run(characterClass: CharacterClass, speed: GameSpeed) {
  const w = new GameplayWorld({ characterClass, level: 10, seed: 777, campaign: { mapId: 4 } });
  w.setTestProtection(true);
  const stepper = new SimStepper();
  const digests: string[] = [];
  let steps = 0;
  for (let sync = 0; sync < SYNCS; sync++) {
    // Inputs and offer choices only at shared simulation times.
    w.setMovement(Math.cos(sync * 0.37), Math.sin(sync * 0.23));
    const offer = w.getSnapshot().skills.offer;
    if (offer) {
      const c = offer.cards[0];
      w.chooseSkill(c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`);
    }
    const target = (sync + 1) * SYNC_STEPS;
    while (steps < target) {
      const n = stepper.steps(frameStep(FRAME_MS, speed));
      for (let i = 0; i < n; i++) w.update(SIM_STEP);
      steps += n;
    }
    expect(steps).toBe(target); // frames land exactly on the shared times
    if (sync % 20 === 19) {
      const s = w.getSnapshot();
      digests.push(
        JSON.stringify([
          s.time,
          s.playerBody,
          s.player.currentHp,
          s.kills,
          s.progression,
          s.coins.collected,
          s.chests?.items.length ?? 0,
          s.enemies.map((e) => [e.entityId, e.position.x, e.position.y, e.entity.currentHp]),
        ]),
      );
    }
  }
  const s = w.getSnapshot();
  return { digests, kills: s.kills, time: s.time };
}

describe('Task 36 — identical results at ×1, ×1.5 and ×2', () => {
  for (const cls of ['warrior', 'mage', 'archer', 'rogue'] as const)
    it(`${cls}: same seed + inputs ⇒ identical kills, XP, Gold, HP and positions`, () => {
      const base = run(cls, 1);
      expect(base.kills).toBeGreaterThan(0); // the run really fought
      for (const speed of [1.5, 2] as const)
        expect(run(cls, speed).digests, `×${speed}`).toEqual(base.digests);
    });
});
