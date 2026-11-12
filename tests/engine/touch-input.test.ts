import { describe, expect, it } from 'vitest';
import { GameplayWorld } from '../../src/gameplay';
import {
  JOYSTICK,
  inJoystickZone,
  joystickVector,
  keyboardVector,
  movementInput,
} from '../../src/engine/touch-input';
import { createUiSettings, parseUiSettings } from '../../src/gameplay-ui/ui-settings';

const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe('Task 16 Phase 1 — joystick vectors', () => {
  it('dead zone 10%, linear to full speed at 60 px, clamped beyond', () => {
    expect(JOYSTICK).toEqual({ radius: 60, deadZone: 0.1 });
    expect(joystickVector(0, 0)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(6, 0)).toEqual({ x: 0, y: 0 }); // exactly the dead zone
    expect(joystickVector(3, -4)).toEqual({ x: 0, y: 0 });
    expect(len(joystickVector(33, 0))).toBeCloseTo(0.5, 10); // (33 − 6) / (60 − 6)
    expect(joystickVector(60, 0)).toEqual({ x: 1, y: 0 });
    expect(joystickVector(0, 200)).toEqual({ x: 0, y: 1 });
    const diag = joystickVector(-100, -100);
    expect(len(diag)).toBeCloseTo(1, 12);
    expect(diag.x).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(joystickVector(Number.NaN, 4)).toEqual({ x: 0, y: 0 });
  });
  it('full deflection gives exactly the keyboard vectors in all 8 directions', () => {
    for (const [r, l, d, u] of [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, 0, 1, 0],
      [1, 0, 0, 1],
      [0, 1, 1, 0],
      [0, 1, 0, 1],
    ]) {
      const k = keyboardVector(!!r, !!l, !!d, !!u);
      const t = joystickVector((r - l) * 90, (d - u) * 90);
      expect(t.x).toBeCloseTo(k.x, 12);
      expect(t.y).toBeCloseTo(k.y, 12);
    }
    // An active joystick inside its dead zone leaves the keyboard in charge.
    const keys = keyboardVector(true, false, false, false);
    expect(movementInput(keys, { active: true, dx: 2, dy: 2 })).toBe(keys);
    expect(movementInput(keys, { active: false, dx: 60, dy: 0 })).toBe(keys);
    expect(movementInput(keys, { active: true, dx: 0, dy: 60 })).toEqual({ x: 0, y: 1 });
  });
  it('«Левша» mirrors the joystick zone; the top 30% stays for the HUD', () => {
    expect(inJoystickZone(100, 500, 844, 600, false)).toBe(true);
    expect(inJoystickZone(700, 500, 844, 600, false)).toBe(false);
    expect(inJoystickZone(700, 500, 844, 600, true)).toBe(true);
    expect(inJoystickZone(100, 500, 844, 600, true)).toBe(false);
    expect(inJoystickZone(100, 100, 844, 600, false)).toBe(false);
  });
});

describe('Task 16 Phase 1 — touch and keyboard share one input path', () => {
  it('same input sequence via keyboard and touch ⇒ identical simulation', () => {
    const script: [number, number, number, number, number][] = [
      // frames, right, left, down, up
      [40, 1, 0, 0, 0],
      [30, 1, 0, 1, 0],
      [25, 0, 0, 0, 1],
      [50, 0, 1, 0, 1],
      [20, 0, 0, 0, 0],
      [35, 0, 1, 1, 0],
    ];
    const run = (touch: boolean) => {
      const w = new GameplayWorld({ characterClass: 'rogue', seed: 4, campaign: { mapId: 6 } });
      w.setTestProtection(true);
      let frame = 0;
      for (const [frames, r, l, d, u] of script)
        for (let i = 0; i < frames; i++, frame++) {
          const keys = keyboardVector(!!r, !!l, !!d, !!u);
          const stick = { active: touch, dx: (r - l) * 75, dy: (d - u) * 75 };
          const move = movementInput(
            touch ? keyboardVector(false, false, false, false) : keys,
            stick,
          );
          w.setMovement(move.x, move.y);
          if (frame === 90) w.requestDash(); // the touch button and Space both call requestDash
          w.update(1 / 60);
          if (w.run.currentOffer) w.skipSkillOffer();
        }
      return JSON.stringify(w.getSnapshot());
    };
    expect(run(true)).toBe(run(false));
  });
});

describe('Task 16 Phase 1 — settings', () => {
  it('«Левша» and «Вибрация» persist (defaults off / on)', () => {
    expect(parseUiSettings(null)).toMatchObject({ leftHanded: false, haptics: true });
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
    createUiSettings(storage).set({ leftHanded: true, haptics: false });
    expect(createUiSettings(storage).get()).toMatchObject({ leftHanded: true, haptics: false });
    expect(parseUiSettings('{"leftHanded":"yes","haptics":0}')).toMatchObject({
      leftHanded: false,
      haptics: true,
    });
  });
});
