import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo } from '../fixtures';

/** Find the intruder: the one word not in the category shared by the rest. */
const solve = (page: Page) => page.evaluate(() => {
  const words = [...document.querySelectorAll('#ch .choice')].map(b => b.textContent!.replace(/^\d/, ''));
  const cat = CATEGORIES.find(c => words.filter(w => c.includes(w)).length === words.length - 1)!;
  return { words, odd: words.findIndex(w => !cat.includes(w)) };
});

test.describe('Odd Word Out', () => {
  test('offers four words with exactly one intruder at difficulty 1', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'oddword');
    await expect(page.locator('#arena')).toContainText('Which word does not belong?');
    const s = await solve(page);
    expect(s.words).toHaveLength(4);
    expect(new Set(s.words).size).toBe(4);
    expect(s.odd).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#hud-l')).toHaveText('✓ 0  ✗ 0');
    await expect(page.locator('#hud-r')).toHaveText('⏱ 45s');
    await expect(page.locator('.choice kbd')).toHaveText(['1', '2', '3', '4']);
  });

  test('picking the intruder scores, anything else is wrong, keys work', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'oddword');
    let s = await solve(page);
    await page.locator('#ch .choice').nth(s.odd).click();
    await expect(page.locator('#fb')).toHaveText('✓');
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 0');

    s = await solve(page);
    await page.locator('#ch .choice').nth((s.odd + 1) % 4).click();
    await expect(page.locator('#fb')).toHaveText('✗');
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 1');

    s = await solve(page);
    await page.keyboard.press(String(s.odd + 1));
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
    await page.keyboard.press('5');
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
  });

  test('more options at higher difficulty', async ({ page }) => {
    await seedLog(page, Array.from({ length: 3 }, () => play('oddword', 800)));
    await startAndGo(page, 'oddword');
    await expect(page.locator('#ch .choice')).toHaveCount(5);
    for (let i = 0; i < 5; i++) { const s = await solve(page); await page.keyboard.press(String(s.odd + 1)) }
    await expect(page.locator('#hud-l')).toHaveText('✓ 5  ✗ 0');

    await seedLog(page, Array.from({ length: 7 }, () => play('oddword', 800)));
    await startAndGo(page, 'oddword');
    await expect(page.locator('#ch .choice')).toHaveCount(6);
  });

  test('finishes after 45 s scoring 50 per correct minus 40 per wrong', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'oddword');
    for (let i = 0; i < 2; i++) { const s = await solve(page); await page.locator('#ch .choice').nth(s.odd).click() }
    const s = await solve(page);
    await page.locator('#ch .choice').nth((s.odd + 1) % 4).click();
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
    await page.clock.fastForward(46_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('60');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('2 correct');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('1 wrong');
  });
});
