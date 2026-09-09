import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo } from '../fixtures';

/** Work out which choice the current rule wants. */
const solve = (page: Page) => page.evaluate(() => {
  const names = [...document.querySelectorAll('.choice')].map(b => b.textContent!.replace(/^\d/, ''));
  const word = document.querySelector('#st-word') as HTMLElement;
  const mode = document.querySelector('#st-mode')!.textContent!;
  const hex: Record<string, string> = { RED: '#ff5c7a', GREEN: '#3ddc97', BLUE: '#6c8cff', YELLOW: '#ffc857', PURPLE: '#c77dff', ORANGE: '#ff9f43' };
  const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` };
  const ink = names.findIndex(n => rgb(hex[n]) === word.style.color);
  const said = names.indexOf(word.textContent!);
  return { mode, names, ink, said, correct: mode.includes('INK') ? ink : said };
});

test.describe('Color Clash', () => {
  test('shows a colour word with 4 choices and a 45 s countdown at difficulty 1', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'stroop');
    const s = await solve(page);
    expect(s.names).toEqual(['RED', 'GREEN', 'BLUE', 'YELLOW']);
    expect(s.mode).toBe('Tap the INK COLOR');
    expect(s.ink).toBeGreaterThanOrEqual(0);
    expect(s.said).toBeGreaterThanOrEqual(0);
    await expect(page.locator('#hud-l')).toHaveText('✓ 0  ✗ 0');
    await expect(page.locator('#hud-r')).toHaveText('⏱ 45s');
    await expect(page.locator('.choice kbd')).toHaveText(['1', '2', '3', '4']);
  });

  test('answering by click or key updates the tally and moves on', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'stroop');
    let s = await solve(page);
    await page.locator('.choice').nth(s.correct).click();
    await expect(page.locator('#fb')).toHaveText('✓');
    await expect(page.locator('#hud-l')).toHaveText('✓ 1  ✗ 0');

    s = await solve(page);
    await page.keyboard.press(String(s.correct + 1));
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 0');

    s = await solve(page);
    await page.locator('.choice').nth((s.correct + 1) % 4).click();
    await expect(page.locator('#fb')).toHaveText('✗');
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');

    await page.keyboard.press('7');
    await expect(page.locator('#hud-l')).toHaveText('✓ 2  ✗ 1');
  });

  test('finishes after 45 s with 30 points per net correct answer', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'stroop');
    for (let i = 0; i < 3; i++) {
      const s = await solve(page);
      await page.locator('.choice').nth(s.correct).click();
    }
    const s = await solve(page);
    await page.locator('.choice').nth((s.correct + 1) % 4).click();
    await expect(page.locator('#hud-l')).toHaveText('✓ 3  ✗ 1');
    await page.clock.fastForward(46_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('60');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('3 correct');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('1 wrong');
    await expect(r.locator('.tags .tag').nth(4)).toHaveText('75% accuracy');
  });

  test('difficulty 7 uses 6 colours and sometimes asks for the word instead', async ({ page }) => {
    await seedLog(page, Array.from({ length: 6 }, () => play('stroop', 800)));
    await startAndGo(page, 'stroop');
    await expect(page.locator('.choice')).toHaveCount(6);
    const modes = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const s = await solve(page);
      modes.add(s.mode);
      await page.locator('.choice').nth(s.correct).click();
    }
    expect([...modes].sort()).toEqual(['Tap the INK COLOR', 'Tap what the WORD SAYS']);
    await expect(page.locator('#hud-l')).toHaveText('✓ 40  ✗ 0');
  });
});
