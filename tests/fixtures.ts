import { test as base, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const COVERAGE_DIR = path.join(__dirname, '..', '.v8-coverage');

// The external scripts the app loads. Tests never hit the network: the fixture answers
// the supabase-js URL with an in-page stub that mimics the small slice of the library the
// app uses (recording everything on window.__cloud), and the confetti.js URL with a stub
// that records every confetti() call's config on window.__confetti.
export const SUPA_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@**';
export const CONFETTI_CDN = 'https://cdn.jsdelivr.net/npm/@hiseb/confetti@**';

const CONFETTI_STUB = `window.__confetti = []; window.confetti = cfg => { window.__confetti.push(cfg) };`;

const SUPABASE_STUB = `(() => {
  const cloud = window.__cloud = { rows: [], upserts: [], selects: 0, signOuts: 0, oauth: null,
    failUpsert: false, failSelect: false, seq: 0, url: null, key: null };
  const stamp = () => new Date(Date.UTC(2026, 0, 1) + (++cloud.seq) * 1000).toISOString();
  cloud.stamp = stamp;
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  function selectBuilder() {
    let since = '', limit = Infinity;
    const b = {
      gte(_col, v) { since = v; return b },
      order() { return b },
      limit(n) { limit = n; return b },
      then(res, rej) {
        cloud.selects++;
        if (cloud.failSelect) return Promise.resolve({ data: null, error: { message: 'select failed' } }).then(res, rej);
        const data = cloud.rows.filter(r => r.created_at >= since)
          .sort((x, y) => cmp(x.created_at, y.created_at) || cmp(x.id, y.id)).slice(0, limit);
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return b;
  }
  const auth = {
    _cb: null,
    onAuthStateChange(cb) { auth._cb = cb; setTimeout(() => cb('INITIAL_SESSION', null), 0); return { data: { subscription: { unsubscribe() {} } } } },
    signInWithOAuth(opts) { cloud.oauth = opts; return Promise.resolve({ data: {}, error: null }) },
    signOut() { cloud.signOuts++; setTimeout(() => auth._cb && auth._cb('SIGNED_OUT', null), 0); return Promise.resolve({ error: null }) },
  };
  const client = {
    auth,
    from(table) {
      cloud.table = table;
      return {
        upsert(rows, opts) {
          cloud.upserts.push({ rows, opts });
          if (cloud.failUpsert) return Promise.resolve({ error: { message: 'upsert failed' } });
          for (const r of rows) if (!cloud.rows.some(x => x.id === r.id)) cloud.rows.push({ id: r.id, t: r.t, data: r.data, created_at: stamp() });
          return Promise.resolve({ error: null });
        },
        select() { return selectBuilder() },
      };
    },
  };
  // Test hook: simulate Supabase completing a Google sign-in for the given user id.
  window.__signIn = id => auth._cb('SIGNED_IN', { user: { id } });
  window.supabase = { createClient(url, key) { cloud.url = url; cloud.key = key; return client } };
})();`;

type Fixtures = {
  /** Uncaught errors thrown by the page during the test. Asserted empty on teardown. */
  pageErrors: Error[];
};

export const test = base.extend<Fixtures>({
  pageErrors: async ({}, use) => { await use([]) },
  page: async ({ page, pageErrors }, use, testInfo) => {
    page.on('pageerror', e => pageErrors.push(e));
    await page.route(SUPA_CDN, route => route.fulfill({ contentType: 'application/javascript', body: SUPABASE_STUB }));
    await page.route(CONFETTI_CDN, route => route.fulfill({ contentType: 'application/javascript', body: CONFETTI_STUB }));
    await page.coverage.startJSCoverage({ resetOnNavigation: false });

    await use(page);

    const coverage = await page.coverage.stopJSCoverage();
    fs.mkdirSync(COVERAGE_DIR, { recursive: true });
    const id = `${testInfo.workerIndex}-${testInfo.testId.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}`;
    fs.writeFileSync(path.join(COVERAGE_DIR, `${id}.json`), JSON.stringify(coverage));

    expect(pageErrors.map(e => e.message), 'the page threw uncaught errors').toEqual([]);
  },
});

export { expect };

/* ---------------- helpers shared by the specs ---------------- */

export const KEY = 'brainbop_v2';

export type Rec = Record<string, any>;

let recSeq = 0;
/** Build a play record. `d` defaults to today (computed page-side via seedLog). */
export function play(g: string, s: number, extra: Rec = {}): Rec {
  recSeq++;
  return { id: `r${recSeq}-${Math.random().toString(36).slice(2, 8)}`, t: 1_700_000_000_000 + recSeq * 1000, g, s, x: extra.x ?? Math.round(s / 10), df: 1, ...extra };
}

/** Load the app with the given log in localStorage. Records without `d` get today's date. */
export async function seedLog(page: Page, recs: Rec[], log: Rec = {}) {
  await page.goto('/');
  await page.evaluate(([key, recs, log]) => {
    const t = today();
    for (const r of recs) if (r.g !== '_base' && !r.d) r.d = t;
    localStorage.setItem(key, JSON.stringify({ recs, sound: true, sync: {}, ...log }));
  }, [KEY, recs, log] as const);
  await page.reload();
}

/** The persisted log, parsed. */
export const readLog = (page: Page): Promise<Rec> => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), KEY);

/** The derived state `S`. */
export const readS = (page: Page): Promise<Rec> => page.evaluate(() => JSON.parse(JSON.stringify(S)));

/** Local YYYY-MM-DD strings for today + offset days. Node and the browser share the machine's timezone. */
export const localDates = (offsets: number[]): string[] => offsets.map(o => {
  const d = new Date(); d.setDate(d.getDate() + o);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

/** Open a game via the runner and press Start. Resolves once the game's start() has run. */
export async function startAndGo(page: Page, id: string) {
  await page.evaluate(id => startGame(id), id);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#go-btn')).toHaveCount(0);
}

/** Finish the current game through the same path a game's api.finish() takes. */
export const finishGame = (page: Page, id: string, score: number, details: string[] = [], extra: Rec = {}) =>
  page.evaluate(([id, score, details, extra]) => endGame(id, score, details as string[], extra), [id, score, details, extra] as const);

/** The configs passed to confetti() so far (recorded by the fixture's stub). */
export const readConfetti = (page: Page): Promise<Rec[]> => page.evaluate(() => (window as any).__confetti ?? []);

/** Read the runner's `current` bookkeeping. */
export const readCurrent = (page: Page): Promise<null | { id: string; timers: number; done: boolean; started: boolean; hasKey: boolean }> =>
  page.evaluate(() => { const c = current; return c && { id: c.id, timers: c.timers.length, done: c.done, started: c.started, hasKey: !!c.key } });

export const GAME_IDS = ['match', 'simon', 'grid', 'digits', 'nback', 'stroop', 'schulte', 'react', 'dots', 'math', 'scramble', 'oddword', 'seq', 'rotate'];
