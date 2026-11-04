# Echoes

A one-thumb space survival game for your phone. The SS Meridian was destroyed by aliens, and you are the one rescue bot that got out. Slide left and right to thread the wreckage. Every run you fly comes back as a **crew ghost** that replays your route, so you are always racing your own past.

## Play
```
npm start        # http://localhost:8080 (open it on your phone via your computer's address)
npm test         # rules, replay checking and leaderboard tests
npm run tune     # difficulty check with a human-like bot
```
The first launch plays a short animated intro (the ship destroyed, the bot's escape) with its own score: the engine hum, alien shots and impacts, the explosions, a choir for the lost crew, the launch and a title chime. Browsers need a touch before any sound, so a "Tap for sound" prompt appears; the first tap starts the music in sync with the picture and the next one skips. "Watch intro" replays it.

## Rules
- **Steer** with your thumb. You follow it at a capped speed, so you can't teleport. Wreckage ends the run at once. Skim a gap edge for a **graze** bonus.
- **Sound.** A soft filtered white-noise bed (with a faint low hum) plays from your first touch; the speaker button turns it and all effects off. It brightens during Nitro and muffles during Slow-mo.
- **Boards.** The wreckage is the same every run of a board. The **Daily board** is the same for everyone each day. **New board** is a private practice board with no leaderboard (your own runs on it still come back as ghosts).
- **The speed** starts at 0.6 and climbs to 1.2 (double) over about 23 seconds, then stays there. The crew's visits and the patches follow the wreckage, not the clock, so Slow-mo cannot shift them.
- **Crew ghosts come and go.** The crew first find you 10 to 15 seconds in, stay for 12 to 18 seconds (8 to 12 when both come at once), then drift away for 12 to 18 seconds, and repeat, at times fixed by the board. The first visit is your best run (the captain, gold), the second your last flight (blue), and later visits can bring both. A visiting ghost fades in and has 1.5 s to wake, and can't touch you for its last 0.75 s as it leaves. A touch costs one of your **3 suit cells**, shatters that ghost for 2.5 s, and gives you 2.5 s of safety (the same time the ghost takes to re-form). That ghost can't hit you again until you have moved clear of it (or 6 s have passed), so being caught on your own old line costs one cell, not three. Ghosts follow the wreckage, not the clock, so they stay on the line they flew even when you or they used Slow-mo. Lose all three and the run ends. A ghost whose run was short never arrives.
- **Something is always after you.** While the crew are away, the board gives you either an **alien nest** (aliens on most bars) or a **tight patch** (lit red: gaps a little narrower than usual, about 11% less room, with the usual choice of gaps and normal-size jumps). Before the first visit a few aliens keep you busy. The line under the score tells you what it is: *aliens in the wreckage*, *the crew is after you*, *alien nest*, *tight wreckage*. (If a crew member's run was too short to reach this far, that visit is quiet.)
- **Aliens** (snails) sit on the wreckage from bar 4 on. They shake red before they fire, and every shot is slower than you can slide. **Hammer**: thrown straight at where you stood (never in a tight patch, where the room is narrower). **Jacks**: a fan of three. **Bomb**: lands, ticks half a second, then a wide blast. A shot costs a suit cell, like a ghost.
- **Helpers.** Friendly crew spirits drift by carrying a power. Fly into one to take it. Only one timed power works at a time, and a new one replaces the old. The better ones unlock the further you fly:

| Tier | Helper | Effect |
|---|---|---|
| 1 | Nitro | 4 s of faster sideways speed and double points |
| 1 | Shield | absorbs the next hit (8 s) |
| 1 | Slow-mo | the wreckage and the aliens' shots move at half speed for 5 s |
| 1 | Wide gaps | gaps grow by half for 5 s (never ending while wreckage is at your row) |
| 1 | Foresight | for 8 s, shows the safe route through the next bars, where shots will land and where the crew will be |
| 2 | Exorcise | crew ghosts and alien shots pass through you for 4 s |
| 2 | Shrink | you get smaller for 6 s (never ending while wreckage is at your row) |
| 2 | Gold rush | triple points for 5 s |
| 3 | Repair | +1 suit cell (5 s of safety if you are full) |
| 3 | Phase | fly through wreckage and shots for 2 s |

## Leaderboard
Where the page has a shared database (the hosted Claude page), a **Survivors** board appears: Today and This week. Players are random callsigns (rerollable), with no names or profiles. **Every score is checked by replaying the saved run**, so a faked score or an impossible move simply isn't listed. To let friends post scores, give them **Contributor** access to the page; viewers can read but not post. It is not available in the standalone build.

Limits: the replay also plays the aliens' shots (with a few spare cells, since it can't see your ghosts), so a route that ignores them is cut off early, but it can't tell a flawless bot from a person, and it can't stop someone posting a verbatim copy of another player's run (there is no server clock to say who posted first), and an anonymous friends' board isn't a hardened competition.

## Code
- `src/core.js`: the rules at a fixed 60 Hz. Every position is snapped to a 16-bit grid so a saved run replays exactly (`verifyRun`).
- `src/art.js`, `src/intro.js`: all drawing (space, wreckage, bot, crew, aliens, shots, the opening scene). Nothing is loaded; it is all vector code. The backdrop is a stream of scenery along your route (planets of six kinds, moons, comets, asteroid fields, nebulae, galaxies, pulsars, binary stars, a derelict station), each at its own depth so it drifts past at its own speed, and different on every board.
- `src/main.js`: screens, controls, hearts and chips, field guide, leaderboard sheet.
- `src/board.js`, `src/leaderboard.js`: leaderboard logic and the database glue.
- `src/store.js`, `src/names.js`, `src/sound.js`: saved runs, callsigns, synthesised sounds.
- `scripts/`: `bot.mjs` (a human-like player that dodges), `tune.mjs`, `feasible.mjs`, `serve.mjs`, `build-artifact.mjs`.
- `test/`: engine, replay verification, powers, snails and leaderboard tests (a small fake database in `fakedb.js`).

## Difficulty, measured
A human-like bot that dodges ghosts and shots (but ignores helpers) survives a median of 44 to 51 s, and every board can be flown by following its guaranteed route for 150 s, tight patches included. Before hearts, a single ghost touch ended a run within seconds.

## Android app

The same game ships as an Android app built with [Capacitor](https://capacitorjs.com) (project in `android/`, app id `app.echoes.rescue`). It runs fully offline: fonts are bundled (`app/fonts`, SIL Open Font License) and nothing is fetched from the internet. The shared leaderboard is not in the app yet (personal bests and ghosts work as on the web).

```
npm install
npm run app:build     # copies the game into android/ (adds Capacitor's runtime and local fonts)
npm run app:debug     # android/app/build/outputs/apk/debug/app-debug.apk, to sideload
npm run app:release   # signed .aab for Google Play, once android/keystore.properties exists
npm run app:icons     # redraws launcher icons, splash screens and store graphics from src/art.js
```

The Android back button closes a sheet, pauses a run (on the field guide), skips the intro, or leaves the app; switching away mid-run pauses it too. Publishing steps, store text, graphics and the privacy policy are in `store/` (start with `store/PUBLISHING.md`).

