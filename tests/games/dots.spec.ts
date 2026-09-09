import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo } from '../fixtures';

const counts = (page: Page): Promise<number[]> => page.locator('.side').evaluateAll(els => els.map(e => e.querySelectorAll('circle').length));
const more = async (page: Page) => { const [a, b] = await counts(page); expect(a).not.toBe(b); return a > b ? 0 : 1 };

test.describe('Quick Count', () => {
  test('shows two dot clouds with different counts and a 45 s countdown', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'dots');
    await expect(page.locator('.side')).toHaveCount(2);
    const [a, b] = await counts(page);
    expect(Math.min(a, b)).toBeGreaterThanOrEqual(8);
    expect(Math.max(a, b)).toBeGreaterThanOrEqual(Math.round(Math.min(a, b) * 1.5));
    await expect(page.locator('#hud-l')).toHaveText('✓ 0  ✗ 0');
    await expect(page.locator('#hud-r')).toHaveText('⏱ 45s');
    await expect(page.locator('.side.hid')).toHaveCount(0);
  });

  test('the side with more dots is right, by tap or arrow key', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'dots');
    let m = await more(page);
    await page.locator('.side').nth(m).click();
    await expect(page.locator('#fb')).toHaveText('✓');
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 0');

    m = await more(page);
    await page.locator('.side').nth(1 - m).click();
    await expect(page.locator('#fb')).toHaveText('✗');
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 1');

    m = await more(page);
    await page.keyboard.press(m === 0 ? 'ArrowLeft' : 'ArrowRight');
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');

    m = await more(page);
    await page.keyboard.press(m === 0 ? 'ArrowRight' : 'ArrowLeft');
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 2');
  });

  test('from difficulty 5 the dots hide after a moment and reappear on the next round', async ({ page }) => {
    await seedLog(page, Array.from({ length: 4 }, () => play('dots', 800)));
    await startAndGo(page, 'dots');
    await expect(page.locator('.side.hid')).toHaveCount(2, { timeout: 3000 });
    const m = await more(page);
    await page.locator('.side').nth(m).click();
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 0');
    await expect(page.locator('.side.hid')).toHaveCount(0);
    await expect(page.locator('.side.hid')).toHaveCount(2, { timeout: 3000 });
  });

  test('finishes after 45 s with 45 points per net correct answer', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'dots');
    for (let i = 0; i < 2; i++) await page.locator('.side').nth(await more(page)).click();
    await page.locator('.side').nth(1 - await more(page)).click();
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
    await page.clock.fastForward(46_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('45');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('2 correct');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('1 wrong');
  });
});
