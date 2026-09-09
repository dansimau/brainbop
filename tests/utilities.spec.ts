import { test, expect } from './fixtures';

test.describe('Utilities', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/') });

  test('esc() escapes &, <, > and double quotes', async ({ page }) => {
    expect(await page.evaluate(() => esc('<b a="1">&</b>'))).toBe('&lt;b a=&quot;1&quot;&gt;&amp;&lt;/b&gt;');
    expect(await page.evaluate(() => esc(5))).toBe('5');
    expect(await page.evaluate(() => esc("it's"))).toBe("it's");
  });

  test('clamp() bounds a value inclusively', async ({ page }) => {
    expect(await page.evaluate(() => [clamp(5, 0, 10), clamp(-1, 0, 10), clamp(11, 0, 10), clamp(0, 0, 10), clamp(10, 0, 10)])).toEqual([5, 0, 10, 0, 10]);
  });

  test('rndInt() is inclusive on both ends and never leaves the range', async ({ page }) => {
    const draws: number[] = await page.evaluate(() => Array.from({ length: 2000 }, () => rndInt(3, 7)));
    expect(Math.min(...draws)).toBe(3);
    expect(Math.max(...draws)).toBe(7);
    expect(draws.every(n => Number.isInteger(n))).toBe(true);
  });

  test('pick() returns a member of the array', async ({ page }) => {
    const ok = await page.evaluate(() => { const a = ['x', 'y', 'z']; return Array.from({ length: 50 }, () => pick(a)).every(v => a.includes(v)) });
    expect(ok).toBe(true);
  });

  test('shuffle() returns a permutation and leaves the input untouched', async ({ page }) => {
    const r = await page.evaluate(() => {
      const a = [1, 2, 3, 4, 5, 6, 7, 8];
      const b = shuffle(a);
      const moved = Array.from({ length: 20 }, () => shuffle(a).join()).some(s => s !== a.join());
      return { a, b: [...b].sort((x, y) => x - y), same: b === a, moved };
    });
    expect(r.a).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.b).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.same).toBe(false);
    expect(r.moved).toBe(true);
  });

  test('dateStr(), today() and yesterday() use local time with zero padding', async ({ page }) => {
    const r = await page.evaluate(() => {
      const d = new Date(); d.setDate(d.getDate() - 1);
      return { fixed: dateStr(new Date(2026, 0, 5, 23, 30)), today: today(), now: dateStr(new Date()), yesterday: yesterday(), expectY: dateStr(d) };
    });
    expect(r.fixed).toBe('2026-01-05');
    expect(r.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.today).toBe(r.now);
    expect(r.yesterday).toBe(r.expectY);
  });

  test('dateStr() is local, not UTC', async ({ page }) => {
    // 23:30 local on Jan 5 is Jan 5 regardless of timezone; toISOString may say otherwise.
    const r = await page.evaluate(() => { const d = new Date(2026, 0, 5, 23, 30); return { local: dateStr(d), day: d.getDate() } });
    expect(r.local.endsWith(`-0${r.day}`)).toBe(true);
  });

  test('seeded() gives a deterministic stream in [0, 1)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const a = seeded('daily2026-09-09'), b = seeded('daily2026-09-09'), c = seeded('daily2026-09-10');
      const sa = Array.from({ length: 20 }, () => a()), sb = Array.from({ length: 20 }, () => b()), sc = Array.from({ length: 20 }, () => c());
      return { sa, sb, sc };
    });
    expect(r.sa).toEqual(r.sb);
    expect(r.sa).not.toEqual(r.sc);
    expect(r.sa.every(v => v >= 0 && v < 1)).toBe(true);
    expect(new Set(r.sa).size).toBeGreaterThan(15);
  });

  test('levelInfo() follows a curve that grows 20% per level', async ({ page }) => {
    const r = await page.evaluate(() => [0, 99, 100, 219, 220, 364, 537].map(levelInfo));
    expect(r).toEqual([
      { level: 1, into: 0, need: 100 },
      { level: 1, into: 99, need: 100 },
      { level: 2, into: 0, need: 120 },
      { level: 2, into: 119, need: 120 },
      { level: 3, into: 0, need: 144 },
      { level: 4, into: 0, need: 173 },
      { level: 5, into: 0, need: 208 },
    ]);
  });

  test('toast() shows a message and removes it after 3 seconds', async ({ page }) => {
    await page.clock.install();
    await page.evaluate(() => toast('Hello there'));
    const t = page.locator('.toast');
    await expect(t).toHaveText('Hello there');
    await page.clock.fastForward(3100);
    await expect(t).toHaveCount(0);
  });
});
