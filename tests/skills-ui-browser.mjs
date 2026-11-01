import assert from 'node:assert/strict';

const MAGE_CLASS_SKILLS = new Set([
  'fireball',
  'flame_burst',
  'inferno',
  'frost_nova',
  'ice_shards',
  'blizzard',
  'elemental_mastery',
]);

/**
 * Task 07.3: Pause shows Skills + Synergies immediately; level-up cards carry synergy hints.
 * The same interactions run against the compiled QA build at desktop and phone widths.
 */
export async function checkSkillsAccess(page) {
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (action) => page.evaluate((a) => window.__alpha.command(a), action);
  const screenIs = (screen) =>
    page.waitForFunction((s) => window.__alpha.state().screen === s, screen, { timeout: 2500 });
  for (const [width, height] of [
    [1200, 800],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await command({
      type: 'restart',
      options: { characterClass: 'mage', initialEnemies: false, spawning: { enabled: false } },
    });
    await command({ type: 'grant-skill', skillId: 'fireball', rank: 2 });

    // 1. Pause → Skills visible immediately, no extra click.
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await screenIs('paused');
    const paused = await state();
    const pauseDialog = page.getByRole('dialog', { name: 'Перевести дух.' });
    const skills = pauseDialog.getByRole('region', { name: 'Обзор навыков', exact: true });
    await skills.waitFor({ timeout: 2500 });
    const text = await skills.innerText();
    assert.ok(text.includes('Огненный шар'), 'acquired skill visible on pause');
    assert.ok(text.includes('Перезарядка') || text.includes('Готов'), 'cooldown state shown');
    assert.ok(text.includes('Свободных слотов: 3'), 'free automatic slots shown');
    assert.ok(text.includes('↻ 3'), 'rerolls shown');
    assert.equal(await skills.locator('.skill-empty-slot').count(), 9);
    assert.equal(
      await pauseDialog.getByRole('button', { name: 'Обзор навыков', exact: true }).count(),
      0,
      'no redundant Skills button on the Pause screen',
    );
    // 2. Synergies section from the authoritative rules.
    const synergies = skills.getByRole('region', { name: 'Синергии', exact: true });
    assert.equal(await synergies.locator('.synergy-entry').count(), 3);
    const wildfire = synergies.locator('[data-synergy-id="wildfire"]');
    const thermal = synergies.locator('[data-synergy-id="thermal_shock"]');
    assert.match(await wildfire.getAttribute('class'), /is-available/);
    assert.match(await thermal.getAttribute('class'), /is-locked/);
    assert.match(await thermal.innerText(), /Не хватает: ледяной навык/);
    assert.match(await thermal.innerText(), /Кольцо льда/);
    assert.match(await wildfire.innerText(), /Открыто навыком: Огненный шар/);
    await page.screenshot({ path: `artifacts/alpha-18-pause-skills-${width}.png`, fullPage: true });
    // Pause stays frozen while reading; layout fits the viewport.
    await page.waitForTimeout(120);
    assert.deepEqual((await state()).world, paused.world);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const box = await pauseDialog.locator('.pause-panel').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'pause panel fits the viewport');
    // 3. Resume via button.
    await page.getByRole('button', { name: 'Продолжить', exact: false }).click();
    await screenIs('playing');
    const resumed = (await state()).world.time;
    await page.evaluate(() => window.__alpha.advance(0.2));
    assert.ok((await state()).world.time >= resumed + 0.2, 'gameplay resumes');
    // 4. Esc keeps its existing pause ownership: pause → resume.
    await page.keyboard.press('Escape');
    await screenIs('paused');
    await pauseDialog.getByRole('region', { name: 'Обзор навыков', exact: true }).waitFor();
    // Phaser consumes key events once per rendered frame; let a few frames pass between presses.
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await screenIs('playing');

    // 5. Quick-look during play does not pause; pausing folds it into the Pause screen.
    await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
    const quick = page.getByRole('complementary', { name: 'Обзор навыков', exact: true });
    await quick.waitFor();
    await quick.getByRole('region', { name: 'Синергии', exact: true }).waitFor();
    const running = (await state()).world.time;
    await page.evaluate(() => window.__alpha.advance(0.2));
    assert.ok((await state()).world.time >= running + 0.2, 'quick-look leaves gameplay running');
    await page.keyboard.press('p');
    await screenIs('paused');
    await quick.waitFor({ state: 'detached' });
    await pauseDialog.getByRole('region', { name: 'Обзор навыков', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Продолжить', exact: false }).click();
    await screenIs('playing');

    // 6. Pending level-ups: hints on cards, Skills readable, queue/offers unchanged.
    await command({
      type: 'restart',
      options: { characterClass: 'mage', initialEnemies: false, spawning: { enabled: false } },
    });
    await command({ type: 'grant-xp', amount: 90 });
    const pending = await state();
    assert.equal(pending.screen, 'level-up');
    assert.equal(pending.world.skills.pendingChoices, 3);
    const cards = page.locator('.skill-card');
    const offered = pending.world.skills.offer.cards;
    assert.equal(await cards.count(), offered.length);
    for (let i = 0; i < offered.length; i++) {
      const card = offered[i];
      const hint = cards.nth(i).locator('.card-synergy-unlock');
      if (card.kind === 'skill' && MAGE_CLASS_SKILLS.has(card.skillId))
        assert.match(await hint.innerText(), /Откроет:/, `${card.skillId} unlocks a synergy`);
      else assert.equal(await cards.nth(i).locator('.card-synergy').count(), 0, 'no hint');
    }
    await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
    const blocking = page.locator('#skill-overview');
    await blocking.waitFor();
    assert.ok((await blocking.innerText()).includes('Синергии'));
    await page.waitForTimeout(120);
    assert.deepEqual((await state()).world, pending.world, 'nothing advances under Skills');
    await page.getByRole('button', { name: 'Закрыть обзор навыков' }).click();
    await screenIs('level-up');
    assert.deepEqual((await state()).world.skills, pending.world.skills);
    if ((await state()).world.skills.offer.rerollAvailable) {
      await page.getByRole('button', { name: /Перебросить/ }).click();
      assert.equal((await state()).world.skills.rerolls, 2);
      assert.equal((await state()).world.skills.pendingChoices, 3);
    }
    await page.screenshot({ path: `artifacts/alpha-19-levelup-hints-${width}.png` });
    while ((await state()).world.skills.offer) await page.locator('.skill-card').first().click();
    assert.equal((await state()).screen, 'playing');
  }
}
