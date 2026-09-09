import { test, expect, play, seedLog, startAndGo, readLog } from '../fixtures';

test.describe('Number Hunt', () => {
  test('lays out a shuffled 5×5 table at difficulty 1 with a stopwatch', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'schulte');
    const btns = page.locator('.schulte button');
    await expect(btns).toHaveCount(25);
    const values = (await btns.allInnerTexts()).map(Number).sort((a, b) => a - b);
    expect(values).toEqual([...Array(25).keys()].map(x => x + 1));
    expect(await page.locator('.schulte').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe('repeat(5, 1fr)');
    await expect(page.locator('#hud-l')).toHaveText('Find: 1');
    await expect(page.locator('#hud-r')).toHaveText(/^⏱ \d+\.\ds$/);
  });

  test('bigger tables at higher difficulty', async ({ page }) => {
    await seedLog(page, Array.from({ length: 3 }, () => play('schulte', 800)));
    await startAndGo(page, 'schulte');
    await expect(page.locator('.schulte button')).toHaveCount(36);
    await seedLog(page, Array.from({ length: 7 }, () => play('schulte', 800)));
    await startAndGo(page, 'schulte');
    await expect(page.locator('.schulte button')).toHaveCount(49);
  });

  test('a wrong tap shakes and counts; tapping in order finishes the game', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'schulte');
    const btn = (v: number) => page.locator(`.schulte button[data-v="${v}"]`);
    await btn(3).click();
    await expect(btn(3)).toHaveClass(/shake/);
    await expect(page.locator('#hud-l')).toHaveText('Find: 1');
    await expect(btn(3)).not.toHaveClass(/shake/);
    await btn(1).click();
    await expect(btn(1)).toHaveClass(/done/);
    await expect(page.locator('#hud-l')).toHaveText('Find: 2');
    for (let v = 2; v <= 25; v++) await btn(v).click();
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('1000');
    const tags = await r.locator('.tags .tag').allInnerTexts();
    expect(tags[2]).toMatch(/^\d+\.\ds$/);
    expect(tags[3]).toBe('1 misses');
    expect(tags[4]).toBe('5×5');
    expect((await readLog(page)).recs[0]).toMatchObject({ g: 'schulte', s: 1000 });
  });
});
