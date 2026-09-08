# AGENTS.md

Guidance for AI coding agents and contributors working on BrainBop.

## What this is

A brain training web app delivered as **one self-contained file**, `index.html`. Plain HTML, CSS, and vanilla JavaScript. No framework, no build step, no package manager, no external requests. That constraint is deliberate. Keep it.

## Hard rules

1. **Single file.** All markup, styles, and script stay in `index.html`. Do not split into modules, add a bundler, or load anything from a CDN.
2. **No dependencies.** Vanilla JS only. Features must work when the file is opened directly from disk (`file://`), so nothing may rely on `fetch`, service workers, or same-origin APIs beyond `localStorage` and Web Audio.
3. **Name.** The product is **BrainBop**. Do not reintroduce any prior name anywhere, including in storage keys or comments.
4. **Storage key.** State is stored under `brainbop_v1`. If you change the state shape in a way that breaks old saves, either migrate in `load()` or bump the key version and say so in the README.
5. **Preserve saved state on edits.** Adding fields to state is fine if `load()` fills defaults (it merges over `defaultState()`). Never rename or remove existing fields without a migration.

## File layout

Everything is in `index.html`, in this order. Section headers in the script are `/* ===== name ===== */` comments; search for them rather than relying on line numbers.

- `<style>` – all CSS. Design tokens are CSS custom properties on `:root`. Game-specific classes are grouped after the shared UI classes.
- `<body>` – static shell: header (level bar, streak, sound toggle), five `<section class="screen">` containers (`home`, `play`, `result`, `stats`, `badges`), and a fixed bottom `<nav>`.
- `<script>` sections:
  - **utilities** – DOM helpers (`$`, `$$`), random helpers, date helpers, `seeded()` PRNG, `toast()`, `flashFb()`.
  - **sound** – `beep()` and the `sfx` object. Silently no-ops if audio is unavailable or muted.
  - **state** – `S` (the live state object), `load()`, `save()`, `gs(id)` (get or create a game's stats record), `levelInfo(xp)`.
  - **game registry** – `GAMES` array, `G` map by id, `CATS` category order, `reg()`.
  - **achievements** – `ACH` definitions and `checkAch(ctx)`.
  - **daily workout** – `dailyGames()` (date-seeded pick of 3), `dailyState()`.
  - **brain score** – `recentAvg`, `catScores`, `brainScore`.
  - **screens** – `showScreen`, `renderHeader`, `renderHome`, `renderStats`, `renderBadges`, `spark()`.
  - **game runner** – `startGame`, `makeApi`, `endGame`, `abortGame`, the global keydown dispatcher.
  - **GAMES** – one `reg({...})` block per game, each preceded by a `/* --- Name --- */` comment.
  - **boot** – initial render.

## State shape

```js
{
  xp: 0,
  games: { [id]: { best, plays, total, diff, hist: [last 40 scores] } },
  history: [ { d: 'YYYY-MM-DD', g: id, s: score } ],   // capped at 500
  streak: { count, last: 'YYYY-MM-DD' | null },
  ach: [ achievementId, ... ],
  daily: { date: 'YYYY-MM-DD', done: [gameId, ...] },
  dailyCount: 0,
  totalPlays: 0,
  sound: true,
  days: { 'YYYY-MM-DD': gamesPlayedThatDay }
}
```

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

`endGame` does the rest: updates per-game stats, adjusts difficulty (≥750 up, <350 down), awards XP, updates streak, daily workout, activity days, checks achievements, saves, and renders the result screen. Games never touch `S` directly.

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

Append to `ACH`: `{ id, ico, nm, ds, t: (state, ctx) => boolean }`. `ctx` is `{ id, score, extra }` from the game that just finished, or `undefined`. Badges are checked after every game and unlock permanently. Keep `id` stable.

## Conventions

- Code style is compact: single-letter DOM helpers, short arrow functions, minimal blank lines. Match it rather than reformatting.
- Escape user-influenced text with `esc()` before inserting via `innerHTML`. Game-generated content (numbers, word lists) is trusted.
- Colors come from the `:root` tokens. Reuse them rather than adding hex values, except for game palettes that need many distinct hues.
- Emoji are used as icons throughout. No SVG icon sets or icon fonts.
- Dates are local-time `YYYY-MM-DD` strings from `dateStr()`. Do not use `toISOString()`, which is UTC and shifts the day.

## Testing

There is no test suite. Verify changes by loading the page in a browser and exercising the flow. When a headless browser is available, the pattern that has worked:

1. Serve the directory (`python3 -m http.server 8765`) because headless tools often block `file://`.
2. Load the page and check the console for errors.
3. For every game, run `startGame(id)`, click `#go-btn`, wait about a second, and confirm `#arena` has children and `#hud-l` has text. All registry symbols (`GAMES`, `G`, `startGame`, `current`, `S`) are global and reachable from `page.evaluate`.
4. Play at least one game to completion programmatically (Memory Match and Number Hunt are easy to solve by reading the DOM) and confirm the result screen shows and `localStorage` updated.
5. Regression check for the timer bug: start Math Sprint, submit several answers with Enter, and confirm `current.timers.length` stays at 1 and the countdown text decreases monotonically.

A quick syntax check without a browser:

```sh
node -e "const fs=require('fs');const js=fs.readFileSync('index.html','utf8').split('<script>')[1].split('</script>')[0];new Function(js);console.log('ok')"
```

## Known gotchas

- The overlay Start handler must be cleared once the game begins (see Game lifecycle). Any game that uses a text input and does not call `api.onKey` depends on this.
- `api.countdown` and `api.stopwatch` both write to `#hud-r`. Use one per game.
- `gs(id)` creates a stats record on first access, including when a game is merely opened. UI code must check `plays > 0` before showing a best score, otherwise unplayed games show 0.
- Web Audio needs a user gesture before it can play. The first `beep()` happens after a click, so this is fine, but do not add sounds on page load.
- The full-page layout has a fixed bottom nav. Keep `padding-bottom` on `.app` large enough that content is not hidden behind it.
