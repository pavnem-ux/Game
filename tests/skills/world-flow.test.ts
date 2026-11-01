import { describe, expect, it } from 'vitest';
import { CHARACTER_CLASSES } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import { arena, play, resolveOffers, skillEvents, stationaryMelee } from './helpers';

describe('level-up flow inside GameplayWorld', () => {
  it('pauses at the exact collection instant and queues every gained level', () => {
    const w = arena('warrior');
    w.dropTestCrystal(75, 30);
    const enemy = w.spawnEnemy('melee', 600, 0, { ...stationaryMelee, movementSpeed: 50 });
    w.update(0.5);
    // 75 XP: 20 + 30 = two levels, 25 left over.
    expect(w.getSnapshot().progression).toMatchObject({ level: 3, xp: 25 });
    expect(w.getSnapshot().skills.pendingChoices).toBe(2);
    const t = w.time;
    expect(t).toBeLessThan(0.5);
    const position = w.getSnapshot().enemies.find((e) => e.entityId === enemy)!.position;
    w.update(5);
    expect(w.time).toBe(t);
    const first = w.run.currentOffer!;
    const card = first.cards[0];
    w.chooseSkill(card.kind === 'skill' ? card.skillId : `bonus:${card.bonusId}`);
    // Still paused for the second queued choice; enemies did not advance between selections.
    expect(w.paused).toBe(true);
    w.update(5);
    expect(w.time).toBe(t);
    expect(w.getSnapshot().enemies.find((e) => e.entityId === enemy)!.position).toEqual(position);
    expect(w.run.currentOffer!.id).toBeGreaterThan(first.id);
    resolveOffers(w);
    expect(w.paused).toBe(false);
    w.update(1);
    expect(w.time).toBeCloseTo(t + 1, 9);
  });
  it('rejects choices without a pending offer and keeps manual pause independent', () => {
    const w = arena('mage');
    expect(() => w.chooseSkill('fireball')).toThrow();
    expect(() => w.rerollSkillOffer()).toThrow();
    w.grantTestXp(20);
    w.setPaused(true);
    resolveOffers(w);
    expect(w.paused).toBe(true);
    w.setPaused(false);
    expect(w.paused).toBe(false);
  });
  it('records chosen skills, offers and rerolls as world events', () => {
    const w = arena('rogue');
    w.grantTestXp(20);
    w.rerollSkillOffer();
    resolveOffers(w);
    expect(
      skillEvents(w, 'skill-offer').map((e) => (e.event as { reroll: boolean }).reroll),
    ).toEqual([false, true]);
    expect(skillEvents(w, 'skill-chosen')).toHaveLength(1);
    expect(w.getSnapshot().skills.rerolls).toBe(2);
  });
  it('a newly chosen automatic skill starts working immediately after the choice', () => {
    const w = arena('archer', { level: 5 });
    w.spawnEnemy('melee', 250, 0, stationaryMelee);
    w.grantTestXp(20);
    // Pick piercing arrow if offered, otherwise grant it directly through the DEV path.
    const card = w.run.currentOffer!.cards.find(
      (c) => c.kind === 'skill' && c.skillKind === 'auto',
    );
    if (card && card.kind === 'skill') w.chooseSkill(card.skillId);
    else {
      resolveOffers(w);
      w.grantTestSkill('piercing_arrow', 1);
    }
    w.update(0.05);
    expect(skillEvents(w, 'skill-activated').length).toBeGreaterThan(0);
  });
});

describe('one-minute smoke run per class with random choices', () => {
  for (const characterClass of CHARACTER_CLASSES)
    it(`${characterClass}: real waves, crystal pickup, choices and skills without runtime errors`, () => {
      const w = new GameplayWorld({ characterClass, level: 15, seed: 31 });
      w.setTestProtection(true);
      // Walk in a slow circle so crystals are actually collected.
      let angle = 0;
      while (w.time < 60) {
        resolveOffers(w);
        angle += 0.05;
        // Walk to the nearest crystal (real pickup path); otherwise circle slowly.
        const body = w.getSnapshot().playerBody;
        const crystal = [...w.getSnapshot().crystals].sort(
          (a, b) => Math.hypot(a.x - body.x, a.y - body.y) - Math.hypot(b.x - body.x, b.y - body.y),
        )[0];
        if (crystal) w.setMovement(crystal.x - body.x, crystal.y - body.y);
        else w.setMovement(Math.cos(angle), Math.sin(angle));
        w.update(1 / 30);
      }
      const s = w.getSnapshot();
      expect(s.progression.level).toBeGreaterThan(1);
      // Every level-up granted exactly one choice: one rank or one bonus reward.
      const ranks = s.skills.owned.reduce((sum, o) => sum + o.rank, 0);
      const bonuses = Object.values(s.skills.bonusesClaimed).reduce((a, b) => a + b, 0);
      expect(ranks + bonuses).toBe(s.progression.level - 1);
      expect(s.kills).toBeGreaterThan(20);
      expect(Number.isFinite(s.player.currentHp)).toBe(true);
      expect(s.statuses.every((g) => g.stacks.length <= 10)).toBe(true);
      play(w, 5);
    });
});
