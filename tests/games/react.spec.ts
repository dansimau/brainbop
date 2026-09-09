import { test, expect, play, seedLog, startAndGo, readLog } from '../fixtures';

test.describe('Reflex', () => {
  test('walks through five rounds and scores the average reaction', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    // Math.random pinned to 0 makes every wait exactly 1000 ms, so runFor lands right on green.
    await page.evaluate(() => { startGame('react'); Math.random = () => 0 });
    await page.getByRole('button', { name: 'Start' }).click();
    const box = page.locator('#rf'), log = page.locator('#rf-log');
    await expect(box).toHaveText('Click to start round 1');
    await expect(page.locator('#hud-l')).toHaveText('');
    for (let r = 1; r <= 5; r++) {
      await expect(box).toHaveText(`Click to start round ${r}`);
      await box.click();
      await expect(box).toHaveText('Wait for green…');
      await expect(box).toHaveClass('reflex wait');
      await page.clock.runFor(1000);
      await expect(box).toHaveText('CLICK!');
      await expect(box).toHaveClass('reflex go');
      await box.click();
      await expect(log).toHaveText(/^\d+ ms$/);
      expect((await page.locator('#hud-l').innerText()).split(' · ')).toHaveLength(r);
    }
    await expect(box).toHaveText(/^Average \d+ ms$/);
    await box.click();
    await expect(box).toHaveText(/^Average \d+ ms$/);
    await page.clock.runFor(1000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('1000');
    const tags = await r.locator('.tags .tag').allInnerTexts();
    expect(tags[2]).toMatch(/^avg \d+ ms$/);
    expect(tags[3]).toMatch(/^best \d+ ms$/);
    await expect(r).toContainText('Badge unlocked: Lightning');
    expect((await readLog(page)).recs[0].a).toEqual(expect.arrayContaining(['fast']));
  });

  test('clicking before green counts as 500 ms', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'react');
    const box = page.locator('#rf');
    await box.click();
    await expect(box).toHaveText('Wait for green…');
    await box.click();
    await expect(page.locator('#rf-log')).toHaveText('Too early! Counted as 500 ms');
    await expect(page.locator('#hud-l')).toHaveText('500ms');
    await expect(box).toHaveText('Click to start round 2');
    await expect(box).toHaveClass('reflex');
  });

  test('the space bar taps too', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'react');
    await page.keyboard.press('Space');
    await expect(page.locator('#rf')).toHaveText('Wait for green…');
    await page.keyboard.press('Space');
    await expect(page.locator('#hud-l')).toHaveText('500ms');
  });

  test('from difficulty 4 a yellow decoy can appear before green', async ({ page }) => {
    await page.clock.install();
    await seedLog(page, Array.from({ length: 3 }, () => play('react', 800)));
    await page.evaluate(() => { startGame('react'); Math.random = () => 0.3 });
    await page.getByRole('button', { name: 'Start' }).click();
    const box = page.locator('#rf');
    await box.click();
    await page.clock.runFor(900);
    await expect(box).toHaveText('Not yet!');
    await expect(box).toHaveClass('reflex decoy');
    await box.click();
    await expect(page.locator('#rf-log')).toHaveText('Too early! Counted as 500 ms');
    // Let the abandoned round's timers expire (they no-op once the round is over).
    await page.clock.runFor(2000);
    await expect(box).toHaveText('Click to start round 2');

    await box.click();
    await page.clock.runFor(900);
    await expect(box).toHaveText('Not yet!');
    await page.clock.runFor(450);
    await expect(box).toHaveText('Wait for green…');
    await page.clock.runFor(450);
    await expect(box).toHaveText('CLICK!');
    await box.click();
    await expect(page.locator('#rf-log')).toHaveText(/^\d+ ms$/);
  });
});
