# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MRT Math Express is a Singapore MRT-themed math game for kids around age 6. It covers single-digit addition and subtraction, and **every number in a question and its answer is 10 or less** (the user asked for Easy difficulty only). `README.md` has the player-facing description and a list of future game ideas.

The whole game is the single file `index.html`, with its HTML, CSS and JS inline. It has no build step and no dependencies, and it must keep working offline when opened directly from `file://`. `media/` holds the README's gameplay video and screenshot, which the game doesn't use. The Home Screen icon (a train) lives in `icons/`: `icon.svg` is the source drawing, with PNG exports at 180px (`apple-touch-icon`), 192px and 512px, plus a padded `icon-maskable-512.png` for Android. They're linked from `<head>` and `manifest.webmanifest` (short name "MRT Math", `display: browser`, so tapping the icon opens the game in the browser as before). Re-export the PNGs if you change the SVG. The `syntax` check confirms the linked files exist.

## Commands

- **Run:** open `index.html` in a browser.
- **Test everything:** `node tests/play.js`. It plays the game in headless Chromium with Playwright, which is pre-installed in the cloud container. It prints PASS/FAIL lines, exits with code 1 on any failure, and takes about 12 minutes (longer than a 10-minute tool timeout, so run it in the background).
- **Run some checks:** `node tests/play.js ride fit` runs just the named checks:

  | Check | What it covers |
  |---|---|
  | `syntax` | The script compiles. A syntax error blanks the whole page; this takes under a second. |
  | `ride` | The whole North South Line: passenger counts, numbers ≤ 10, the 🏅 badge, above ground/underground per station, time of day moving on |
  | `change` | Start picker (Bishan), changing lines at an interchange (Newton → Downtown Line), returning home |
  | `wrong` | Wrong-answer feedback, no star for a missed question, the in-game map |
  | `storage` | Blocked `localStorage` plus reduced motion |
  | `screens` | Game screen and map on phones and an iPad; the station sign, ⭐ count and 🗺️ button are all visible; the route strip's end names and big dots |
  | `fit` | The start screen fits on one page, upright and sideways |
  | `signal` | Red → amber → green, GO before green, the iPhone silent-mode hint |
  | `lines` | The start train swapping colour, rapid taps |
  | `sound` | Audio starts only after a real tap; after a mid-game pause, sound comes back and the music carries on |
  | `bedtime` | Play-time limit: night sky near the end, "2 more stops", the sleeping train, the lock surviving a reload, the grown-up check and +5 minutes |
  | `cab` | At normal speed: the 3D station, the train driving off, the driver's view showing a picture, then back on the platform (Bishan → Braddell, into the tunnel) |

- **Check station data:** `node tests/check-stations.js` checks that every station has a map position, that none overlap, and that no line has a suspicious jump. It takes under a second.
- Run one Playwright script at a time, because several browsers at once cause false timeouts. Put throwaway scripts and screenshots in a scratch directory, not the repo.
- The time of day starts from the device clock, so screenshots of the scene or cab view change with the hour. To pin it, call `await page.clock.setFixedTime(new Date('2026-11-13T10:00:00'))` before `goto` (it fixes `Date` but keeps timers and animation running).
- The tests' `open()` helper turns the default play-time limit off (`mrtLimit` = 0) unless given `keepLimit: true`.
- When you change gameplay or the DOM, update `tests/play.js` in the same change. Its `play()` helper is the reference loop for driving a ride: it handles interchanges (`#xchg`; each option is a `.psign` platform sign with `data-kind` of stay/change/end, `data-line` and `data-to`), surprises (`.sans`, answered by counting `.sitem`) and questions (`#equation`, where the minus sign is `−`, U+2212).
- Headless Chromium can't play audio, so the `sound` check counts `OscillatorNode.prototype.start` calls and speech requests instead. It also can't produce the iPhone/iPad `interrupted` audio state, so a passing `sound` check doesn't prove sound works on a phone. After any change to audio code, ask the owner to try it on their device.

## Publishing

- `main` is published on GitHub Pages at https://hermannwwr-cmyk.github.io/MRT-GAME/. Every merge to `main` goes live within a minute or two.
- The owner has asked for pull requests to be merged automatically. After a change passes the checks, open a PR into `main`, merge it, and confirm the "pages build and deployment" workflow run succeeds. Then start the next change from the latest `main`.
- `github.io` may be blocked by the container's network. If it is, confirm the deployment through the workflow run.
- When the owner says "Preview", make mock-ups first (Playwright screenshots of the options on an iPhone 13 and the smallest phone, saved in a scratch directory) and build only the option they choose. The owner plays on an iPhone.

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

### Play time (set by a grown-up)
- **Setting:** the limit is **15 minutes a day by default** (the owner's choice). The ⏱️ `#homeClock` chip shows the minutes left today next to the ⚙️ `#parentBtn` (top right of the start screen), which opens `#gate`, a grown-up check (a times-table sum from 6–9 × 6–9, typed on the number keypad), then `#parent`: a daily limit of Off/10/15/20/30 minutes, today's use, "+5 minutes today" and "Start today again".
- **Counting:** `playTime` keeps the limit in `mrtLimit` (minutes, 0 = off) and today's use in `mrtPlay` (`{ day, used` seconds`, extra` minutes`}`). A 1-second interval adds time only while `#game` is active and the page is visible, saves it, and updates the `#clock` chip (⏱️ m:ss, between 🏠 and 🔊 in the game's top bar; the owner chose a digital countdown), so reloading or reopening doesn't reset it; a new `day` starts fresh. With storage blocked it lasts for the visit.
- **Sky clock:** with a limit set, `skyTime()` replaces the device clock: the time of day follows the share of today's time used (morning → afternoon → evening → night).
- **Ending:** `continueTrip()` calls `bedtime()`. When `LAST_CALL` (60 s) or less is left, it sets `S.lastStops = 2`, `#stopsPill` shows "🌙 2 more stops" then "🌙 Last stop!", and `depart()` reads the warning first. It never stops mid-question. Then `finish(true)` shows the "Time for the train to rest! 😴" end screen (no "Ride again"; `#nightBtn` instead) and marks today as used up.
- **Locked:** while `playTime.left() <= 0`, `#sleep` (the sleeping train, above everything except the gate and settings) shows on load and when GO is tapped. Adding time from the settings wakes the train. The end screen's `#endTime` shows "Played today" for grown-ups.

### Ride world: signs, tunnels, sky
- **Station sign:** `setSign(label, name)` sets the game screen's `#stationSign` ("Start", "Now at" or "Next stop") in the same platform-sign style: a badge for every line that stops there (current line first), the station name, and an arrow showing the direction of travel for "Next stop". Always use `setSign()` rather than writing `#signLbl` or `#stationName` directly.
- **Platform signs:** every direction choice (start picker and interchanges) is built by `platformSign()`. It looks like an MRT platform sign: a yellow platform letter, the line badge and "towards <end>", an arrow, and a strip of this station plus the next 3 stops in the line colour. Interchange signs say "Stay on" or "Change to"; at the end of a line there's a 🏁 "End the ride here" sign.
- **Above ground or underground:** `ABOVE` lists the platforms that are above ground (NS Jurong East–Bishan; EW except Lavender–Tiong Bahru); every other platform is underground, and interchanges can differ by line (Bishan NS is outside, Bishan CC is underground). `applyEnv(place)` sets `#scene`'s `data-place` (`ug` shows the `.indoor` platform: ceiling lights, tiles, line-colour band). The ride's cab view (below) is a tunnel all the way underground, open track above ground, and passes a tunnel mouth halfway when going in or coming out.
- **Time of day and weather:** `S.time` starts from the device clock and moves on every `TIME_EVERY` (6) stations: morning → afternoon → evening → night. `S.weather` is re-rolled every `WEATHER_EVERY` (3–5) stations from `WEATHER` (sunny 40%, cloudy 30%, rain 20%, storm 10%). `stepEnv()` runs in `depart()`, and the change appears at mid-ride via `applyEnv()`. `#scene`'s `data-time`/`data-weather` drive the sky colours, sun or moon, stars, clouds, rain and lightning (rain and lightning never show underground). `#envPill` shows 🚇 underground, otherwise the time and weather icons.

### Stations and map
- **Data:** `LINES` holds the 6 lines (`id`, `name`, official line colour) with every open station in route order, 145 stations as of Nov 2026. The Circle Line is stored from Dhoby Ghaut round the loop to Bayfront, so Promenade appears once. The Changi Airport branch isn't included. `STOPS[name]` lists every `{ L, i }` that stops at a station.
- **Map positions:** `POS` gives each station a schematic position (x 0–184 west→east, y 0–100 north→south). It's hand-placed, not exact geography, and interchanges share one position.
- **Adding a station:**
  1. Insert the name in route order in its line's `stations` in `LINES`.
  2. Add a `POS` entry between its neighbours. If it's an interchange, give it the same position on every line.
  3. Run `node tests/check-stations.js`.

  Bedok South (TE), Sungei Bedok (TE and DT) and Xilin (DT) open on 26 Dec 2026 and need adding then.
- **`drawMap(svg, options)`** draws the network from `POS`. It's used by:
  - the start picker `#picker`, opened from the 📍 `#startPick` chip. The map is the only way to pick (there's no list). It's drawn 1300px wide with the line highlighted and every station's name (the `names` option). Names are set at right angles to the line, on alternating sides (flipped back near the map's edges), and are tappable (`.pick-label[data-name]`), and the chosen station is in red. For mid-line stations, the direction choice is two platform signs (A and B).
  - the in-game `#mapView`, opened from 🗺️: the train at `here`, ⭐ on `S.trail`, and labels for line ends and `LANDMARKS`

  The SVG is 960px wide inside a scrolling box, and `centreOn()` scrolls to a station.

### Start screen
- **Layout:** the start screen fits on one page with no scrolling. The 6 lines are a 3 × 2 grid, the 3 modes sit in one row, and the choices are centred above the dock. Smaller sizes apply below 600px tall. On a phone held sideways (landscape, ≤500px tall), the dock moves to the right-hand side. `fitDock()` keeps room for the dock (bottom padding, or right padding sideways) from its real size, and reruns on resize and rotation.
- **Dock:** `.start-dock` is fixed to the bottom. It holds the 📍 start chip, the hint, the start train `#goBtn` and the railway signal `#signal`. On phones (≤520px wide) the train shows one carriage so the signal fits.
- **Start train:** `pullInStartTrain()` replays its pull-in animation (it brakes, overshoots slightly and settles) whenever the home screen shows. It bobs while it has `.waiting`. Picking a different line calls `swapStartTrain()`: the train drives off (`.swapping`), then on `animationend` `--line` is repainted and a train in the new colour pulls in. Quick repeat taps collapse into one swap.
- **Signal:** `setSignal()` shows red while the train moves, amber as it brakes, then green with a glowing `#goSignal` GO lamp (and `sfx.ready()`). `go()` handles taps on GO or on the train. On green it adds `.leaving` (drive-off plus `sfx.toot()`), and `startGame()` runs about 1 s later. Before green it shakes the signal (`.nudge`) and says "Wait for the green light!" While the signal isn't green, the hint says "Wait for green…", except on iPhones and iPads (`IOS`), where it says "🔔 Silent mode off!" ("🔔 Silent off!" at 360px wide or less). iOS mutes `speechSynthesis` in silent mode while the music and sound effects still play, and a page can't detect the switch.
- **Scenery:** an elevated MRT station on a sunny day. Only `body[data-screen="home"]` gets the sky, sun glow and drifting clouds (`body::before`). The dock background draws a viaduct deck (`--deck`, including the safe-area inset) with HDB flats and trees behind the train. `paintStation()` makes the cloud and HDB SVG tiles (`--clouds`, `--hdb`). The game and end screens keep the plain background.

### Game screen visuals
- **Train look:** a generic Singapore-style MRT car with no operator branding: white/silver body, a band of blue-tinted window glass with reflections, two stripes in the line colour, full-height double doors, and a sloped front with a windscreen. The game train's paint is the `--livery` custom property on `.train`, which `.train::before` reuses to draw the next carriage past a gangway gap. `.st-car` (start train) and `.mini-train` (end screen) use the same scheme.
- **Route strip:** the line's first and last station names sit at the strip's two ends. Between them, `renderRoute()` draws a close-up window of big dots for the stations around the train, chosen by `routeWindow()`: 1 behind and the rest ahead in the direction of travel, 4–8 stations depending on the strip's width, and clamped at the ends of the line. "⋯" shows the line carries on. `S.routeWin` holds the window, and `placeRoute(pos)` moves the 🚆 and the travelled shading (from `S.from`) during rides. It's re-rendered on arrival, line change and resize, and only after `show("game")`, because it measures its width.
- **3D station:** at each station the scene is seen in 3D from along the platform. `.scene` sets the `perspective`; `#stage` (`preserve-3d`, turned with `rotateY`) holds `#carbox` (the flat side-view `#train` and `#wheels`, plus a `.roof` plane), the `.floor`, `.edge` and `.trackbed` planes, and `#platform`, an upright strip of waiting passengers at the yellow line (`translateZ`). `#layerFar`, `#layerNear` and `.indoor` are the flat backdrop. Passengers stay tappable through the 3D transforms. Walkers (below) are flat overlays in the scene, positioned from `getBoundingClientRect()`, so `rel()` scales their font to how big the passenger appears.
- **Ride animation (driver's view):** `ride()` runs one `requestAnimationFrame` loop for `T` (4.4 s; 0.9 s with reduced motion). In the first 17%, `#carbox` accelerates out to the right; then `#cab`, a canvas over the scene, fades in with the driver's view drawn by `cabView()`; in the last 17%, it fades out and `#carbox` slides in from the left and brakes. `cabView(canvas, fromUG, toUG, next)` draws a simple perspective world (`P(X, Y, z)`): track and sleepers, tunnel rings and lights underground, or, outside, an elevated viaduct like the real MRT: the camera rides `ELEV` above the ground on a concrete deck with low side walls and posts, looking down on roads, trees and the feet of HDB flats, under the sky (from the scene's `--sky1`/`--sky2`, time and weather); a tunnel mouth in a grassy bank at the midpoint when `fromUG !== toUG`; the next station's platform near the end; rain on the windscreen; and the cab frame and dashboard with "Next stop". At the midpoint, hidden behind the cab view, `onMid` runs `fillScene()` and `applyEnv()`. The same loop drives wheel rotation, the bob, the route marker and the rumble sound.
- **Passengers walking:** `movePassengers()` moves one passenger at a time, overlapping slightly. `boardOne()` walks someone to the nearest door and pops them into `#carriage`. `alightOne()` walks a `.leaving` passenger out and off-screen. A `.walker` copy, animated with the Web Animations API between points from `rel()`, does the moving, and `leaveGap()` keeps the others in their seats. Passengers move before the question, so the train then holds exactly the answer. `#tally` counts only how many get on or off (➕ 1, 2, 3), and shows the total in green after a right answer.

### Audio and storage
- **Audio:** everything is made with the Web Audio API; there are no audio files. Don't copy the real MRT chimes or jingles, which are copyrighted. Keep the sounds original.
  - `tone()` plays the `sfx` sound effects.
  - `music` schedules an original looping tune, and `music.duck()` lowers it while `say()` speaks. Keep notes above about 130 Hz so phone speakers can play them.
  - `say()` uses `speechSynthesis` and returns a promise that resolves when speaking ends.
  - `unlockAudio()` runs on real taps (`pointerup`, `touchend`, `click`, `keydown`; not `pointerdown`, which doesn't count as a tap on touch screens). It resumes the AudioContext, plays a silent `<audio>` loop and sets `navigator.audioSession.type = "playback"` (so the iPhone silent switch doesn't mute the music and sound effects; it still mutes `speechSynthesis`, which no page can prevent, hence the start-screen hint), speaks a silent utterance (iOS needs one during a tap), and starts the music. Its listeners stay on for the whole session, because iPhones and iPads pause sound (AudioContext state `interrupted`) after the screen locks, a call or an app switch. `audio()` resumes from any non-`running` state, a `visibilitychange` handler wakes sound and speech when the page is shown again, and the music scheduler skips notes it missed while paused.
- **Persistence:** `store` wraps `localStorage` keys `mrtBadges`, `mrtSound` (the one 🔊/🔇 switch for music, voice and sound effects), `mrtLimit` and `mrtPlay`, each in try/catch. The game must still work when storage is unavailable.

## Design constraints for the audience

Keep the kid-friendly rules: big tap targets, exactly 3 answer choices, tappable passengers for counting, questions read aloud, gentle feedback on wrong answers (a hint on the second miss), and no timers or losing. Use generic line colours and station names only. No operator logos or branding.
