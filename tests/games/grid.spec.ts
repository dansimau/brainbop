import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo, readLog } from '../fixtures';

const msg = (page: Page) => page.locator('#gr-msg');
const cell = (page: Page, i: number) => page.locator(`.scell[data-i="${i}"]`);

/** Wait for the show phase, read the lit cells, then wait for the input phase. */
async function memorize(page: Page, count: number): Promise<number[]> {
  await expect(msg(page)).toHaveText(`Memorize ${count} cells`, { timeout: 3000 });
  const lit: number[] = await page.locator('.scell.lit').evaluateAll(els => els.map(e => +(e as HTMLElement).dataset.i!));
  expect(lit).toHaveLength(count);
  await expect(msg(page)).toHaveText('Now tap them', { timeout: 5000 });
  return lit;
}

const pickWrong = (lit: number[], n: number) => [...Array(n).keys()].find(i => !lit.includes(i))!;

test.describe('Grid Recall', () => {
  test('shows 3 cells on a 4×4 grid, then hides them', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'grid');
    await expect(page.locator('.scell')).toHaveCount(16);
    expect(await page.locator('#gr').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe('repeat(4, 1fr)');
    await expect(page.locator('#hud-l')).toHaveText('Cells 3 · 4×4 · Lives ❤️❤️');
    await expect(msg(page)).toHaveText('Memorize 3 cells');
    await expect(page.locator('.scell.lit')).toHaveCount(3);
    await expect(msg(page)).toHaveText('Now tap them', { timeout: 5000 });
    await expect(page.locator('.scell.lit')).toHaveCount(0);
  });

  test('taps during the show phase are ignored', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'grid');
    await expect(msg(page)).toHaveText('Memorize 3 cells');
    await cell(page, 0).click();
    await cell(page, 5).click();
    await expect(page.locator('.scell.ok, .scell.bad')).toHaveCount(0);
    await expect(msg(page)).toHaveText('Memorize 3 cells');
  });

  test('recalling grows the pattern; misses reveal it, cost lives and finally end the game', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'grid');
    let lit = await memorize(page, 3);
    for (const i of lit) {
      await cell(page, i).click();
      await expect(cell(page, i)).toHaveClass(/ok/);
    }
    await expect(msg(page)).toHaveText('✓ Correct');
    await expect(page.locator('#hud-l')).toHaveText('Cells 4 · 4×4 · Lives ❤️❤️');

    lit = await memorize(page, 4);
    await cell(page, lit[0]).click();
    const wrong = pickWrong(lit, 16);
    await cell(page, wrong).click();
    await expect(cell(page, wrong)).toHaveClass(/bad/);
    await expect(msg(page)).toHaveText('✗ Try that size again');
    await expect(page.locator('#hud-l')).toHaveText('Cells 4 · 4×4 · Lives ❤️');
    for (const i of lit.slice(1)) await expect(cell(page, i)).toHaveClass(/lit/);
    await expect(cell(page, lit[0])).not.toHaveClass(/lit/);
    await cell(page, lit[1]).click();
    await expect(cell(page, lit[1])).not.toHaveClass(/ok/);

    lit = await memorize(page, 4);
    await cell(page, pickWrong(lit, 16)).click();
    await expect(page.locator('#hud-l')).toHaveText('Cells 4 · 4×4 · Lives —');
    await expect(msg(page)).toHaveText('✗ Try that size again');

    lit = await memorize(page, 4);
    await cell(page, pickWrong(lit, 16)).click();
    await expect(msg(page)).toHaveText('Out of lives');
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/, { timeout: 5000 });
    await expect(r.locator('.score')).toHaveText('300');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('3 cells');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('4×4 grid');
    expect((await readLog(page)).recs[0]).toMatchObject({ g: 'grid', s: 300 });
  });

  test('failing the first pattern scores zero', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'grid');
    for (let k = 0; k < 3; k++) {
      const lit = await memorize(page, 3);
      await cell(page, pickWrong(lit, 16)).click();
    }
    await expect(page.locator('#result .score')).toHaveText('0', { timeout: 5000 });
    await expect(page.locator('#result')).toContainText('0 cells');
  });

  test('difficulty 7 starts with 6 cells on a 6×6 grid', async ({ page }) => {
    await seedLog(page, Array.from({ length: 6 }, () => play('grid', 800)));
    await startAndGo(page, 'grid');
    await expect(page.locator('.scell')).toHaveCount(36);
    await expect(page.locator('#hud-l')).toHaveText('Cells 6 · 6×6 · Lives ❤️❤️');
    await expect(page.locator('.scell.lit')).toHaveCount(6);
  });
});
