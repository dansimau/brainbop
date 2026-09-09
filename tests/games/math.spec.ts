import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo, readCurrent } from '../fixtures';

type Q = { a: number; op: string; b: number; c: number | null; ans: number };
async function question(page: Page): Promise<Q> {
  const text = await page.locator('#q').innerText();
  const m = text.match(/^(\d+) ([+\-×÷]) (\d+)(?: \+ (\d+))? = \?$/);
  expect(m, text).not.toBeNull();
  const [, a, op, b, c] = m!;
  const x = +a, y = +b;
  const base = op === '+' ? x + y : op === '-' ? x - y : op === '×' ? x * y : x / y;
  return { a: x, op, b: y, c: c ? +c : null, ans: base + (c ? +c : 0) };
}
const answer = async (page: Page, v: number | string) => { await page.locator('#ans').fill(String(v)); await page.locator('#ans').press('Enter') };

test.describe('Math Sprint', () => {
  test('poses + and − problems up to 20 at difficulty 1 with a 60 s countdown', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'math');
    await expect(page.locator('#hud-l')).toHaveText('✓ 0  ✗ 0');
    await expect(page.locator('#hud-r')).toHaveText('⏱ 60s');
    await expect(page.locator('#ans')).toBeFocused();
    for (let i = 0; i < 12; i++) {
      const q = await question(page);
      expect(['+', '-']).toContain(q.op);
      expect(q.a).toBeLessThanOrEqual(20);
      expect(q.b).toBeLessThanOrEqual(20);
      expect(q.ans).toBeGreaterThanOrEqual(0);
      expect(q.c).toBeNull();
      await answer(page, q.ans);
    }
    await expect(page.locator('#hud-l')).toHaveText('✓ 12  ✗ 0');
  });

  test('correct answers count, wrong ones reveal the answer, blanks are ignored', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'math');
    let q = await question(page);
    await answer(page, q.ans);
    await expect(page.locator('#fb')).toHaveText('✓');
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 0');
    await expect(page.locator('#ans')).toHaveValue('');

    q = await question(page);
    await answer(page, q.ans + 1);
    await expect(page.locator('#fb')).toHaveText(`✗ ${q.ans}`);
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 1');

    await page.locator('#ans').press('Enter');
    await answer(page, '   ');
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 1');

    q = await question(page);
    await page.locator('#ans').fill(String(q.ans));
    await page.locator('#af button').click();
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
  });

  test('Enter inside the answer box never restarts the game (timer regression)', async ({ page }) => {
    await page.goto('/');
    await page.locator('.gcard[data-play=math]').click();
    await page.keyboard.press('Enter');
    await expect(page.locator('#q')).toBeVisible();
    const t1 = parseFloat((await page.locator('#hud-r').innerText()).replace(/[^\d.]/g, ''));
    for (let i = 0; i < 6; i++) await answer(page, (await question(page)).ans);
    await expect(page.locator('#hud-l')).toHaveText('✓ 6  ✗ 0');
    expect((await readCurrent(page))?.timers).toBe(1);
    await page.waitForTimeout(1200);
    const t2 = parseFloat((await page.locator('#hud-r').innerText()).replace(/[^\d.]/g, ''));
    expect(t2).toBeLessThan(t1);
    await expect(page.locator('#arena .overlay')).toHaveCount(0);
  });

  test('finishes after 60 s scoring 40 per correct minus 15 per wrong', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'math');
    for (let i = 0; i < 2; i++) await answer(page, (await question(page)).ans);
    await answer(page, (await question(page)).ans + 1);
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
    await page.clock.fastForward(61_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('65');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('2 correct');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('1 wrong');
  });

  test('a wrong-heavy run never scores below zero', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'math');
    for (let i = 0; i < 3; i++) await answer(page, (await question(page)).ans + 1);
    await page.clock.fastForward(61_000);
    await expect(page.locator('#result .score')).toHaveText('0');
  });

  test('difficulty 8 adds ×, ÷ and chained terms, with exact division', async ({ page }) => {
    await seedLog(page, Array.from({ length: 7 }, () => play('math', 800)));
    await startAndGo(page, 'math');
    const ops = new Set<string>();
    let chained = 0;
    for (let i = 0; i < 40; i++) {
      const q = await question(page);
      ops.add(q.op);
      if (q.c !== null) chained++;
      expect(Number.isInteger(q.ans), `${q.a} ${q.op} ${q.b}`).toBe(true);
      await answer(page, q.ans);
    }
    expect([...ops].sort()).toEqual(['+', '-', '×', '÷']);
    expect(chained).toBeGreaterThan(0);
    await expect(page.locator('#hud-l')).toHaveText('✓ 40  ✗ 0');
  });
});
