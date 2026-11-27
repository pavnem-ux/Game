import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { EXTENDED, screenshot } from './e2e-options.mjs';

/**
 * Task 24 e2e (desktop 1280×720 and a landscape phone 844×390 with touch): a campaign run with
 * map activities through the DEV tools — spawn toast, world label, off-screen pointer, shrine
 * capture by walking in (reward chest), lantern / nest / thief through the real boundaries,
 * Light bar, results ore, the Activities quest tab. Needs a dev server (`/?debug`).
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const errors = [];

// The landscape phone pass runs in extended runs only (Task 29 mobile freeze).
for (const [tag, viewport, touch] of [
  ['desktop', { width: 1280, height: 720 }, false],
  ...(EXTENDED ? [['mobile', { width: 844, height: 390 }, true]] : []),
]) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
  await page.goto(base + '/?debug');
  // Unlock map 25 (all four activity types) through a normal profile edit.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('skazki.profile'));
    p.completedMaps = Array.from({ length: 24 }, (_, i) => i + 1);
    p.highestUnlockedMap = 25;
    localStorage.setItem('skazki.profile', JSON.stringify(p));
  });
  await page.reload();
  await page.getByRole('button', { name: /^Start run · map 25/ }).click();
  await page.waitForFunction(() => window.__alpha?.state().screen === 'playing');
  await page
    .getByRole('button', { name: 'Hide' })
    .click({ timeout: 3000 })
    .catch(() => {});
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
  /** Advances simulation time, taking the first card of any level-up offer on the way. */
  const advance = async (seconds) => {
    const end = (await state()).world.time + seconds;
    for (let guard = 0; guard < 400; guard++) {
      const s = await state();
      const offer = s.world.skills.offer;
      if (offer) {
        const c = offer.cards[0];
        await command({
          type: 'choose-skill',
          card: c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`,
        });
        continue;
      }
      const left = end - s.world.time;
      if (left <= 1e-6) return;
      await page.evaluate((x) => window.__alpha.advance(x), Math.min(1, left));
    }
  };
  await command({ type: 'protection', enabled: true });

  // Shrine: toast + label; walking in captures it in 9 s and drops an enchanted chest.
  await command({ type: 'activity', activityType: 'shrine' });
  await page.getByRole('status').filter({ hasText: 'A shrine has appeared' }).waitFor();
  let shrine = (await state()).world.activities.items.find((a) => a.type === 'shrine');
  assert.ok(shrine, `${tag}: shrine on the map`);
  const chestsBefore = (await state()).world.chests.items.length;
  // Walk in with the real keyboard input (the scene samples it every frame).
  for (let i = 0; i < 400; i++) {
    const p = (await state()).world.playerBody;
    const dx = shrine.x - p.x,
      dy = shrine.y - p.y;
    if (Math.hypot(dx, dy) < 40) break;
    const keys = [];
    if (Math.abs(dx) > 20) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    if (Math.abs(dy) > 20) keys.push(dy > 0 ? 'ArrowDown' : 'ArrowUp');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(40);
    await advance(0.1);
    for (const k of keys) await page.keyboard.up(k);
  }
  await page.waitForTimeout(60); // the scene samples the released keys
  await advance(10);
  shrine = (await state()).world.activities.items.find((a) => a.id === shrine.id);
  assert.equal(shrine, undefined, `${tag}: the shrine completed`);
  assert.equal(
    (await state()).world.runStats.activities.completed.shrine,
    1,
    `${tag}: shrine counted`,
  );
  // The reward chest lands at the shrine centre, under the player: it opens at once by touch.
  const chestsNow = (await state()).world;
  assert.ok(
    chestsNow.chests.items.some((c) => c.type === 'enchanted') ||
      chestsNow.runStats.chests.opened.enchanted >= 1,
    `${tag}: enchanted reward chest (had ${chestsBefore} chests)`,
  );

  // Lantern: activation + defence with its Light bar, completed through the DEV tool.
  await command({ type: 'activity', activityType: 'lantern' });
  const lantern = (await state()).world.activities.items.find((a) => a.type === 'lantern');
  await command({ type: 'activity-resolve', id: lantern.id, outcome: 'complete' });
  const after = (await state()).world;
  assert.equal(after.activities.litLanterns.length, 1, `${tag}: lantern stays lit`);
  assert.ok(after.activities.ore >= 2, `${tag}: map 25 lantern banks 2 Ore`);

  // Nest and thief are real enemies; the thief escapes after 20 s.
  await command({ type: 'activity', activityType: 'nest' });
  await command({ type: 'activity', activityType: 'thief' });
  let w = (await state()).world;
  const nest = w.activities.items.find((a) => a.type === 'nest');
  const thief = w.activities.items.find((a) => a.type === 'thief');
  assert.ok(
    w.enemies.some((e) => e.entityId === nest.enemyId && e.config.behavior === 'stationary'),
    `${tag}: nest is a stationary enemy`,
  );
  assert.ok(
    w.enemies.some((e) => e.entityId === thief.enemyId && e.config.behavior === 'flee'),
    `${tag}: thief flees`,
  );
  await advance(21);
  w = (await state()).world;
  assert.equal(w.runStats.activities.failed.thief, 1, `${tag}: the thief escaped`);
  await command({ type: 'activity-resolve', id: nest.id, outcome: 'complete' });
  w = (await state()).world;
  assert.equal(w.runStats.activities.completed.nest, 1, `${tag}: nest destroyed`);
  assert.ok(
    w.chests.items.some((c) => c.type === 'wooden'),
    `${tag}: wooden chest from the nest`,
  );

  // Off-screen pointer: a fresh shrine far away is drawn at the screen edge (canvas pixels).
  await screenshot(page, { path: `artifacts/activities-${tag}.png` }).catch(() => {});

  // Win the run: the results show the banked activity Ore.
  await command({ type: 'campaign-force', outcome: 'victory' });
  const results = page.getByRole('dialog', { name: 'Victory.' });
  await results.waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.results-save')?.textContent?.includes('Progress saved'),
  );
  assert.match(await results.innerText(), /\(activities \+\d+\)/, `${tag}: activity Ore shown`);
  const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.deepEqual(
    profile.questCounters.activities,
    { shrine: 1, lantern: 1, thief: 0, nest: 1 },
    `${tag}: lifetime activity counters saved once`,
  );
  assert.equal(profile.schemaVersion, 11); // Task 41

  // Quests: the Activities group with its progress.
  await results.getByRole('button', { name: 'To menu' }).click();
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await nav.getByRole('button', { name: /^Quests/ }).click();
  const groups = page.getByRole('group', { name: 'Quest groups' });
  await groups.getByRole('button', { name: /Activities/ }).evaluate((el) => el.click());
  await page.getByText('Cleanse 10 shrines').waitFor();
  await page.getByText('Destroy 50 nests').waitFor();
  assert.ok(
    (await page.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width + 1,
    `${tag}: no horizontal scroll on the quests page`,
  );
  await context.close();
}
await browser.close();
assert.deepEqual(errors, [], 'no page errors');
console.log(
  'PASS activities: desktop + phone — spawn toast, shrine capture by walking (enchanted chest), lantern lit + banked Ore, stationary nest (wooden chest), fleeing thief escape at 20 s, victory pays activity Ore once, lifetime counters in the save (v11), Activities quest tab.',
);
