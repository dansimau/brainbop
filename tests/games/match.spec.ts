import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo, readLog } from '../fixtures';

const faces = (page: Page): Promise<string[]> => page.locator('.card-tile').evaluateAll(els => els.map(e => e.querySelector('.face')!.textContent!));
const tile = (page: Page, i: number) => page.locator(`.card-tile[data-i="${i}"]`);

/** Indices grouped by face: [[i, j], ...] */
async function pairs(page: Page) {
  const f = await faces(page);
  const by: Record<string, number[]> = {};
  f.forEach((x, i) => (by[x] ||= []).push(i));
  return Object.values(by);
}

test.describe('Memory Match', () => {
  test('deals 6 pairs in a 4-column grid with a stopwatch at difficulty 1', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'match');
    await expect(page.locator('.card-tile')).toHaveCount(12);
    expect(await page.locator('#arena .grid').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe('repeat(4, 1fr)');
    const groups = await pairs(page);
    expect(groups).toHaveLength(6);
    expect(groups.every(g => g.length === 2)).toBe(true);
    await expect(page.locator('#hud-l')).toHaveText('Moves 0 · Pairs 0/6');
    await expect(page.locator('#hud-r')).toHaveText(/^⏱ \d+\.\ds$/);
    await expect(page.locator('.card-tile.open, .card-tile.done')).toHaveCount(0);
  });

  test('higher difficulty adds pairs, up to 18', async ({ page }) => {
    await seedLog(page, Array.from({ length: 3 }, () => play('match', 800)));
    await startAndGo(page, 'match');
    await expect(page.locator('.card-tile')).toHaveCount(24);
    expect(await page.locator('#arena .grid').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe('repeat(6, 1fr)');
    await expect(page.locator('#hud-l')).toHaveText('Moves 0 · Pairs 0/12');

    await seedLog(page, Array.from({ length: 9 }, () => play('match', 800)));
    await startAndGo(page, 'match');
    await expect(page.locator('.card-tile')).toHaveCount(36);
    await expect(page.locator('#hud-l')).toHaveText('Moves 0 · Pairs 0/18');
  });

  test('a mismatch flips back after a moment and a match stays face up', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'match');
    const groups = await pairs(page);
    const [a] = groups[0], [b] = groups[1];
    await tile(page, a).click();
    await expect(tile(page, a)).toHaveClass(/open/);
    await expect(page.locator('#hud-l')).toHaveText('Moves 0 · Pairs 0/6');
    await tile(page, b).click();
    await expect(page.locator('#hud-l')).toHaveText('Moves 1 · Pairs 0/6');
    await expect(tile(page, b)).toHaveClass(/open/);
    await expect(tile(page, a)).not.toHaveClass(/open/);
    await expect(tile(page, b)).not.toHaveClass(/open/);

    const [c, d] = groups[2];
    await tile(page, c).click();
    await tile(page, d).click();
    await expect(tile(page, c)).toHaveClass(/done/);
    await expect(tile(page, d)).toHaveClass(/done/);
    await expect(page.locator('#hud-l')).toHaveText('Moves 2 · Pairs 1/6');
  });

  test('clicks on an already open or matched card do nothing', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'match');
    const groups = await pairs(page);
    const [a, a2] = groups[0];
    await tile(page, a).click();
    await tile(page, a).click();
    await expect(page.locator('.card-tile.open')).toHaveCount(1);
    await expect(page.locator('#hud-l')).toHaveText('Moves 0 · Pairs 0/6');
    await tile(page, a2).click();
    await expect(page.locator('#hud-l')).toHaveText('Moves 1 · Pairs 1/6');
    await tile(page, a).click();
    await tile(page, a2).click();
    await expect(page.locator('#hud-l')).toHaveText('Moves 1 · Pairs 1/6');
    await expect(page.locator('.card-tile.done')).toHaveCount(2);
  });

  test('a third card is ignored while a mismatch is flipping back', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'match');
    const groups = await pairs(page);
    await tile(page, groups[0][0]).click();
    await tile(page, groups[1][0]).click();
    await tile(page, groups[2][0]).click();
    await expect(page.locator('#hud-l')).toHaveText('Moves 1 · Pairs 0/6');
    await expect(page.locator('.card-tile.open')).toHaveCount(0);
  });

  test('finding every pair finishes the game with moves and time', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'match');
    for (const [a, b] of await pairs(page)) {
      await tile(page, a).click();
      await tile(page, b).click();
    }
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('1000');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('6 moves');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText(/^\d+\.\ds$/);
    await expect(r).toContainText('Badge unlocked: Sharpshooter');
    const rec = (await readLog(page)).recs[0];
    expect(rec).toMatchObject({ g: 'match', s: 1000, df: 1 });
  });
});
