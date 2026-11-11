# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MRT Math Express is a Singapore MRT-themed math game for kids around age 6. It covers single-digit addition and subtraction, and **every number in a question and its answer is 10 or less** (the user asked for Easy difficulty only). `README.md` has the player-facing description and a list of future game ideas.

## Running and testing

The project has no build, dependencies, package manager, linter or test suite. The whole game is the single file `index.html`, with its HTML, CSS and JS inline, and it must keep working offline when opened directly from `file://`.

- **Run:** open `index.html` in a browser.
- **Check a change:** drive the game headlessly with Playwright, which is pre-installed in the cloud container (`require('playwright')`). Load `file:///…/index.html`, click `#goBtn`, then for each question wait for `#answers .ans` to appear (it's empty while the train rides, about 5 s), read `#equation` (the minus sign is `−`, U+2212) and click the matching `.ans`. Listen for `pageerror`. A full line is 9 questions and ends on the `#end` screen. A syntax error blanks the whole page, so extract the `<script>` body and run `node --check` on it after big edits. Save screenshots and test scripts in a scratch directory, not the repo.
- Headless browsers can't play audio. To check sound, count `OscillatorNode.prototype.start` calls instead.

## Architecture (inside `index.html`)

- **Three screens:** `<section class="screen">` elements with the ids `home`, `game` and `end`. `show(id)` switches between them.
- **Data:** `LINES` holds 6 lines (`id`, `name`, official line colour, and 10 real station names in route order). Each trip is `stations.length - 1` questions. The current line colour is applied through the CSS variable `--line` on `:root`.
- **State:** one object `S` holds the line, mode (`add`, `sub` or `mix`), current stop, stars and current question. `makeQuestion()` sets the number ranges (the 10-or-less limit lives here) and makes 3 answer choices, adding distractors that are near the answer and within 0–10.
- **Game loop:** `startGame()` (train at station 0) → `depart()` (makes the next question, closes the doors) → `ride()` → `arrive()` (`S.at++`, opens the doors, shows the question) → `answer()`. After a right answer comes `depart()` again, or `finish()` at the last station. That gives 9 questions, at stations 1–9.
- **Ride animation:** in `ride()`, the camera follows the train, so the train stays put and a `requestAnimationFrame` loop moves everything else. An ease-in-out curve drives `background-position` on the scenery layers (`#layerFar` and `#layerNear`, which are SVG tiles made in `paintScenery()`) and `#rail`, a `transform` on `#platform`, wheel rotation, the train's bob, the tunnel overlay's opacity, the route marker and the rumble sound. The next question's passengers are swapped in by `fillScene()` at the midpoint, while the tunnel is darkest and the platform is off-screen.
- **Cancelling:** `S.gen` is a game counter. Timers and rides check it and stop if it has changed, so 🏠 or a restart cancels anything still running. Honour `prefers-reduced-motion` through `reduceMotion`, which makes the ride short and removes the bob.
- **Audio:** everything is made with the Web Audio API; there are no audio files.
  - `tone()` plays sound effects (in `sfx`).
  - `music` is an IIFE with a look-ahead note scheduler that plays an original looping tune. It starts on the first `pointerdown`, because of browser autoplay rules, and `music.duck()` lowers it while `say()` speaks.
  - `say()` uses `speechSynthesis` to read questions aloud.
  - Don't copy the real MRT chimes or jingles, which are copyrighted. Keep the sounds original.
- **Persistence:** the `store` wrapper writes `localStorage` keys `mrtBadges`, `mrtSound` and `mrtMusic`, each in try/catch. The game must still work when storage is unavailable.

## Design constraints for the audience

Keep the kid-friendly rules: big tap targets, exactly 3 answer choices, tappable passengers for counting, questions read aloud, gentle feedback on wrong answers (a hint on the second miss), and no timers or losing. Use generic line colours and station names only. No operator logos or branding.
