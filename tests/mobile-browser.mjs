import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { brand, goTo, sections, startMap } from './e2e-nav.mjs';

/**
 * Task 16 mobile e2e (Chromium device emulation with touch): touch joystick moves the hero, the
 * dash button dashes (same as Space), multi-touch keeps the joystick while tapping dash.
 * Needs a dev server (`/?debug`). CHROMIUM_PATH / GAME_URL as the other browser tests.
 */
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
});
const errors = [];

async function open(viewport) {
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  const cdp = await context.newCDPSession(page);
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (a) => page.evaluate((x) => window.__alpha.command(x), a);
  const advance = (s) => page.evaluate((x) => window.__alpha.advance(x), s);
  /** Raw multi-touch through CDP (each point: {x, y, id}). */
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4 })),
    });
  return { context, page, state, command, advance, touch };
}

// ── Phase 1: touch input on a landscape phone ──
{
  const { context, page, state, command, advance, touch } = await open({ width: 844, height: 390 });
  await command({
    type: 'restart',
    options: {
      characterClass: 'mage',
      level: 10,
      initialEnemies: false,
      spawning: { enabled: false },
    },
  });
  await command({ type: 'protection', enabled: true });
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  // The debug overlay (debug builds only) covers the joystick zone: collapse it.
  await page.getByRole('button', { name: 'Hide' }).click(); // lazy-loaded: wait for it
  const canvas = await page.locator('.game-canvas canvas').boundingBox();
  // Joystick: touch the left half, drag 80 px right (full speed), hold.
  const visibleBottom = Math.min(canvas.y + canvas.height, page.viewportSize().height);
  const ox = canvas.x + 150,
    oy = canvas.y + (visibleBottom - canvas.y) * 0.8;
  const start = (await state()).world.playerBody.x;
  await touch('touchStart', [{ x: ox, y: oy, id: 1 }]);
  await touch('touchMove', [{ x: ox + 80, y: oy, id: 1 }]);
  await page.waitForTimeout(60);
  await advance(1);
  const moved = (await state()).world.playerBody.x - start;
  assert.ok(moved > 100, `joystick moved the hero right (${moved})`);
  // Multi-touch: tap the dash button with a second finger while the joystick is held.
  const dash = page.locator('.touch-dash');
  await dash.waitFor();
  const box = await dash.boundingBox();
  assert.ok(box.width >= 72 && box.height >= 72, 'dash button ≥ 72 px');
  assert.ok(box.x + box.width > canvas.x + canvas.width * 0.6, 'dash button on the right');
  const before = (await state()).world.dash.used;
  await touch('touchStart', [
    { x: ox + 80, y: oy, id: 1 },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 },
  ]);
  // CDP touchEnd lists the points being released: lift only the dash finger.
  await touch('touchEnd', [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 }]);
  await page.waitForTimeout(60);
  await advance(0.3);
  let s = await state();
  assert.equal(s.world.dash.used, before + 1, 'dash button = one dash');
  // The joystick finger is still down: the hero keeps moving after the dash tap.
  const x1 = s.world.playerBody.x;
  await advance(0.5);
  assert.ok((await state()).world.playerBody.x > x1 + 40, 'joystick kept working during the tap');
  await touch('touchEnd', [{ x: ox + 80, y: oy, id: 1 }]);
  await page.waitForTimeout(60);
  await advance(0.3);
  const x2 = (await state()).world.playerBody.x;
  await advance(0.5);
  assert.equal((await state()).world.playerBody.x, x2, 'released joystick stops the hero');
  // Dash button and Space give the same dash (distance and cooldown).
  await command({ type: 'dash-cooldown', seconds: 0 });
  const k0 = (await state()).world.playerBody.x;
  await page.keyboard.press('Space');
  await page.waitForTimeout(60);
  await advance(0.3);
  const byKey = (await state()).world.playerBody.x - k0;
  const b0 = (await state()).world.playerBody.x;
  await dash.tap();
  await page.waitForTimeout(60);
  await advance(0.3);
  const byButton = (await state()).world.playerBody.x - b0;
  assert.ok(Math.abs(byKey - byButton) < 1e-6, `same dash distance (${byKey} vs ${byButton})`);
  await context.close();
}

// ── Task 22 review fix: left-handed — the active skill row stays clear of the dash button ──
for (const viewport of [
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
]) {
  const { context, page, command } = await open(viewport);
  await page.evaluate(() =>
    localStorage.setItem('skazki.settings', JSON.stringify({ leftHanded: true })),
  );
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  await command({
    type: 'restart',
    options: {
      characterClass: 'warrior',
      level: 10,
      initialEnemies: false,
      spawning: { enabled: false },
    },
  });
  await command({ type: 'protection', enabled: true });
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  for (const skillId of ['shield_bash', 'cleave', 'whirlwind', 'ground_slam'])
    await command({ type: 'grant-skill', skillId, rank: 1 });
  const skills = page.locator('.active-skills');
  await skills.waitFor();
  const dash = page.locator('.touch-dash');
  await dash.waitFor();
  const a = await skills.boundingBox(),
    b = await dash.boundingBox();
  const overlap =
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  assert.ok(
    !overlap,
    `${viewport.width}×${viewport.height} left-handed: skill row ${JSON.stringify(a)} overlaps the dash button ${JSON.stringify(b)}`,
  );
  await context.close();
}

// ── Phase 2: a whole run and every menu screen, landscape phone and tablet ──
const MENU_PAGES = [
  'Home',
  'Hero',
  'Equipment',
  'Talents',
  'Shop',
  'Forge',
  'Campaign map',
  'Progress',
  'Settings',
];
async function noHorizontalScroll(page, where) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(over <= 0, `${where}: no horizontal page scroll (${over})`);
}
async function tapTarget(locator, what) {
  const box = await locator.boundingBox();
  assert.ok(
    box && box.height >= 44 && box.width >= 44,
    `${what} is a ≥ 44 px tap target (${JSON.stringify(box)})`,
  );
  return box;
}
for (const viewport of [
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
]) {
  const tag = `${viewport.width}×${viewport.height}`;
  const { context, page, state, command, advance, touch } = await open(viewport);
  // Start a map from the hub (Task 45: tap «To battle», then the map's «Play» button).
  await tapTarget(page.locator('.hub-fight'), `${tag} hub «To battle»`);
  await startMap(page, undefined, 'tap');
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  await command({ type: 'protection', enabled: true });
  await page.getByRole('button', { name: 'Hide' }).click();
  await noHorizontalScroll(page, `${tag} run`);
  // The arena fills the viewport (no outer header/footer on phones).
  const canvas = await page.locator('.game-canvas canvas').boundingBox();
  assert.ok(canvas.y + canvas.height <= viewport.height + 1, `${tag}: arena fits the screen`);
  // Move with the joystick.
  const ox = canvas.x + Math.min(160, canvas.width * 0.2),
    oy = canvas.y + canvas.height * 0.75;
  const x0 = (await state()).world.playerBody.x;
  await touch('touchStart', [{ x: ox, y: oy, id: 1 }]);
  await touch('touchMove', [{ x: ox + 70, y: oy, id: 1 }]);
  await page.waitForTimeout(80);
  await advance(0.6);
  await touch('touchEnd', [{ x: ox + 70, y: oy, id: 1 }]);
  await page.waitForTimeout(80);
  assert.ok((await state()).world.playerBody.x > x0 + 50, `${tag}: joystick moves`);
  // Dash with the button.
  const dash = page.locator('.touch-dash');
  await tapTarget(dash, `${tag} dash button`);
  const used = (await state()).world.dash.used;
  await dash.tap();
  await page.waitForTimeout(80);
  await advance(0.3);
  assert.equal((await state()).world.dash.used, used + 1, `${tag}: dash button dashes`);
  // Pick a level-up card by tapping it; the controls are tap targets.
  await command({ type: 'grant-xp', amount: 20 });
  await page.waitForFunction(() => window.__alpha.state().screen === 'level-up');
  await tapTarget(page.getByRole('button', { name: /^Reroll/ }), `${tag} reroll`);
  const card = page.locator('.upgrade-grid .skill-card').first();
  await card.scrollIntoViewIfNeeded();
  await tapTarget(card, `${tag} card`);
  await card.tap();
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  assert.equal((await state()).world.skills.pendingChoices, 0, `${tag}: card picked`);
  // Pause button is a tap target.
  await tapTarget(page.getByRole('button', { name: 'Pause', exact: true }), `${tag} pause`);
  // Finish via debug → results → back to the menu.
  await command({ type: 'campaign-force', outcome: 'victory' });
  await page.waitForFunction(() => window.__alpha.state().screen === 'results');
  await noHorizontalScroll(page, `${tag} results`);
  for (const name of ['Again →', 'To menu']) {
    const button = page.locator('.results-actions').getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await tapTarget(button, `${tag} results «${name}»`);
  }
  await page.locator('.results-actions').getByRole('button', { name: 'To menu' }).tap();
  await page.waitForFunction(() => window.__alpha.state().screen === 'menu');
  // Menus: every screen opens from its hub tile without horizontal scroll; tiles, the title and
  // «← Home» are tap targets (Task 45: no top nav).
  await tapTarget(brand(page), `${tag} title`);
  for (const name of MENU_PAGES) {
    if (name !== 'Home') {
      await goTo(page, 'Home', 'tap');
      const tile = sections(page).getByRole('button', { name, exact: true });
      await tile.scrollIntoViewIfNeeded();
      await tapTarget(tile, `${tag} tile «${name}»`);
    }
    await goTo(page, name, 'tap');
    await page.waitForTimeout(150);
    if (name !== 'Home')
      await tapTarget(page.getByRole('button', { name: '← Home', exact: true }), `${tag} «← Home»`);
    await noHorizontalScroll(page, `${tag} ${name}`);
  }
  // Task 40: equip by touch — own a Common helmet instance (item level 1), select it, «Equip».
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('skazki.profile'));
    const uid = `i${p.nextItemNumber}`;
    p.items = [...p.items, { uid, slot: 'helmet', itemLevel: 1, rarity: 'common', affixes: [] }];
    p.nextItemNumber += 1;
    localStorage.setItem('skazki.profile', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  // Task 41: the Bag — tap the item, tap «Equip» on its card, then the slot row shows it.
  // (Mobile is frozen: on a phone the card sits under the bag, so it is scrolled into view.)
  await goTo(page, 'Equipment', 'tap');
  const helmCard = page.getByRole('button', { name: /^Hunter's Hood, L1/ });
  await helmCard.scrollIntoViewIfNeeded();
  await helmCard.tap();
  const equipBtn = page
    .getByRole('group', { name: 'Item card' })
    .getByRole('button', { name: 'Equip' });
  await equipBtn.scrollIntoViewIfNeeded();
  await tapTarget(equipBtn, `${tag} «Equip»`);
  await equipBtn.tap();
  const helmSlot = page.getByRole('button', { name: "Helmet +0: Hunter's Hood" });
  await helmSlot.scrollIntoViewIfNeeded();
  await helmSlot.tap();
  await noHorizontalScroll(page, `${tag} bag`);
  // Task 20: pets by touch — shop tab (buy with confirmation), «Pets» page (activate), forge pet
  // tab (upgrade), then a run starts with the pet.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('skazki.profile'));
    p.gold += 2000;
    p.ore += 10;
    // Task 21: maps 1–4 won → the next run is map 5 (its quest completes with that win).
    p.completedMaps = [1, 2, 3, 4];
    p.highestUnlockedMap = 5;
    localStorage.setItem('skazki.profile', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__alpha);
  await goTo(page, 'Shop', 'tap');
  const petsTab = page.getByRole('group', { name: 'Shop slots' }).getByRole('button', {
    name: 'Pets',
  });
  await petsTab.scrollIntoViewIfNeeded();
  await tapTarget(petsTab, `${tag} shop pets tab`);
  // The DEV toggle (debug builds only) overlaps this tab at 844×390: press it through the DOM.
  await petsTab.evaluate((el) => el.click());
  const owletCard = page.getByRole('group', { name: 'Hoot the Owlet' });
  const buy = owletCard.getByRole('button', { name: /Buy/ });
  await buy.scrollIntoViewIfNeeded();
  await tapTarget(buy, `${tag} buy pet`);
  // Quest pets cannot be bought.
  assert.equal(
    await page
      .getByRole('group', { name: 'Glimmer the Firefly' })
      .getByRole('button', { name: /Buy/ })
      .count(),
    0,
    `${tag}: quest pet not for sale`,
  );
  await buy.tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).tap();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('skazki.profile')).ownedPets.includes('owlet'),
  );
  await noHorizontalScroll(page, `${tag} shop pets`);
  // «Pets» page from the hub tile: make the owlet the active pet.
  await goTo(page, 'Home', 'tap');
  const tile = page.locator('.hub-tile', { hasText: 'A companion on every run' }); // «Forge» mentions pets too
  await tile.scrollIntoViewIfNeeded();
  await tile.tap();
  const choose = page.getByRole('group', { name: 'Hoot the Owlet' }).getByRole('button', {
    name: 'Take on runs',
  });
  await choose.scrollIntoViewIfNeeded();
  await tapTarget(choose, `${tag} activate pet`);
  await choose.tap();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('skazki.profile')).activePet === 'owlet',
  );
  await noHorizontalScroll(page, `${tag} pets page`);
  // Forge (pets only since Task 40) → upgrade to level 2 (500 Gold, 10 ore).
  await goTo(page, 'Forge', 'tap');
  const upPet = page.getByRole('button', { name: /Upgrade to level 2/ });
  await upPet.scrollIntoViewIfNeeded();
  await tapTarget(upPet, `${tag} upgrade pet`);
  const beforePet = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  await upPet.tap();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('skazki.profile')).petLevels.owlet === 2,
  );
  const afterPet = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(afterPet.gold, beforePet.gold - 500, `${tag}: pet upgrade Gold`);
  assert.equal(afterPet.ore, beforePet.ore - 10, `${tag}: pet upgrade ore`);
  await noHorizontalScroll(page, `${tag} forge pets`);
  // A run brings the active pet (any class).
  await goTo(page, 'Home', 'tap');
  await startMap(page, undefined, 'tap');
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  assert.deepEqual(
    await page.evaluate(() => {
      const p = window.__alpha.state().world.pet;
      return p && [p.id, p.level];
    }),
    ['owlet', 2],
    `${tag}: the run starts with the active pet`,
  );
  await page.locator('.pet-hud').waitFor();
  // Task 21: winning map 5 completes «Win on map 5» → results toast, hub badge, claim by tap.
  await command({ type: 'campaign-force', outcome: 'victory' });
  await page.waitForFunction(() => window.__alpha.state().screen === 'results');
  const toast = page.locator('.results-quests');
  await toast.waitFor();
  assert.match(await toast.innerText(), /Win on map 5/, `${tag}: quest toast`);
  await page.locator('.results-actions').getByRole('button', { name: 'To menu' }).tap();
  await page.waitForFunction(() => window.__alpha.state().screen === 'menu');
  await goTo(page, 'Home', 'tap');
  const questsTile = page.locator('.hub-tile', { hasText: 'Quests' });
  await questsTile.scrollIntoViewIfNeeded();
  assert.ok(
    Number(await questsTile.locator('.hub-badge').innerText()) >= 1,
    `${tag}: hub badge counts claimable quests`,
  );
  await questsTile.tap();
  const map5 = page.getByRole('group', { name: /^Win on map 5/ });
  const claimButton = map5.getByRole('button', { name: 'Claim' });
  await claimButton.scrollIntoViewIfNeeded();
  await tapTarget(claimButton, `${tag} claim quest`);
  const beforeClaim = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  await claimButton.tap();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('skazki.profile')).questsClaimed.includes('campaign.map5'),
  );
  const afterClaim = await page.evaluate(() => JSON.parse(localStorage.getItem('skazki.profile')));
  assert.equal(afterClaim.gold, beforeClaim.gold + 240, `${tag}: quest Gold`); // Task 40: 300 × 0.8
  assert.equal(afterClaim.ore, beforeClaim.ore + 10, `${tag}: quest ore`);
  await map5.getByText('Claimed').waitFor();
  await noHorizontalScroll(page, `${tag} quests`);
  await context.close();
}

await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log(
  'PASS mobile: touch joystick, dash button (= Space), multi-touch; 844×390 and 768×1024: run from the hub, move, dash, pick a card, results, all menu screens without horizontal scroll, tap targets ≥ 44 px; Task 45 Equipment: equip an item instance by touch, hub tiles + «← Home»; Task 20 pets (buy, activate, upgrade, run with the pet) by touch; Task 21 quest toast, hub badge, claim by touch.',
);
