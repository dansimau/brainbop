# BrainBop

![Checks](https://github.com/dansimau/brainbop/actions/workflows/checks.yaml/badge.svg)
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/dansimau/brainbop/badges/coverage.json)
[![Coded with Claude Code](https://vibecoded.fyi/badges/flat/agents/claude-code.svg)](https://vibecoded.fyi/)

A brain training web app in a single HTML file. Fourteen short games across memory, attention, speed, math, language, and logic, with adaptive difficulty, XP and levels, daily workouts, streaks, and badges to track progress over time.

**URL:** https://dansimau.github.io/brainbop/

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

## Scoring and progression

- **Score.** Every game reports a score on a nominal 0 to 1000 scale, along with details such as accuracy or time. Some games can exceed 1000 on exceptional runs.
- **Adaptive difficulty.** Each game has its own difficulty from 1 to 10. Scoring 750 or more raises it by one. Scoring under 350 lowers it by one. Harder levels change the task (more cards, longer sequences, bigger numbers, tighter timing).
- **XP and levels.** XP earned per game is roughly score divided by 10, scaled up by 15% per difficulty level above 1. Personal bests and first plays add a bonus. Levels follow a growing curve, so each one takes a bit longer than the last.
- **Daily workout.** Three games chosen each day, the same for everyone on that date. Completing all three earns a 150 XP bonus.
- **Streak.** Counts consecutive days with at least one game played.
- **Brain Score.** The average of your recent form (last five scores) in each category, then averaged across categories. Shown on the home screen with per-category bars.
- **Badges.** 22 achievements for milestones like play counts, levels, streaks, daily workouts, high scores, and a few game-specific feats.

The Stats tab shows the cloud sync controls, totals, a 12-week activity heatmap, and per-game sparklines of recent scores.

## Progress and sync

Progress is saved in the browser's localStorage as an append-only log of plays. Stats, levels, streaks and badges are all computed from that log. Nothing is ever edited or deleted, and there is no reset.

Optionally, tap the ☁️ button in the header (or the Cloud sync panel on the Stats tab) and **Sign in with Google** to back the log up to the cloud (Supabase). Once signed in, every play is pushed as it happens and plays from your other devices are pulled in, so clearing the browser or switching devices no longer loses progress. Only your account ID and game results are stored. Sync is only available when the page is served over http(s); opened from disk, the app works exactly as before without it.

The storage key is `brainbop_v2`. Progress saved by earlier versions under `brainbop_v1` is migrated automatically the first time the new version loads.

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
