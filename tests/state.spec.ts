import { test, expect, KEY, play, seedLog, readLog, readS, localDates, startAndGo, finishGame } from './fixtures';

test.describe('Storage and load()', () => {
  test('a fresh visit creates an empty v2 log and a level 1 header', async ({ page }) => {
    await page.goto('/');
    expect(await readLog(page)).toEqual({ recs: [], sound: true, sync: {} });
    const s = await readS(page);
    expect(s.xp).toBe(0);
    expect(s.totalPlays).toBe(0);
    expect(s.ach).toEqual([]);
    await expect(page.locator('#lvl-label')).toHaveText('Level 1');
    await expect(page.locator('#lvl-xp')).toHaveText('0 / 100 XP · 0 total');
    await expect(page.locator('#lvl-bar')).toHaveCSS('width', '0px');
    await expect(page.locator('#streak-chip')).toHaveText('🔥 0');
    await expect(page.locator('#sound-btn')).toHaveText('🔊');
  });

  test('corrupt or malformed v2 storage falls back to a fresh log', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(k => localStorage.setItem(k, 'not json'), KEY);
    await page.reload();
    expect((await readLog(page)).recs).toEqual([]);
    await page.evaluate(k => localStorage.setItem(k, '{"foo":1}'), KEY);
    await page.reload();
    expect((await readLog(page)).recs).toEqual([]);
    await expect(page.locator('.gcard')).toHaveCount(14);
  });

  test('missing sync/sound keys in an old v2 log get in-memory defaults', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ recs: [] })), KEY);
    await page.reload();
    expect(await page.evaluate(() => ({ sound: L.sound, sync: L.sync }))).toEqual({ sound: true, sync: {} });
    expect((await readS(page)).sound).toBe(true);
    // load() does not write the defaults back until something is saved.
    expect(await readLog(page)).toEqual({ recs: [] });
    await page.locator('#sound-btn').click();
    expect(await readLog(page)).toEqual({ recs: [], sound: false, sync: {} });
  });
});

test.describe('v1 migration', () => {
  const V1 = {
    xp: 1234, totalPlays: 12, dailyCount: 2, sound: false,
    games: { match: { best: 800, plays: 5, total: 3000, diff: 3, hist: [500, 800] }, math: { best: 300, plays: 7, total: 1400, diff: 1, hist: [300] } },
    days: { '2026-01-01': 2, '2026-01-02': 3 },
    ach: ['first', 'p10'],
  };

  test('migrates brainbop_v1 into a single _base record when v2 is absent', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(([k, v1]) => { localStorage.removeItem(k); localStorage.setItem('brainbop_v1', JSON.stringify(v1)) }, [KEY, V1] as const);
    await page.reload();

    const log = await readLog(page);
    expect(log.sound).toBe(false);
    expect(log.recs).toHaveLength(1);
    const base = log.recs[0];
    expect(base).toMatchObject({ g: '_base', xp: 1234, totalPlays: 12, dailyCount: 2, games: V1.games, days: V1.days, ach: V1.ach, u: 1 });
    expect(typeof base.id).toBe('string');
    expect(typeof base.t).toBe('number');

    const s = await readS(page);
    expect(s.xp).toBe(1234);
    expect(s.totalPlays).toBe(12);
    expect(s.dailyCount).toBe(2);
    expect(s.sound).toBe(false);
    expect(s.games.match).toEqual({ best: 800, plays: 5, total: 3000, diff: 3, hist: [500, 800] });
    expect(s.days).toEqual(V1.days);
    expect(s.ach).toEqual(expect.arrayContaining(['first', 'p10', 'l5']));
    await expect(page.locator('#lvl-label')).toHaveText('Level 7');
    await expect(page.locator('#sound-btn')).toHaveText('🔇');
  });

  test('once v2 exists, v1 is never read again', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(([k, v1]) => { localStorage.removeItem(k); localStorage.setItem('brainbop_v1', JSON.stringify(v1)) }, [KEY, V1] as const);
    await page.reload();
    const before = await readLog(page);
    await page.evaluate(v1 => localStorage.setItem('brainbop_v1', JSON.stringify({ ...v1, xp: 99999, totalPlays: 999 })), V1);
    await page.reload();
    const after = await readLog(page);
    expect(after).toEqual(before);
    expect((await readS(page)).xp).toBe(1234);
  });

  test('v1 is never written to', async ({ page }) => {
    await page.goto('/');
    const raw = JSON.stringify(V1);
    await page.evaluate(([k, raw]) => { localStorage.removeItem(k); localStorage.setItem('brainbop_v1', raw) }, [KEY, raw] as const);
    await page.reload();
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 500);
    await expect(page.locator('#result .score')).toHaveText('500');
    expect(await page.evaluate(() => localStorage.getItem('brainbop_v1'))).toBe(raw);
  });

  test('a v1 with no plays carries over only the sound preference', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(k => { localStorage.removeItem(k); localStorage.setItem('brainbop_v1', JSON.stringify({ totalPlays: 0, xp: 0, sound: false })) }, KEY);
    await page.reload();
    const log = await readLog(page);
    expect(log.recs).toEqual([]);
    expect(log.sound).toBe(false);
  });

  test('a corrupt v1 is ignored', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(k => { localStorage.removeItem(k); localStorage.setItem('brainbop_v1', '{{{') }, KEY);
    await page.reload();
    expect(await readLog(page)).toEqual({ recs: [], sound: true, sync: {} });
  });
});

test.describe('derive()', () => {
  test('folds plays in time order regardless of array order', async ({ page }) => {
    await seedLog(page, [play('match', 100, { t: 2000, x: 10 }), play('match', 900, { t: 1000, x: 90 })]);
    const s = await readS(page);
    const [t] = localDates([0]);
    expect(s.games.match).toEqual({ best: 900, plays: 2, total: 1000, diff: 1, hist: [900, 100] });
    expect(s.history.map((h: any) => h.s)).toEqual([900, 100]);
    expect(s.history[0]).toEqual({ d: t, g: 'match', s: 900 });
    expect(s.xp).toBe(100);
    expect(s.totalPlays).toBe(2);
    expect(s.days).toEqual({ [t]: 2 });
    expect(s.streak).toEqual({ count: 1, last: t });
  });

  test('difficulty rises on 750+, falls under 350, and is clamped to 1..10', async ({ page }) => {
    await seedLog(page, [...Array.from({ length: 12 }, () => play('match', 800)), play('grid', 800), play('grid', 500), play('grid', 100), play('grid', 100), play('grid', 100)]);
    const s = await readS(page);
    expect(s.games.match.diff).toBe(10);
    expect(s.games.grid.diff).toBe(1);
    expect(s.games.grid.hist).toEqual([800, 500, 100, 100, 100]);
  });

  test('a mid-range score leaves difficulty alone', async ({ page }) => {
    await seedLog(page, [play('math', 800), play('math', 749), play('math', 350)]);
    expect((await readS(page)).games.math.diff).toBe(2);
  });

  test('hist keeps the last 40 scores and history the last 500 plays', async ({ page }) => {
    await seedLog(page, Array.from({ length: 505 }, (_, i) => play('math', i)));
    const s = await readS(page);
    expect(s.games.math.hist).toHaveLength(40);
    expect(s.games.math.hist[0]).toBe(465);
    expect(s.games.math.hist[39]).toBe(504);
    expect(s.history).toHaveLength(500);
    expect(s.history[0].s).toBe(5);
    expect(s.totalPlays).toBe(505);
  });

  test('dc counts daily workouts and a pins achievements permanently', async ({ page }) => {
    await seedLog(page, [play('match', 500, { dc: 1, a: ['s30', 'fast'] })]);
    const s = await readS(page);
    expect(s.dailyCount).toBe(1);
    expect(s.streak.count).toBe(1);
    expect(s.ach).toEqual(expect.arrayContaining(['s30', 'fast', 'first']));
    expect(s.ach.filter((a: string) => a === 's30')).toHaveLength(1);
  });

  test('state-based achievements are re-evaluated on every derive', async ({ page }) => {
    await seedLog(page, Array.from({ length: 10 }, () => play('match', 100)));
    const s = await readS(page);
    expect(s.ach).toEqual(expect.arrayContaining(['first', 'p10']));
    expect(s.ach).not.toContain('p50');
    expect(s.ach).not.toContain('sc900');
  });

  test('a _base record folds additively with later plays', async ({ page }) => {
    const [t, y] = localDates([0, -1]);
    const base = { id: 'base1', t: 1000, g: '_base', xp: 50, totalPlays: 2, dailyCount: 1, ach: ['p50'], days: { [y]: 2 },
      games: { match: { best: 700, plays: 2, total: 1000, diff: 4, hist: [400, 600] } } };
    await seedLog(page, [base, play('match', 300, { t: 2000, x: 30 })]);
    const s = await readS(page);
    expect(s.games.match).toEqual({ best: 700, plays: 3, total: 1300, diff: 3, hist: [400, 600, 300] });
    expect(s.xp).toBe(80);
    expect(s.totalPlays).toBe(3);
    expect(s.dailyCount).toBe(1);
    expect(s.days).toEqual({ [y]: 2, [t]: 1 });
    expect(s.ach).toContain('p50');
    expect(s.streak).toEqual({ count: 2, last: t });
    expect(s.history).toHaveLength(1);
  });

  test('a _base with missing fields uses safe defaults', async ({ page }) => {
    await seedLog(page, [{ id: 'b', t: 1, g: '_base' }]);
    const s = await readS(page);
    expect(s.xp).toBe(0);
    expect(s.totalPlays).toBe(0);
    expect(s.games).toEqual({});
  });

  test('records are never edited: unknown fields survive further plays', async ({ page }) => {
    await seedLog(page, [play('match', 500, { zzz: 'keep me', id: 'seed-1' })]);
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 600);
    await expect(page.locator('#result .score')).toHaveText('600');
    const log = await readLog(page);
    expect(log.recs).toHaveLength(2);
    expect(log.recs[0]).toMatchObject({ id: 'seed-1', s: 500, zzz: 'keep me' });
  });

  test('S is rebuilt from the log alone: gs() entries for unplayed games are transient', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => startGame('dots'));
    expect((await readS(page)).games.dots).toEqual({ best: 0, plays: 0, total: 0, diff: 1, hist: [] });
    await page.evaluate(() => derive());
    expect((await readS(page)).games.dots).toBeUndefined();
  });
});

test.describe('Streaks', () => {
  test('streakFrom() walks back from today or yesterday', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(() => {
      const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return dateStr(x) };
      return {
        three: streakFrom({ [d(0)]: 1, [d(1)]: 2, [d(2)]: 1 }),
        yOnly: streakFrom({ [d(1)]: 1 }),
        gapToday: streakFrom({ [d(0)]: 1, [d(2)]: 1 }),
        stale: streakFrom({ [d(2)]: 1, [d(3)]: 1 }),
        none: streakFrom({}),
        expect: { t: d(0), y: d(1) },
      };
    });
    expect(r.three).toEqual({ count: 3, last: r.expect.t });
    expect(r.yOnly).toEqual({ count: 1, last: r.expect.y });
    expect(r.gapToday).toEqual({ count: 1, last: r.expect.t });
    expect(r.stale).toEqual({ count: 0, last: null });
    expect(r.none).toEqual({ count: 0, last: null });
  });

  test('the header shows a live streak from yesterday', async ({ page }) => {
    const [y, y2] = localDates([-1, -2]);
    await seedLog(page, [play('match', 500, { d: y }), play('math', 500, { d: y2 })]);
    await expect(page.locator('#streak-chip')).toHaveText('🔥 2');
    await expect(page.locator('#streak-chip')).toHaveAttribute('title', '2-day streak');
  });

  test('a streak that ended before yesterday shows as zero', async ({ page }) => {
    const [d3, d4] = localDates([-3, -4]);
    await seedLog(page, [play('match', 500, { d: d3 }), play('math', 500, { d: d4 })]);
    await expect(page.locator('#streak-chip')).toHaveText('🔥 0');
    await expect(page.locator('#streak-chip')).toHaveAttribute('title', 'Play today to start a streak');
  });

  test('playing today extends yesterday\'s streak', async ({ page }) => {
    const [y] = localDates([-1]);
    await seedLog(page, [play('match', 500, { d: y })]);
    await expect(page.locator('#streak-chip')).toHaveText('🔥 1');
    await startAndGo(page, 'math');
    await finishGame(page, 'math', 400);
    await expect(page.locator('#streak-chip')).toHaveText('🔥 2');
  });
});

test.describe('Sound preference', () => {
  test('toggles, persists across reloads and never becomes a record', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#sound-btn');
    await btn.click();
    await expect(btn).toHaveText('🔇');
    expect((await readS(page)).sound).toBe(false);
    expect((await readLog(page)).sound).toBe(false);
    await page.reload();
    await expect(btn).toHaveText('🔇');
    await btn.click();
    await expect(btn).toHaveText('🔊');
    const log = await readLog(page);
    expect(log.sound).toBe(true);
    expect(log.recs).toEqual([]);
  });
});

test.describe('Header', () => {
  test('shows level progress derived from XP', async ({ page }) => {
    await seedLog(page, [play('match', 500, { x: 229 })]);
    await expect(page.locator('#lvl-label')).toHaveText('Level 3');
    await expect(page.locator('#lvl-xp')).toHaveText('9 / 144 XP · 229 total');
    const width = await page.locator('#lvl-bar').evaluate(el => (el as HTMLElement).style.width);
    expect(parseFloat(width)).toBeCloseTo(100 * 9 / 144, 3);
  });
});
