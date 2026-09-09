import { test, expect, play, seedLog, startAndGo, readLog } from '../fixtures';

test.describe('Echo Sequence', () => {
  test('lays out 4 tiles in 2 columns and plays round 1 at difficulty 1', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'simon');
    await expect(page.locator('.simon-tile')).toHaveCount(4);
    expect(await page.locator('.simon').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe('repeat(2, 1fr)');
    await expect(page.locator('#simon-msg')).toHaveText('Watch…');
    await expect(page.locator('#hud-l')).toHaveText('Round 1');
    await expect(page.locator('.simon-tile.lit')).toHaveCount(1, { timeout: 3000 });
    await expect(page.locator('#simon-msg')).toHaveText('Your turn', { timeout: 5000 });
    await expect(page.locator('.simon-tile.lit')).toHaveCount(0);
  });

  test('difficulty 5 uses 6 tiles in 3 columns', async ({ page }) => {
    await seedLog(page, Array.from({ length: 4 }, () => play('simon', 800)));
    await startAndGo(page, 'simon');
    await expect(page.locator('.simon-tile')).toHaveCount(6);
    expect(await page.locator('.simon').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe('repeat(3, 1fr)');
  });

  test('taps during playback are ignored', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'simon');
    await page.locator('.simon-tile').nth(3).click();
    await page.locator('.simon-tile').nth(2).click();
    await expect(page.locator('#simon-msg')).toHaveText('Watch…');
    await expect(page.locator('#simon-msg')).toHaveText('Your turn', { timeout: 5000 });
    await expect(page.locator('#play')).toHaveClass(/active/);
  });

  test('repeating the sequence advances rounds; a wrong tile shows the answer and ends the game', async ({ page }) => {
    await page.goto('/');
    // With Math.random pinned to 0 every step of the sequence is tile 0.
    await page.evaluate(() => { startGame('simon'); Math.random = () => 0 });
    await page.getByRole('button', { name: 'Start' }).click();
    const msg = page.locator('#simon-msg');
    const tile = (i: number) => page.locator(`.simon-tile[data-i="${i}"]`);

    await expect(msg).toHaveText('Your turn', { timeout: 5000 });
    await tile(0).click();
    await expect(msg).toHaveText('✓ Nice');
    await expect(page.locator('#hud-l')).toHaveText('Round 2', { timeout: 3000 });

    await expect(msg).toHaveText('Your turn', { timeout: 5000 });
    await tile(0).click();
    await expect(msg).toHaveText('Your turn');
    await tile(0).click();
    await expect(msg).toHaveText('✓ Nice');
    await expect(page.locator('#hud-l')).toHaveText('Round 3', { timeout: 3000 });

    await expect(msg).toHaveText('Your turn', { timeout: 6000 });
    await tile(1).click();
    await expect(msg).toHaveText('✗ Wrong tile');
    await expect(tile(0)).toHaveClass(/hint/);
    await tile(0).click();
    await expect(msg).toHaveText('✗ Wrong tile');

    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('200');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('2 rounds');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('4 tiles');
    expect((await readLog(page)).recs[0]).toMatchObject({ g: 'simon', s: 200 });
  });

  test('failing round 1 scores zero', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { startGame('simon'); Math.random = () => 0 });
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('#simon-msg')).toHaveText('Your turn', { timeout: 5000 });
    await page.locator('.simon-tile[data-i="2"]').click();
    await expect(page.locator('#result .score')).toHaveText('0');
    await expect(page.locator('#result')).toContainText('0 rounds');
  });
});
