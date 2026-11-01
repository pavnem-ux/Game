import assert from 'node:assert/strict';

/** The same interactions run against the compiled QA build at desktop and phone widths. */
export async function checkSkillsAccess(page) {
  const state = () => page.evaluate(() => window.__alpha.state());
  const command = (action) => page.evaluate((a) => window.__alpha.command(a), action);
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
    await command({ type: 'grant-skill', skillId: 'elemental_mastery', rank: 1 });
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    const paused = await state();
    await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click({ timeout: 2500 });
    const overview = page.locator('#skill-overview');
    await overview.waitFor();
    assert.ok((await overview.innerText()).includes('Огненный шар'));
    assert.equal(await overview.locator('.skill-empty-slot').count(), 8);
    await page.keyboard.press('p');
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'з', code: 'KeyP', keyCode: 80, bubbles: true }),
      ),
    );
    await page.waitForTimeout(100);
    assert.equal((await state()).world.time, paused.world.time);
    await page.keyboard.press('Escape');
    await overview.waitFor({ state: 'detached' });
    assert.equal((await state()).screen, 'paused');
    assert.deepEqual((await state()).world, paused.world);
    await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
    await page.getByRole('button', { name: 'Закрыть обзор навыков' }).click();
    assert.equal((await state()).screen, 'paused');
    await page.getByRole('button', { name: 'Продолжить', exact: false }).click();
    await command({ type: 'grant-xp', amount: 90 });
    const pending = await state();
    assert.equal(pending.world.skills.pendingChoices, 3);
    await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
    await overview.waitFor();
    const box = await overview.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, 'overview fits the viewport');
    await page.waitForTimeout(150);
    assert.deepEqual(
      (await state()).world,
      pending.world,
      'no simulation, offers or rerolls change under Skills',
    );
    await page.screenshot({ path: `artifacts/alpha-17-skills-overview-${width}.png` });
    await page.getByRole('button', { name: 'Закрыть обзор навыков' }).click();
    assert.deepEqual((await state()).world.skills, pending.world.skills);
    assert.equal((await state()).screen, 'level-up');
    assert.equal(
      await page.locator('.skill-card').count(),
      pending.world.skills.offer.cards.length,
    );
    await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.deepEqual((await state()).world, pending.world);
    await page.screenshot({ path: `artifacts/alpha-14-skills-paused-${width}.png` });
    while ((await state()).world.skills.offer) await page.locator('.skill-card').first().click();
    await page.getByRole('button', { name: 'Обзор навыков', exact: true }).click();
    const running = (await state()).world.time;
    await page.evaluate(() => window.__alpha.advance(0.2));
    assert.ok(
      (await state()).world.time >= running + 0.2,
      'normal gameplay continues under Skills',
    );
    await page.keyboard.press('p');
    assert.equal(
      (await state()).screen,
      'paused',
      'P still pauses a running game while Skills is open',
    );
    await page.getByRole('button', { name: 'Закрыть обзор навыков' }).click();
    assert.equal((await state()).screen, 'paused');
    await page.getByRole('button', { name: 'Продолжить', exact: false }).click();
  }
}
