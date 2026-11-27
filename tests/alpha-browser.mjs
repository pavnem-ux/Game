import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { EXTENDED, screenshot } from './e2e-options.mjs';
import { startMap } from './e2e-nav.mjs';
const base = process.env.GAME_URL || 'http://127.0.0.1:5173';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/?debug');
  await page.waitForFunction(() => !!window.__alpha);
  await page.getByRole('heading', { name: 'The Last Light', level: 1 }).waitFor(); // Task 13 hub
  await screenshot(page, { path: 'artifacts/alpha-01-selection.png' });
  await page.getByRole('button', { name: 'Warrior Sword', exact: false }).click();
  await startMap(page);
  await page.waitForFunction(() => window.__alpha.state().screen === 'playing');
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (action) => page.evaluate((a) => window.__alpha.command(a), action);
  let s = await state();
  assert.equal(s.world.character.characterClass, 'warrior');
  assert.ok(s.world.enemies.some((e) => e.config.behavior === 'melee'));
  assert.ok(s.world.enemies.some((e) => e.config.behavior === 'ranged'));
  const before = s.world.playerBody.x;
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  assert.ok((await state()).world.playerBody.x > before + 30, 'WASD moves integrated player');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await state();
  await page.waitForTimeout(200);
  assert.equal((await state()).world.time, paused.world.time);
  await page.keyboard.press('p');
  assert.equal((await state()).screen, 'playing');
  // Regression: keys pressed in the same frame as P/Esc must not replay the pause toggle
  // (Phaser re-scans its key queue on every key event until the next game step).
  const sameFrame = await page.evaluate(() => {
    const key = (type, key, code, keyCode) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key, code, keyCode, bubbles: true }));
    const screens = [];
    key('keydown', 'Escape', 'Escape', 27);
    key('keyup', 'Escape', 'Escape', 27);
    screens.push(window.__alpha.state().screen);
    for (const [k, code, keyCode] of [
      ['d', 'KeyD', 68],
      ['w', 'KeyW', 87],
    ]) {
      key('keydown', k, code, keyCode);
      screens.push(window.__alpha.state().screen);
      key('keyup', k, code, keyCode);
      screens.push(window.__alpha.state().screen);
    }
    key('keydown', 'Escape', 'Escape', 27);
    key('keyup', 'Escape', 'Escape', 27);
    screens.push(window.__alpha.state().screen);
    return screens;
  });
  assert.deepEqual(sameFrame, ['paused', 'paused', 'paused', 'paused', 'paused', 'playing']);
  // The normal hidden-page auto-pause is unchanged.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  assert.equal((await state()).screen, 'paused', 'hidden document pauses the alpha');
  await page.keyboard.press('p');
  assert.equal((await state()).screen, 'playing');
  await command({ type: 'protection', enabled: true });
  await command({ type: 'spawn', kind: 'melee', distance: 35 });
  await page.evaluate(() => window.__alpha.advance(1));
  assert.ok(
    (await state()).events.some(
      (e) => e.channel === 'combat' && e.event.type === 'damage' && e.event.targetId !== 'player',
    ),
    'actual sword damage',
  );
  await screenshot(page, { path: 'artifacts/alpha-02-warrior.png' });
  // Test the interactive panel, not only the automation bridge.
  await page.getByRole('button', { name: 'DEV · Testing' }).click();
  await page.getByRole('complementary', { name: 'Developer Testing Mode' }).waitFor();
  await page.getByLabel('DEV class').selectOption('mage');
  await page.getByLabel('DEV level').fill('7');
  await page.getByRole('button', { name: 'Start / repeat configuration' }).click();
  await page.waitForFunction(
    () => window.__alpha.state().world.character.characterClass === 'mage',
  );
  assert.equal((await state()).world.character.permanentLevel, 7);
  await command({ type: 'protection', enabled: true });
  await page.waitForFunction(() => window.__alpha.state().world.playerProjectiles.length > 0);
  assert.equal((await state()).world.weapon.weapon.category, 'staff');
  await screenshot(page, { path: 'artifacts/alpha-03-developer.png' });
  await page.getByRole('button', { name: 'DEV · Close' }).click();
  // Measured status cap/timers in the real loop; ordinary test protection disabled for effects.
  await command({ type: 'protection', enabled: false });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await command({
    type: 'effect',
    targetId: 'player',
    effectType: 'poison',
    stacks: 12,
    damage: 1,
    duration: 6,
  });
  s = await state();
  assert.equal(s.world.statuses.find((g) => g.targetId === 'player').stacks.length, 10);
  const runId = s.runId,
    positions = s.world.enemies.map((e) => ({ id: e.entityId, position: e.position })),
    projectiles = s.world.enemyProjectiles;
  await command({ type: 'death' });
  await page.getByRole('button', { name: 'Revive' }).waitFor();
  const dead = await state();
  await page.waitForTimeout(250);
  assert.equal((await state()).world.time, dead.world.time);
  assert.deepEqual((await state()).world.enemyProjectiles, projectiles);
  await screenshot(page, { path: 'artifacts/alpha-04-death-choice.png' });
  await page.getByRole('button', { name: 'Revive' }).click();
  s = await state();
  assert.equal(s.runId, runId);
  assert.equal(s.world.survival.revivalUsed, true);
  assert.ok(s.world.player.currentHp <= s.world.player.maxHp / 2);
  assert.ok(s.world.player.currentHp > 0);
  assert.ok(s.world.survival.fullyProtected);
  for (const previous of positions) {
    const current = s.world.enemies.find((e) => e.entityId === previous.id);
    if (current)
      assert.ok(
        Math.hypot(
          current.position.x - previous.position.x,
          current.position.y - previous.position.y,
        ) <=
          101 * (s.world.time - dead.world.time) + 1e-7,
        'revival preserves positions before ordinary resumed movement',
      );
  }
  assert.ok(s.world.statuses.every((g) => g.targetId !== 'player'));
  await screenshot(page, { path: 'artifacts/alpha-05-revival.png' });
  await command({ type: 'death' });
  await page.getByRole('heading', { name: 'The spark has faded.' }).waitFor();
  assert.equal((await state()).world.survival.runState, 'ended');
  await screenshot(page, { path: 'artifacts/alpha-06-ended.png' });
  for (const [characterClass, category] of [
    ['archer', 'bow'],
    ['rogue', 'dual_daggers'],
  ]) {
    await command({ type: 'restart', options: { characterClass, initialEnemies: false } });
    await command({ type: 'spawn', kind: 'melee', distance: 35 });
    await page.evaluate(() => window.__alpha.advance(0.5));
    s = await state();
    assert.equal(s.world.weapon.weapon.category, category);
    assert.ok(
      s.events.some(
        (e) => e.channel === 'combat' && e.event.type === 'damage' && e.event.targetId !== 'player',
      ),
    );
    if (characterClass === 'rogue')
      assert.ok(
        s.events.filter((e) => e.event.type === 'attack-started').length >= 2,
        'both dagger strikes',
      );
  }
  // Real enemy deaths drop persistent crystals; collect them by moving, without granting XP.
  // Task 12: the pickup radius is 74, so the kills happen at range (archer, enemies far away)
  // and the crystals stay outside the pickup reach until the player walks to them.
  await command({
    type: 'restart',
    options: {
      characterClass: 'archer',
      level: 50,
      initialEnemies: false,
      spawning: { enabled: false },
    },
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await command({ type: 'group', count: 2, distance: 250 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.evaluate(() => window.__alpha.advance(1));
  s = await state();
  assert.ok(s.world.crystals.length > 0, 'real death crystals remain in the world');
  const permanent = s.world.character.permanentLevel,
    maxHp = s.world.player.maxHp;
  // Walk to real crystals with simulated input, exercising the same pickup API as normal play.
  for (let i = 0; i < 100; i++) {
    s = await state();
    if (s.world.progression.totalXp >= 20) break;
    const crystal = s.world.crystals[0];
    if (!crystal) {
      await page.evaluate(() => window.__alpha.advance(0.1));
      continue;
    }
    const dx = crystal.x - s.world.playerBody.x,
      dy = crystal.y - s.world.playerBody.y;
    const keys = [];
    if (Math.abs(dx) > 8) keys.push(dx > 0 ? 'd' : 'a');
    if (Math.abs(dy) > 8) keys.push(dy > 0 ? 's' : 'w');
    for (const key of keys) await page.keyboard.down(key);
    // Let the scene sample the held keys before stepping (input is read on its frame).
    await page.waitForTimeout(40);
    await page.evaluate(() => window.__alpha.advance(0.1));
    for (const key of keys) await page.keyboard.up(key);
  }
  s = await state();
  assert.ok(s.world.progression.level >= 2, 'collectible XP raises only run level');
  assert.equal(s.world.character.permanentLevel, permanent);
  assert.equal(s.world.player.maxHp, maxHp);
  await page.getByRole('progressbar', { name: 'Run XP' }).waitFor();
  await screenshot(page, { path: 'artifacts/alpha-10-xp.png' });
  await page.getByRole('button', { name: 'DEV · Testing' }).click();
  await page.getByLabel('DEV XP').fill('20');
  const totalBefore = (await state()).world.progression.totalXp;
  await page.getByRole('button', { name: 'Grant XP', exact: true }).click();
  assert.ok(
    (await state()).world.progression.totalXp >= totalBefore + 20,
    'interactive DEV XP control',
  );
  await page.getByRole('button', { name: 'DEV · Close' }).click();
  await command({
    type: 'restart',
    options: {
      characterClass: 'mage',
      initialEnemies: false,
      spawning: { interval: 1, minimumInterval: 1, count: 3, maximumCount: 3, maxActive: 6 },
    },
  });
  await command({ type: 'protection', enabled: true });
  await page.evaluate(() => window.__alpha.advance(1));
  s = await state();
  assert.equal(s.world.enemies.length, 3);
  const view = s.world.spawning.viewport;
  for (const e of s.world.enemies)
    assert.ok(
      Math.abs(e.position.x - s.world.playerBody.x) >= view.width / 2 ||
        Math.abs(e.position.y - s.world.playerBody.y) >= view.height / 2,
      'new wave spawns off screen',
    );
  await page.evaluate(() => window.__alpha.advance(2));
  s = await state();
  assert.equal(s.world.spawning.waves, 3);
  assert.ok(s.world.enemies.length <= 6);
  await screenshot(page, { path: 'artifacts/alpha-11-waves.png' });
  // Task 07: real level-up dialog, reroll and skill choice for every class.
  for (const characterClass of ['warrior', 'mage', 'archer', 'rogue']) {
    await command({
      type: 'restart',
      options: { characterClass, initialEnemies: false, spawning: { enabled: false } },
    });
    await command({ type: 'protection', enabled: true });
    await command({ type: 'grant-xp', amount: 20 });
    await page.getByRole('dialog', { name: /Run level 2/ }).waitFor();
    if (characterClass === 'warrior')
      await screenshot(page, { path: 'artifacts/alpha-12-level-up.png' });
    s = await state();
    assert.equal(s.screen, 'level-up');
    assert.equal(s.world.paused, true, 'level-up pauses the world');
    assert.equal(s.world.skills.offer.cards.length, 3);
    assert.ok(s.world.skills.offer.cards.every((c) => c.kind === 'skill' && c.isNew));
    const frozen = s.world.time;
    await page.evaluate(() => window.__alpha.advance(1));
    assert.equal((await state()).world.time, frozen, 'no simulation while choosing');
    await page.getByRole('button', { name: /Reroll · 3 left/ }).click();
    assert.equal((await state()).world.skills.rerolls, 2);
    const first = (await state()).world.skills.offer.cards[0];
    await page.getByRole('listitem', { name: new RegExp(first.name) }).click();
    s = await state();
    assert.equal(s.screen, 'playing');
    assert.equal(s.world.skills.owned[0].skillId, first.skillId);
    assert.equal(s.world.skills.owned[0].rank, 1);
    await page.getByLabel('Run skills').waitFor();
    if (characterClass === 'mage') {
      await command({ type: 'grant-skill', skillId: 'frost_nova', rank: 5 });
      await command({ type: 'group', count: 6, distance: 90 });
      await page.evaluate(() => window.__alpha.advance(1.5));
      s = await state();
      assert.ok(
        s.events.some((e) => e.channel === 'skill' && e.event.type === 'skill-activated'),
        'automatic skill activates without input',
      );
      await screenshot(page, { path: 'artifacts/alpha-12-skills.png' });
    }
  }
  // Task 14: «Banish» and «Skip» with counters; disabled with a reason.
  // Task 22: the R / B / S / 1–3 shortcuts were removed — pressing them changes nothing.
  await command({
    type: 'restart',
    options: { characterClass: 'mage', initialEnemies: false, spawning: { enabled: false } },
  });
  await command({ type: 'protection', enabled: true });
  await command({ type: 'grant-xp', amount: 92 }); // three levels: 20 + 30 + 42
  const offerDialog = page.getByRole('dialog', { name: /Run level/ });
  await offerDialog.waitFor();
  const controls = page.getByRole('group', { name: 'Choice controls' });
  assert.ok(await controls.getByRole('button', { name: 'Banish · 2 left' }).isEnabled());
  const untouched = (await state()).world.skills;
  for (const key of ['r', 'b', 's', '1', '2', '3', 'R', 'B', 'S']) await page.keyboard.press(key);
  await page.waitForTimeout(80);
  assert.deepEqual((await state()).world.skills, untouched, 'offer hotkeys do nothing');
  assert.equal((await state()).screen, 'level-up');
  assert.equal(await offerDialog.getByText(/R — reroll/).count(), 0, 'no hotkey hint');
  assert.equal(
    await offerDialog.getByRole('button', { name: /Skills|Skills overview/ }).count(),
    0,
  );
  const offered = (await state()).world.skills.offer.cards.map((c) => c.skillId);
  const cardsOnOffer = page.locator('.upgrade-grid .skill-card');
  await controls.getByRole('button', { name: 'Banish · 2 left' }).click();
  assert.equal(
    await controls.getByRole('button', { name: 'Cancel banish' }).getAttribute('aria-pressed'),
    'true',
  );
  await cardsOnOffer.nth(1).click();
  s = await state();
  assert.deepEqual(s.world.skills.banished, [offered[1]]);
  assert.equal(s.world.skills.banishes, 1);
  assert.ok(!s.world.skills.offer.cards.some((c) => c.skillId === offered[1]));
  assert.equal(s.screen, 'level-up', 'banishing keeps the offer open');
  await controls.getByRole('button', { name: /Skip/ }).click();
  s = await state();
  assert.equal(s.world.skills.skips, 1);
  assert.equal(s.world.skills.pendingChoices, 2);
  await controls.getByRole('button', { name: 'Banish · 1 left' }).click();
  await cardsOnOffer.first().click();
  const noBanish = controls.getByRole('button', { name: 'Banish · 0 left' });
  assert.equal(await noBanish.isDisabled(), true);
  assert.equal(await noBanish.getAttribute('title'), 'No banishes left');
  assert.equal((await state()).world.runStats.choices.banishes, 2);
  await cardsOnOffer.first().click();
  await page.waitForFunction(() => window.__alpha.state().world.skills.pendingChoices < 2);
  if ((await state()).screen === 'level-up') await cardsOnOffer.first().click();
  assert.equal((await state()).screen, 'playing');
  // Two picks (the second may upgrade the first skill): ranks sum to 2, nothing pending.
  s = await state();
  assert.equal(s.world.skills.pendingChoices, 0);
  assert.equal(
    s.world.skills.owned.reduce((sum, o) => sum + o.rank, 0),
    2,
  );

  // Task 14: Space dashes (140 units, cooldown shown in the skill bar); Shift on cooldown does not.
  // With no input the dash follows the player's facing. The no-op hotkey check above presses `s`
  // (also «move down»): when a frame sampled it, the facing was left pointing down and the dash went
  // down instead of right (the intermittent failure since Task 25). Face right first, deterministically.
  const beforeFacing = (await state()).world.playerBody.x;
  await page.keyboard.down('d');
  // The player has moved right ⇒ the world sampled the input and the facing is right.
  await page.waitForFunction((x) => window.__alpha.state().world.playerBody.x > x, beforeFacing);
  await page.keyboard.up('d');
  await page.waitForFunction(() => window.__alpha.state().world.movement.x === 0);
  const dashStart = (await state()).world.playerBody.x;
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__alpha.advance(0.3));
  s = await state();
  assert.equal(s.world.dash.used, 1);
  assert.ok(
    s.world.playerBody.x - dashStart >= 139,
    // The state is in the message: this check failed intermittently in the full e2e chain
    // (Task 25, not reproduced standalone) — the next failure should show why.
    `dash moved the player ~140 units ${JSON.stringify({
      moved: s.world.playerBody.x - dashStart,
      start: dashStart,
      player: s.world.playerBody,
      dash: s.world.dash,
      movement: s.world.movement,
      time: s.world.time,
      paused: s.world.paused,
      screen: s.screen,
    })}`,
  );
  await page.getByLabel(/^Dash: \d+\.\d s$/).waitFor();
  await page.keyboard.press('Shift');
  await page.evaluate(() => window.__alpha.advance(0.1));
  assert.equal((await state()).world.dash.used, 1, 'no dash on cooldown');
  // Task 14 sound: the dash cue reaches the audio log; automation keeps it silent (no AudioContext).
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="debug-audio-log"] li')].some(
      (li) => li.textContent.startsWith('dash') && li.textContent.endsWith('silent'),
    ),
  );
  // Task 14 §1.4 DEV tools: grant rerolls/banishes and the dash cooldown override.
  const choicesBefore = (await state()).world.skills;
  await page.getByRole('button', { name: 'DEV · Testing' }).click();
  await page.getByRole('button', { name: '+3 rerolls, +2 banishes' }).click();
  await page.getByRole('button', { name: 'Dash without cooldown' }).click();
  await page.getByRole('button', { name: 'DEV · Close' }).click();
  await page.evaluate(() => window.__alpha.advance(0.05));
  s = await state();
  assert.equal(s.world.skills.rerolls, choicesBefore.rerolls + 3);
  assert.equal(s.world.skills.banishes, choicesBefore.banishes + 2);
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__alpha.advance(0.3));
  assert.equal((await state()).world.dash.used, 2, 'no cooldown with the DEV override');
  await command({ type: 'dash-cooldown', seconds: null });

  // Task 15: synergy levels. Fireball + Frost Nova is a Thermal Shock pair (catalog v3).
  await command({ type: 'restart', options: { characterClass: 'mage', initialEnemies: false } });
  await command({ type: 'protection', enabled: true });
  await command({ type: 'grant-skill', skillId: 'fireball', rank: 3 });
  await command({ type: 'grant-skill', skillId: 'frost_nova', rank: 2 });
  await page.getByText('✦ Synergy unlocked: Thermal Shock · I').waitFor();
  await command({ type: 'grant-choices', rerolls: 12, banishes: 0 });
  await command({ type: 'grant-xp', amount: 20 });
  await page.waitForFunction(() => window.__alpha.state().screen === 'level-up');
  // Reroll until the offer holds the Frost Nova upgrade (the only card that raises the level).
  for (let i = 0; i < 12; i++) {
    const cards = (await state()).world.skills.offer.cards;
    if (cards.some((c) => c.kind === 'skill' && c.skillId === 'frost_nova')) break;
    await command({ type: 'reroll-skills' });
    await page.waitForTimeout(150);
  }
  const offerCards = (await state()).world.skills.offer.cards;
  assert.ok(
    offerCards.some((c) => c.skillId === 'frost_nova'),
    'offer holds the raising card',
  );
  const hints = page.getByTestId('card-level-hint');
  await hints.first().waitFor();
  assert.equal(await hints.count(), 1, 'the ▲ hint appears only on the card that raises a level');
  assert.equal(await hints.first().innerText(), '▲ Thermal Shock II');
  const raising = page.locator('.skill-card', { has: page.getByTestId('card-level-hint') });
  assert.match(await raising.getAttribute('aria-label'), /^Frost Nova, upgrade.*Thermal Shock II/);
  await raising.click();
  await page.getByText('▲ Thermal Shock · level II').waitFor();
  await command({ type: 'grant-skill', skillId: 'fireball', rank: 5 });
  await command({ type: 'grant-skill', skillId: 'frost_nova', rank: 5 });
  const awakening = page.locator('.synergy-banner.level-3');
  await awakening.waitFor();
  assert.match(await awakening.innerText(), /Awakening: Thermal Shock · III[\s\S]*Steam Blast/);
  assert.equal((await state()).world.synergyLevels.find((l) => l.id === 'thermal_shock').level, 3);
  // Task 15 §3.3 DEV/QA: level and best pair per synergy; force a level for testing.
  await page.getByRole('button', { name: 'DEV · Testing' }).click();
  await page.getByLabel('Synergy level Wildfire').selectOption('2');
  await page.waitForFunction(
    () => window.__alpha.state().world.synergyLevels.find((l) => l.id === 'wildfire').forced,
  );
  assert.match(
    await page.getByTestId('synergy-level-thermal_shock').innerText(),
    /III · best pair: fireball \+ frost_nova/,
  );
  assert.match(await page.getByTestId('synergy-level-wildfire').innerText(), /II \(set manually\)/);
  await page.getByRole('button', { name: 'DEV · Close' }).click();
  assert.deepEqual(
    (await state()).world.synergyLevels.find((l) => l.id === 'wildfire'),
    { id: 'wildfire', level: 2, pair: null, forced: true },
  );

  await command({ type: 'restart', options: { characterClass: 'mage', initialEnemies: false } });
  await command({ type: 'protection', enabled: true });
  for (let i = 0; i < 5; i++) await command({ type: 'group', count: 24, distance: 550 });
  const perf = await page.evaluate(async () => {
    let frames = 0;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        frames++;
        if (performance.now() - start > 1200) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return {
      frames,
      elapsed: performance.now() - start,
      enemies: window.__alpha.state().world.enemies.length,
    };
  });
  console.log('Alpha performance:', JSON.stringify(perf));
  await screenshot(page, { path: 'artifacts/alpha-07-group.png' });
  // Phone portrait notice + touch joystick: extended runs only (Task 29 mobile freeze).
  if (EXTENDED) {
    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    mobile.on('pageerror', (e) => errors.push(e.message));
    await mobile.goto(base + '/?debug');
    await mobile.waitForFunction(() => !!window.__alpha);
    await startMap(mobile);
    // Task 16: in portrait a phone shows «Rotate your device» and the run pauses.
    await mobile.getByText('Rotate your device').first().waitFor();
    await mobile.waitForFunction(() => window.__alpha.state().screen === 'paused');
    // Rotate to landscape (the play orientation), resume, collapse the debug overlay.
    await mobile.setViewportSize({ width: 844, height: 390 });
    await mobile.getByText('Rotate your device').first().waitFor({ state: 'detached' });
    await mobile.evaluate(() =>
      window.__alpha.command({ type: 'restart', options: { characterClass: 'warrior' } }),
    );
    await mobile.waitForFunction(() => window.__alpha.state().screen === 'playing');
    await mobile.getByRole('button', { name: 'Hide' }).click();
    const x0 = await mobile.evaluate(() => window.__alpha.state().world.playerBody.x);
    const canvas = await mobile.locator('canvas').boundingBox();
    const client = await mobile.context().newCDPSession(mobile);
    const x = canvas.x + 60,
      y = canvas.y + canvas.height * 0.65;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + 65, y }],
    });
    await mobile.waitForTimeout(300);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(
      await mobile.evaluate((before) => window.__alpha.state().world.playerBody.x > before, x0),
      'integrated touchscreen joystick',
    );
    await screenshot(mobile, { path: 'artifacts/alpha-08-mobile.png' });
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS alpha: class selection, all four weapons, both enemies, actual damage, WASD/joystick, interactive DEV, status cap, pause, same-world revival, second death, bounded enemy group, collectible death XP/run levels, DEV XP, continuous off-screen waves, level-up skill choice/reroll for all classes and automatic skills; no browser exceptions.',
  );
} finally {
  await browser.close();
}
