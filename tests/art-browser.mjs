import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { EXTENDED } from './e2e-options.mjs';

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
    // Task 26: 13 unit looks + 4 pickup looks.
    await page.waitForFunction(() => window.__alpha.presentation().artLooks === 17, null, {
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
  const { artLooks, artGround } = await page.evaluate(() => window.__alpha.presentation());
  await context.close();
  return { digests, logs, artLooks, artGround };
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
  // Task 26: the Gold / Ore badges use the pack's coin / ore icons (inline SVGs as the fallback).
  if (withArt) await page.locator('.kit-ore img.currency-icon').waitFor();
  const badges = await page.evaluate(() =>
    [...document.querySelectorAll('.kit-currency')].slice(0, 2).map((b) => {
      const img = b.querySelector('img.currency-icon');
      return img && img.naturalWidth > 0
        ? new URL(img.src).pathname
        : b.querySelector('svg')
          ? 'svg'
          : 'none';
    }),
  );
  await context.close();
  return { select, hub, badges };
}

/**
 * Task 27: skill icons from art pack 3 on the HUD (active skills), the level-up offer cards and the
 * pause skill list; the catalogue glyphs are the fallback without the manifest.
 */
async function skillIcons(withArt, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (!withArt)
    await page.route('**/assets/manifest.json', (route) => route.fulfill({ status: 404 }));
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
  await command({
    type: 'restart',
    options: { characterClass: 'warrior', level: 5, seed: 99, initialEnemies: false },
  });
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawning', settings: { enabled: false } });
  for (const skillId of ['ground_slam', 'whirlwind'])
    await command({ type: 'grant-skill', skillId, rank: 2 });
  await page.locator('.active-skill').nth(1).waitFor();
  /** Loaded icon images (pathnames) and glyph fallbacks inside `selector`. */
  const shown = (selector) =>
    page.evaluate(async (sel) => {
      const imgs = [...document.querySelectorAll(`${sel} img.skill-icon`)];
      await Promise.all(imgs.map((i) => (i.complete ? null : i.decode().catch(() => null))));
      return {
        icons: imgs.filter((i) => i.naturalWidth > 0).map((i) => new URL(i.src).pathname),
        glyphs: document.querySelectorAll(`${sel} .skill-icon.is-glyph`).length,
        size: Math.round(
          document.querySelector(`${sel} .skill-icon`)?.getBoundingClientRect().width ?? 0,
        ),
        scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    }, selector);
  if (withArt) await page.locator('.active-skill img.skill-icon').nth(1).waitFor();
  else await page.waitForTimeout(500);
  const hud = await shown('.active-skills');
  // A level-up offer: its skill cards show icons (bonus cards keep their glyph).
  await command({ type: 'grant-xp', amount: 200 });
  await page.locator('.skill-card').first().waitFor();
  if (withArt) await page.locator('.skill-card-icon img.skill-icon').first().waitFor();
  const offer = await shown('.upgrade-grid .skill-card-icon');
  const cards = await page.evaluate(() => window.__alpha.state().world.skills.offer.cards.length);
  for (
    let i = 0;
    i < 20 && (await page.evaluate(() => !!window.__alpha.state().world.skills.offer));
    i++
  ) {
    const c = await page.evaluate(() => window.__alpha.state().world.skills.offer.cards[0]);
    await command({
      type: 'choose-skill',
      card: c.kind === 'skill' ? c.skillId : `bonus:${c.bonusId}`,
    });
  }
  await page.keyboard.press('p');
  await page.locator('.pause-skills').waitFor();
  const pause = await shown('.pause-skills .skill-overview-groups');
  // Task 28: the pause synergy list shows each of the class's three synergy icons.
  const synergies = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.synergy-overview img.synergy-icon')];
    await Promise.all(imgs.map((i) => (i.complete ? null : i.decode().catch(() => null))));
    return imgs.filter((i) => i.naturalWidth > 0).map((i) => new URL(i.src).pathname);
  });
  await context.close();
  return { hud, offer, cards, pause, synergies, errors };
}

/**
 * Task 28: the talent screen — the three branch headers show their emblems, every node shows its
 * branch emblem with a number badge; letters and no badges without the pack.
 */
async function talentEmblems(withArt, viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (!withArt)
    await page.route('**/assets/manifest.json', (route) => route.fulfill({ status: 404 }));
  await page.goto(base + '/');
  const nav = page.getByRole('navigation', { name: 'Main menu' });
  await nav.waitFor();
  // The default profile's selected class is the warrior (branches 5 + 5 + 4 nodes).
  await nav.getByRole('button', { name: 'Talents', exact: true }).evaluate((el) => el.click());
  await page.locator('.talent-column').nth(2).waitFor();
  if (withArt) await page.locator('.talent-orb.has-art img').nth(13).waitFor();
  else await page.waitForTimeout(500);
  const result = await page.evaluate(async () => {
    const all = [...document.querySelectorAll('.talent-column img')];
    await Promise.all(all.map((i) => (i.complete ? null : i.decode().catch(() => null))));
    const loaded = (sel) =>
      [...document.querySelectorAll(sel)]
        .filter((i) => i.naturalWidth > 0)
        .map((i) => new URL(i.src).pathname);
    const orb = document.querySelector('.talent-orb');
    return {
      headers: loaded('.talent-column h3 img.talent-branch-icon'),
      nodes: loaded('.talent-orb.has-art img').length,
      badges: [...document.querySelectorAll('.talent-node-number')].map((b) => b.textContent),
      letters: document.querySelectorAll('.talent-orb-glyph').length,
      orb: Math.round(orb.getBoundingClientRect().width),
      scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  await context.close();
  return { ...result, errors };
}

/** Phone checks run in extended runs only (Task 29 mobile freeze). */
const VIEWPORTS = EXTENDED ? ['desktop', 'phone'] : ['desktop'];
const art = await scenario(true);
const procedural = await scenario(false);
const shots = {
  desktop: await portraits(true, { width: 1280, height: 720 }, false),
  ...(EXTENDED ? { phone: await portraits(true, { width: 844, height: 390 }, true) } : {}),
  fallback: await portraits(false, { width: 1280, height: 720 }, false),
};
const icons = {
  desktop: await skillIcons(true, { width: 1280, height: 720 }, false),
  ...(EXTENDED ? { phone: await skillIcons(true, { width: 844, height: 390 }, true) } : {}),
  fallback: await skillIcons(false, { width: 1280, height: 720 }, false),
};
const talents = {
  desktop: await talentEmblems(true, { width: 1280, height: 720 }, false),
  ...(EXTENDED ? { phone: await talentEmblems(true, { width: 844, height: 390 }, true) } : {}),
  fallback: await talentEmblems(false, { width: 1280, height: 720 }, false),
};
await browser.close();

// Task 28: synergy icons in the pause list, talent branch emblems on the talent screen.
for (const tag of VIEWPORTS) {
  assert.deepEqual(
    [...icons[tag].synergies].sort(),
    ['battle_momentum', 'seismic_impact', 'skull_crusher'].map(
      (id) => `/assets/icons/synergies/${id}.webp`,
    ),
    `${tag}: the warrior's three synergy icons in the pause list`,
  );
  const t = talents[tag];
  assert.deepEqual(t.errors, [], `${tag}: talent screen without page errors`);
  assert.deepEqual(
    t.headers,
    ['berserker', 'guardian', 'twin_blade_master'].map((n) => `/assets/icons/talents/${n}.webp`),
    `${tag}: branch header emblems`,
  );
  assert.equal(t.nodes, 14, `${tag}: every node shows its branch emblem`);
  assert.deepEqual(
    t.badges,
    ['1', '2', '3', '4', '5', '1', '2', '3', '4', '5', '1', '2', '3', '4'],
    `${tag}: node number badges`,
  );
  assert.equal(t.letters, 0, `${tag}: no letter left on the nodes`);
  assert.equal(t.orb, tag === 'phone' ? 48 : 56, `${tag}: talent node size (touch on the phone)`);
  assert.equal(t.scroll, false, `${tag}: talent screen without horizontal scroll`);
}
assert.deepEqual(icons.fallback.synergies, [], 'fallback: no synergy icon without the pack');
assert.deepEqual(talents.fallback.headers, [], 'fallback: no branch emblem without the pack');
assert.equal(talents.fallback.letters, 14, 'fallback: the node letters are back');
assert.deepEqual(talents.fallback.badges, [], 'fallback: no number badges without the pack');
assert.deepEqual(talents.fallback.errors, [], 'fallback: talent screen without page errors');

for (const tag of VIEWPORTS) {
  const { hud, offer, cards, pause, errors } = icons[tag];
  assert.deepEqual(errors, [], `${tag}: no page errors`);
  assert.deepEqual(
    hud.icons,
    ['ground_slam', 'whirlwind'].map((id) => `/assets/icons/skills/${id}.webp`),
    `${tag}: HUD active skills use the pack icons`,
  );
  assert.equal(hud.glyphs, 0, `${tag}: no glyph left on the HUD`);
  assert.equal(hud.size, 44, `${tag}: HUD icon size (desktop 44 / Task 16 touch 44)`);
  assert.ok(
    offer.icons.length >= 1 && offer.icons.length + offer.glyphs === cards,
    `${tag}: offer cards`,
  );
  assert.ok(
    offer.icons.every((p) => p.startsWith('/assets/icons/skills/')),
    `${tag}: offer icons`,
  );
  assert.equal(offer.size, tag === 'phone' ? 64 : 96, `${tag}: card icon size (compact on phones)`);
  assert.ok(pause.icons.length >= 2 && pause.glyphs === 0, `${tag}: pause skill list icons`);
  assert.equal(pause.size, 32, `${tag}: pause list icon size`);
  assert.equal(hud.scroll || offer.scroll || pause.scroll, false, `${tag}: no horizontal scroll`);
}
assert.deepEqual(icons.fallback.hud.icons, [], 'fallback: no skill icon without the pack');
assert.equal(icons.fallback.hud.glyphs, 2, 'fallback: the HUD glyphs are back');
assert.equal(icons.fallback.offer.glyphs, icons.fallback.cards, 'fallback: offer glyphs');
assert.deepEqual(icons.fallback.errors, [], 'fallback: no page errors');

const CLASSES = ['archer', 'mage', 'rogue', 'warrior'];
for (const tag of VIEWPORTS) {
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
for (const tag of VIEWPORTS)
  assert.deepEqual(
    shots[tag].badges,
    ['/assets/pickups/coin.webp', '/assets/pickups/ore.webp'],
    `${tag}: Gold / Ore badges with the pack icons`,
  );
assert.deepEqual(shots.fallback.badges, ['svg', 'svg'], 'fallback: Gold / Ore SVG icons');

assert.equal(art.artLooks, 17, 'all 13 unit + 4 pickup looks drawn with the owner art');
assert.equal(procedural.artLooks, 0, 'no manifest: every look stays procedural');
// Task 26: map 25 (act III) tiles the ashlands ground (tinted per map); procedural without art.
assert.equal(art.artGround, 'art:ground_ashlands~map25', 'act III ground art in use');
assert.equal(procedural.artGround, null, 'no manifest: procedural ground');
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
  'PASS art: same seed ⇒ identical simulation with art on / off (24 steps, map 25, every enemy type, thief, nest); 13 unit + 4 pickup looks from the packs; no missing-texture warnings; procedural fallback without the manifest; act ground art (identical simulation with it); class portraits on character select + hub (desktop and phone, no horizontal scroll), emblems as the fallback; Gold / Ore badge icons (SVG fallback); skill icons on the HUD, offer cards and pause list (desktop and phone sizes, glyph fallback); synergy icons in the pause list and talent branch emblems on headers and nodes (desktop and phone, current look without the pack).',
);
