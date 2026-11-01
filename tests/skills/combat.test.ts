import { describe, expect, it } from 'vitest';
import { COMBAT_ATTRIBUTE_CAPS, calculateCharacterStats } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import { CONTROL_RULES, BONUS_TUNING } from '../../src/skills';
import { STATUS_RULES } from '../../src/status-effects';
import { arena, play, ring, skillEvents, stationaryMelee } from './helpers';

const activations = (w: GameplayWorld, id: string) =>
  skillEvents(w, 'skill-activated').filter((e) => (e.event as { skillId: string }).skillId === id);

describe('automatic abilities: timing, pause and movement', () => {
  it('activate on their own cooldown without input and never while paused or choosing', () => {
    const w = arena('warrior', { level: 20 });
    ring(w, 3, 100, { ...stationaryMelee });
    for (const id of w.getSnapshot().enemies.map((e) => e.entityId))
      w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
    w.grantTestSkill('earthquake', 1);
    w.update(0.001);
    expect(activations(w, 'earthquake')).toHaveLength(1);
    w.setPaused(true);
    w.update(30);
    expect(activations(w, 'earthquake')).toHaveLength(1);
    w.setPaused(false);
    // Cooldown scales with the character's existing Cooldown Reduction stat.
    const cooldown = 6 * (1 - w.getSnapshot().stats.cooldownReduction / 100);
    w.update(cooldown - 0.01);
    expect(activations(w, 'earthquake')).toHaveLength(1);
    w.update(0.02);
    expect(activations(w, 'earthquake')).toHaveLength(2);
    w.grantTestXp(20);
    expect(w.paused).toBe(true);
    w.update(30);
    expect(activations(w, 'earthquake')).toHaveLength(2);
  });
  it('do not move the hero or override WASD input', () => {
    const w = arena('rogue', { level: 10 });
    ring(w, 6, 120);
    for (const id of ['blade_flurry', 'shadow_strike', 'fan_of_knives', 'lacerate'])
      w.grantTestSkill(id, 5);
    const start = { ...w.getSnapshot().playerBody };
    play(w, 3);
    expect(w.getSnapshot().playerBody).toMatchObject({ x: start.x, y: start.y });
    w.setMovement(1, 0);
    w.update(1);
    expect(w.getSnapshot().playerBody.x).toBeGreaterThan(start.x + 100);
    expect(w.getSnapshot().playerBody.y).toBe(start.y);
  });
  it('wait for a valid target instead of firing into nothing', () => {
    const w = arena('mage');
    w.grantTestSkill('fireball', 1);
    w.update(10);
    expect(activations(w, 'fireball')).toHaveLength(0);
    w.spawnEnemy('melee', 200, 0, stationaryMelee);
    w.update(0.1);
    expect(activations(w, 'fireball')).toHaveLength(1);
  });
  it('a long frame and many short frames resolve the same deterministic outcome', () => {
    const make = () => {
      const w = arena('mage', { level: 15, seed: 99 });
      ring(w, 8, 160);
      ring(w, 8, 300);
      for (const id of ['fireball', 'ice_shards', 'frost_nova', 'blizzard'])
        w.grantTestSkill(id, 5);
      w.grantTestSkill('elemental_mastery', 5);
      return w;
    };
    const a = make(),
      b = make();
    a.update(4);
    for (let i = 0; i < 400; i++) b.update(0.01);
    const view = (w: GameplayWorld) => ({
      kills: w.getSnapshot().kills,
      hp: w.getSnapshot().enemies.map((e) => [e.entityId, e.entity.currentHp]),
      statuses: w.getSnapshot().statuses.map((g) => [g.targetId, g.effectType, g.stacks.length]),
    });
    expect(view(b)).toEqual(view(a));
    expect(a.time).toBeCloseTo(b.time, 9);
  });
});

describe('Slow and Stun', () => {
  it('slow reduces movement for its duration, strongest slow wins, cap applies, then expires', () => {
    const w = arena('mage', { level: 5 });
    const id = w.spawnEnemy('melee', 115);
    w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
    w.grantTestSkill('frost_nova', 4);
    w.grantTestSkill('elemental_mastery', 3);
    w.update(0.001);
    const control = w.getSnapshot().enemies.find((e) => e.entityId === id)!.control!;
    // 45% + 5% Elemental Mastery bonus, below the 60% cap.
    expect(control.movementMultiplier).toBeCloseTo(0.5, 9);
    expect(1 - control.movementMultiplier).toBeLessThanOrEqual(CONTROL_RULES.maxSlow);
    const slow = w.getSnapshot().skillCombat.controls.find((c) => c.targetId === id)!;
    // Activated at t=0 (the boundary where it became ready): Slow lasts 2 s.
    expect(slow.slowUntil).toBeCloseTo(2, 9);
    w.setPaused(true);
    w.update(10);
    expect(w.getSnapshot().enemies[0].control).toBeDefined();
    w.setPaused(false);
    // Disable the nova so the slow can lapse.
    w.weapons.setAttackSpeed('player', 1);
    w.skills['autos'].get('frost_nova')!.readyAt = 1e9;
    w.update(2.1);
    expect(w.getSnapshot().enemies.find((e) => e.entityId === id)!.control).toBeUndefined();
  });
  it('stunned enemies neither move nor attack, stun duration is capped and followed by immunity', () => {
    const w = arena('warrior', { level: 30, protect: false });
    const id = w.spawnEnemy('melee', 60);
    w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
    w.weapons.setAttackSpeed('player', 1);
    expect(w.skills.stun(id, 99)).toBe(true);
    const stunUntil = w.getSnapshot().skillCombat.controls[0].stunUntil;
    expect(stunUntil - w.time).toBeCloseTo(CONTROL_RULES.maxStunDuration, 9);
    w.update(0);
    const before = w.getSnapshot().enemies[0];
    expect(before.control?.stunned).toBe(true);
    expect(Math.hypot(before.velocity.x, before.velocity.y)).toBe(0);
    const hp = w.core.getEntity('player').currentHp;
    w.update(1.4);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    expect(w.getSnapshot().enemies[0].position).toEqual(before.position);
    // Immediately re-stunning is refused: no perpetual stunlock.
    w.update(0.2);
    expect(w.getSnapshot().enemies[0].control?.stunned).toBeFalsy();
    expect(w.skills.stun(id, 1)).toBe(false);
    w.update(CONTROL_RULES.stunImmunity);
    expect(w.skills.stun(id, 1)).toBe(true);
  });
});

describe('status limits and hit bounds', () => {
  it('skills, secondary effects and synergies never exceed the 10-stack cap per type', () => {
    const w = arena('archer', { level: 20 });
    const ids = ring(w, 5, 140);
    for (const id of ids) w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
    for (const id of ['toxic_volley', 'poison_trap', 'split_shot', 'arrow_rain'])
      w.grantTestSkill(id, 5);
    w.grantTestSkill('multishot', 5);
    w.grantTestSkill('lingering_effects', 5);
    for (let i = 0; i < 300; i++) {
      w.update(0.05);
      for (const g of w.getSnapshot().statuses)
        expect(g.stacks.length).toBeLessThanOrEqual(STATUS_RULES.maxStacks);
    }
    expect(w.getSnapshot().statuses.some((g) => g.stacks.length === STATUS_RULES.maxStacks)).toBe(
      true,
    );
  });
  it('piercing projectiles hit each target at most once and Fan of Knives bounds hits per enemy', () => {
    const w = arena('rogue', { level: 10 });
    const id = w.spawnEnemy('melee', 100, 0, stationaryMelee);
    w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
    w.weapons.setAttackSpeed('player', 1);
    w.grantTestSkill('fan_of_knives', 5);
    w.update(0.001);
    w.update(1);
    const hits = w
      .getEvents()
      .filter(
        (e) => e.channel === 'combat' && e.event.type === 'damage' && e.event.targetId === id,
      );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(2);
  });
});

describe('passive modifiers and Character Stats caps', () => {
  it('universal passives stack through the existing stat boundary and respect central caps', () => {
    const w = arena('rogue', { level: 50 });
    const base = calculateCharacterStats('rogue', 50).combatAttributes;
    for (const id of ['power', 'haste', 'vitality', 'fortitude', 'precision', 'swiftness'])
      w.grantTestSkill(id, 5);
    const s = w.getSnapshot().stats;
    expect(s.criticalChance).toBe(
      Math.min(COMBAT_ATTRIBUTE_CAPS.criticalChance, base.criticalChance + 16),
    );
    expect(s.attackSpeed).toBeLessThanOrEqual(COMBAT_ATTRIBUTE_CAPS.attackSpeed);
    expect(s.movementSpeed).toBeLessThanOrEqual(COMBAT_ATTRIBUTE_CAPS.movementSpeed);
    expect(s.resistance).toBe(base.resistance + 24);
    expect(w.core.getEntity('player').criticalChance).toBe(s.criticalChance);
    expect(w.weapons.getWeaponState('player').attackSpeedPercent).toBe(s.attackSpeed);
    // The permanent snapshot is untouched.
    expect(w.character.combatAttributes).toEqual(base);
  });
  it('Vitality raises Max HP and keeps missing HP (current HP rises by the same amount)', () => {
    const w = arena('warrior');
    w.setPlayerHp(50);
    const before = w.core.getEntity('player');
    w.grantTestSkill('vitality', 1);
    const after = w.core.getEntity('player');
    expect(after.maxHp).toBeCloseTo(before.maxHp * 1.08, 9);
    expect(after.maxHp - after.currentHp).toBeCloseTo(before.maxHp - before.currentHp, 9);
  });
  it('rank increases recompute modifiers once instead of stacking duplicate listeners', () => {
    const w = arena('mage', { level: 10 });
    const base = w.getSnapshot().stats.magicalDamage;
    w.grantTestSkill('power', 1);
    w.grantTestSkill('power', 2);
    w.grantTestSkill('power', 3);
    expect(w.getSnapshot().stats.magicalDamage).toBeCloseTo(
      calculateCharacterStats('mage', 10).combatAttributes.magicalDamage * 1.18,
      9,
    );
    expect(base).toBe(calculateCharacterStats('mage', 10).combatAttributes.magicalDamage);
  });
  it('Toxic Mastery and Lingering Effects modify DoT damage/duration, not the stack cap', () => {
    const w = arena('mage', { level: 5 });
    const id = w.spawnEnemy('melee', 200, 0, stationaryMelee);
    w.core.updateEntityStats(id, { ...w.core.getEntity(id), maxHp: 1e9 });
    w.grantTestSkill('toxic_mastery', 5);
    w.grantTestSkill('lingering_effects', 5);
    w.update(1);
    const g = w.getSnapshot().statuses.find((s) => s.targetId === id && s.effectType === 'burn')!;
    expect(g.stacks[0].rawDamagePerTick).toBeCloseTo(3 * 1.6, 9);
    expect(g.expiresAt - g.createdAt).toBeCloseTo(4 * 1.55, 9);
  });
});

describe('bonus rewards', () => {
  const exhausted = (characterClass: 'warrior' | 'mage' = 'warrior') => {
    const w = arena(characterClass, { level: 10 });
    const ids =
      characterClass === 'warrior'
        ? ['ground_slam', 'whirlwind', 'shield_bash', 'earthquake', 'battle_fury']
        : ['fireball', 'ice_shards', 'frost_nova', 'blizzard', 'elemental_mastery'];
    for (const id of [...ids, 'power', 'haste', 'fortitude', 'precision', 'swiftness'])
      w.grantTestSkill(id, 5);
    w.grantTestXp(20);
    expect(w.getSnapshot().skills.offer!.mode).toBe('bonus');
    return w;
  };
  it('Recovery heals 30% of Max HP without exceeding it', () => {
    const w = exhausted();
    const max = w.core.getEntity('player').maxHp;
    w.setPlayerHp(max * 0.9);
    w.chooseSkill('bonus:recovery');
    expect(w.core.getEntity('player').currentHp).toBe(max);
    expect(skillEvents(w, 'bonus-claimed').at(-1)!.event).toMatchObject({ bonusId: 'recovery' });
  });
  it('Barrier absorbs damage first and expires after its lifetime; Gold accumulates', () => {
    // Mage: no stuns, so the adjacent enemy really attacks into the barrier.
    const w = exhausted('mage');
    const max = w.core.getEntity('player').maxHp;
    w.chooseSkill('bonus:barrier');
    expect(w.getSnapshot().skillCombat.barrier).toBeCloseTo(
      (max * BONUS_TUNING.barrierMaxHpPercent) / 100,
      9,
    );
    w.setTestProtection(false);
    const enemy = w.spawnEnemy('melee', 20, 0, stationaryMelee);
    w.core.updateEntityStats(enemy, { ...w.core.getEntity(enemy), maxHp: 1e9 });
    const hp = w.core.getEntity('player').currentHp;
    w.weapons.setAttackSpeed('player', 1);
    w.update(0.1);
    const absorbed = w
      .getEvents()
      .some(
        (e) =>
          e.channel === 'enemy' &&
          e.event.type === 'contact-attempt' &&
          (e.event.result?.absorbed ?? 0) > 0,
      );
    expect(absorbed).toBe(true);
    expect(w.core.getEntity('player').currentHp).toBe(hp);
    w.core.updateEntityStats(enemy, { ...w.core.getEntity(enemy), physicalDamage: 0 });
    w.update(BONUS_TUNING.barrierDuration);
    expect(w.getSnapshot().skillCombat.barrier).toBe(0);
    expect(w.getSnapshot().skillCombat.barrierExpiresAt).toBeNull();
    w.grantTestXp(1000);
    w.chooseSkill('bonus:gold');
    w.chooseSkill('bonus:gold');
    expect(w.getSnapshot().skills.gold).toBe(BONUS_TUNING.gold * 2);
  });
});

describe('run lifecycle', () => {
  it('ending a run drops pending choices; a new run starts with no skills and three rerolls', () => {
    const w = arena('archer');
    w.grantTestSkill('piercing_arrow', 3);
    w.grantTestXp(100);
    expect(w.getSnapshot().skills.pendingChoices).toBeGreaterThan(0);
    w.setTestProtection(false);
    w.setPlayerHp(0);
    w.decide('finish-run');
    expect(w.getSnapshot().skills.pendingChoices).toBe(0);
    expect(w.getSnapshot().skills.offer).toBeNull();
    const fresh = arena('archer');
    expect(fresh.getSnapshot().skills).toMatchObject({
      owned: [],
      rerolls: 3,
      pendingChoices: 0,
      gold: 0,
    });
  });
  it('revival keeps skills and pending choices; the choice is presented after reviving', () => {
    const w = arena('mage');
    w.grantTestSkill('frost_nova', 2);
    w.grantTestXp(20);
    w.setTestProtection(false);
    w.setPlayerHp(0);
    expect(w.survival.getState().runState).toBe('awaiting-revival-choice');
    w.decide('revive');
    expect(w.getSnapshot().skills.offer).not.toBeNull();
    expect(w.paused).toBe(true);
    expect(w.run.rank('frost_nova')).toBe(2);
  });
  it('long runs keep engine bookkeeping bounded', () => {
    const w = new GameplayWorld({ characterClass: 'rogue', level: 25, seed: 5 });
    w.setTestProtection(true);
    for (const id of ['blade_flurry', 'fan_of_knives', 'blood_blades', 'death_mark'])
      w.grantTestSkill(id, 5);
    w.grantTestSkill('serrated_blades', 5);
    play(w, 120, 0.25);
    const engine = w.skills as unknown as Record<string, Map<unknown, unknown>>;
    expect(engine.controls.size).toBeLessThanOrEqual(120);
    expect(engine.projectiles.size).toBeLessThan(200);
    expect(engine.counters.size).toBeLessThan(500);
    expect(engine.queue.length).toBeLessThan(50);
    expect(w.getEvents().length).toBeLessThanOrEqual(160);
  });
});
