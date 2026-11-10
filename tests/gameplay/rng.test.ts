import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, createRunRandom, validateSeed } from '../../src/gameplay';

/** The exact inline formulas GameplayWorld used before Task 08.5 (golden reference). */
function legacy(seedOption?: number) {
  let seed = seedOption ?? 1337;
  const combat = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let skillSeed = ((seedOption ?? 1337) ^ 0x5bd1e995) >>> 0;
  const skills = () => {
    skillSeed = (Math.imul(skillSeed, 1664525) + 1013904223) >>> 0;
    return skillSeed / 4294967296;
  };
  let spawnSeed = (seedOption ?? 1337) ^ 0x9e3779b9;
  const spawn = () => {
    spawnSeed = (Math.imul(spawnSeed, 1664525) + 1013904223) >>> 0;
    return spawnSeed / 4294967296;
  };
  return { combat, skills, spawn };
}
const take = (f: () => number, n = 500) => Array.from({ length: n }, f);

describe('Task 08.5 §4.1 seeded RNG module', () => {
  it.each([undefined, 0, 1, 7, 1337, 4242, 0x7fffffff, 0xffffffff, 2 ** 40, 2 ** 53 - 1])(
    'seed %s: every stream reproduces the pre-08.5 sequence exactly',
    (seed) => {
      const r = createRunRandom(seed);
      const old = legacy(seed);
      for (const stream of ['combat', 'skills', 'spawn'] as const)
        expect(take(r[stream])).toEqual(take(old[stream]));
      expect(r.seed).toBe(seed ?? DEFAULT_SEED);
    },
  );
  it('streams are independent and values are in [0, 1)', () => {
    const a = createRunRandom(99);
    const b = createRunRandom(99);
    take(a.combat, 1000); // draining one stream does not shift the others
    expect(take(a.spawn, 50)).toEqual(take(b.spawn, 50));
    expect(take(a.skills, 50)).toEqual(take(b.skills, 50));
    for (const v of take(createRunRandom(5).combat, 2000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('rejects invalid seeds', () => {
    for (const bad of [-1, 1.5, Number.NaN, 2 ** 53]) expect(() => validateSeed(bad)).toThrow();
    expect(() => createRunRandom(-3)).toThrow(RangeError);
  });
});
