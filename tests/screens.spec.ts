import { test, expect, GAME_IDS, play, seedLog, localDates, readCurrent } from './fixtures';

test.describe('Navigation', () => {
  test('bottom nav switches screens and highlights the active tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home')).toHaveClass(/active/);
    await expect(page.locator('nav button[data-nav=home]')).toHaveClass(/active/);

    await page.locator('nav button[data-nav=stats]').click();
    await expect(page.locator('#stats')).toHaveClass(/active/);
    await expect(page.locator('#home')).not.toHaveClass(/active/);
    await expect(page.locator('nav button[data-nav=stats]')).toHaveClass(/active/);
    await expect(page.locator('nav button[data-nav=home]')).not.toHaveClass(/active/);
    await expect(page.locator('.screen.active')).toHaveCount(1);

    await page.locator('nav button[data-nav=badges]').click();
    await expect(page.locator('#badges')).toHaveClass(/active/);

    await page.locator('nav button[data-nav=home]').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
  });

  test('the header is rendered on every screen', async ({ page }) => {
    await seedLog(page, [play('match', 500, { x: 100 })]);
    for (const nav of ['stats', 'badges', 'home']) {
      await page.locator(`nav button[data-nav=${nav}]`).click();
      await expect(page.locator('#lvl-label')).toHaveText('Level 2');
    }
  });
});

test.describe('Home screen', () => {
  test('renders the daily workout, brain score and every game card', async ({ page }) => {
    await page.goto('/');
    const home = page.locator('#home');
    await expect(home.locator('.panel h3').first()).toHaveText('📅 Daily Workout');
    await expect(home.locator('.panel').first()).toContainText('Finish all three for +150 XP and to keep your streak alive.');
    const daily: string[] = await page.evaluate(() => dailyGames());
    const dlist = home.locator('.dlist button');
    await expect(dlist).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(dlist.nth(i)).toHaveAttribute('data-play', daily[i]);
      const g = await page.evaluate(id => ({ name: G[id].name, cat: G[id].cat }), daily[i]);
      await expect(dlist.nth(i).locator('.n')).toHaveText(g.name);
      await expect(dlist.nth(i)).toContainText(g.cat);
      await expect(dlist.nth(i)).not.toHaveClass(/done/);
    }
    await expect(home.locator('.bs')).toHaveText('—');
    await expect(home).toContainText('Play a few games to get a score.');
    await expect(home.locator('.cats .cat')).toHaveCount(6);
    await expect(home.locator('.cats .cat .v')).toHaveText(['—', '—', '—', '—', '—', '—']);

    await expect(home.locator('h2')).toHaveText(['Memory', 'Attention', 'Speed', 'Math', 'Language', 'Logic']);
    const cards = home.locator('.gcard');
    await expect(cards).toHaveCount(14);
    const ids = await cards.evaluateAll(els => els.map(e => (e as HTMLElement).dataset.play));
    expect(ids).toEqual(GAME_IDS);
    const first = cards.first();
    await expect(first.locator('.ico')).toHaveText('🃏');
    await expect(first.locator('.nm')).toHaveText('Memory Match');
    await expect(first.locator('.ds')).toHaveText('Flip cards and find every matching pair in as few moves as possible.');
    await expect(first.locator('.meta')).toContainText('Best —');
    await expect(first.locator('.meta')).toContainText('Lvl 1 · 0 plays');
  });

  test('cards show best score, difficulty and play count once played', async ({ page }) => {
    await seedLog(page, [play('match', 800), play('match', 650)]);
    const card = page.locator('.gcard[data-play=match] .meta');
    await expect(card).toContainText('Best 800');
    await expect(card).toContainText('Lvl 2 · 2 plays');
  });

  test('a game opened but never played still shows no best score', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => startGame('dots'));
    await page.locator('#quit-btn').click();
    await expect(page.locator('.gcard[data-play=dots] .meta')).toContainText('Best —');
  });

  test('brain score panel averages recent form per category', async ({ page }) => {
    await seedLog(page, [play('match', 800), play('stroop', 600), play('react', 1500), play('math', 400), play('scramble', 200), play('seq', 700)]);
    const home = page.locator('#home');
    await expect(home.locator('.bs')).toHaveText('617');
    await expect(home).toContainText('Average of your recent form across categories (0–1000).');
    await expect(home.locator('.cats .cat .v')).toHaveText(['800', '600', '1000', '400', '200', '700']);
    const widths = await home.locator('.cats .cat .bar i').evaluateAll(els => els.map(e => (e as HTMLElement).style.width));
    expect(widths).toEqual(['80%', '60%', '100%', '40%', '20%', '70%']);
  });

  test('daily list marks completed games and says when all three are done', async ({ page }) => {
    await page.goto('/');
    const daily: string[] = await page.evaluate(() => dailyGames());
    await seedLog(page, [play(daily[0], 500), play(daily[2], 500)]);
    const dlist = page.locator('#home .dlist button');
    await expect(dlist.nth(0)).toHaveClass(/done/);
    await expect(dlist.nth(0).locator('.tick')).toHaveText('✓');
    await expect(dlist.nth(1)).not.toHaveClass(/done/);
    await expect(dlist.nth(2)).toHaveClass(/done/);
    await expect(page.locator('#home')).toContainText('Finish all three');

    await seedLog(page, daily.map(id => play(id, 500)));
    await expect(page.locator('#home .dlist button.done')).toHaveCount(3);
    await expect(page.locator('#home')).toContainText('Complete! Come back tomorrow.');
  });

  test('clicking a game card or a daily entry opens that game', async ({ page }) => {
    await page.goto('/');
    await page.locator('.gcard[data-play=schulte]').click();
    await expect(page.locator('#play')).toHaveClass(/active/);
    await expect(page.locator('#play-title')).toHaveText('🔍 Number Hunt');
    expect((await readCurrent(page))?.id).toBe('schulte');

    await page.locator('#quit-btn').click();
    const daily: string[] = await page.evaluate(() => dailyGames());
    await page.locator('#home .dlist button').first().click();
    await expect(page.locator('#play')).toHaveClass(/active/);
    expect((await readCurrent(page))?.id).toBe(daily[0]);
  });
});

test.describe('Stats screen', () => {
  test('shows KPIs, a 12-week heatmap and a row per game', async ({ page }) => {
    const [t, y, d2, d3] = localDates([0, -1, -2, -3]);
    await seedLog(page, [
      play('match', 800, { d: t, x: 80 }),
      play('match', 600, { d: y }), play('math', 400, { d: y, dc: 1 }),
      ...Array.from({ length: 4 }, () => play('dots', 500, { d: d2 })),
      ...Array.from({ length: 6 }, () => play('seq', 300, { d: d3 })),
    ]);
    await page.locator('nav button[data-nav=stats]').click();
    const stats = page.locator('#stats');
    await expect(stats.locator('h2')).toHaveText(['Cloud sync', 'Overview', 'Per game']);

    const kpi = async (label: string) => stats.locator('.kpi', { hasText: label }).locator('b').innerText();
    expect(await kpi('Level')).toBe('5');
    expect(await kpi('Total XP')).toBe(String(80 + 60 + 40 + 4 * 50 + 6 * 30));
    expect(await kpi('Games played')).toBe('13');
    expect(await kpi('Average score')).toBe(String(Math.round((800 + 600 + 400 + 2000 + 1800) / 13)));
    expect(await kpi('Days trained')).toBe('4');
    expect(await kpi('Daily workouts')).toBe('1');
    expect(await kpi('Badges')).toBe('5/22');
    expect(await kpi('Brain score')).toBe(String(Math.round((700 + 500 + 400 + 300) / 4)));

    const cells = stats.locator('.heat i');
    await expect(cells).toHaveCount(84);
    await expect(cells.nth(83)).toHaveAttribute('title', `${t}: 1 game`);
    await expect(cells.nth(83)).toHaveClass('l1');
    await expect(cells.nth(82)).toHaveAttribute('title', `${y}: 2 games`);
    await expect(cells.nth(82)).toHaveClass('l2');
    await expect(cells.nth(81)).toHaveClass('l3');
    await expect(cells.nth(80)).toHaveClass('l4');
    await expect(cells.nth(79)).toHaveClass('');
    await expect(cells.nth(79)).toHaveAttribute('title', /: 0 games$/);

    const rows = stats.locator('.stat-row:not(.muted)');
    await expect(rows).toHaveCount(14);
    const match = rows.filter({ hasText: 'Memory Match' });
    await expect(match).toContainText('Memory · 2 plays · avg 700');
    await expect(match.locator('svg polyline')).toHaveCount(1);
    await expect(match.locator('.r b')).toHaveText('800');
    await expect(match.locator('.r').last()).toHaveText('2');
    const math = rows.filter({ hasText: 'Math Sprint' });
    await expect(math).toContainText('Math · 1 plays · avg 400');
    await expect(math.locator('svg')).toHaveCount(0);
    await expect(math).toContainText('—');
    const unplayed = rows.filter({ hasText: 'Shape Shift' });
    await expect(unplayed).toContainText('Logic · 0 plays · avg —');
    await expect(unplayed.locator('.r b')).toHaveText('—');
    await expect(unplayed.locator('.r').last()).toHaveText('1');
  });

  test('is empty-safe before any play', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav button[data-nav=stats]').click();
    const stats = page.locator('#stats');
    await expect(stats.locator('.kpi', { hasText: 'Average score' }).locator('b')).toHaveText('0');
    await expect(stats.locator('.kpi', { hasText: 'Brain score' }).locator('b')).toHaveText('—');
    await expect(stats.locator('.kpi', { hasText: 'Badges' }).locator('b')).toHaveText('0/22');
    await expect(stats.locator('.heat i:not([class=""])')).toHaveCount(0);
  });

  test('sparklines scale to the larger of 1000 and the best recent score', async ({ page }) => {
    await seedLog(page, [play('match', 0), play('match', 1000)]);
    await page.locator('nav button[data-nav=stats]').click();
    const pts = await page.locator('#stats .stat-row', { hasText: 'Memory Match' }).locator('polyline').getAttribute('points');
    expect(pts).toBe('0,30 120,2');
  });
});

test.describe('Badges screen', () => {
  test('lists every badge locked by default', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav button[data-nav=badges]').click();
    const b = page.locator('#badges');
    await expect(b).toContainText('0 of 22 badges earned');
    await expect(b.locator('.badge')).toHaveCount(22);
    await expect(b.locator('.badge.locked')).toHaveCount(22);
    await expect(b.locator('.badge').first().locator('.nm')).toHaveText('First Rep');
    await expect(b.locator('.badge').first().locator('.ds')).toHaveText('Play your first game');
    await expect(b.locator('.badge').first().locator('.ico')).toHaveText('🌱');
  });

  test('unlocks badges from the derived state', async ({ page }) => {
    await seedLog(page, [play('match', 950, { a: ['s3'] })]);
    await page.locator('nav button[data-nav=badges]').click();
    const b = page.locator('#badges');
    await expect(b).toContainText('3 of 22 badges earned');
    const unlocked = b.locator('.badge:not(.locked) .nm');
    await expect(unlocked).toHaveText(['First Rep', 'On a Roll', 'Sharpshooter']);
  });
});

test.describe('Touch handling', () => {
  test('double-tap zoom is disabled on the page, buttons and the arena', async ({ page }) => {
    await page.goto('/');
    const ta = (sel: string) => page.locator(sel).first().evaluate(el => getComputedStyle(el).touchAction);
    expect(await ta('body')).toBe('manipulation');
    expect(await ta('nav button')).toBe('manipulation');
    expect(await ta('.gcard')).toBe('manipulation');
    await page.evaluate(() => startGame('react'));
    expect(await ta('#arena')).toBe('manipulation');
    expect(await ta('.overlay .btn')).toBe('manipulation');
  });
});
