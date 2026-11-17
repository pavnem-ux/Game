import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

/**
 * Task 25 e2e: the art pack is rendering only.
 *  1. Same seed + same steps ⇒ identical simulation with the owner art loaded and with the art
 *     blocked (procedural fallback). The page's clock is paused after boot, so animation frames do
 *     not advance the world; only `__alpha.advance` does (it also draws every step, so the art path
 *     runs: sizing, flips, bakes, labels).
 *  2. With art: all 13 unit looks load, and the page logs no missing-texture warnings or errors.
 *  3. Without the manifest: nothing breaks; every look stays procedural.
 * Needs a dev server (`/?debug`).
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});

/** Runs a fixed scenario; returns a digest of the world after each step and the page's logs. */
async function scenario(withArt) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    // Chromium logs the automatic /favicon.ico request (no favicon) as a bare "Failed to load
    // resource"; real failures of the pack are caught with their URL by the response listener.
    if (m.type() === 'error' && /Failed to load resource/.test(m.text())) return;
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico') && withArt)
      logs.push(`HTTP ${r.status()} ${r.url()}`);
  });
  if (!withArt)
    await page.route('**/assets/manifest.json', (route) => route.fulfill({ status: 404 }));
  await page.clock.install();
  await page.goto(base + '/?debug');
  // Unlock map 25 (all activity types) through a normal profile edit.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('skazki.profile'));
    p.completedMaps = Array.from({ length: 24 }, (_, i) => i + 1);
    p.highestUnlockedMap = 25;
    localStorage.setItem('skazki.profile', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  // Real frames must not advance the world: pause the page clock before the run exists.
  await page.clock.pauseAt(Date.now() + 1000);
  await page.evaluate(() =>
    window.__alpha.command({
      type: 'restart',
      options: {
        characterClass: 'rogue',
        level: 12,
        seed: 4242,
        campaign: { mapId: 25, runId: 'art-determinism' },
      },
    }),
  );
  if (withArt) {
    await page.waitForFunction(() => window.__alpha.presentation().artLooks === 13, null, {
      timeout: 15_000,
    });
  }
  const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
  await command({ type: 'protection', enabled: true });
  for (const kind of ['melee', 'ranged', 'swift', 'brute', 'bombard'])
    await command({ type: 'spawn-n', kind, count: 3, distance: 160 });
  await command({ type: 'activity', activityType: 'thief' });
  await command({ type: 'activity', activityType: 'nest' });
  const digests = [];
  for (let step = 0; step < 24; step++) {
    // Movement turns the player (the flip path); both runs get the same input.
    await command({ type: 'move', x: step % 8 < 4 ? 1 : -1, y: 0 });
    digests.push(
      await page.evaluate(() => {
        window.__alpha.advance(0.25);
        const s = window.__alpha.state();
        // Take any level-up offer the same way in both runs.
        const offer = s.world.skills.offer;
        if (offer) {
          const c = offer.cards[0];
          window.__alpha.command({
            type: 'choose-skill',
            card: c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`,
          });
        }
        const w = window.__alpha.state().world;
        return JSON.stringify({
          t: w.time,
          p: [w.playerBody.x, w.playerBody.y, w.player.currentHp],
          e: w.enemies.map((e) => [e.entityId, e.position.x, e.position.y, e.entity.currentHp]),
          k: w.runStats?.kills ?? null,
        });
      }),
    );
  }
  const artLooks = await page.evaluate(() => window.__alpha.presentation().artLooks);
  await context.close();
  return { digests, logs, artLooks };
}

/**
 * Phase 3: portraits on character select (4 cards) and the hub's chosen-hero panel; the emblem is
 * the fallback without the pack. Returns what is shown and whether the page scrolls sideways.
 */
async function portraits(withArt, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  if (!withArt)
    await page.route('**/assets/manifest.json', (route) => route.fulfill({ status: 404 }));
  await page.goto(base + '/');
  const nav = page.getByRole('navigation', { name: 'Main menu' });
  await nav.waitFor();
  const go = (label) =>
    nav.getByRole('button', { name: label, exact: true }).evaluate((el) => el.click());
  /** Loaded portrait images (natural size > 0) and SVG emblems inside `selector`. */
  const shown = (selector) =>
    page.evaluate(async (sel) => {
      const root = document.querySelectorAll(sel);
      const imgs = [...document.querySelectorAll(`${sel} .class-portrait img`)];
      await Promise.all(imgs.map((i) => (i.complete ? null : i.decode().catch(() => null))));
      return {
        blocks: root.length,
        portraits: imgs
          .filter((i) => i.naturalWidth > 0)
          .map((i) => new URL(i.src).pathname)
          .sort(),
        emblems: document.querySelectorAll(`${sel} svg.class-emblem`).length,
        scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    }, selector);
  await go('Hero');
  if (withArt) await page.locator('.character-card .class-portrait img').first().waitFor();
  else await page.waitForTimeout(500);
  const select = await shown('.character-card');
  await go('Home');
  if (withArt) await page.locator('.hub-champion .class-portrait img').waitFor();
  const hub = await shown('.hub-champion');
  await context.close();
  return { select, hub };
}

const art = await scenario(true);
const procedural = await scenario(false);
const shots = {
  desktop: await portraits(true, { width: 1280, height: 720 }, false),
  phone: await portraits(true, { width: 844, height: 390 }, true),
  fallback: await portraits(false, { width: 1280, height: 720 }, false),
};
await browser.close();

const CLASSES = ['archer', 'mage', 'rogue', 'warrior'];
for (const tag of ['desktop', 'phone']) {
  const { select, hub } = shots[tag];
  assert.deepEqual(
    select.portraits,
    CLASSES.map((c) => `/assets/portraits/portrait_${c}.webp`),
    `${tag}: four character-select portraits`,
  );
  assert.equal(select.emblems, 0, `${tag}: no emblem left on the cards`);
  assert.equal(hub.portraits.length, 1, `${tag}: hub chosen-hero portrait`);
  assert.equal(select.scroll || hub.scroll, false, `${tag}: no horizontal scroll`);
}
assert.deepEqual(shots.fallback.select.portraits, [], 'fallback: no portrait without the pack');
assert.equal(shots.fallback.select.emblems, 4, 'fallback: the four emblems are back');
assert.equal(shots.fallback.hub.emblems, 1, 'fallback: hub emblem');

assert.equal(art.artLooks, 13, 'all 13 unit looks drawn with the owner art');
assert.equal(procedural.artLooks, 0, 'no manifest: every look stays procedural');
assert.equal(art.digests.length, 24);
assert.ok(
  JSON.parse(art.digests.at(-1)).e.length > 0,
  'the scenario has living enemies to compare',
);
for (let i = 0; i < art.digests.length; i++)
  assert.equal(art.digests[i], procedural.digests[i], `identical simulation at step ${i}`);
assert.deepEqual(
  art.logs.filter((l) => /texture|missing|__MISSING/i.test(l)),
  [],
  'no missing-texture warnings',
);
assert.deepEqual(art.logs, [], 'no errors or warnings with the art pack');
assert.deepEqual(
  procedural.logs.filter((l) => !/\[art\] manifest unavailable/.test(l)),
  [],
  'the fallback only logs its one "manifest unavailable" warning',
);
console.log(
  'PASS art: same seed ⇒ identical simulation with art on / off (24 steps, map 25, every enemy type, thief, nest); 13 looks from the pack; no missing-texture warnings; procedural fallback without the manifest; class portraits on character select + hub (desktop and phone, no horizontal scroll), emblems as the fallback.',
);
