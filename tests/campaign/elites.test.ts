import { describe, expect, it } from 'vitest';
import { CAMPAIGN_BALANCE, eliteEnemyConfig, eliteProfile } from '../../src/campaign';
import { ALPHA_ENEMIES, GameplayWorld } from '../../src/gameplay';
import { XP_RULES } from '../../src/gameplay/experience';
import { enemyConfig } from '../../src/enemy-ai/validation';
import type { CombatTag } from '../../src/skills';
import { resolveOffers } from '../skills/helpers';

const kill = (w: GameplayWorld, id: string) => {
  const t = new Set<CombatTag>(['physical']);
  w.skills.hit(id, w.skills.attack(t, 1e7, 'physical'), t, { procs: false });
};
function world() {
  const w = new GameplayWorld({
    characterClass: 'mage',
    seed: 9,
    initialEnemies: false,
    spawning: { enabled: false },
    onHit: [],
    campaign: { mapId: 1 },
  });
  w.setTestProtection(true);
  w.weapons.setAttackSpeed('player', 0.01); // keep the staff from killing elites before checks
  return w;
}
const until = (w: GameplayWorld, t: number) => {
  while (w.time < t - 1e-9) {
    resolveOffers(w);
    w.update(Math.min(0.5, t - w.time));
  }
};

describe('elite profiles (Task 08 §2.1)', () => {
  it('derive valid enemy configs from the existing melee/ranged profiles', () => {
    const melee = eliteEnemyConfig(ALPHA_ENEMIES.melee, 'melee');
    const d = CAMPAIGN_BALANCE.elite.definitions;
    expect(melee.radius).toBeCloseTo(ALPHA_ENEMIES.melee.radius * d.melee.radiusScale, 12);
    expect(melee.movementSpeed).toBeCloseTo(
      ALPHA_ENEMIES.melee.movementSpeed * d.melee.movementScale,
      12,
    );
    expect(melee.attackInterval).toBeLessThan(ALPHA_ENEMIES.melee.attackInterval);
    const ranged = eliteEnemyConfig(ALPHA_ENEMIES.ranged, 'ranged');
    expect(ranged.behavior === 'ranged' && ranged.attackRange).toBeCloseTo(360 * 1.2, 9);
    expect(() => enemyConfig(melee)).not.toThrow();
    expect(() => enemyConfig(ranged)).not.toThrow();
    expect(() => eliteEnemyConfig(ALPHA_ENEMIES.melee, 'ranged')).toThrow();
    expect(eliteProfile('melee').name).not.toBe(eliteProfile('ranged').name);
  });
  it('scheduled elites use their profile, are named in the snapshot and drop extra run XP', () => {
    const w = world();
    until(w, 241);
    const c = w.getSnapshot().campaign!;
    expect(c.elites.map((e) => [e.profile, e.name])).toEqual([
      ['melee', 'Savage Brute'],
      ['ranged', 'Dark Conjurer'],
    ]);
    for (const elite of c.elites) {
      const snap = w.getSnapshot().enemies.find((e) => e.entityId === elite.enemyId)!;
      expect(snap.config.radius).toBeGreaterThan(ALPHA_ENEMIES[elite.profile].radius);
      const seq = w.getEvents().at(-1)?.sequence ?? 0;
      kill(w, elite.enemyId);
      const reward = w.getEvents(seq).find((e) => e.event.type === 'enemy-rewarded')!.event as {
        xp: number;
      };
      const base = elite.profile === 'melee' ? XP_RULES.meleeReward : XP_RULES.rangedReward;
      expect(reward.xp).toBe(base + eliteProfile(elite.profile).extraXp);
    }
    expect(w.getSnapshot().campaign!.eliteKills).toBe(2);
    // Dead elites stay listed (results need them) and no reward is granted twice.
    expect(w.getSnapshot().campaign!.elites).toHaveLength(2);
  });
});
