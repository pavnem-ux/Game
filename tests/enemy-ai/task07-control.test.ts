import { describe, expect, it } from 'vitest';
import { PLAYER, addEnemy, contacts, setup } from './helpers';

describe('Task 07 Slow/Stun control in EnemyAI', () => {
  it('slow scales movement speed; stun stops movement and attacks; clearing restores both', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 200, y: 0 });
    ai.update(0, PLAYER);
    const speed = () =>
      Math.hypot(ai.getEnemy('enemy').velocity.x, ai.getEnemy('enemy').velocity.y);
    const full = speed();
    ai.setControl('enemy', { movementMultiplier: 0.5, stunned: false });
    ai.update(0, PLAYER);
    expect(speed()).toBeCloseTo(full / 2, 9);
    expect(ai.getEnemy('enemy').control).toEqual({ movementMultiplier: 0.5, stunned: false });
    ai.setControl('enemy', { movementMultiplier: 1, stunned: true });
    ai.update(0, PLAYER);
    expect(speed()).toBe(0);
    const at = ai.getEnemy('enemy').position;
    expect(contacts(ai.update(10, PLAYER))).toEqual([]);
    expect(ai.getEnemy('enemy').position).toEqual(at);
    ai.setControl('enemy', { movementMultiplier: 1, stunned: false });
    expect(ai.getEnemy('enemy').control).toBeUndefined();
    ai.update(0, PLAYER);
    expect(speed()).toBeCloseTo(full, 9);
    expect(contacts(ai.update(10, PLAYER)).length).toBeGreaterThan(0);
  });
  it('validates control input and unknown enemies', () => {
    const { core, ai } = setup();
    addEnemy(core, ai);
    expect(() => ai.setControl('enemy', { movementMultiplier: 0, stunned: false })).toThrow();
    expect(() => ai.setControl('enemy', { movementMultiplier: 1.5, stunned: false })).toThrow();
    expect(() =>
      ai.setControl('enemy', { movementMultiplier: 1, stunned: 'yes' as never }),
    ).toThrow();
    expect(() => ai.setControl('nobody', { movementMultiplier: 1, stunned: false })).toThrow();
  });
});
