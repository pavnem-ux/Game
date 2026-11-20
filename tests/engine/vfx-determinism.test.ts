import { describe, expect, it } from 'vitest';
import type { CharacterClass } from '../../src/character-stats';
import { GameplayWorld } from '../../src/gameplay';
import { VFX_CAPS } from '../../src/engine/vfx/caps';
import { VfxDirector } from '../../src/engine/vfx/director';
import { VfxEmitter } from '../../src/engine/vfx/emitters';
import { ParticleStore } from '../../src/engine/vfx/particles';

/**
 * Task 33: VFX are rendering only — the same seed and steps give an identical simulation with the
 * VFX director reading every frame's events / snapshot (and the world's attack sources) or not.
 */
const SKILLS: Record<CharacterClass, string[]> = {
  warrior: ['ground_slam', 'whirlwind', 'cleave'],
  mage: ['fireball', 'frost_nova', 'inferno'],
  archer: ['toxic_volley', 'poison_trap', 'piercing_arrow'],
  rogue: ['blade_flurry', 'fan_of_knives', 'blood_blades'],
};

function run(characterClass: CharacterClass, vfx: boolean) {
  const w = new GameplayWorld({ characterClass, level: 8, seed: 4242, campaign: { mapId: 3 } });
  w.setTestProtection(true);
  for (const id of SKILLS[characterClass]) w.grantTestSkill(id, 3);
  const store = new ParticleStore(VFX_CAPS.high.particles, VFX_CAPS.high);
  const fx = new VfxEmitter(store);
  const director = new VfxDirector(fx);
  const ctx = {
    characterClass,
    attackRange: 60,
    playerId: 'player',
    attackSource: (id: string) => w.attackSource(id),
  };
  let last = 0;
  const digests: string[] = [];
  for (let step = 0; step < 240; step++) {
    w.setMovement(step % 40 < 20 ? 1 : -1, 0);
    w.update(1 / 20);
    const s = w.getSnapshot();
    if (s.skills.offer) {
      const c = s.skills.offer.cards[0];
      w.chooseSkill(c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`);
    }
    if (vfx) {
      const events = w.getEvents(last);
      fx.now = s.time;
      store.update(s.time, 1 / 20);
      director.frame(s, events, ctx);
    }
    const events = w.getEvents(last);
    if (events.length) last = events[events.length - 1].sequence;
    if (step % 20 === 19)
      digests.push(
        JSON.stringify([
          s.time,
          s.playerBody,
          s.player.currentHp,
          s.enemies.map((e) => [e.entityId, e.position.x, e.position.y, e.entity.currentHp]),
          s.runStats?.kills ?? null,
        ]),
      );
  }
  return { digests, particles: store.spawned };
}

describe('Task 33 — VFX on / off ⇒ identical simulation', () => {
  for (const cls of ['warrior', 'mage', 'archer', 'rogue'] as const)
    it(`${cls}: same seed, same steps`, () => {
      const on = run(cls, true);
      const off = run(cls, false);
      expect(on.particles).toBeGreaterThan(0); // the director really drew something
      expect(on.digests).toEqual(off.digests);
    });
});
