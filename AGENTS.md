# AGENTS.md

Guidance for AI coding agents and contributors working on BrainBop.

## What this is

A brain training web app delivered as **one self-contained file**, `index.html`. Plain HTML, CSS, and vanilla JavaScript. No framework, no build step, no package manager. The one external resource is the supabase-js script used for optional cloud sync. That constraint is deliberate. Keep it.

## Hard rules

1. **Single file.** All markup, styles, and script stay in `index.html`. Do not split into modules or add a bundler. The only external resource allowed is the pinned supabase-js UMD script in `<head>`. Do not add any other CDN script, stylesheet, or font.
2. **No dependencies beyond sync.** Vanilla JS only. Network access lives exclusively in the **sync** section and goes through `sb` (the Supabase client). `sb` is `null` on `file://` or when the CDN script did not load, and every feature except sync must work identically in that case. Never make sync a prerequisite for anything.
3. **Name.** The product is **BrainBop**. Do not reintroduce any prior name anywhere, including in storage keys or comments.
4. **Storage model.** The source of truth is `L`, stored under `brainbop_v2`: an **append-only log** of immutable records (`L.recs`) plus device prefs. `S` is derived from `L` by `derive()` and is never persisted. To change progress, append a record and call `derive()`; never mutate `S` for persistence and never edit or remove an existing record. There is deliberately no reset feature.
5. **Records are forever.** Records already written (locally or in the cloud) must keep working. Add new record fields only with defaults in `derive()`. Never rename or reinterpret existing fields.
6. **v1 is dead.** `load()` performs a one-time migration from `brainbop_v1` only when `brainbop_v2` does not exist. Once v2 exists, v1 is never read or written. Do not add any other code path that touches v1; the migration branch itself can be deleted once it has been deployed for a while.

## File layout

Everything is in `index.html`, in this order. Section headers in the script are `/* ===== name ===== */` comments; search for them rather than relying on line numbers.

- `<style>` – all CSS. Design tokens are CSS custom properties on `:root`. Game-specific classes are grouped after the shared UI classes.
- `<body>` – static shell: header (level bar, streak, sound toggle, cloud sync chip), five `<section class="screen">` containers (`home`, `play`, `result`, `stats`, `badges`), and a fixed bottom `<nav>`.
- `<script>` sections:
  - **utilities** – DOM helpers (`$`, `$$`), random helpers, date helpers, `seeded()` PRNG, `toast()`, `flashFb()`.
  - **sound** – `beep()` and the `sfx` object. Silently no-ops if audio is unavailable or muted.
  - **state** – `L` (the persisted log), `S` (the derived aggregate), `load()` (with the one-time v1 migration), `save()`, `gs(id)` (get or create a game's stats record in `S`), `streakFrom(days)`, `derive()`, `levelInfo(xp)`.
  - **sync** – Supabase config, `sb` client, `commit()` (save + header + push), `pushPending()`, `pull()`, `fullSync()`, sign in/out, the sync panel/chip renderers, and `openSyncModal()`.
  - **game registry** – `GAMES` array, `G` map by id, `CATS` category order, `reg()`.
  - **achievements** – `ACH` definitions. Unlocking happens in `derive()` and `endGame()`.
  - **daily workout** – `dailyGames()` (date-seeded pick of 3), `dailyState()` (re-derives if the date rolled over).
  - **brain score** – `recentAvg`, `catScores`, `brainScore`.
  - **screens** – `showScreen`, `renderHeader`, `renderHome`, `renderStats`, `renderBadges`, `spark()`.
  - **game runner** – `startGame`, `makeApi`, `endGame`, `abortGame`, the global keydown dispatcher.
  - **GAMES** – one `reg({...})` block per game, each preceded by a `/* --- Name --- */` comment.
  - **boot** – initial render.

## State shape

Persisted (`L`, key `brainbop_v2`):

```js
{
  recs:  [ record, ... ],              // append-only, any order; derive() sorts by t
  sound: true,                         // device preference, never synced
  sync:  { cursor: isoTimestamp|null,  // created_at of the last pulled cloud row
           uid: userId|null }          // account this browser's log belongs to
}
```

Record kinds, distinguished by `g`:

```js
// A play. Written by endGame(), one per finished game.
{ id: uuid, t: Date.now(), d: 'YYYY-MM-DD', g: gameId, s: score,
  x: xpAwarded,          // includes the +150 daily bonus when dc is set
  df: difficultyPlayedAt,
  dc: 1,                 // only present if this play completed the daily workout
  a: [achievementId],    // only present if badges unlocked on this play
  u: 1 }                 // only present while not yet pushed to the cloud; stripped on push

// The legacy baseline. Written once by the v1 migration, never again.
{ id, t, g: '_base', xp, games, days, ach, dailyCount, totalPlays, u? }
```

Derived (`S`, rebuilt by `derive()`, same shape the render functions have always used):

```js
{
  xp, totalPlays, dailyCount,
  games: { [id]: { best, plays, total, diff, hist: [last 40 scores] } },
  history: [ { d, g, s } ],                 // last 500 plays
  streak: { count, last },                  // walked back from today/yesterday over days
  ach: [ achievementId, ... ],              // union of record.a, base.ach, and state-based tests
  daily: { date: today, done: [gameId] },   // today's plays that are in dailyGames()
  days: { 'YYYY-MM-DD': gamesPlayedThatDay },
  sound
}
```

Folding rules in `derive()`: a play increments `plays/total/best/hist`, adjusts `diff` (≥750 up, <350 down), adds `x` to xp, bumps `totalPlays` and `days[d]`, and bumps `dailyCount` if `dc`. A `_base` adds its totals, unions `ach`, and per game adds `plays/total`, takes max `best`/`diff`, and concatenates `hist`. Because every operation is additive or a max, merging record sets from several devices is just set union by `id`.

Badges: state-based tests (`t.length === 1`) are re-evaluated on every `derive()`; anything that once passed is also pinned via `record.a`, so a badge is never lost when a streak or difficulty later drops. Context-based tests (`nbperf`, `fast`, `span9`) run only in `endGame()` and persist via `record.a`.

## Sync

- `sb` is created at parse time from `SUPA_URL`/`SUPA_KEY` (publishable key, safe to commit). RLS in `supabase/schema.sql` is the security boundary: users can select and insert only their own rows, and nothing can update or delete.
- Cloud table `recs(user_id, id, t, data jsonb, created_at)`; `data` is the record verbatim minus `u`.
- `pushPending()` upserts every record with `u` (`onConflict: user_id,id`, `ignoreDuplicates`) in chunks of 500, then strips `u`. Called from `commit()` after every play and at the start of `fullSync()`.
- `pull()` pages by `created_at >= L.sync.cursor` ordered by `created_at, id`, dedupes by `id`, advances the cursor.
- `fullSync()` = push, pull, `derive()`, `save()`, re-render the active screen. Runs on sign-in, when the tab becomes visible, and on `online`, throttled to once per 30 s.
- Signing in with a different account than `L.sync.uid` asks for confirmation and then discards the local log before pulling. Signing out keeps local progress.
- The sync panel content comes from `syncPanelHtml()` and is shown in two places: at the top of the Stats screen and in a popup opened by the ☁️ header chip (`openSyncModal()`). Both containers carry class `sync-body`; `renderSyncUI()` refreshes all of them. Keep the privacy note ("Only your account ID and game results are stored.").
- The sign-in button follows Google's branding guidelines (light theme, standard-colour G logo, "Sign in with Google" wording). Do not recolour the logo or reword the button.
- `.modal-bg`/`.modal` is the only page-level popup pattern. It sits at `z-index:8`, above the nav (5) and below toasts (9). Close on backdrop click, ✕, or Escape.

Setting up a project is described in the README.

## Game lifecycle

`startGame(id)` shows an intro overlay with a Start button. Start (click, Enter, or Space) runs `go()`, which is guarded to fire **once** and clears the overlay key handler before calling the game's `start(api)`. Do not remove that guard. It fixed a bug where Enter presses inside a game's text input re-triggered Start and spawned duplicate timers.

`makeApi(id, diff)` returns the object every game receives:

| Member | Purpose |
|---|---|
| `api.diff` | Current difficulty, 1 to 10. Use it to scale the task. |
| `api.el` | The `#arena` element. Render into it with `innerHTML`. |
| `api.setTimeout(fn, ms)` / `api.setInterval(fn, ms)` | **Always use these instead of the globals.** They are tracked and cleared on quit or finish, and they no-op once the game is over. |
| `api.onKey(fn)` | Register a keydown handler. Only one at a time. Call `e.preventDefault()` for Space to stop page scroll. |
| `api.hud(text)` | Left status text above the arena (score, round, lives). |
| `api.countdown(secs, onDone)` | Timer on the right; calls `onDone` at zero. Call at most once per game. |
| `api.stopwatch()` | Elapsed timer on the right; returns a function giving elapsed seconds. |
| `api.finish(score, detailsArray, extra)` | Ends the game. `details` are short strings shown as tags. `extra` is passed to achievement checks. |

`endGame` does the rest: computes XP and daily-workout completion from the current derived `S`, appends one play record to `L.recs`, calls `derive()`, works out which badges just unlocked (and pins them on the record), calls `commit()` (save, header, push), and renders the result screen. Games never touch `S` or `L` directly.

## Adding a game

1. Copy an existing `reg({...})` block that is closest in shape (timed rapid-fire like Color Clash, or round-based sudden death like Grid Recall).
2. Set a unique `id` (short, lowercase, stable forever since it is a storage key), `name`, `icon` (one emoji), `cat` (one of `CATS`), `desc` (one sentence shown on the card), and optional `how` (one sentence shown on the intro overlay).
3. Implement `start(api)`. Use only `api.*` timers. Register button handlers with `onclick`. Offer keyboard input via `api.onKey` where natural.
4. **Calibrate scoring** so a solid performance at the given difficulty lands around 700 to 800, and a poor one lands under 350. That is what drives the adaptive difficulty. Nominal max is 1000; brain score caps individual scores at 1000.
5. Make `api.diff` change the task in a visible way and mention it in `how`.
6. Add any game-specific CSS next to the other game classes in `<style>`.
7. The game appears automatically on the home screen, in stats, and in the daily-workout pool. The `all` achievement (play every game) also picks it up.

Game ids currently in use: `match`, `simon`, `grid`, `digits`, `nback`, `stroop`, `schulte`, `react`, `dots`, `math`, `scramble`, `oddword`, `seq`, `rotate`.

## Adding an achievement

Append to `ACH`: `{ id, ico, nm, ds, t: (state, ctx) => boolean }`. Declare the `ctx` parameter **only** if the test needs it: `derive()` uses `t.length` to tell state-based tests (re-run on every derive) from context-based ones (run once in `endGame()` with `{ id, score, extra }`). Unlocks are pinned on the play record, so they are permanent. Keep `id` stable.

## Conventions

- Code style is compact: single-letter DOM helpers, short arrow functions, minimal blank lines. Match it rather than reformatting.
- Escape user-influenced text with `esc()` before inserting via `innerHTML`. Game-generated content (numbers, word lists) is trusted.
- Colors come from the `:root` tokens. Reuse them rather than adding hex values, except for game palettes that need many distinct hues.
- Emoji are used as icons throughout. No SVG icon sets or icon fonts.
- Dates are local-time `YYYY-MM-DD` strings from `dateStr()`. Do not use `toISOString()`, which is UTC and shifts the day.

## Testing

Playwright end-to-end tests live in `tests/`. They run against `index.html` served over http and never touch the network: the fixture in `tests/fixtures.ts` answers the supabase-js CDN URL with an in-page stub that records everything the app does with it on `window.__cloud`.

```bash
npm install                  # once; then: npx playwright install chromium
npm test                     # full suite + coverage report in coverage/
npm run test:ui              # interactive Playwright UI
npx playwright test -g "name"   # a single test by name
npx playwright test tests/games/math.spec.ts
```

Layout:

- `tests/fixtures.ts` – the `test` export (coverage collection, Supabase stub route, fails a test if the page throws) and shared helpers: `seedLog(page, recs)` writes a `brainbop_v2` log and reloads, `play(g, s, extra)` builds a play record, `startAndGo(page, id)` opens a game and presses Start, `finishGame(page, id, score, details, extra)` calls `endGame` the way `api.finish` does, `readLog`/`readS`/`readCurrent` read `L`/`S`/`current`, `localDates([0, -1])` gives local date strings.
- `tests/app-globals.d.ts` – ambient declarations for the app's top-level bindings. They are `const`/`let` in a classic script, so inside `page.evaluate` use them as bare identifiers (`S`, `L`, `startGame(id)`), never `window.S`.
- `tests/utilities.spec.ts`, `state.spec.ts`, `registry.spec.ts`, `screens.spec.ts`, `runner.spec.ts`, `sync.spec.ts` – one file per script section.
- `tests/games/<id>.spec.ts` – one file per game, plus `smoke.spec.ts` which opens, starts and quits every game.

Conventions that keep the suite deterministic:

- Countdown and multi-round games use `page.clock.install()` before `page.goto` and then `page.clock.fastForward(...)`/`runFor(...)`. After `install()` the fake clock still ticks with real time, so normal waits keep working.
- Random content is solved from the DOM (Memory Match faces, Schulte numbers, Stroop ink colours, word lists via the `WORDS`/`CATEGORIES` globals) rather than guessed. Where a fixed sequence is needed, pin `Math.random` after `startGame(id)` and before clicking Start, e.g. `page.evaluate(() => { startGame('simon'); Math.random = () => 0 })`.
- Sync tests simulate sign-in with `window.__signIn(userId)`, seed the fake table via `window.__cloud.rows`, and flip `window.__cloud.failUpsert`/`failSelect` for error paths. Blocking the CDN with `page.route(SUPA_CDN, r => r.abort())` exercises the `sb === null` path.
- Records seeded without `u: 1` count as already synced.

When adding a feature or fixing a bug, add or extend a test in the matching file and run `npm test`. Real Google sign-in cannot be automated; everything else can.

## Known gotchas

- The overlay Start handler must be cleared once the game begins (see Game lifecycle). Any game that uses a text input and does not call `api.onKey` depends on this.
- `api.countdown` and `api.stopwatch` both write to `#hud-r`. Use one per game.
- `gs(id)` creates a stats record in `S` on first access, including when a game is merely opened. UI code must check `plays > 0` before showing a best score, otherwise unplayed games show 0. Such entries are transient; `derive()` rebuilds `S` from records only.
- `derive()` is called at boot, after `ACH`, `GAMES`, and `dailyGames()` exist. Do not call it (or anything reading `S`) at parse time before the boot line.
- `S` is replaced wholesale by `derive()`. Never keep a reference to `S` or a sub-object across a `derive()` call; re-read it (e.g. `gs(id)` again) as `endGame()` does.
- Web Audio needs a user gesture before it can play. The first `beep()` happens after a click, so this is fine, but do not add sounds on page load.
- The full-page layout has a fixed bottom nav. Keep `padding-bottom` on `.app` large enough that content is not hidden behind it.
