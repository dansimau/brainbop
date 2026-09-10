import { test, expect, play, seedLog, readLog, readS, localDates, startAndGo, finishGame, readCurrent, readConfetti, CONFETTI_CDN } from './fixtures';

test.describe('Intro overlay', () => {
  test('shows the game info and focuses Start', async ({ page }) => {
    await page.goto('/');
    await page.locator('.gcard[data-play=math]').click();
    await expect(page.locator('#play')).toHaveClass(/active/);
    await expect(page.locator('#play-title')).toHaveText('➕ Math Sprint');
    await expect(page.locator('#play-diff')).toHaveText('Difficulty 1/10');
    const ov = page.locator('#arena .overlay');
    await expect(ov.locator('.ico')).toHaveText('➕');
    await expect(ov.locator('h3')).toHaveText('Math Sprint');
    await expect(ov).toContainText('Solve as many arithmetic problems as you can in 60 seconds.');
    await expect(ov).toContainText('Type the answer and hit Go. Operators and sizes grow with difficulty.');
    await expect(ov).toContainText('Best: — · Difficulty 1/10');
    await expect(page.locator('#go-btn')).toBeFocused();
    await expect(page.locator('#hud-l')).toHaveText('');
    await expect(page.locator('#hud-r')).toHaveText('');
    expect(await readCurrent(page)).toEqual({ id: 'math', timers: 0, done: false, started: false, hasKey: true });
  });

  test('shows the current best and difficulty once played', async ({ page }) => {
    await seedLog(page, [play('math', 800), play('math', 760)]);
    await page.evaluate(() => startGame('math'));
    await expect(page.locator('#play-diff')).toHaveText('Difficulty 3/10');
    await expect(page.locator('#arena .overlay')).toContainText('Best: 800 · Difficulty 3/10');
  });

  for (const how of ['click', 'Enter', 'Space'] as const) {
    test(`Start responds to ${how}`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => startGame('math'));
      if (how === 'click') await page.locator('#go-btn').click();
      else await page.keyboard.press(how);
      await expect(page.locator('#go-btn')).toHaveCount(0);
      await expect(page.locator('#q')).toBeVisible();
      expect((await readCurrent(page))?.started).toBe(true);
    });
  }

  test('Start fires only once even if Enter keeps arriving', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => startGame('math'));
    await page.keyboard.press('Enter');
    await expect(page.locator('#q')).toBeVisible();
    await page.locator('#q').evaluate(el => el.setAttribute('data-marker', 'original'));
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(page.locator('#q[data-marker=original]')).toHaveCount(1);
    expect((await readCurrent(page))?.timers).toBe(1);
  });
});

test.describe('Runner bookkeeping', () => {
  test('quit clears the game and returns home', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'simon');
    expect((await readCurrent(page))!.timers).toBeGreaterThan(0);
    await page.locator('#quit-btn').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
    expect(await readCurrent(page)).toBeNull();
    await expect(page.locator('#arena')).toBeEmpty();
    await page.waitForTimeout(1500);
    await expect(page.locator('#arena')).toBeEmpty();
    expect((await readLog(page)).recs).toEqual([]);
  });

  test('switching tabs mid-game aborts it', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'stroop');
    await page.locator('nav button[data-nav=stats]').click();
    await expect(page.locator('#stats')).toHaveClass(/active/);
    expect(await readCurrent(page)).toBeNull();
    await expect(page.locator('#arena')).toBeEmpty();
  });

  test('starting a game replaces any running one', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'math');
    await page.evaluate(() => startGame('dots'));
    expect((await readCurrent(page))?.id).toBe('dots');
    await expect(page.locator('#play-title')).toHaveText('⚫ Quick Count');
    await expect(page.locator('#go-btn')).toBeVisible();
  });

  test('a stale finish after quitting is ignored', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'math');
    await page.locator('#quit-btn').click();
    await finishGame(page, 'math', 500);
    await expect(page.locator('#home')).toHaveClass(/active/);
    expect((await readLog(page)).recs).toEqual([]);
  });

  test('a finish for a different game than the current one is ignored', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'math');
    await finishGame(page, 'dots', 500);
    await expect(page.locator('#play')).toHaveClass(/active/);
    expect((await readLog(page)).recs).toEqual([]);
    expect((await readCurrent(page))?.id).toBe('math');
  });

  test('api timers stop firing after the game finishes', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'stroop');
    await finishGame(page, 'stroop', 300);
    await expect(page.locator('#result')).toHaveClass(/active/);
    const hud = await page.locator('#hud-r').innerText();
    await page.waitForTimeout(400);
    expect(await page.locator('#hud-r').innerText()).toBe(hud);
    expect(await readCurrent(page)).toBeNull();
  });

  test('the global key handler only reaches the active game', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'stroop');
    await page.keyboard.press('1');
    await expect(page.locator('#hud-l')).toHaveText(/✓ 1  ✗ 0|✓ 0  ✗ 1/);
    await page.locator('#quit-btn').click();
    await page.keyboard.press('1');
    await expect(page.locator('#home')).toHaveClass(/active/);
  });
});

test.describe('endGame()', () => {
  test('appends one play record and re-derives state', async ({ page }) => {
    await page.goto('/');
    const [t] = localDates([0]);
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 800, ['12 moves']);
    await expect(page.locator('#result')).toHaveClass(/active/);
    const log = await readLog(page);
    expect(log.recs).toHaveLength(1);
    const rec = log.recs[0];
    expect(rec).toMatchObject({ g: 'match', s: 800, d: t, x: 100, df: 1, u: 1, a: ['first'] });
    expect(rec.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Math.abs(rec.t - Date.now())).toBeLessThan(60_000);
    expect(rec.dc).toBeUndefined();
    const s = await readS(page);
    expect(s.games.match).toEqual({ best: 800, plays: 1, total: 800, diff: 2, hist: [800] });
    expect(s.xp).toBe(100);
    expect(s.totalPlays).toBe(1);
    expect(s.ach).toEqual(['first']);
    expect(await readCurrent(page)).toBeNull();
  });

  test('the result screen summarises the play', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 800, ['12 moves', '30.5s']);
    const r = page.locator('#result');
    await expect(r).toContainText('🃏 Memory Match');
    await expect(r.locator('.score')).toHaveText('800');
    await expect(r.locator('.tags .tag')).toHaveText(['Best 800', '+100 XP', '12 moves', '30.5s']);
    await expect(r).toContainText('📈 Difficulty raised to 2');
    await expect(r.locator('.unlock', { hasText: 'Level up!' })).toContainText('You reached level 2');
    await expect(r.locator('.unlock', { hasText: 'Badge unlocked: First Rep' })).toContainText('Play your first game');
    await expect(r).not.toContainText('Daily workout complete');
    await expect(r.locator('#again-btn')).toHaveText('Play again');
    await expect(r.locator('#home-btn')).toHaveText('Home');
    await expect(page.locator('#lvl-label')).toHaveText('Level 2');
    await expect(page.locator('#lvl-xp')).toHaveText('0 / 120 XP · 100 total');
  });

  test('details are escaped before rendering', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 500, ['<b>bold</b>']);
    const tag = page.locator('#result .tags .tag').last();
    await expect(tag).toHaveText('<b>bold</b>');
    await expect(tag.locator('b')).toHaveCount(0);
  });

  test('api.finish() rounds the score and defaults details/extra', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'match');
    await page.evaluate(() => makeApi('match', 1).finish(499.6));
    await expect(page.locator('#result .score')).toHaveText('500');
    await expect(page.locator('#result')).toContainText('Difficulty stays at 1. Score 750+ to level up.');
    await expect(page.locator('#result .tags .tag')).toHaveText(['Best 500', '+70 XP']);
    expect((await readLog(page)).recs[0].s).toBe(500);
  });

  test('a new best adds 25 XP and a tag', async ({ page }) => {
    await seedLog(page, [play('match', 500)]);
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 600);
    const r = page.locator('#result');
    await expect(r.locator('.tag.hi')).toHaveText('🏅 New best!');
    await expect(r.locator('.tag.xp')).toHaveText('+85 XP');
    expect((await readLog(page)).recs[1].x).toBe(85);
  });

  test('equalling the best is not a new best', async ({ page }) => {
    await seedLog(page, [play('match', 600)]);
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 600);
    await expect(page.locator('#result .tag.hi')).toHaveCount(0);
    await expect(page.locator('#result .tags .tag').first()).toHaveText('Best 600');
    await expect(page.locator('#result .tag.xp')).toHaveText('+60 XP');
  });

  test('a low score eases difficulty', async ({ page }) => {
    await seedLog(page, [play('match', 800), play('match', 800)]);
    await page.evaluate(() => startGame('match'));
    await expect(page.locator('#play-diff')).toHaveText('Difficulty 3/10');
    await finishGame(page, 'match', 100);
    await expect(page.locator('#result')).toContainText('📉 Difficulty eased to 2');
    await expect(page.locator('#result .tag.xp')).toHaveText('+13 XP');
    expect((await readLog(page)).recs[2]).toMatchObject({ df: 3, x: 13 });
  });

  test('XP scales 15% per difficulty level above 1', async ({ page }) => {
    await seedLog(page, Array.from({ length: 4 }, () => play('match', 800)));
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 800);
    await expect(page.locator('#result .tag.xp')).toHaveText('+128 XP');
    await expect(page.locator('#result')).toContainText('📈 Difficulty raised to 6');
    expect((await readLog(page)).recs[4]).toMatchObject({ df: 5, x: 128 });
  });

  test('difficulty stops at 10', async ({ page }) => {
    await seedLog(page, Array.from({ length: 9 }, () => play('match', 800)));
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 900);
    await expect(page.locator('#result')).toContainText('Difficulty stays at 10.');
    expect((await readS(page)).games.match.diff).toBe(10);
  });

  test('Play again restarts the same game and Home returns home', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'schulte');
    await finishGame(page, 'schulte', 700);
    await page.locator('#again-btn').click();
    await expect(page.locator('#play')).toHaveClass(/active/);
    await expect(page.locator('#play-title')).toHaveText('🔍 Number Hunt');
    await expect(page.locator('#arena .overlay')).toContainText('Best: 700');
    await finishGame(page, 'schulte', 100);
    await page.locator('#home-btn').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
    await expect(page.locator('.gcard[data-play=schulte] .meta')).toContainText('Best 700');
    await expect(page.locator('.gcard[data-play=schulte] .meta')).toContainText('Lvl 1 · 2 plays');
  });

  test('the Next daily button points at the first unfinished daily game', async ({ page }) => {
    await page.goto('/');
    const daily: string[] = await page.evaluate(() => dailyGames());
    const other = ['match', 'simon', 'grid', 'digits'].find(id => !daily.includes(id))!;
    await startAndGo(page, other);
    await finishGame(page, other, 500);
    const next = page.locator('#next-btn');
    const g = await page.evaluate(id => G[id], daily[0]);
    await expect(next).toHaveText(`Next daily: ${g.icon} ${g.name}`);
    await next.click();
    await expect(page.locator('#play-title')).toHaveText(`${g.icon} ${g.name}`);
    expect((await readCurrent(page))?.id).toBe(daily[0]);
  });

  test('the Next daily button skips the game just played', async ({ page }) => {
    await page.goto('/');
    const daily: string[] = await page.evaluate(() => dailyGames());
    await startAndGo(page, daily[0]);
    await finishGame(page, daily[0], 500);
    const g = await page.evaluate(id => G[id], daily[1]);
    await expect(page.locator('#next-btn')).toHaveText(`Next daily: ${g.icon} ${g.name}`);
  });
});

test.describe('Daily workout completion', () => {
  test('finishing the third daily game adds 150 XP and marks the record', async ({ page }) => {
    await page.goto('/');
    const daily: string[] = await page.evaluate(() => dailyGames());
    await seedLog(page, [play(daily[0], 500), play(daily[1], 500)]);
    await startAndGo(page, daily[2]);
    await finishGame(page, daily[2], 500);
    const r = page.locator('#result');
    await expect(r.locator('.tag.xp')).toHaveText('+220 XP');
    await expect(r.locator('.unlock', { hasText: 'Daily workout complete!' })).toContainText('+150 bonus XP · streak 1');
    await expect(r.locator('.unlock', { hasText: 'Badge unlocked: Daily Dose' })).toBeVisible();
    await expect(r.locator('#next-btn')).toHaveCount(0);
    const log = await readLog(page);
    expect(log.recs[2]).toMatchObject({ g: daily[2], dc: 1, x: 220 });
    expect(log.recs[2].a).toEqual(expect.arrayContaining(['d1']));
    const s = await readS(page);
    expect(s.dailyCount).toBe(1);
    expect(s.daily.done.sort()).toEqual([...daily].sort());
    await page.locator('#home-btn').click();
    await expect(page.locator('#home')).toContainText('Complete! Come back tomorrow.');
    await expect(page.locator('#home .dlist button.done')).toHaveCount(3);
  });

  test('replaying a daily game after completion gives no second bonus', async ({ page }) => {
    await page.goto('/');
    const daily: string[] = await page.evaluate(() => dailyGames());
    await seedLog(page, [play(daily[0], 500), play(daily[1], 500), play(daily[2], 500, { dc: 1 })]);
    await startAndGo(page, daily[0]);
    await finishGame(page, daily[0], 500);
    await expect(page.locator('#result .tag.xp')).toHaveText('+50 XP');
    await expect(page.locator('#result')).not.toContainText('Daily workout complete');
    expect((await readLog(page)).recs[3].dc).toBeUndefined();
    expect((await readS(page)).dailyCount).toBe(1);
  });

  test('a non-daily game never completes the workout', async ({ page }) => {
    await page.goto('/');
    const daily: string[] = await page.evaluate(() => dailyGames());
    const other = ['match', 'simon', 'grid', 'digits'].find(id => !daily.includes(id))!;
    await seedLog(page, [play(daily[0], 500), play(daily[1], 500)]);
    await startAndGo(page, other);
    await finishGame(page, other, 500);
    await expect(page.locator('#result')).not.toContainText('Daily workout complete');
    expect((await readS(page)).dailyCount).toBe(0);
  });

  test('plays from another day do not count toward today', async ({ page }) => {
    await page.goto('/');
    const daily: string[] = await page.evaluate(() => dailyGames());
    const [y] = localDates([-1]);
    await seedLog(page, [play(daily[0], 500, { d: y }), play(daily[1], 500, { d: y })]);
    await expect(page.locator('#home .dlist button.done')).toHaveCount(0);
    await startAndGo(page, daily[2]);
    await finishGame(page, daily[2], 500);
    await expect(page.locator('#result')).not.toContainText('Daily workout complete');
  });
});

test.describe('Badges on finish', () => {
  test('context badges are unlocked in endGame and pinned on the record', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'react');
    await finishGame(page, 'react', 950, ['avg 180 ms'], { avg: 180 });
    const r = page.locator('#result');
    await expect(r.locator('.unlock', { hasText: 'Badge unlocked: Lightning' })).toContainText('Average reaction under 220 ms');
    await expect(r.locator('.unlock', { hasText: 'Badge unlocked: Sharpshooter' })).toBeVisible();
    await expect(r.locator('.unlock', { hasText: 'Badge unlocked: First Rep' })).toBeVisible();
    const rec = (await readLog(page)).recs[0];
    expect([...rec.a].sort()).toEqual(['fast', 'first', 'sc900']);
    await page.reload();
    expect((await readS(page)).ach).toEqual(expect.arrayContaining(['fast', 'first', 'sc900']));
    await page.locator('nav button[data-nav=badges]').click();
    await expect(page.locator('#badges .badge:not(.locked)')).toHaveCount(3);
  });

  test('a context badge needs the right game and the right extra', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'react');
    await finishGame(page, 'react', 500, [], { avg: 300 });
    await expect(page.locator('#result')).not.toContainText('Lightning');
    await page.locator('#home-btn').click();
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 500, [], { avg: 100, perfect: true, len: 9 });
    await expect(page.locator('#result .unlock', { hasText: 'Badge unlocked' })).toHaveCount(0);
    expect((await readS(page)).ach).toEqual(['first']);
  });

  test('N-Back perfect and Digit Span nine digits unlock their badges', async ({ page }) => {
    await page.goto('/');
    await startAndGo(page, 'nback');
    await finishGame(page, 'nback', 1000, [], { perfect: true });
    await expect(page.locator('#result')).toContainText('Badge unlocked: Flawless Recall');
    await page.locator('#home-btn').click();
    await startAndGo(page, 'digits');
    await finishGame(page, 'digits', 900, [], { len: 9 });
    await expect(page.locator('#result')).toContainText('Badge unlocked: Nine Digits');
    await expect(page.locator('#result')).not.toContainText('Sharpshooter');
  });

  test('a badge already earned is not announced again', async ({ page }) => {
    await seedLog(page, [play('match', 500)]);
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 500);
    await expect(page.locator('#result .unlock', { hasText: 'Badge unlocked' })).toHaveCount(0);
    expect((await readLog(page)).recs[1].a).toBeUndefined();
  });

  test('state badges crossing a threshold on this play are announced', async ({ page }) => {
    await seedLog(page, Array.from({ length: 9 }, () => play('match', 100)));
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 100);
    const badges = page.locator('#result .unlock', { hasText: 'Badge unlocked' });
    await expect(badges).toHaveCount(1);
    await expect(badges).toContainText('Badge unlocked: Warming Up');
    expect((await readLog(page)).recs[9].a).toEqual(['p10']);
  });

  test('Explorer unlocks when every game has been played', async ({ page }) => {
    const ids: string[] = ['match', 'simon', 'grid', 'digits', 'nback', 'stroop', 'schulte', 'react', 'dots', 'math', 'scramble', 'oddword', 'seq'];
    await seedLog(page, ids.map(id => play(id, 100)));
    await startAndGo(page, 'rotate');
    await finishGame(page, 'rotate', 100);
    await expect(page.locator('#result')).toContainText('Badge unlocked: Explorer');
  });
});

test.describe('Confetti', () => {
  const bursts = (page: Parameters<typeof readConfetti>[0]) => expect.poll(() => readConfetti(page).then(c => c.length));

  test('fires on a level up', async ({ page }) => {
    await seedLog(page, [play('match', 500)]); // 50 XP, First Rep already earned
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 600); // +60 XP crosses 100 → level 2, no new badge
    const r = page.locator('#result');
    await expect(r.locator('.unlock', { hasText: 'Level up!' })).toBeVisible();
    await expect(r.locator('.unlock', { hasText: 'Badge unlocked' })).toHaveCount(0);
    await bursts(page).toBe(3);
    const cfg = (await readConfetti(page))[0];
    expect(cfg.count).toBe(90);
    expect(cfg.color).toEqual(['#6c8cff', '#ff7ab6', '#3ddc97', '#ffc857']);
    expect(cfg.position.x).toBeGreaterThan(0);
    expect(cfg.position.y).toBeGreaterThan(0);
  });

  test('fires on a new badge', async ({ page }) => {
    await seedLog(page, Array.from({ length: 9 }, () => play('match', 100, { x: 0 })));
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 100); // 10 XP total: no level up, but Warming Up unlocks
    const r = page.locator('#result');
    await expect(r.locator('.unlock', { hasText: 'Badge unlocked: Warming Up' })).toBeVisible();
    await expect(r.locator('.unlock', { hasText: 'Level up!' })).toHaveCount(0);
    await bursts(page).toBe(3);
  });

  test('stays quiet on an ordinary play', async ({ page }) => {
    await seedLog(page, [play('match', 500)]);
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 100); // 60 XP total, nothing new
    await expect(page.locator('#result .unlock')).toHaveCount(0);
    await page.waitForTimeout(600);
    expect(await readConfetti(page)).toEqual([]);
  });

  test('respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 800);
    await expect(page.locator('#result .unlock', { hasText: 'Level up!' })).toBeVisible();
    await page.waitForTimeout(600);
    expect(await readConfetti(page)).toEqual([]);
  });

  // Level up with no new badge; returns the centre of the score, a non-interactive spot on the result screen.
  const celebrateAndTapTarget = async (page: Parameters<typeof readConfetti>[0]) => {
    await seedLog(page, [play('match', 500)]);
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 600);
    await expect(page.locator('#result .unlock', { hasText: 'Level up!' })).toBeVisible();
    await bursts(page).toBe(3);
    const box = (await page.locator('#result .score').boundingBox())!;
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  };

  test('after a celebration, a tap outside a control bursts at the tap point', async ({ page }) => {
    const { x, y } = await celebrateAndTapTarget(page);
    await page.mouse.click(x, y);
    await bursts(page).toBe(4);
    await page.mouse.click(x + 40, y + 60);
    await bursts(page).toBe(5);
    const c = await readConfetti(page);
    expect(c[3]).toMatchObject({ count: 60, position: { x, y }, color: ['#6c8cff', '#ff7ab6', '#3ddc97', '#ffc857'] });
    expect(c[4].position).toEqual({ x: x + 40, y: y + 60 });
  });

  test('taps on controls do not burst', async ({ page }) => {
    const { x, y } = await celebrateAndTapTarget(page);
    await page.click('#sound-btn'); // header button: stays on the result screen
    await page.click('#sound-btn');
    await page.waitForTimeout(200);
    await bursts(page).toBe(3);
    await page.mouse.click(x, y); // still armed afterwards
    await bursts(page).toBe(4);
  });

  test('tap-to-confetti is disarmed when the screen changes', async ({ page }) => {
    await celebrateAndTapTarget(page);
    await page.click('#home-btn');
    await expect(page.locator('#home')).toHaveClass(/active/);
    const box = (await page.locator('#home .panel').first().boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + 4);
    await page.waitForTimeout(200);
    expect(await readConfetti(page)).toHaveLength(3);
  });

  test('tap-to-confetti stays off without a celebration', async ({ page }) => {
    await seedLog(page, [play('match', 500)]);
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 100);
    await expect(page.locator('#result .unlock')).toHaveCount(0);
    const box = (await page.locator('#result .score').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(600);
    expect(await readConfetti(page)).toEqual([]);
  });

  test('degrades gracefully when the CDN script is unavailable', async ({ page }) => {
    await page.route(CONFETTI_CDN, r => r.abort());
    await page.goto('/');
    expect(await page.evaluate(() => typeof (window as any).confetti)).toBe('undefined');
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 800);
    await expect(page.locator('#result .unlock', { hasText: 'Level up!' })).toBeVisible();
    await expect(page.locator('#result .unlock', { hasText: 'Badge unlocked: First Rep' })).toBeVisible();
    const box = (await page.locator('#result .score').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // tap-to-confetti must not throw either
  });
});
