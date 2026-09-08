# BrainBop

[![Coded with Claude Code](https://vibecoded.fyi/badges/flat/agents/claude-code.svg)](https://vibecoded.fyi/)

A brain training web app in a single HTML file. Fourteen short games across memory, attention, speed, math, language, and logic, with adaptive difficulty, XP and levels, daily workouts, streaks, and badges to track progress over time.

https://dansimau.github.io/brainbop/

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

The Stats tab shows totals, a 12-week activity heatmap, per-game sparklines of recent scores, and a Reset button.

All progress lives in the browser's localStorage. It never leaves the device.
