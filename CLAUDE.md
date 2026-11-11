# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MRT Math Express is a Singapore MRT-themed math game for kids around age 6. It covers single-digit addition and subtraction, and **every number in a question and its answer is 10 or less** (the user asked for Easy difficulty only). `README.md` has the player-facing description and a list of future game ideas.

## Running and testing

The project has no build, dependencies, package manager, linter or test suite. The whole game is the single file `index.html`, with its HTML, CSS and JS inline, and it must keep working offline when opened directly from `file://`.

- **Run:** open `index.html` in a browser.
- **Check a change:** drive the game headlessly with Playwright, which is pre-installed in the cloud container (`require('playwright')`). Load `file:///…/index.html`, click `#goBtn`, then answer each question by reading `#equation` (the minus sign is `−`, U+2212) and clicking the matching `.ans` button. Wait about 3.4 s between answers for the train animation, and listen for `pageerror`. A full line is 9 questions and ends on the `#end` screen. Save screenshots and test scripts in a scratch directory, not the repo.
- Headless browsers can't play audio. To check sound, count `OscillatorNode.prototype.start` calls instead.

## Architecture (inside `index.html`)

- **Three screens:** `<section class="screen">` elements with the ids `home`, `game` and `end`. `show(id)` switches between them.
- **Data:** `LINES` holds 6 lines (`id`, `name`, official line colour, and 10 real station names in route order). Each trip is `stations.length - 1` questions. The current line colour is applied through the CSS variable `--line` on `:root`.
- **State:** one object `S` holds the line, mode (`add`, `sub` or `mix`), current stop, stars and current question. `makeQuestion()` sets the number ranges (the 10-or-less limit lives here) and makes 3 answer choices, adding distractors that are near the answer and within 0–10.
- **Game loop:** `startGame()` → `nextQuestion()`, which draws the passengers in `#carriage` and `#platform`, the story text, the equation and the answers → `answer()`. A right answer animates the passengers, then the train, then advances `S.stop`, and finally calls either `nextQuestion()` or `finish()`.
- **Audio:** everything is made with the Web Audio API; there are no audio files.
  - `tone()` plays sound effects (in `sfx`).
  - `music` is an IIFE with a look-ahead note scheduler that plays an original looping tune. It starts on the first `pointerdown`, because of browser autoplay rules, and `music.duck()` lowers it while `say()` speaks.
  - `say()` uses `speechSynthesis` to read questions aloud.
  - Don't copy the real MRT chimes or jingles, which are copyrighted. Keep the sounds original.
- **Persistence:** the `store` wrapper writes `localStorage` keys `mrtBadges`, `mrtSound` and `mrtMusic`, each in try/catch. The game must still work when storage is unavailable.

## Design constraints for the audience

Keep the kid-friendly rules: big tap targets, exactly 3 answer choices, tappable passengers for counting, questions read aloud, gentle feedback on wrong answers (a hint on the second miss), and no timers or losing. Use generic line colours and station names only. No operator logos or branding.
