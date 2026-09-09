import { Page } from '@playwright/test';
import { test, expect, SUPA_CDN, play, seedLog, readLog, readS, localDates, startAndGo, finishGame, Rec } from './fixtures';

const chip = (page: Page) => page.locator('#sync-chip');
const statsPanel = (page: Page) => page.locator('#stats .sync-body');

/** Put rows into the fake cloud table. `data` is the record as another device would have pushed it. */
async function seedCloud(page: Page, recs: Rec[]) {
  const [t] = localDates([0]);
  await page.evaluate(([recs, t]) => {
    for (const r of recs) { if (!r.d) r.d = t; window.__cloud.rows.push({ id: r.id, t: r.t, data: r, created_at: window.__cloud.stamp() }) }
  }, [recs, t] as const);
}

async function signIn(page: Page, uid: string) {
  await page.evaluate(id => window.__signIn(id), uid);
  await expect(chip(page)).toHaveText(/☁️ (✓|⚠️)/);
}

test.describe('Without the sync library', () => {
  test.beforeEach(async ({ page }) => {
    // Registered after the fixture's stub route, so it wins: the CDN script never loads.
    await page.route(SUPA_CDN, route => route.abort());
    await page.goto('/');
  });

  test('sb is null, the chip is hidden and the panel explains why', async ({ page }) => {
    expect(await page.evaluate(() => sb)).toBeNull();
    await expect(chip(page)).toBeHidden();
    await page.locator('nav button[data-nav=stats]').click();
    await expect(statsPanel(page)).toHaveText('Sync is unavailable when the page is opened from disk or the sync library could not load. Your progress is still saved in this browser.');
    await expect(page.locator('.gsi')).toHaveCount(0);
  });

  test('sync entry points are safe no-ops', async ({ page }) => {
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 500);
    await expect(page.locator('#result .score')).toHaveText('500');
    expect(await page.evaluate(() => pushPending())).toBe(true);
    await page.evaluate(() => fullSync());
    await page.evaluate(() => maybeSync());
    const log = await readLog(page);
    expect(log.recs[0].u).toBe(1);
    expect(log.sync).toEqual({});
  });
});

test.describe('Signed out', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/') });

  test('creates the client with the published project config', async ({ page }) => {
    const cloud = await page.evaluate(() => ({ url: window.__cloud.url, key: window.__cloud.key }));
    expect(cloud.url).toMatch(/^https:\/\/[a-z]+\.supabase\.co$/);
    expect(cloud.key).toMatch(/^sb_publishable_/);
    expect(await page.evaluate(() => !!sb && syncUser === null)).toBe(true);
  });

  test('the chip is visible and the panel offers Google sign-in with the branded button', async ({ page }) => {
    await expect(chip(page)).toBeVisible();
    await expect(chip(page)).toHaveText('☁️');
    await expect(chip(page)).toHaveAttribute('title', 'Cloud sync');
    await page.locator('nav button[data-nav=stats]').click();
    const panel = statsPanel(page);
    await expect(panel).toContainText('Back up your plays and sync progress between devices.');
    await expect(panel).toContainText('Only your account ID and game results are stored.');
    const btn = panel.locator('button.gsi');
    await expect(btn).toHaveText('Sign in with Google');
    await expect(btn).toHaveAttribute('data-sync', 'in');
    const fills = await btn.locator('svg path').evaluateAll(ps => ps.map(p => p.getAttribute('fill')));
    expect(fills).toEqual(['#EA4335', '#4285F4', '#FBBC05', '#34A853']);
    await expect(panel.locator('[data-sync=out]')).toHaveCount(0);
  });

  test('clicking Sign in starts the Google OAuth flow back to this page', async ({ page }) => {
    await page.locator('nav button[data-nav=stats]').click();
    await statsPanel(page).locator('button.gsi').click();
    const oauth = await page.evaluate(() => window.__cloud.oauth);
    expect(oauth.provider).toBe('google');
    expect(oauth.options.redirectTo).toBe(new URL(page.url()).origin + '/');
  });

  test('the header chip opens a single sync modal that closes by ✕, Escape or backdrop', async ({ page }) => {
    await chip(page).click();
    const bg = page.locator('.modal-bg');
    await expect(bg).toBeVisible();
    await expect(bg.locator('.modal h3')).toHaveText('☁️ Cloud sync');
    await expect(bg.locator('.sync-body button.gsi')).toHaveText('Sign in with Google');
    await page.evaluate(() => openSyncModal());
    await expect(bg).toHaveCount(1);

    await bg.locator('.x').click();
    await expect(bg).toHaveCount(0);

    await chip(page).click();
    await expect(bg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bg).toHaveCount(0);

    await chip(page).click();
    await bg.locator('.modal h3').click();
    await expect(bg).toHaveCount(1);
    await bg.click({ position: { x: 5, y: 5 } });
    await expect(bg).toHaveCount(0);

    // The Escape listener is removed with the modal.
    await page.evaluate(() => openSyncModal());
    await page.locator('.modal-bg .x').click();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.querySelectorAll('.modal-bg').length)).toBe(0);
  });

  test('the sign-in button inside the modal triggers OAuth', async ({ page }) => {
    await chip(page).click();
    await page.locator('.modal-bg button.gsi').click();
    expect(await page.evaluate(() => window.__cloud.oauth?.provider)).toBe('google');
  });

  test('a signed-out play stays pending locally and nothing is pushed', async ({ page }) => {
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 500);
    await expect(page.locator('#result .score')).toHaveText('500');
    expect((await readLog(page)).recs[0].u).toBe(1);
    expect(await page.evaluate(() => window.__cloud.upserts.length)).toBe(0);
  });
});

test.describe('Signing in', () => {
  test('pushes pending records, pulls the rest, merges by id and reports', async ({ page }) => {
    const shared = play('math', 400, { id: 'shared-1' });
    const local2 = play('grid', 300, { id: 'local-2' });
    await seedLog(page, [{ ...shared, u: 1 }, { ...local2, u: 1 }]);
    await seedCloud(page, [shared, play('dots', 600, { id: 'cloud-1' }), play('seq', 700, { id: 'cloud-2' })]);
    await page.locator('nav button[data-nav=stats]').click();

    await signIn(page, 'user-1');
    await expect(chip(page)).toHaveText('☁️ ✓');
    await expect(chip(page)).toHaveAttribute('title', 'Cloud sync on');
    await expect(page.locator('.toast')).toHaveText('Synced · 2 new plays');
    const panel = statsPanel(page);
    await expect(panel).toContainText('☁️ Signed in');
    await expect(panel).toContainText(/Last synced \d{1,2}:\d{2}/);
    await expect(panel.locator('[data-sync=out]')).toHaveText('Sign out');
    await expect(panel).toContainText('Only your account ID and game results are stored.');

    const log = await readLog(page);
    expect(log.sync.uid).toBe('user-1');
    expect(log.recs.map((r: Rec) => r.id).sort()).toEqual(['cloud-1', 'cloud-2', 'local-2', 'shared-1']);
    expect(log.recs.some((r: Rec) => r.u)).toBe(false);
    const cloud = await page.evaluate(() => window.__cloud);
    expect(cloud.rows.map(r => r.id).sort()).toEqual(['cloud-1', 'cloud-2', 'local-2', 'shared-1']);
    expect(log.sync.cursor).toBe(cloud.rows.map(r => r.created_at).sort().at(-1));
    expect(cloud.table).toBe('recs');
    expect(cloud.upserts).toHaveLength(1);
    expect(cloud.upserts[0].opts).toEqual({ onConflict: 'user_id,id', ignoreDuplicates: true });
    expect(cloud.upserts[0].rows.map((r: any) => r.id)).toEqual(['shared-1', 'local-2']);
    for (const row of cloud.upserts[0].rows) {
      expect(Object.keys(row).sort()).toEqual(['data', 'id', 't']);
      expect(row.data.u).toBeUndefined();
      expect(row.data.id).toBe(row.id);
    }
    const s = await readS(page);
    expect(s.totalPlays).toBe(4);
    await expect(page.locator('#stats .kpi', { hasText: 'Games played' }).locator('b')).toHaveText('4');
  });

  test('re-renders the active screen after the pull', async ({ page }) => {
    await page.goto('/');
    await seedCloud(page, [play('match', 800, { id: 'c1' })]);
    await signIn(page, 'u');
    await expect(page.locator('.gcard[data-play=match] .meta')).toContainText('Best 800');
    await expect(page.locator('#lvl-xp')).toHaveText('80 / 100 XP · 80 total');
  });

  test('a play while signed in is pushed immediately', async ({ page }) => {
    await page.goto('/');
    await signIn(page, 'u');
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 500);
    await expect(page.locator('#result .score')).toHaveText('500');
    await expect.poll(() => page.evaluate(() => window.__cloud.rows.length)).toBe(1);
    const rec = (await readLog(page)).recs[0];
    expect(rec.u).toBeUndefined();
    const row = await page.evaluate(() => window.__cloud.rows[0]);
    expect(row.id).toBe(rec.id);
    expect(row.data).toEqual(rec);
  });

  test('pushes in chunks of 500', async ({ page }) => {
    await seedLog(page, Array.from({ length: 501 }, () => play('math', 100, { u: 1 })));
    await signIn(page, 'u');
    const sizes = await page.evaluate(() => window.__cloud.upserts.map(u => u.rows.length));
    expect(sizes).toEqual([500, 1]);
    expect(await page.evaluate(() => window.__cloud.rows.length)).toBe(501);
    expect((await readLog(page)).recs.some((r: Rec) => r.u)).toBe(false);
  });

  test('pulls more than one page', async ({ page }) => {
    await page.goto('/');
    await seedCloud(page, Array.from({ length: 1001 }, (_, i) => play('math', 100, { id: `c${String(i).padStart(4, '0')}` })));
    await signIn(page, 'u');
    await expect(page.locator('.toast')).toHaveText('Synced · 1001 new plays');
    expect((await readLog(page)).recs).toHaveLength(1001);
    expect(await page.evaluate(() => window.__cloud.selects)).toBeGreaterThanOrEqual(2);
    expect((await readS(page)).totalPlays).toBe(1001);
  });

  test('the cursor limits later pulls to new rows', async ({ page }) => {
    await page.goto('/');
    await seedCloud(page, [play('math', 100, { id: 'c1' })]);
    await signIn(page, 'u');
    await expect(page.locator('.toast')).toHaveText('Synced · 1 new play');
    const cursor = (await readLog(page)).sync.cursor;
    await seedCloud(page, [play('math', 200, { id: 'c2' })]);
    await page.evaluate(() => fullSync());
    await expect(page.locator('.toast', { hasText: 'Synced · 1 new play' })).toHaveCount(2);
    const log = await readLog(page);
    expect(log.recs).toHaveLength(2);
    expect(log.sync.cursor > cursor).toBe(true);
    // A pull with nothing new shows no toast.
    await page.evaluate(() => fullSync());
    await expect(chip(page)).toHaveText('☁️ ✓');
    expect((await readLog(page)).recs).toHaveLength(2);
  });

  test('sign-in from an OAuth redirect cleans the code from the URL', async ({ page }) => {
    await page.goto('/?code=abc123&state=xyz');
    await signIn(page, 'u');
    expect(new URL(page.url()).search).toBe('');
    expect((await readLog(page)).sync.uid).toBe('u');
  });

  test('the same account signing in again is not questioned', async ({ page }) => {
    await seedLog(page, [play('match', 500)], { sync: { uid: 'u1', cursor: null } });
    let dialogs = 0;
    page.on('dialog', d => { dialogs++; d.dismiss() });
    await signIn(page, 'u1');
    expect(dialogs).toBe(0);
    expect((await readLog(page)).recs).toHaveLength(1);
  });
});

test.describe('Switching accounts', () => {
  test('declining keeps the local log and signs out again', async ({ page }) => {
    await seedLog(page, [play('match', 500, { id: 'mine' })], { sync: { uid: 'u1', cursor: null } });
    await seedCloud(page, [play('math', 100, { id: 'theirs' })]);
    let message = '';
    page.on('dialog', d => { message = d.message(); d.dismiss() });
    await page.evaluate(() => window.__signIn('u2'));
    await expect.poll(() => page.evaluate(() => window.__cloud.signOuts)).toBe(1);
    expect(message).toBe("This browser has progress from a different account. Replace it with this account's progress?");
    await page.locator('nav button[data-nav=stats]').click();
    await expect(statsPanel(page).locator('button.gsi')).toBeVisible();
    const log = await readLog(page);
    expect(log.recs.map((r: Rec) => r.id)).toEqual(['mine']);
    expect(log.sync.uid).toBe('u1');
    expect(await page.evaluate(() => window.__cloud.upserts.length)).toBe(0);
  });

  test('accepting replaces the local log with the new account\'s cloud records', async ({ page }) => {
    await seedLog(page, [play('match', 500, { id: 'mine', u: 1 })], { sync: { uid: 'u1', cursor: '2026-01-01T00:00:05.000Z' } });
    await seedCloud(page, [play('math', 100, { id: 'theirs' })]);
    page.on('dialog', d => d.accept());
    await signIn(page, 'u2');
    await expect(chip(page)).toHaveText('☁️ ✓');
    const log = await readLog(page);
    expect(log.recs.map((r: Rec) => r.id)).toEqual(['theirs']);
    expect(log.sync.uid).toBe('u2');
    expect(await page.evaluate(() => window.__cloud.upserts.length)).toBe(0);
    expect((await readS(page)).games.match).toBeUndefined();
    await expect(page.locator('.gcard[data-play=math] .meta')).toContainText('Best 100');
  });
});

test.describe('Signing out', () => {
  test('keeps local progress and shows the sign-in button again', async ({ page }) => {
    await seedLog(page, [play('match', 500, { u: 1 })]);
    await page.locator('nav button[data-nav=stats]').click();
    await signIn(page, 'u1');
    await statsPanel(page).locator('[data-sync=out]').click();
    await expect(statsPanel(page).locator('button.gsi')).toBeVisible();
    await expect(chip(page)).toHaveText('☁️');
    const log = await readLog(page);
    expect(log.recs).toHaveLength(1);
    expect(log.sync.uid).toBe('u1');
    expect(await page.evaluate(() => window.__cloud.signOuts)).toBe(1);
    // Plays after signing out stay pending.
    await startAndGo(page, 'dots');
    await finishGame(page, 'dots', 400);
    await expect(page.locator('#result .score')).toHaveText('400');
    expect((await readLog(page)).recs[1].u).toBe(1);
    expect(await page.evaluate(() => window.__cloud.rows.length)).toBe(1);
  });
});

test.describe('Failures', () => {
  test('a failed push shows the error state and keeps records pending', async ({ page }) => {
    await seedLog(page, [play('match', 500, { u: 1 })]);
    await page.evaluate(() => { window.__cloud.failUpsert = true });
    await page.locator('nav button[data-nav=stats]').click();
    await signIn(page, 'u');
    await expect(chip(page)).toHaveText('☁️ ⚠️');
    await expect(chip(page)).toHaveAttribute('title', 'Sync failed · tap to retry');
    await expect(statsPanel(page)).toContainText('Sync failed · will retry');
    expect((await readLog(page)).recs[0].u).toBe(1);
    expect(await page.evaluate(() => window.__cloud.selects)).toBe(0);

    await page.evaluate(() => { window.__cloud.failUpsert = false });
    await page.evaluate(() => fullSync());
    await expect(chip(page)).toHaveText('☁️ ✓');
    await expect(statsPanel(page)).toContainText('Last synced');
    expect((await readLog(page)).recs[0].u).toBeUndefined();
  });

  test('a failed pull shows the error state without losing local data', async ({ page }) => {
    await seedLog(page, [play('match', 500, { u: 1 })]);
    await page.evaluate(() => { window.__cloud.failSelect = true });
    await signIn(page, 'u');
    await expect(chip(page)).toHaveText('☁️ ⚠️');
    const log = await readLog(page);
    expect(log.recs).toHaveLength(1);
    expect(log.recs[0].u).toBeUndefined();
    expect(log.sync.cursor).toBeUndefined();
  });

  test('a failed push while playing does not block the result screen', async ({ page }) => {
    await page.goto('/');
    await signIn(page, 'u');
    await page.evaluate(() => { window.__cloud.failUpsert = true });
    await startAndGo(page, 'match');
    await finishGame(page, 'match', 500);
    await expect(page.locator('#result .score')).toHaveText('500');
    await expect(chip(page)).toHaveText('☁️ ⚠️');
    expect((await readLog(page)).recs[0].u).toBe(1);
  });
});

test.describe('Background syncing', () => {
  test('maybeSync() is throttled to once per 30 s and reacts to online/visibility events', async ({ page }) => {
    await page.goto('/');
    await signIn(page, 'u');
    const selects = await page.evaluate(() => window.__cloud.selects);
    await page.evaluate(() => maybeSync());
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')) });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__cloud.selects)).toBe(selects);

    await page.evaluate(() => { syncLast = 0 });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => page.evaluate(() => window.__cloud.selects)).toBe(selects + 1);

    await page.evaluate(() => { syncLast = 0 });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => page.evaluate(() => window.__cloud.selects)).toBe(selects + 2);
  });

  test('maybeSync() does nothing when signed out', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { syncLast = 0; maybeSync(); window.dispatchEvent(new Event('online')) });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__cloud.selects)).toBe(0);
  });

  test('the chip shows progress while syncing and the modal follows state', async ({ page }) => {
    await page.goto('/');
    await chip(page).click();
    await signIn(page, 'u');
    await expect(page.locator('.modal-bg .sync-body')).toContainText('☁️ Signed in');
    await expect(page.locator('.modal-bg .sync-body [data-sync=out]')).toBeVisible();
    await page.locator('.modal-bg .sync-body [data-sync=out]').click();
    await expect(page.locator('.modal-bg .sync-body button.gsi')).toBeVisible();
  });
});
