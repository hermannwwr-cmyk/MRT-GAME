# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MRT Math Express is a Singapore MRT-themed math game for kids around age 6. It covers single-digit addition and subtraction, and **every number in a question and its answer is 10 or less** (the user asked for Easy difficulty only). `README.md` has the player-facing description and a list of future game ideas.

The whole game is the single file `index.html`, with its HTML, CSS and JS inline. It has no build step and no dependencies, and it must keep working offline when opened directly from `file://`. `media/` holds the README's gameplay video and screenshot, which the game doesn't use.

## Commands

- **Run:** open `index.html` in a browser.
- **Test everything:** `node tests/play.js`. It plays the game in headless Chromium with Playwright, which is pre-installed in the cloud container. It prints PASS/FAIL lines, exits with code 1 on any failure, and takes about 10 minutes.
- **Run some checks:** `node tests/play.js ride fit` runs just the named checks:

  | Check | What it covers |
  |---|---|
  | `syntax` | The script compiles. A syntax error blanks the whole page; this takes under a second. |
  | `ride` | The whole North South Line: passenger counts, numbers ≤ 10, the 🏅 badge |
  | `change` | Start picker (Bishan), changing lines at an interchange (Newton → Downtown Line), returning home |
  | `wrong` | Wrong-answer feedback, no star for a missed question, the in-game map |
  | `storage` | Blocked `localStorage` plus reduced motion |
  | `screens` | Game screen and map on phones and an iPad |
  | `fit` | The start screen fits on one page, upright and sideways |
  | `signal` | Red → amber → green, GO before green |
  | `lines` | The start train swapping colour, rapid taps |
  | `sound` | Audio starts only after a real tap |

- **Check station data:** `node tests/check-stations.js` checks that every station has a map position, that none overlap, and that no line has a suspicious jump. It takes under a second.
- Run one Playwright script at a time, because several browsers at once cause false timeouts. Put throwaway scripts and screenshots in a scratch directory, not the repo.
- When you change gameplay or the DOM, update `tests/play.js` in the same change. Its `play()` helper is the reference loop for driving a ride: it handles interchanges (`#xchg`), surprises (`.sans`, answered by counting `.sitem`) and questions (`#equation`, where the minus sign is `−`, U+2212).
- Headless Chromium can't play audio, so the `sound` check counts `OscillatorNode.prototype.start` calls and speech requests instead.

## Publishing

- `main` is published on GitHub Pages at https://hermannwwr-cmyk.github.io/MRT-GAME/. Every merge to `main` goes live within a minute or two.
- The owner has asked for pull requests to be merged automatically. After a change passes the checks, open a PR into `main`, merge it, and confirm the "pages build and deployment" workflow run succeeds. Then start the next change from the latest `main`.
- `github.io` may be blocked by the container's network. If it is, confirm the deployment through the workflow run.

## Architecture (inside `index.html`)

### Screens and flow
- **Three screens:** `<section class="screen">` elements with the ids `home`, `game` and `end`. `show(id)` switches between them and sets `body[data-screen]`.
- **Game loop:** `startGame()` (the train at the start station) → `depart()` (makes the next question, closes the doors) → `ride()` → `arrive()` (`S.at += S.dir`, opens the doors, maybe a surprise, reads the story, runs `movePassengers()`, then shows the answer buttons and asks) → `answer()` → `continueTrip()`.
- **State:** a single object `S`.
  - Home choices: `line`, `mode` (`add`, `sub` or `mix`), `startIdx` and `startDir`.
  - The ride: `at`, `dir` (±1), `from` (where the train boarded the current line), `trail` (stations visited), `asked`, `stars` and `surprises`.
  - Bookkeeping: `home` (the home choices saved at start), `gen` and the current question `q`.
- **Rides:** every ride goes to the end of the line (`S.left` is `Infinity`); the owner chose this over a trip-length setting. Because a ride can change lines, `startGame()` saves the home choices in `S.home`, and `restoreHome()` puts them back for "Ride again", "Choose another line" and 🏠. Reaching the end of a line earns its 🏅 (`mrtBadges`).
- **Interchanges:** after each answer, `continueTrip()` finishes the ride, departs, or calls `showInterchange()`. That offers "Stay" plus each other line in each direction ("towards <end>"), or "End the ride here" at the end of a line. Changing sets the new `S.line`, `S.at`, `S.dir` and `S.from`, and repaints `--line`.
- **Questions:** `makeQuestion()` sets the number ranges (the 10-or-less limit lives here) and makes 3 answer choices, adding distractors near the answer and within 0–10.
- **Surprises:** `depart()` sets `S.surpriseNow` on about 30% of rides after the first. `arrive()` then runs `surpriseRound()` before the station story: 1–5 birds, balloons, butterflies or cats (`.sitem`) to count with `.sans` buttons, with no timer.
- **Cancelling:** `S.gen` is a game counter. Timers and rides check it and stop if it has changed, so 🏠 or a restart cancels anything still running. Honour `prefers-reduced-motion` through `reduceMotion`, which shortens the ride and walks and removes the bob.

### Stations and map
- **Data:** `LINES` holds the 6 lines (`id`, `name`, official line colour) with every open station in route order, 145 stations as of Nov 2026. The Circle Line is stored from Dhoby Ghaut round the loop to Bayfront, so Promenade appears once. The Changi Airport branch isn't included. `STOPS[name]` lists every `{ L, i }` that stops at a station.
- **Map positions:** `POS` gives each station a schematic position (x 0–184 west→east, y 0–100 north→south). It's hand-placed, not exact geography, and interchanges share one position.
- **Adding a station:**
  1. Insert the name in route order in its line's `stations` in `LINES`.
  2. Add a `POS` entry between its neighbours. If it's an interchange, give it the same position on every line.
  3. Run `node tests/check-stations.js`.

  Bedok South (TE), Sungei Bedok (TE and DT) and Xilin (DT) open on 26 Dec 2026 and need adding then.
- **`drawMap(svg, options)`** draws the network from `POS`. It's used by:
  - the start picker `#picker`, opened from the 📍 `#startPick` chip. The map is the only way to pick (there's no list). It's drawn 1300px wide with the line highlighted and every station's name (the `names` option). Names are set at right angles to the line and are tappable (`.pick-label[data-name]`), and the chosen station is in red. There's a direction choice for mid-line stations.
  - the in-game `#mapView`, opened from 🗺️: the train at `here`, ⭐ on `S.trail`, and labels for line ends and `LANDMARKS`

  The SVG is 960px wide inside a scrolling box, and `centreOn()` scrolls to a station.

### Start screen
- **Layout:** the start screen fits on one page with no scrolling. The 6 lines are a 3 × 2 grid, the 3 modes sit in one row, and the choices are centred above the dock. Smaller sizes apply below 600px tall. On a phone held sideways (landscape, ≤500px tall), the dock moves to the right-hand side. `fitDock()` keeps room for the dock (bottom padding, or right padding sideways) from its real size, and reruns on resize and rotation.
- **Dock:** `.start-dock` is fixed to the bottom. It holds the 📍 start chip, the hint, the start train `#goBtn` and the railway signal `#signal`. On phones (≤520px wide) the train shows one carriage so the signal fits.
- **Start train:** `pullInStartTrain()` replays its pull-in animation (it brakes, overshoots slightly and settles) whenever the home screen shows. It bobs while it has `.waiting`. Picking a different line calls `swapStartTrain()`: the train drives off (`.swapping`), then on `animationend` `--line` is repainted and a train in the new colour pulls in. Quick repeat taps collapse into one swap.
- **Signal:** `setSignal()` shows red while the train moves, amber as it brakes, then green with a glowing `#goSignal` GO lamp (and `sfx.ready()`). `go()` handles taps on GO or on the train. On green it adds `.leaving` (drive-off plus `sfx.toot()`), and `startGame()` runs about 1 s later. Before green it shakes the signal (`.nudge`) and says "Wait for the green light!"
- **Scenery:** an elevated MRT station on a sunny day. Only `body[data-screen="home"]` gets the sky, sun glow and drifting clouds (`body::before`). The dock background draws a viaduct deck (`--deck`, including the safe-area inset) with HDB flats and trees behind the train. `paintStation()` makes the cloud and HDB SVG tiles (`--clouds`, `--hdb`). The game and end screens keep the plain background.

### Game screen visuals
- **Train look:** a generic Singapore-style MRT car with no operator branding: white/silver body, a band of blue-tinted window glass with reflections, two stripes in the line colour, full-height double doors, and a sloped front with a windscreen. The game train's paint is the `--livery` custom property on `.train`, which `.train::before` reuses to draw the next carriage past a gangway gap. `.st-car` (start train) and `.mini-train` (end screen) use the same scheme.
- **Route strip:** `renderRoute()` shows the whole current line, with small dots on long lines and shading between `S.from` and the train.
- **Ride animation:** in `ride()`, the camera follows the train, so the train stays put and a `requestAnimationFrame` loop moves everything else. An ease-in-out curve drives the scenery layers (`#layerFar`, `#layerNear`, SVG tiles from `paintScenery()`), `#rail`, `#platform`, wheel rotation, the bob, the tunnel overlay, the route marker and the rumble sound. `fillScene()` swaps in the next passengers at the midpoint, while the tunnel is darkest.
- **Passengers walking:** `movePassengers()` moves one passenger at a time, overlapping slightly. `boardOne()` walks someone to the nearest door and pops them into `#carriage`. `alightOne()` walks a `.leaving` passenger out and off-screen. A `.walker` copy, animated with the Web Animations API between points from `rel()`, does the moving, and `leaveGap()` keeps the others in their seats. Passengers move before the question, so the train then holds exactly the answer. `#tally` counts only how many get on or off (➕ 1, 2, 3), and shows the total in green after a right answer.

### Audio and storage
- **Audio:** everything is made with the Web Audio API; there are no audio files. Don't copy the real MRT chimes or jingles, which are copyrighted. Keep the sounds original.
  - `tone()` plays the `sfx` sound effects.
  - `music` schedules an original looping tune, and `music.duck()` lowers it while `say()` speaks. Keep notes above about 130 Hz so phone speakers can play them.
  - `say()` uses `speechSynthesis` and returns a promise that resolves when speaking ends.
  - `unlockAudio()` runs on real taps (`pointerup`, `touchend`, `click`, `keydown`; not `pointerdown`, which doesn't count as a tap on touch screens). It resumes the AudioContext, plays a silent `<audio>` loop and sets `navigator.audioSession.type = "playback"` (so the iPhone silent switch doesn't mute the game), speaks a silent utterance (iOS needs one during a tap), and starts the music.
- **Persistence:** `store` wraps `localStorage` keys `mrtBadges`, `mrtSound` and `mrtMusic`, each in try/catch. The game must still work when storage is unavailable.

## Design constraints for the audience

Keep the kid-friendly rules: big tap targets, exactly 3 answer choices, tappable passengers for counting, questions read aloud, gentle feedback on wrong answers (a hint on the second miss), and no timers or losing. Use generic line colours and station names only. No operator logos or branding.
