import { Page } from '@playwright/test';
import { test, expect, play, seedLog, startAndGo } from '../fixtures';

/** The scramble on screen plus every listed word (and anagram) it could be. */
const puzzle = (page: Page) => page.evaluate(() => {
  const s = document.querySelector('#sw')!.textContent!.toLowerCase();
  const key = [...s].sort().join('');
  const cands = WORDS[s.length].filter(w => [...w].sort().join('') === key);
  return { s, cands, alts: cands.flatMap(w => anagrams(w)).filter(a => !cands.includes(a)) };
});
const submit = async (page: Page, v: string) => { await page.locator('#ans').fill(v); await page.locator('#ans').press('Enter') };

test.describe('Word Scramble', () => {
  test('shows a scrambled 4-letter word with a 60 s countdown at difficulty 1', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'scramble');
    const p = await puzzle(page);
    expect(p.s).toMatch(/^[a-z]{4}$/);
    expect(await page.locator('#sw').innerText()).toBe(p.s.toUpperCase());
    expect(p.cands.length).toBeGreaterThan(0);
    expect(p.cands).not.toContain(p.s);
    await expect(page.locator('#hud-l')).toHaveText('Solved 0 · Skipped 0');
    await expect(page.locator('#hud-r')).toHaveText('⏱ 60s');
    await expect(page.locator('#ans')).toBeFocused();
  });

  test('solving, rejecting the scramble itself, wrong guesses and skipping', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'scramble');
    const p = await puzzle(page);
    await submit(page, p.s.toUpperCase());
    await expect(page.locator('#fb')).toHaveText('✗ that is the scramble itself');
    await expect(page.locator('#sw')).toHaveText(p.s.toUpperCase());
    await submit(page, 'zzzz');
    await expect(page.locator('#fb')).toHaveText('✗ try again');
    await expect(page.locator('#hud-l')).toHaveText('Solved 0 · Skipped 0');
    await page.locator('#ans').press('Enter');
    await expect(page.locator('#fb')).toHaveText('✗ try again');

    await submit(page, ` ${p.cands[0].toUpperCase()} `);
    await expect(page.locator('#fb')).toHaveText(/^✓ /);
    await expect(page.locator('#hud-l')).toHaveText('Solved 1 · Skipped 0');
    const next = await puzzle(page);
    expect(next.s).not.toBe(p.s);

    await page.locator('#skip').click();
    await expect(page.locator('#fb')).toHaveText('skipped');
    await expect(page.locator('#hud-l')).toHaveText('Solved 1 · Skipped 1');
    const after = await puzzle(page);
    expect(after.s).not.toBe(next.s);
    // Skipping must not reveal the answer.
    for (const w of next.cands) await expect(page.locator('#fb')).not.toContainText(w);
  });

  test('never repeats a word within a game', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'scramble');
    // The list holds genuine anagram pairs (lamp/palm), so a letter set may recur once per such word.
    const seen: Record<string, { n: number; max: number }> = {};
    for (let i = 0; i < 25; i++) {
      const p = await puzzle(page);
      const key = [...p.s].sort().join('');
      seen[key] = { n: (seen[key]?.n ?? 0) + 1, max: p.cands.length };
      await page.locator('#skip').click();
    }
    for (const [key, v] of Object.entries(seen)) expect(v.n, key).toBeLessThanOrEqual(v.max);
    expect(Object.keys(seen).length).toBeGreaterThan(20);
  });

  test('accepts any listed anagram and mentions the intended word', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'scramble');
    let p = await puzzle(page);
    for (let i = 0; i < 40 && !p.alts.length; i++) { await page.locator('#skip').click(); p = await puzzle(page) }
    expect(p.alts.length).toBeGreaterThan(0);
    await submit(page, p.alts[0]);
    await expect(page.locator('#fb')).toHaveText(new RegExp(`^✓ ${p.alts[0]} \\(also \\w+\\)$`));
    await expect(page.locator('#hud-l')).toHaveText(/^Solved 1/);
  });

  test('longer words at higher difficulty', async ({ page }) => {
    await seedLog(page, Array.from({ length: 4 }, () => play('scramble', 800)));
    await startAndGo(page, 'scramble');
    expect((await puzzle(page)).s).toMatch(/^[a-z]{6}$/);

    await seedLog(page, Array.from({ length: 8 }, () => play('scramble', 800)));
    await startAndGo(page, 'scramble');
    const lens = new Set<number>();
    for (let i = 0; i < 20; i++) { lens.add((await puzzle(page)).s.length); await page.locator('#skip').click() }
    expect([...lens].every(l => l >= 5 && l <= 8)).toBe(true);
    expect(lens.size).toBeGreaterThan(1);
  });

  test('finishes after 60 s scoring 130 per word minus 20 per skip', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await startAndGo(page, 'scramble');
    for (let i = 0; i < 2; i++) { const p = await puzzle(page); await submit(page, p.cands[0]); await expect(page.locator('#hud-l')).toHaveText(`Solved ${i + 1} · Skipped 0`) }
    await page.locator('#skip').click();
    await page.clock.fastForward(61_000);
    const r = page.locator('#result');
    await expect(r).toHaveClass(/active/);
    await expect(r.locator('.score')).toHaveText('240');
    await expect(r.locator('.tags .tag').nth(2)).toHaveText('2 solved');
    await expect(r.locator('.tags .tag').nth(3)).toHaveText('1 skipped');
  });
});
