# BrainBop

![Checks](https://github.com/dansimau/brainbop/actions/workflows/checks.yaml/badge.svg)
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/dansimau/brainbop/badges/coverage.json)
[![Coded with Claude Code](https://vibecoded.fyi/badges/flat/agents/claude-code.svg)](https://vibecoded.fyi/)

A brain training web app in a single HTML file. Fourteen short games across memory, attention, speed, math, language, and logic, with adaptive difficulty, XP and levels, daily workouts, streaks, and badges to track progress over time.

**URL:** https://dansimau.github.io/brainbop/

## Features

- 🧠 **Fourteen games** across memory, attention, speed, math, language and logic, each scored on a nominal 0 to 1000 scale.
- 📈 **Adaptive difficulty.** Every game has its own level from 1 to 10. Score 750 or more to move up, under 350 to drop down.
- ⭐ **XP and levels.** Each play earns XP scaled by difficulty, with bonuses for personal bests and first plays.
- 📅 **Daily workout.** Three games chosen each day, the same for everyone on that date. Complete all three for a 150 XP bonus.
- 🔥 **Streaks.** Counts consecutive days with at least one game played.
- 🎯 **Brain Score.** Your recent form in each category, averaged into one number with per-category bars on the home screen.
- 🏅 **Badges.** 22 achievements for play counts, levels, streaks, daily workouts, high scores and game-specific feats.
- 📊 **Stats.** Totals, a 12-week activity heatmap and per-game sparklines of recent scores.
- 💾 **Local progress.** Saved in the browser as an append-only log of plays. Nothing is edited or deleted, so progress is never lost to a stray tap.
- ☁️ **Cloud sync.** Optionally sign in with Google to back the log up to Supabase and sync across devices. Only your account ID and game results are stored.
- 📄 **Single HTML file.** No build step or dependencies. Works opened straight from disk (sync needs http(s)).

## Games

| Category  | Game            | What you do                                                                 |
|-----------|-----------------|-----------------------------------------------------------------------------|
| Memory    | Memory Match    | Flip cards and find every matching pair in as few moves as possible.        |
| Memory    | Echo Sequence   | Watch tiles light up, then repeat the sequence. It grows every round.       |
| Memory    | Grid Recall     | Memorize highlighted cells, then tap them back from memory.                 |
| Memory    | Digit Span      | A number flashes. Type it back. Higher levels require typing it backwards.  |
| Memory    | N-Back          | Letters stream past. Hit MATCH when the letter equals the one N steps back. |
| Attention | Color Clash     | Stroop test. Pick the ink color, not the word. The rule flips at higher levels. |
| Attention | Number Hunt     | Schulte table. Tap numbers in ascending order as fast as you can.           |
| Speed     | Reflex          | Wait for green and click. Higher levels add a yellow decoy.                 |
| Speed     | Quick Count     | Two clouds of dots. Which side has more?                                    |
| Math      | Math Sprint     | Timed arithmetic. Operators and number sizes grow with difficulty.          |
| Language  | Word Scramble   | Unscramble words. Longer words at higher levels.                            |
| Language  | Odd Word Out    | Spot the word that doesn't belong in the group.                             |
| Logic     | Pattern Finder  | Work out the rule behind a number sequence and pick what comes next.        |
| Logic     | Shape Shift     | Is the second shape a rotation of the first, or a mirror image?             |

## Development

There is no build step. Serve the directory and open it in a browser:

```bash
npm install
npm run serve    # http://localhost:8765
npm test         # Playwright end-to-end tests (auto-starts a server) + coverage report
```

Tests live in `tests/`; see `AGENTS.md` for the layout and conventions.

### Setting up your own Supabase project

1. Create a project at https://supabase.com and run `supabase/schema.sql` in the SQL editor.
2. In Google Cloud Console create an OAuth client (Web application) with the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Paste its Client ID and Secret into Authentication → Providers → Google in Supabase.
3. In Authentication → URL Configuration set the Site URL to where you host the page and add `http://localhost:8765/**` for local testing.
4. Put the project URL and publishable key into `SUPA_URL` and `SUPA_KEY` in `index.html`. Both are safe to publish; row-level security keeps each user's rows private.
