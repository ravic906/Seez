# Echoes

A one-thumb space survival game for your phone. The SS Meridian was destroyed by aliens, and you are the one rescue bot that got out. Slide left and right to thread the wreckage. Every run you fly comes back as a **crew ghost** that replays your route, so you are always racing your own past.

## Play
```
npm start        # http://localhost:8080 (open it on your phone via your computer's address)
npm test         # rules, replay checking and leaderboard tests
npm run tune     # difficulty check with a human-like bot
```
The first launch plays a short animated intro (the ship destroyed, the bot's escape). It can be skipped, and "Watch intro" replays it.

## Rules
- **Steer** with your thumb. You follow it at a capped speed, so you can't teleport. Wreckage ends the run at once. Skim a gap edge for a **graze** bonus.
- **Sound.** A soft filtered white-noise bed (with a faint low hum) plays from your first touch; the speaker button turns it and all effects off. It brightens during Nitro and muffles during Slow-mo.
- **Boards.** The wreckage is the same every run of a board. The **Daily board** is the same for everyone each day. **New board** is a private practice board with no ghosts.
- **Crew ghosts.** You keep two: your best run (the captain, gold) and your last run (blue). They wake 2 seconds after you start. A touch costs one of your **3 suit cells**, shatters that ghost for 2.5 s, and gives you 1.5 s of safety. Lose all three and the run ends.
- **Aliens** (snails) sit on the wreckage from bar 10 on. They shake red before they fire, and every shot is slower than you can slide. **Hammer**: fast, straight at where you stood. **Jacks**: a fan of three. **Bomb**: lands, ticks half a second, then a wide blast. A shot costs a suit cell, like a ghost.
- **Helpers.** Friendly crew spirits drift by carrying a power. Fly into one to take it. Only one timed power works at a time, and a new one replaces the old. The better ones unlock the further you fly:

| Tier | Helper | Effect |
|---|---|---|
| 1 | Nitro | 4 s of faster sideways speed and double points |
| 1 | Shield | absorbs the next hit (8 s) |
| 1 | Slow-mo | the wreckage falls slower for 4 s |
| 1 | Wide gaps | gaps grow for 5 s |
| 1 | Foresight | shows where the crew will be for 6 s |
| 2 | Exorcise | crew ghosts can't touch you for 5 s |
| 2 | Shrink | you get smaller for 6 s |
| 2 | Gold rush | triple points for 5 s |
| 3 | Repair | +1 suit cell (a Shield if you are full) |
| 3 | Phase | fly through wreckage and shots for 2 s |

## Leaderboard
Where the page has a shared database (the hosted Claude page), a **Survivors** board appears: Today and This week. Players are random callsigns (rerollable), with no names or profiles. **Every score is checked by replaying the saved run**, so a faked score or an impossible move simply isn't listed. To let friends post scores, give them **Contributor** access to the page; viewers can read but not post. It is not available in the standalone build.

Limits: the replay check can't tell a flawless bot from a person, and an anonymous friends' board isn't a hardened competition.

## Code
- `src/core.js`: the rules at a fixed 60 Hz. Every position is snapped to a 16-bit grid so a saved run replays exactly (`verifyRun`).
- `src/art.js`, `src/intro.js`: all drawing (space, wreckage, bot, crew, aliens, shots, the opening scene). Nothing is loaded; it is all vector code. The backdrop is a stream of scenery along your route (planets of six kinds, moons, comets, asteroid fields, nebulae, galaxies, pulsars, binary stars, a derelict station), each at its own depth so it drifts past at its own speed, and different on every board.
- `src/main.js`: screens, controls, hearts and chips, field guide, leaderboard sheet.
- `src/board.js`, `src/leaderboard.js`: leaderboard logic and the database glue.
- `src/store.js`, `src/names.js`, `src/sound.js`: saved runs, callsigns, synthesised sounds.
- `scripts/`: `bot.mjs` (a human-like player that dodges), `tune.mjs`, `feasible.mjs`, `serve.mjs`, `build-artifact.mjs`.
- `test/`: engine, replay verification, powers, snails and leaderboard tests (a small fake database in `fakedb.js`).

## Difficulty, measured
A human-like bot that dodges ghosts and shots (but ignores helpers) survives a median of about 40 s with no ghosts and 15 to 20 s with two, so a strong run makes the next one harder and a weak one easier. Before hearts, a single ghost touch ended a run within seconds.
