# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MRT Math Express is a Singapore MRT-themed math game for kids around age 6. It covers single-digit addition and subtraction, and **every number in a question and its answer is 10 or less** (the user asked for Easy difficulty only). `README.md` has the player-facing description and a list of future game ideas.

## Running and testing

The project has no build, dependencies, package manager, linter or test suite. The whole game is the single file `index.html`, with its HTML, CSS and JS inline, and it must keep working offline when opened directly from `file://`.

- **Run:** open `index.html` in a browser.
- **Check a change:** drive the game headlessly with Playwright, which is pre-installed in the cloud container (`require('playwright')`). Load `file:///…/index.html`, click `#goBtn`, then for each question wait for `#answers .ans` to appear (it's empty while passengers walk and the train rides, which can take up to about 15 s), read `#equation` (the minus sign is `−`, U+2212) and click the matching `.ans`. Listen for `pageerror`. A full line is 9 questions and ends on the `#end` screen. A syntax error blanks the whole page, so extract the `<script>` body and run `node --check` on it after big edits. Save screenshots and test scripts in a scratch directory, not the repo.
- Test small phones too (Playwright's `iPhone SE` is 320×568). A `max-height: 700px` media query tightens the game screen, and `arrive()` scrolls the answer buttons into view if they're below the fold.
- `media/` holds the README's gameplay video and screenshot. They aren't used by the game.
- Headless browsers can't play audio. To check sound, count `OscillatorNode.prototype.start` calls instead.

## Architecture (inside `index.html`)

- **Three screens:** `<section class="screen">` elements with the ids `home`, `game` and `end`. `show(id)` switches between them.
- **Start button:** `#goBtn` is a train drawn in CSS. `pullInStartTrain()` replays its pull-in animation whenever the home screen shows. It bobs while it has the `.waiting` class. A tap adds `.leaving` (drive-off animation plus `sfx.toot()`), and `startGame()` runs about 1 s later. In tests, wait for `#game.active` after clicking it.
- **Data:** `LINES` holds 6 lines (`id`, `name`, official line colour, and 10 real station names in route order). Each trip is `stations.length - 1` questions. The current line colour is applied through the CSS variable `--line` on `:root`.
- **State:** one object `S` holds the line, mode (`add`, `sub` or `mix`), current stop, stars and current question. `makeQuestion()` sets the number ranges (the 10-or-less limit lives here) and makes 3 answer choices, adding distractors that are near the answer and within 0–10.
- **Game loop:** `startGame()` (train at station 0) → `depart()` (makes the next question, closes the doors) → `ride()` → `arrive()` (`S.at++`, opens the doors, reads the story, runs `movePassengers()`, then shows the answer buttons and asks) → `answer()` → `depart()` again, or `finish()` at the last station. That gives 9 questions, at stations 1–9.
- **Ride animation:** in `ride()`, the camera follows the train, so the train stays put and a `requestAnimationFrame` loop moves everything else. An ease-in-out curve drives `background-position` on the scenery layers (`#layerFar` and `#layerNear`, which are SVG tiles made in `paintScenery()`) and `#rail`, a `transform` on `#platform`, wheel rotation, the train's bob, the tunnel overlay's opacity, the route marker and the rumble sound. The next question's passengers are swapped in by `fillScene()` at the midpoint, while the tunnel is darkest and the platform is off-screen.
- **Passengers walking:** `movePassengers()` moves one passenger at a time, overlapping slightly. `boardOne()` walks someone along the platform to the nearest door, steps them in and pops them into the `#carriage` window. `alightOne()` walks a `.leaving` passenger to a door, down onto the platform and off-screen. A walking copy (`.walker`, animated with the Web Animations API between points measured by `rel()`) does the moving, and `leaveGap()` leaves an invisible copy in place so other passengers don't shift. Passengers move when the train arrives, before the question, so by the time the answers show, the train holds exactly the answer. While people walk, `#tally` counts only how many get on or off (➕ 1, 2, 3), so it doesn't give the answer away. After a right answer it shows the total in green. `say()` returns a promise that resolves when speech ends, so `arrive()` can wait for the story to finish.
- **Cancelling:** `S.gen` is a game counter. Timers and rides check it and stop if it has changed, so 🏠 or a restart cancels anything still running. Honour `prefers-reduced-motion` through `reduceMotion`, which makes the ride short and removes the bob.
- **Audio:** everything is made with the Web Audio API; there are no audio files.
  - `tone()` plays sound effects (in `sfx`).
  - `music` is an IIFE with a look-ahead note scheduler that plays an original looping tune. `music.duck()` lowers it while `say()` speaks. Keep its notes above about 130 Hz so phone speakers can play them.
  - `unlockAudio()` runs on real taps (`pointerup`, `touchend`, `click`, `keydown`; not `pointerdown`, which doesn't count as a tap on touch screens). It resumes the AudioContext, plays a silent `<audio>` loop and sets `navigator.audioSession.type = "playback"` so the iPhone silent switch doesn't mute the game, speaks a silent utterance (iOS only allows speech after one during a tap), and starts the music.
  - `say()` uses `speechSynthesis` to read questions aloud.
  - Don't copy the real MRT chimes or jingles, which are copyrighted. Keep the sounds original.
- **Persistence:** the `store` wrapper writes `localStorage` keys `mrtBadges`, `mrtSound` and `mrtMusic`, each in try/catch. The game must still work when storage is unavailable.

## Design constraints for the audience

Keep the kid-friendly rules: big tap targets, exactly 3 answer choices, tappable passengers for counting, questions read aloud, gentle feedback on wrong answers (a hint on the second miss), and no timers or losing. Use generic line colours and station names only. No operator logos or branding.
