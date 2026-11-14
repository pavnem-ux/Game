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
    // 2. Synergies section from the authoritative pair table (Task 07.2 v2).
    const synergies = skills.getByRole('region', { name: 'Синергии', exact: true });
    assert.equal(await synergies.locator('.synergy-entry').count(), 3);
    const wildfire = synergies.locator('[data-synergy-id="wildfire"]');
    const thermal = synergies.locator('[data-synergy-id="thermal_shock"]');
    // One skill of a pair opens nothing; every allowed pair is listed with readable names.
    assert.match(await wildfire.getAttribute('class'), /is-locked/);
    assert.match(await thermal.getAttribute('class'), /is-locked/);
    assert.equal(await thermal.locator('.synergy-pair-row').count(), 4);
    assert.match(await thermal.innerText(), /Огненный шар ✓ \+ Кольцо льда — нужен Кольцо льда/);
    assert.match(
      await thermal.innerText(),
      /Не хватает одного навыка: Кольцо льда или Ледяные осколки/,
    );
    assert.doesNotMatch(await synergies.innerText(), /[a-z]+_[a-z]+/, 'no internal IDs');
    // Owned skills show their computed damage breakdown.
    const damage = skills.locator('.damage-lines').first();
    assert.match(await damage.innerText(), /Снаряд: ×1\.4 → \d+/);
    assert.match(await damage.innerText(), /Burn \(цель и задетые взрывом\): 3 за стак\/тик/);
    // Acquiring the second skill of a pair unlocks the synergy at once and announces it.
    await command({ type: 'grant-skill', skillId: 'frost_nova', rank: 1 });
    await page.waitForFunction(() =>
      document
        .querySelector('[data-synergy-id="thermal_shock"]')
        ?.className.includes('is-available'),
    );
    assert.match(await thermal.innerText(), /Открыто парой: Огненный шар \+ Кольцо льда/);
    const unlocked = (await state()).events.filter((e) => e.event.type === 'synergy-unlocked');
    assert.deepEqual(
      unlocked.map((e) => [e.event.synergyId, e.event.pair]),
      [['thermal_shock', ['fireball', 'frost_nova']]],
    );
    assert.equal((await state()).screen, 'paused', 'unlock does not resume');
    await page.screenshot({ path: `artifacts/alpha-18-pause-skills-${width}.png`, fullPage: true });
    // Pause stays frozen while reading (the unlock did not advance time); layout fits.
    const frozen = await state();
    assert.equal(frozen.world.time, paused.world.time);
    await page.waitForTimeout(120);
    assert.deepEqual((await state()).world, frozen.world);
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
    await page.keyboard.press('Escape');
    await screenIs('playing');

    // 5. Task 22: no in-run quick-look button any more (the full list is the Pause screen's).
    assert.equal(await page.getByRole('button', { name: 'Обзор навыков', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Навыки', exact: true }).count(), 0);

    // 6. Pending level-ups: hints on cards, Skills readable, queue/offers unchanged.
    await command({
      type: 'restart',
      options: { characterClass: 'mage', initialEnemies: false, spawning: { enabled: false } },
    });
    // Task 12: levels 2, 3, 4 cost 20 + 30 + 42 (quadratic run level cost).
    await command({ type: 'grant-xp', amount: 92 });
    const pending = await state();
    assert.equal(pending.screen, 'level-up');
    assert.equal(pending.world.skills.pendingChoices, 3);
    const cards = page.locator('.skill-card');
    const offered = pending.world.skills.offer.cards;
    assert.equal(await cards.count(), offered.length);
    for (let i = 0; i < offered.length; i++) {
      const card = offered[i];
      // No skills owned yet: a class card is only half of a pair, never an immediate unlock.
      assert.equal(await cards.nth(i).locator('.card-synergy-unlock').count(), 0);
      if (card.kind === 'skill' && MAGE_CLASS_SKILLS.has(card.skillId))
        assert.match(
          await cards.nth(i).locator('.card-synergy-pair').innerText(),
          /Половина пары:/,
          `${card.skillId} is half of a pair`,
        );
      else assert.equal(await cards.nth(i).locator('.card-synergy').count(), 0, 'no hint');
      if (card.kind === 'skill')
        assert.ok(
          (await cards.nth(i).locator('.damage-lines').count()) === 1,
          `${card.skillId} shows its damage readout`,
        );
    }
    // Task 22: the offer screen has no «Навыки» button; nothing advances while it is open.
    assert.equal(await page.getByRole('button', { name: 'Обзор навыков', exact: true }).count(), 0);
    await page.waitForTimeout(120);
    assert.deepEqual((await state()).world, pending.world, 'nothing advances during the offer');
    await screenIs('level-up');
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
