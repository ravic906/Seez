# Echoes

A one-thumb dodger for your phone. Slide left and right to pass through gaps in bars that fall toward you. Every run comes back as a **ghost** that replays exactly what you did. Touch one and the run is over.

The bars are the same every time on a given board, so your earlier runs took the same safe route you are about to take. You can't just repeat yourself.

## Play
```
npm start        # http://localhost:8080 (open it on your phone via your computer's address)
npm test         # rules and saving tests
```
- Touch to start. Your thumb sets where you are; you slide at a fixed top speed, so you can't teleport.
- Skim a gap edge for a **graze** bonus.
- You keep two ghosts: your **best** run (gold) and your **last** run (blue). They wake 2 seconds after you start, so you have time to get out of their way.
- **Daily board** is the same for everyone each day. **New board** starts a fresh one with no ghosts.

## Code
- `src/core.js`: the rules, at a fixed 60 Hz so replays match exactly. No DOM.
- `src/main.js`: canvas drawing, touch and keyboard controls.
- `src/store.js`: boards and saved runs (localStorage, with an in-memory fallback).
- `src/sound.js`: tiny synthesised sounds.
- `scripts/bot.mjs`, `scripts/tune.mjs`, `scripts/feasible.mjs`: a human-ish bot and a perfect planner, used to check the difficulty is fair (`npm run tune`).
- `scripts/build-artifact.mjs`: builds a hosted copy with inline wrapper tags stripped.

## Difficulty, measured
A perfect planner survives 60+ seconds with 0 or 1 ghosts and about 17 seconds (median) with 2, so the game gets harder as your history grows but is never impossible. A strong run makes a tougher ghost for the next one, which is a built-in catch-up.
