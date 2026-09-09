import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo } from '../fixtures';

/** Compare the two shapes geometrically. Symmetric shapes match both ways. */
const analyse = (page: Page) => page.evaluate(() => {
  const read = (svg: Element) => [...svg.querySelectorAll('rect')].map(r => [+r.getAttribute('x')!, +r.getAttribute('y')!]);
  const [a, b] = [...document.querySelectorAll('#pair svg')].map(read);
  const key = (pts: number[][]) => pts.map(p => p.join(',')).sort().join('|');
  const rot = (pts: number[][]) => pts.map(([x, y]) => [4 - y, x]);
  const mir = (pts: number[][]) => pts.map(([x, y]) => [4 - x, y]);
  const spin = (pts: number[][]) => { const out: string[] = []; for (let i = 0; i < 4; i++) { out.push(key(pts)); pts = rot(pts) } return out };
  const rots = spin(a), mirs = spin(mir(a));
  return { cells: a.length, isRot: rots.includes(key(b)), isMir: mirs.includes(key(b)), symmetric: rots.some(k => mirs.includes(k)) };
});

test.describe('Shape Shift', () => {
  test('shows two 4-cell shapes, two answers and a 45 s countdown at difficulty 1', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'rotate');
    await expect(page.locator('#pair .side')).toHaveCount(2);
    const a = await analyse(page);
    expect(a.cells).toBe(4);
    expect(a.isRot || a.isMir).toBe(true);
    await expect(page.locator('.choice')).toHaveText(['←Rotation', '→Mirror']);
    await expect(page.locator('#hud-l')).toHaveText('✓ 0  ✗ 0');
    await expect(page.locator('#hud-r')).toHaveText('⏱ 45s');
  });

  test('the geometry decides: rotations are ←, mirror images are →', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'rotate');
    let correct = 0, wrong = 0, decided = 0;
    for (let i = 0; i < 12; i++) {
      const a = await analyse(page);
      if (!a.symmetric) expect(a.isRot !== a.isMir, 'asymmetric shapes match exactly one way').toBe(true);
      const answerMirror = a.isMir && !a.isRot;
      if (i % 2) await page.keyboard.press(answerMirror ? 'ArrowRight' : 'ArrowLeft');
      else await page.locator('.choice').nth(answerMirror ? 1 : 0).click();
      const fb = await page.locator('#fb').innerText();
      if (!a.symmetric) { expect(fb).toBe('✓'); decided++ }
      if (fb === '✓') correct++; else wrong++;
      await expect(page.locator('#hud-l')).toHaveText(`✓ ${correct}  ✗ ${wrong}`);
    }
    expect(decided).toBeGreaterThan(0);
  });

  test('more cells at higher difficulty', async ({ page }) => {
    await seedLog(page, Array.from({ length: 7 }, () => play('rotate', 800)));
    await startAndGo(page, 'rotate');
    expect((await analyse(page)).cells).toBe(8);
  });

  test('finishes after 45 s scoring 60 per net correct answer', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'rotate');
    let correct = 0, wrong = 0;
    for (let i = 0; i < 4; i++) {
      const a = await analyse(page);
      await page.keyboard.press(a.isMir && !a.isRot ? 'ArrowRight' : 'ArrowLeft');
      if ((await page.locator('#fb').innerText()) === '✓') correct++; else wrong++;
    }
    await expect(page.locator('#hud-l')).toHaveText(`✓ ${correct}  ✗ ${wrong}`);
    await page.clock.fastForward(46_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText(String(Math.max(0, correct * 60 - wrong * 60)));
    await expect(r.locator('.tags .tag').nth(2)).toHaveText(`${correct} correct`);
    await expect(r.locator('.tags .tag').nth(3)).toHaveText(`${wrong} wrong`);
  });
});
