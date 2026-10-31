import { describe, expect, it, vi } from 'vitest';
import { PLAYER, setup, addEnemy, contacts, launches, kill } from './helpers';
import { NORMAL_MELEE, FAST_MELEE, RANGED } from './fixtures';
describe('individual contact attacks through Combat Core', () => {
  it('attacks at the first overlap and catches up all eligible intervals', () => {
    const { core, ai } = setup({ movementStep: 2 });
    addEnemy(core, ai, 'enemy', { x: 100, y: 0 });
    const attempts = contacts(ai.update(3, PLAYER));
    expect(attempts).toHaveLength(3);
    attempts.forEach((e, i) => expect(e.time).toBeCloseTo(0.8 + i, 10));
    expect(core.getEntity('player').currentHp).toBe(99940);
  });
  it('does not attack before circular contact, including the exact boundary', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 21, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    expect(contacts(ai.update(1, PLAYER))).toHaveLength(0);
    expect(contacts(ai.update(0, { x: 1, y: 0, radius: 10 }))).toHaveLength(1);
  });
  it('gives different enemies independent cooldowns and stable ID ordering', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'z', { x: 0, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    addEnemy(core, ai, 'a', { x: 0, y: 0 }, { ...FAST_MELEE, movementSpeed: 0 });
    const events = contacts(ai.update(1, PLAYER));
    expect(events.map((e) => [e.sourceId, e.time])).toEqual([
      ['a', 0],
      ['z', 0],
      ['a', 0.5],
      ['a', 1],
      ['z', 1],
    ]);
  });
  it('does not duplicate attacks at repeated equal timestamps', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    expect(contacts(ai.update(0, PLAYER))).toHaveLength(1);
    expect(contacts(ai.update(0, PLAYER))).toHaveLength(0);
    expect(contacts(ai.update(1, PLAYER))).toHaveLength(1);
    expect(contacts(ai.update(0, PLAYER))).toHaveLength(0);
  });
  it('keeps ready while out of contact and does not reset on reentry', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    ai.update(0, PLAYER);
    expect(contacts(ai.update(0.4, { x: 100, y: 0, radius: 10 }))).toEqual([]);
    expect(contacts(ai.update(0.4, PLAYER))).toEqual([]);
    expect(contacts(ai.update(0.2, PLAYER))).toHaveLength(1);
    ai.update(2, { x: 100, y: 0, radius: 10 });
    expect(contacts(ai.update(0, PLAYER))[0].time).toBeCloseTo(3);
  });
  it('Dodge consumes the attacker interval and preserves Core events', () => {
    const { core, ai } = setup({}, () => 0, { dodgeChance: 60 });
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    const first = contacts(ai.update(0, PLAYER))[0];
    expect(first.blocked).toBe(false);
    expect(first.result?.status).toBe('dodged');
    expect(first.result?.events[0].type).toBe('dodge');
    expect(ai.getEnemy('enemy').nextAttackAt).toBe(1);
    expect(contacts(ai.update(0.99, PLAYER))).toEqual([]);
    expect(core.getEntity('player').currentHp).toBe(100000);
  });
  it('blocked attempts consume cooldown without snapshots, RNG or fake Dodge/damage', () => {
    let allowed = false;
    const rng = vi.fn(() => 0.99);
    const { core, ai } = setup({ canResolveDirectDamage: () => allowed }, rng);
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    const event = contacts(ai.update(0, PLAYER))[0];
    expect(event).toMatchObject({ blocked: true, attack: null, result: null });
    expect(rng).not.toHaveBeenCalled();
    expect(ai.getEnemy('enemy').nextAttackAt).toBe(1);
    allowed = true;
    expect(contacts(ai.update(0.5, PLAYER))).toHaveLength(0);
    expect(contacts(ai.update(0.5, PLAYER))[0].result?.damage).toBe(20);
  });
  it.each([
    ['physical', 1, 10],
    ['magical', 1.5, 30],
  ] as const)(
    'delegates %s damage, coefficient and Resistance to Core',
    (damageType, attackCoefficient, expected) => {
      const { core, ai } = setup({}, () => 0.99, { resistance: 100 });
      addEnemy(
        core,
        ai,
        'enemy',
        { x: 0, y: 0 },
        { ...NORMAL_MELEE, damageType, attackCoefficient },
      );
      const event = contacts(ai.update(0, PLAYER))[0];
      expect(event.result?.damage).toBe(expected);
      expect(event.attack?.damageType).toBe(damageType);
    },
  );
  it('delegates critical snapshots through the injected Core RNG', () => {
    const { core, ai } = setup({}, () => 0.1);
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 }, NORMAL_MELEE, {
      criticalChance: 50,
      criticalDamage: 250,
    });
    const event = contacts(ai.update(0, PLAYER))[0];
    expect(event.attack?.critical).toBe(true);
    expect(event.result?.damage).toBe(50);
  });
  it('stops subsequent attackers immediately after player death without duplicate death events', () => {
    const { core, ai } = setup({}, () => 0.99, { maxHp: 30 });
    for (const id of ['c', 'b', 'a']) addEnemy(core, ai, id, { x: 0, y: 0 });
    const events = contacts(ai.update(2, PLAYER));
    expect(events.map((e) => e.sourceId)).toEqual(['a', 'b']);
    expect(
      events.flatMap((e) => e.result?.events ?? []).filter((e) => e.type === 'death'),
    ).toHaveLength(1);
    expect(core.getEntity('player').currentHp).toBe(0);
    expect(ai.getEnemies().every((e) => e.state === 'idle')).toBe(true);
  });
  it('never initiates a new attack from a dead enemy', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 });
    kill(core, 'enemy');
    expect(contacts(ai.update(10, PLAYER))).toEqual([]);
  });
});
describe('ranged approach / attack / retreat behavior', () => {
  it('approaches while outside range then stops inside the configured hysteresis band', () => {
    const { core, ai } = setup({ movementStep: 3 });
    addEnemy(core, ai, 'enemy', { x: 400, y: 0 }, RANGED);
    ai.update(3, PLAYER);
    const enemy = ai.getEnemy('enemy');
    expect(enemy.state).toBe('attack');
    expect(enemy.position.x).toBeCloseTo(205, 9);
    expect(enemy.velocity).toEqual({ x: 0, y: 0 });
  });
  it('remains still and fires when in an acceptable attack position', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 150, y: 0 }, RANGED);
    const events = ai.update(1, PLAYER);
    expect(ai.getEnemy('enemy').state).toBe('attack');
    expect(ai.getEnemy('enemy').position).toEqual({ x: 150, y: 0 });
    expect(launches(events)).toHaveLength(1);
  });
  it('retreats when too close and stops at retreat+hysteresis', () => {
    const { core, ai } = setup({ movementStep: 1 });
    addEnemy(core, ai, 'enemy', { x: 50, y: 0 }, RANGED);
    ai.update(0.5, PLAYER);
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(85);
    expect(ai.getEnemy('enemy').state).toBe('attack');
  });
  it('resumes approach when the player moves away', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 150, y: 0 }, RANGED);
    ai.update(0, PLAYER);
    ai.update(0.5, { x: 500, y: 0, radius: 10 });
    expect(ai.getEnemy('enemy').state).toBe('approach');
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(190);
  });
  it('uses deterministic equality and hysteresis rather than flapping around the outer threshold', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 210, y: 0 }, { ...RANGED, movementSpeed: 0 });
    ai.update(0, PLAYER);
    expect(ai.getEnemy('enemy').state).toBe('attack');
    ai.update(0, { x: -0.001, y: 0, radius: 10 });
    expect(ai.getEnemy('enemy').state).toBe('approach');
    for (const x of [0.001, -0.001, 0.001]) ai.update(0.01, { x, y: 0, radius: 10 });
    expect(ai.getEnemy('enemy').state).toBe('approach');
    ai.update(0, { x: 5, y: 0, radius: 10 });
    expect(ai.getEnemy('enemy').state).toBe('attack');
  });
  it('handles coincident centers without NaN and samples current position, not target velocity', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 0, y: 0 }, RANGED);
    const first = launches(ai.update(0.1, PLAYER))[0];
    expect(first.projectile.direction).toEqual({ x: 1, y: 0 });
    expect(ai.getEnemy('enemy').position.x).toBeCloseTo(8);
    expect(Number.isFinite(ai.getEnemy('enemy').position.y)).toBe(true);
  });
  it('does not launch outside hard attack range or toward other enemies', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'ranged', { x: 500, y: 0 }, { ...RANGED, movementSpeed: 0 });
    addEnemy(core, ai, 'friend', { x: 500, y: 0 }, { ...NORMAL_MELEE, movementSpeed: 0 });
    expect(launches(ai.update(2, PLAYER))).toEqual([]);
  });
  it('catches up ranged cycles in a large update without missing eligible shots', () => {
    const { core, ai } = setup();
    addEnemy(core, ai, 'enemy', { x: 150, y: 0 }, { ...RANGED, movementSpeed: 0 });
    const events = launches(ai.update(3.6, PLAYER));
    expect(events).toHaveLength(4);
    events.forEach((e, i) => expect(e.time).toBeCloseTo(i * 1.2, 10));
  });
});
