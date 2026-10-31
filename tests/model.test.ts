import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addExperience,
  calculateStats,
  damageAfterArmor,
  difficulty,
  freshRanks,
  xpForLevel,
} from '../src/core/progression.ts';
import { loadSave, saveRun } from '../src/progression/save.ts';
test('XP boundaries, overflow and multiple level-ups preserve remaining experience', () => {
  assert.deepEqual(addExperience(1, 0, 11), { level: 1, xp: 11, levels: 0 });
  assert.deepEqual(addExperience(1, 11, 1), { level: 2, xp: 0, levels: 1 });
  const total = xpForLevel(1) + xpForLevel(2) + 7;
  assert.deepEqual(addExperience(1, 0, total), { level: 3, xp: 7, levels: 2 });
});
test('per-run upgrades modify stats, grow HP, and cannot create zero cooldown', () => {
  const ranks = freshRanks(),
    base = calculateStats(1, ranks);
  ranks.power = 2;
  ranks.vitality = 1;
  ranks.haste = 100;
  ranks.multishot = 100;
  ranks.stride = 1;
  ranks.magnet = 1;
  const stats = calculateStats(3, ranks);
  assert.equal(stats.maxHp, 133);
  assert.ok(stats.damage > base.damage);
  assert.equal(stats.interval, 0.12);
  assert.equal(stats.projectiles, 6);
  assert.ok(stats.speed > base.speed);
  assert.ok(stats.pickup > base.pickup);
  assert.deepEqual(freshRanks(), {
    power: 0,
    haste: 0,
    vitality: 0,
    stride: 0,
    magnet: 0,
    multishot: 0,
  });
});
test('armor reduces incoming damage without making player invincible', () => {
  assert.equal(damageAfterArmor(20, 0), 20);
  assert.ok(damageAfterArmor(20, 10) < 20);
  assert.equal(damageAfterArmor(20, 10000), 1);
});
test('difficulty rises over a 20-minute run but spawn interval and speed stay bounded', () => {
  const a = difficulty(0),
    b = difficulty(1200);
  assert.ok(b.health > a.health);
  assert.ok(b.damage > a.damage);
  assert.ok(b.batch > a.batch);
  assert.ok(b.spawnInterval < a.spawnInterval);
  assert.ok(difficulty(999999).spawnInterval >= 0.12);
  assert.ok(difficulty(999999).speed <= 2.4);
});
let raw: string | null = null;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: () => raw,
    setItem: (_key: string, v: string) => {
      raw = v;
    },
  },
});
test('versioned save tolerates corruption, preserves records and stores run count', () => {
  raw = '{invalid';
  assert.equal(loadSave().runs, 0);
  raw = null;
  saveRun(50, 10);
  saveRun(20, 30);
  assert.deepEqual(loadSave(), { version: 1, bestSeconds: 50, bestKills: 30, runs: 2 });
  raw = JSON.stringify({ version: 1, bestSeconds: -1, bestKills: 'wrong', runs: 0 });
  assert.equal(loadSave().bestSeconds, 0);
});
test('unknown future save version is never overwritten', () => {
  raw = JSON.stringify({ version: 5, future: true });
  const before = raw;
  saveRun(10, 3);
  assert.equal(raw, before);
});
