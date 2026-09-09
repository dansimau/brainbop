import { test, expect, GAME_IDS, play, seedLog, readS } from './fixtures';

test.describe('Game registry', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/') });

  test('registers the fourteen games with stable ids', async ({ page }) => {
    const ids: string[] = await page.evaluate(() => GAMES.map(g => g.id));
    expect(ids).toEqual(GAME_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(await page.evaluate(() => Object.keys(G).length)).toBe(14);
  });

  test('every game declares the fields the UI relies on', async ({ page }) => {
    const games = await page.evaluate(() => GAMES.map(g => ({ id: g.id, name: g.name, icon: g.icon, cat: g.cat, desc: g.desc, how: g.how, start: typeof g.start, inG: G[g.id] === g })));
    for (const g of games) {
      expect(g.name, g.id).toBeTruthy();
      expect(g.icon, g.id).toBeTruthy();
      expect(['Memory', 'Attention', 'Speed', 'Math', 'Language', 'Logic'], g.id).toContain(g.cat);
      expect(g.desc.length, g.id).toBeGreaterThan(10);
      expect(g.how.length, g.id).toBeGreaterThan(10);
      expect(g.start, g.id).toBe('function');
      expect(g.inG, g.id).toBe(true);
    }
  });

  test('categories are in display order and each has at least one game', async ({ page }) => {
    expect(await page.evaluate(() => CATS)).toEqual(['Memory', 'Attention', 'Speed', 'Math', 'Language', 'Logic']);
    const counts = await page.evaluate(() => CATS.map(c => GAMES.filter(g => g.cat === c).length));
    expect(counts).toEqual([5, 2, 2, 1, 2, 2]);
  });
});

test.describe('Achievements', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/') });

  test('defines 22 badges with unique ids', async ({ page }) => {
    const ach = await page.evaluate(() => ACH.map(a => ({ id: a.id, ico: a.ico, nm: a.nm, ds: a.ds, arity: a.t.length })));
    expect(ach).toHaveLength(22);
    expect(new Set(ach.map(a => a.id)).size).toBe(22);
    expect(ach.map(a => a.id)).toEqual(['first', 'p10', 'p50', 'p200', 'all', 'l5', 'l10', 'l25', 's3', 's7', 's30', 'd1', 'd10', 'sc900', 'sc900x5', 'diff5', 'diff10', 'nbperf', 'fast', 'span9', 'xp5k', 'xp25k']);
    for (const a of ach) { expect(a.ico, a.id).toBeTruthy(); expect(a.nm, a.id).toBeTruthy(); expect(a.ds, a.id).toBeTruthy() }
  });

  test('only nbperf, fast and span9 need play context', async ({ page }) => {
    const ctx = await page.evaluate(() => ACH.filter(a => a.t.length > 1).map(a => a.id));
    expect(ctx).toEqual(['nbperf', 'fast', 'span9']);
  });

  test('state-based tests evaluate the derived state', async ({ page }) => {
    const r = await page.evaluate(() => {
      const t = (id: string, s: any) => !!ACH.find(a => a.id === id).t(s);
      const base = { totalPlays: 0, xp: 0, games: {}, streak: { count: 0 }, dailyCount: 0 };
      return {
        first0: t('first', base), first1: t('first', { ...base, totalPlays: 1 }),
        p200: t('p200', { ...base, totalPlays: 200 }),
        l5: t('l5', { ...base, xp: 536 }), l5yes: t('l5', { ...base, xp: 537 }),
        s7: t('s7', { ...base, streak: { count: 7 } }),
        d10: t('d10', { ...base, dailyCount: 10 }),
        sc900: t('sc900', { ...base, games: { a: { best: 900 } } }), sc899: t('sc900', { ...base, games: { a: { best: 899 } } }),
        sc900x5: t('sc900x5', { ...base, games: Object.fromEntries('abcde'.split('').map(k => [k, { best: 950 }])) }),
        sc900x4: t('sc900x5', { ...base, games: Object.fromEntries('abcd'.split('').map(k => [k, { best: 950 }])) }),
        diff5: t('diff5', { ...base, games: { a: { diff: 5 } } }), diff10: t('diff10', { ...base, games: { a: { diff: 9 } } }),
        all: t('all', { ...base, games: Object.fromEntries(GAMES.map(g => [g.id, { plays: 1 }])) }),
        allButOne: t('all', { ...base, games: Object.fromEntries(GAMES.slice(1).map(g => [g.id, { plays: 1 }])) }),
        xp5k: t('xp5k', { ...base, xp: 5000 }), xp25k: t('xp25k', { ...base, xp: 24999 }),
      };
    });
    expect(r).toEqual({ first0: false, first1: true, p200: true, l5: false, l5yes: true, s7: true, d10: true, sc900: true, sc899: false, sc900x5: true, sc900x4: false, diff5: true, diff10: false, all: true, allButOne: false, xp5k: true, xp25k: false });
  });

  test('context-based tests check the finishing play', async ({ page }) => {
    const r = await page.evaluate(() => {
      const t = (id: string, c: any) => !!ACH.find(a => a.id === id).t({}, c);
      return {
        nb: t('nbperf', { id: 'nback', extra: { perfect: true } }), nbNo: t('nbperf', { id: 'nback', extra: { perfect: false } }), nbOther: t('nbperf', { id: 'react', extra: { perfect: true } }),
        fast: t('fast', { id: 'react', extra: { avg: 219 } }), slow: t('fast', { id: 'react', extra: { avg: 220 } }),
        span9: t('span9', { id: 'digits', extra: { len: 9 } }), span8: t('span9', { id: 'digits', extra: { len: 8 } }),
        noCtx: t('fast', undefined),
      };
    });
    expect(r).toEqual({ nb: true, nbNo: false, nbOther: false, fast: true, slow: false, span9: true, span8: false, noCtx: false });
  });
});

test.describe('Daily workout', () => {
  test('picks three distinct games and is stable for the day', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(() => ({ a: dailyGames(), b: dailyGames(), valid: dailyGames().every(id => !!G[id]) }));
    expect(r.a).toHaveLength(3);
    expect(new Set(r.a).size).toBe(3);
    expect(r.a).toEqual(r.b);
    expect(r.valid).toBe(true);
  });

  test('is seeded by the date', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 0, 1, 12) });
    await page.goto('/');
    const jan1 = await page.evaluate(() => dailyGames());
    // Find a nearby date with a different pick, proving the seed includes the date.
    let differs = false;
    for (let i = 1; i <= 5 && !differs; i++) {
      await page.clock.setSystemTime(new Date(2026, 0, 1 + i, 12));
      const pick = await page.evaluate(() => dailyGames());
      expect(pick).toHaveLength(3);
      differs = pick.join() !== jan1.join();
    }
    expect(differs).toBe(true);
  });

  test('dailyState() re-derives when the date rolls over', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 5, 15, 23, 59, 30) });
    await page.goto('/');
    const ids: string[] = await page.evaluate(() => dailyGames());
    await page.evaluate(id => { startGame(id); endGame(id, 500, [], {}) }, ids[0]);
    await expect(page.locator('#result .score')).toHaveText('500');
    let d = await page.evaluate(() => dailyState());
    expect(d).toEqual({ date: '2026-06-15', done: [ids[0]] });
    await page.clock.fastForward(60_000);
    d = await page.evaluate(() => dailyState());
    expect(d.date).toBe('2026-06-16');
    expect(d.done).toEqual([]);
  });
});

test.describe('Brain score', () => {
  test('is null until something has been played', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(() => ({ bs: brainScore(), cs: catScores(), ra: recentAvg('match') }));
    expect(r.bs).toBeNull();
    expect(r.ra).toBeNull();
    expect(Object.values(r.cs).every(v => v === null)).toBe(true);
    expect(Object.keys(r.cs)).toEqual(['Memory', 'Attention', 'Speed', 'Math', 'Language', 'Logic']);
  });

  test('averages the last five scores per game, capped at 1000, then per category', async ({ page }) => {
    await seedLog(page, [
      ...[100, 100, 100, 100, 100, 900, 900, 900, 900, 900].map(s => play('match', s)),
      play('simon', 1500), play('simon', 500),
      play('math', 600), play('math', 800),
    ]);
    const r = await page.evaluate(() => ({ match: recentAvg('match'), simon: recentAvg('simon'), simon1: recentAvg('simon', 1), cs: catScores(), bs: brainScore() }));
    expect(r.match).toBe(900);
    expect(r.simon).toBe(750);
    expect(r.simon1).toBe(500);
    expect(r.cs).toEqual({ Memory: 825, Attention: null, Speed: null, Math: 700, Language: null, Logic: null });
    expect(r.bs).toBe(763);
  });

  test('ignores games opened but not played', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { startGame('match'); abortGame() });
    expect(await page.evaluate(() => brainScore())).toBeNull();
    expect((await readS(page)).games.match.plays).toBe(0);
  });
});

test.describe('Word lists', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/') });

  test('every scramble word sits in the bucket for its length, with no duplicates', async ({ page }) => {
    const r = await page.evaluate(() => Object.entries(WORDS).map(([n, ws]) => ({ n: +n, count: ws.length, wrong: ws.filter(w => w.length !== +n), dups: ws.filter((w, i) => ws.indexOf(w) !== i) })));
    expect(r.map(x => x.n)).toEqual([4, 5, 6, 7, 8]);
    for (const x of r) {
      expect(x.count, `${x.n}-letter words`).toBeGreaterThanOrEqual(40);
      expect(x.wrong, `${x.n}-letter bucket`).toEqual([]);
      expect(x.dups, `${x.n}-letter bucket`).toEqual([]);
    }
  });

  test('anagram links are real anagrams of listed words, in both directions', async ({ page }) => {
    const r = await page.evaluate(() => {
      const all = Object.values(WORDS).flat();
      const sorted = (w: string) => [...w].sort().join('');
      const problems: string[] = [];
      for (const w of all) for (const a of anagrams(w)) {
        if (sorted(a) !== sorted(w)) problems.push(`${w} -> ${a} is not an anagram`);
        if (all.includes(a) && !anagrams(a).includes(w)) problems.push(`${a} does not link back to ${w}`);
      }
      for (const ws of Object.values(WORDS)) for (const w of ws) for (const v of ws)
        if (w < v && sorted(w) === sorted(v) && !anagrams(w).includes(v)) problems.push(`${w}/${v} share letters but are not linked`);
      return { problems, sample: anagrams('lamp'), none: anagrams('apple') };
    });
    expect(r.problems).toEqual([]);
    expect(r.sample).toEqual(['palm']);
    expect(r.none).toEqual([]);
  });

  test('odd-word categories have ten distinct words each and never overlap', async ({ page }) => {
    const r = await page.evaluate(() => ({ sizes: CATEGORIES.map(c => new Set(c).size), all: CATEGORIES.flat() }));
    expect(r.sizes).toEqual(Array(16).fill(10));
    expect(new Set(r.all).size).toBe(r.all.length);
  });
});
