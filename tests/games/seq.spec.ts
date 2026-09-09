import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo } from '../fixtures';

/** Difficulty 1 only allows arithmetic, geometric and square sequences. */
function predict(s: number[]): number | null {
  const d = s[1] - s[0];
  if (s.every((v, i) => i === 0 || v - s[i - 1] === d)) return s[4] + d;
  const r = s[1] / s[0];
  if (s[0] !== 0 && Number.isInteger(r) && s.every((v, i) => i === 0 || v === s[i - 1] * r)) return s[4] * r;
  const k = Math.sqrt(s[0]);
  if (Number.isInteger(k) && s.every((v, i) => v === (k + i) ** 2)) return (k + 5) ** 2;
  return null;
}

async function board(page: Page) {
  const text = await page.locator('#sq').innerText();
  const m = text.match(/^(-?\d+), (-?\d+), (-?\d+), (-?\d+), (-?\d+), \?$/);
  expect(m, text).not.toBeNull();
  const shown = m!.slice(1, 6).map(Number);
  const options = (await page.locator('#ch .choice').allInnerTexts()).map(t => +t.replace(/^\d/, ''));
  return { shown, options, answer: predict(shown) };
}

test.describe('Pattern Finder', () => {
  test('shows five terms, four options and a 60 s countdown', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'seq');
    const b = await board(page);
    expect(b.options).toHaveLength(4);
    expect(new Set(b.options).size).toBe(4);
    expect(b.answer).not.toBeNull();
    expect(b.options).toContain(b.answer);
    await expect(page.locator('#sq .q')).toHaveText('?');
    await expect(page.locator('#hud-l')).toHaveText('✓ 0  ✗ 0');
    await expect(page.locator('#hud-r')).toHaveText('⏱ 60s');
  });

  test('the right option scores; a wrong one reveals the answer; keys 1-4 pick', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'seq');
    let b = await board(page);
    await page.locator('#ch .choice').nth(b.options.indexOf(b.answer!)).click();
    await expect(page.locator('#fb')).toHaveText('✓');
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 0');

    b = await board(page);
    const wrong = b.options.findIndex(o => o !== b.answer);
    await page.locator('#ch .choice').nth(wrong).click();
    await expect(page.locator('#fb')).toHaveText(`✗ it was ${b.answer}`);
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 1');

    b = await board(page);
    await page.keyboard.press(String(b.options.indexOf(b.answer!) + 1));
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
    await page.keyboard.press('9');
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
  });

  test('every difficulty-1 sequence is solvable by the three basic rules', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'seq');
    const kinds = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const b = await board(page);
      expect(b.answer, b.shown.join(', ')).not.toBeNull();
      const d = b.shown[1] - b.shown[0];
      kinds.add(b.shown.every((v, j) => j === 0 || v - b.shown[j - 1] === d) ? 'arith' : Number.isInteger(Math.sqrt(b.shown[0])) && b.shown[1] === (Math.sqrt(b.shown[0]) + 1) ** 2 ? 'square' : 'geo');
      await page.locator('#ch .choice').nth(b.options.indexOf(b.answer!)).click();
    }
    await expect(page.locator('#hud-l')).toHaveText('✓ 30  ✗ 0');
    expect(kinds.size).toBeGreaterThan(1);
  });

  test('higher difficulty unlocks sequence types beyond the basic three', async ({ page }) => {
    await seedLog(page, Array.from({ length: 7 }, () => play('seq', 800)));
    await startAndGo(page, 'seq');
    let exotic = 0;
    for (let i = 0; i < 20; i++) {
      const b = await board(page);
      if (b.answer === null || !b.options.includes(b.answer)) exotic++;
      await page.locator('#ch .choice').first().click();
      await expect(page.locator('#hud-l')).toHaveText(new RegExp(`^✓ \\d+  ✗ \\d+$`));
    }
    expect(exotic).toBeGreaterThan(0);
  });

  test('finishes after 60 s scoring 100 per correct minus 50 per wrong', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'seq');
    for (let i = 0; i < 2; i++) { const b = await board(page); await page.locator('#ch .choice').nth(b.options.indexOf(b.answer!)).click() }
    const b = await board(page);
    await page.locator('#ch .choice').nth(b.options.findIndex(o => o !== b.answer)).click();
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
    await page.clock.fastForward(61_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('150');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('2 correct');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('1 wrong');
  });
});
