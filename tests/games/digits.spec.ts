import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo, readLog } from '../fixtures';

const num = (page: Page) => page.locator('#ds-num');
const msg = (page: Page) => page.locator('#ds-msg');
const form = (page: Page) => page.locator('#ds-f');
const input = (page: Page) => page.locator('#ds-in');

/** Read the flashed number, then wait until the answer box appears. */
async function flash(page: Page, len: number): Promise<string> {
  await expect(msg(page)).toHaveText('Memorize…', { timeout: 3000 });
  const n = await num(page).innerText();
  expect(n).toMatch(new RegExp(`^[1-9]\\d{${len - 1}}$`));
  await expect(form(page)).toBeVisible({ timeout: 6000 });
  return n;
}

test.describe('Digit Span', () => {
  test('flashes a 3-digit number, then asks for it', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'digits');
    await expect(form(page)).toBeHidden();
    await expect(page.locator('#hud-l')).toHaveText('Digits 3 · Lives 2');
    await flash(page, 3);
    await expect(num(page)).toHaveText('');
    await expect(msg(page)).toHaveText('Type it back');
    await expect(input(page)).toBeFocused();
    await expect(form(page).locator('button')).toHaveText('Go');
  });

  test('a correct answer adds a digit; two wrong answers end the game at 100 per digit', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'digits');
    let n = await flash(page, 3);
    await input(page).fill(n);
    await input(page).press('Enter');
    await expect(msg(page)).toHaveText('✓');
    await expect(form(page)).toBeHidden();
    await expect(page.locator('#hud-l')).toHaveText('Digits 4 · Lives 2', { timeout: 3000 });

    n = await flash(page, 4);
    await input(page).fill('0');
    await form(page).locator('button').click();
    await expect(msg(page)).toHaveText(`✗ It was ${n}`);
    await expect(num(page)).toHaveText(n);
    await expect(page.locator('#hud-l')).toHaveText('Digits 4 · Lives 1', { timeout: 3000 });

    n = await flash(page, 4);
    await input(page).fill('1');
    await input(page).press('Enter');
    await expect(msg(page)).toHaveText(`✗ It was ${n}`);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/, { timeout: 5000 });
    await expect(r.locator('.score')).toHaveText('300');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('3 digits');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('forward');
    expect((await readLog(page)).recs[0]).toMatchObject({ g: 'digits', s: 300 });
  });

  test('empty submissions and surrounding whitespace are tolerated', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'digits');
    const n = await flash(page, 3);
    await input(page).press('Enter');
    await expect(form(page)).toBeVisible();
    await expect(msg(page)).toHaveText('Type it back');
    await input(page).fill(`  ${n} `);
    await input(page).press('Enter');
    await expect(msg(page)).toHaveText('✓');
  });

  test('difficulty 6 flashes 6 digits and wants them backwards, scoring 1.2×', async ({ page }) => {
    await seedLog(page, Array.from({ length: 5 }, () => play('digits', 800)));
    await startAndGo(page, 'digits');
    await expect(page.locator('#hud-l')).toHaveText('Digits 6 · Lives 2 · REVERSE');
    let n = await flash(page, 6);
    await expect(msg(page)).toHaveText('Type it BACKWARDS');
    await input(page).fill(n);
    await input(page).press('Enter');
    await expect(msg(page)).toHaveText(`✗ It was ${n}`);

    n = await flash(page, 6);
    await input(page).fill([...n].reverse().join(''));
    await input(page).press('Enter');
    await expect(msg(page)).toHaveText('✓');

    n = await flash(page, 7);
    await input(page).fill('0');
    await input(page).press('Enter');
    const r = page.locator('#result');
    await expect(r.locator('.score')).toHaveText('720', { timeout: 5000 });
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('6 digits');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('reverse');
  });

  test('recalling nine digits unlocks Nine Digits', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'digits');
    for (let len = 3; len <= 9; len++) {
      await expect(msg(page)).toHaveText('Memorize…');
      const n = await num(page).innerText();
      expect(n).toHaveLength(len);
      await page.clock.runFor(500 + len * 380 + 20);
      await expect(form(page)).toBeVisible();
      await input(page).fill(n);
      await input(page).press('Enter');
      await expect(msg(page)).toHaveText('✓');
      await page.clock.runFor(620);
    }
    await expect(page.locator('#hud-l')).toHaveText('Digits 10 · Lives 2');
    for (let k = 0; k < 2; k++) {
      await expect(msg(page)).toHaveText('Memorize…');
      await page.clock.runFor(500 + 10 * 380 + 20);
      await input(page).fill('0');
      await input(page).press('Enter');
      await page.clock.runFor(1420);
    }
    const r = page.locator('#result');
    await expect(r.locator('.score')).toHaveText('900');
    await expect(r).toContainText('Badge unlocked: Nine Digits');
    expect((await readLog(page)).recs[0].a).toEqual(expect.arrayContaining(['span9']));
  });
});
