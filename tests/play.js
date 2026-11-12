#!/usr/bin/env node
// Plays MRT Math Express in headless Chromium (Playwright) and checks it.
//
//   node tests/play.js            run every check (a few minutes)
//   node tests/play.js ride fit   run only the named checks
//
// Checks: syntax, ride, change, wrong, storage, screens, fit, signal, lines, sound.
// Prints PASS/FAIL lines and exits with code 1 if anything fails.
// Run one copy at a time: several browsers at once can cause false timeouts.
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { chromium, devices } = require('playwright');

const FILE = path.resolve(__dirname, '..', 'index.html');
const URL = 'file://' + FILE;
let failed = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};
const PHONE = devices['Pixel 7'];
const SIZES = {
  'Pixel 7': devices['Pixel 7'],
  'iPhone 13': devices['iPhone 13'],
  'iPhone SE (375x667)': { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iPhone SE (320x568)': devices['iPhone SE'],
  'iPad Mini': devices['iPad Mini'],
  'iPhone 13 sideways': devices['iPhone 13 landscape'],
  'iPad sideways': devices['iPad (gen 7) landscape'],
};

// ---------- helpers ----------
async function open(browser, options = {}) {
  const ctx = await browser.newContext({ ...PHONE, ...options });
  if (options.init) await ctx.addInitScript(options.init);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(URL);
  return p;
}
async function go(p) {
  await p.waitForSelector('#signal.green', { timeout: 15000 });
  await p.tap('#goSignal', { force: true }); // the GO lamp pulses, so it's never "stable"
  await p.waitForSelector('#game.active');
}
const noSideScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// Plays until the end screen. choose(labels) returns which interchange button to press.
async function play(p, choose = () => 0) {
  const r = { questions: 0, surprises: 0, changes: 0, maxNum: 0, bad: '', places: [], envs: new Set() };
  for (let guard = 0; guard < 120; guard++) {
    const what = await p.waitForFunction(() => {
      if (document.querySelector('#end.active')) return 'end';
      if (!document.getElementById('xchg').hidden) return 'xchg';
      if (document.querySelector('#answers .sans:not([disabled])')) return 'surprise';
      if (document.querySelector('#answers .ans:not(.sans)')) return 'question';
      return false;
    }, null, { timeout: 40000, polling: 200 }).then(h => h.jsonValue());
    if (what === 'end') break;
    if (what === 'xchg') {
      // each platform sign reads "kind:line:towards", e.g. "stay:NS:Marina South Pier" or "change:DT:Expo"
      const labels = await p.$$eval('#xOpts .psign', bs => bs.map(b => `${b.dataset.kind}:${b.dataset.line || ''}:${b.dataset.to || ''}`));
      const i = choose(labels);
      if (!labels[i].startsWith('stay')) r.changes++;
      await p.click(`#xOpts .psign >> nth=${i}`);
      await p.waitForFunction(() => document.getElementById('xchg').hidden);
    } else if (what === 'surprise') {
      const n = await p.$$eval('.sitem', x => x.length);
      await p.click(`#answers .sans >> text="${n}"`);
      r.surprises++;
      await p.waitForFunction(() => !document.querySelector('#answers .sans'), null, { timeout: 15000 });
    } else {
      const eq = await p.textContent('#equation');
      const [a, op, b] = eq.replace('−', '-').split(' ');
      const ans = op === '+' ? +a + +b : a - b;
      const env = await p.$eval('#scene', e => ({ ...e.dataset }));
      r.places.push([await p.textContent('#stationName'), env.place]);
      r.envs.add(`${env.time}/${env.weather}`);
      r.maxNum = Math.max(r.maxNum, +a, +b, ans);
      const seated = await p.$$eval('#carriage .pax', x => x.filter(e => e.style.visibility !== 'hidden').length);
      if (seated !== ans) r.bad += ` ${eq} but ${seated} in the train;`;
      await p.click(`#answers .ans >> text="${ans}"`);
      r.questions++;
      await p.waitForFunction(() => !document.querySelector('#answers .ans') || document.querySelector('#end.active')
        || !document.getElementById('xchg').hidden, null, { timeout: 15000 });
    }
  }
  return r;
}
const stay = labels => Math.max(0, labels.findIndex(l => l.startsWith('stay')));

// ---------- checks ----------
const CHECKS = {
  // The inline script compiles (a syntax error blanks the whole page).
  async syntax() {
    const html = fs.readFileSync(FILE, 'utf8');
    const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
    try { new vm.Script(js); ok('syntax: the game script compiles', true); }
    catch (e) { ok('syntax: the game script compiles', false, e.message); }
    // Home Screen icon files linked from the page must exist
    const linked = [...html.matchAll(/<link rel="(?:apple-touch-icon|icon|manifest)"[^>]*href="([^"]+)"/g)].map(m => m[1]);
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
    const files = [...linked, ...manifest.icons.map(i => i.src)];
    const missing = files.filter(f => !fs.existsSync(path.resolve(__dirname, '..', f)));
    ok('syntax: Home Screen icons and manifest exist', linked.length >= 3 && !missing.length, missing.join(', '));
  },

  // Whole North South Line from the first station, mixed sums, staying at every interchange.
  async ride(b) {
    const p = await open(b, { reducedMotion: 'reduce' });
    ok('ride: start chip shows the first station', (await p.textContent('#startPick')).includes('Jurong East'));
    await p.tap('[data-mode=mix]');
    await go(p);
    const r = await play(p, stay);
    ok('ride: whole NS line, 26 stops', r.questions === 26, JSON.stringify(r));
    ok('ride: passenger count always matches, numbers ≤ 10', !r.bad && r.maxNum <= 10, r.bad);
    ok('ride: ends at Marina South Pier', /Marina South Pier/.test(await p.textContent('#endTitle')));
    // NS is above ground from Jurong East to Bishan, underground from Braddell on
    const above = new Set(['Bukit Batok', 'Bukit Gombak', 'Choa Chu Kang', 'Yew Tee', 'Kranji', 'Marsiling', 'Woodlands', 'Admiralty', 'Sembawang', 'Canberra', 'Yishun', 'Khatib', 'Yio Chu Kang', 'Ang Mo Kio', 'Bishan']);
    const wrongPlace = r.places.filter(([n, pl]) => pl !== (above.has(n) ? 'open' : 'ug'));
    ok('ride: each station shown above ground or underground correctly', r.places.length === 26 && !wrongPlace.length, JSON.stringify(wrongPlace));
    const times = new Set([...r.envs].map(e => e.split('/')[0]));
    ok('ride: time of day moves on during a long ride (every 6 stations)', times.size >= 3, [...r.envs].join(' '));
    await p.tap('#otherBtn'); await p.waitForTimeout(300);
    ok('ride: NS badge earned', (await p.$$eval('.line-btn', bs => bs[0].textContent)).includes('🏅'));
    ok('ride: no script errors', !p.errs.length, p.errs.join('; '));
  },

  // Pick Bishan towards Marina South Pier, change to the Downtown Line at Newton, ride to Expo.
  async change(b) {
    const p = await open(b, { reducedMotion: 'reduce' });
    await p.waitForSelector('#signal.green', { timeout: 15000 });
    await p.tap('#startPick'); await p.waitForSelector('#picker:not([hidden])');
    await p.click('#pickMap .pick-label[data-name="Bishan"]');
    await p.waitForSelector('#dirRow:not([hidden])');
    const signs = await p.$$eval('#dirRow .psign', bs => bs.map(b => b.dataset.to));
    ok('change: platform signs A/B show both directions', signs.join('|') === 'Marina South Pier|Jurong East', signs.join('|'));
    await p.click('#dirRow .psign >> nth=0'); // Platform A, towards Marina South Pier
    await p.waitForSelector('#picker', { state: 'hidden' });
    ok('change: start chip says Bishan', (await p.textContent('#startPick')).includes('Bishan'));
    await go(p);
    ok('change: ride starts at Bishan', (await p.textContent('#stationName')) === 'Bishan');
    let first = true;
    const r = await play(p, labels => {
      const i = labels.indexOf('change:DT:Expo');
      if (first && i >= 0) { first = false; return i; }
      return stay(labels);
    });
    ok('change: 4 stops to Newton + 24 on the Downtown Line', r.questions === 28 && r.changes === 1, JSON.stringify(r));
    ok('change: ends at Expo', /Expo/.test(await p.textContent('#endTitle')));
    await p.tap('#otherBtn'); await p.waitForTimeout(300);
    ok('change: home screen is back on the NS line and Bishan', (await p.textContent('#startPick')).includes('Bishan')
      && (await p.$eval('.line-btn.sel', e => e.textContent)).startsWith('NS'));
    ok('change: no script errors', !p.errs.length, p.errs.join('; '));
  },

  // Wrong answers: "try again", then a hint, and no star for that question. Also opens the map.
  async wrong(b) {
    const p = await open(b, { reducedMotion: 'reduce' });
    await p.tap('.line-btn >> nth=2'); // North East Line
    await go(p);
    await p.waitForSelector('#answers .ans:not(.sans)', { timeout: 40000 });
    await p.tap('#mapBtn'); await p.waitForSelector('#mapView:not([hidden])');
    ok('wrong: map shows where the train is', /Outram Park/.test(await p.textContent('#mapTitle')), await p.textContent('#mapTitle'));
    await p.tap('#mapClose');
    const eq = await p.textContent('#equation');
    const [a, op, bb] = eq.replace('−', '-').split(' ');
    const ans = op === '+' ? +a + +bb : a - bb;
    const wrongs = await p.$$eval('#answers .ans', (els, ans) => els.map(e => +e.textContent).filter(v => v !== ans), ans);
    await p.click(`#answers .ans >> text="${wrongs[0]}"`); const f1 = await p.textContent('#feedback');
    await p.click(`#answers .ans >> text="${wrongs[1]}"`); const f2 = await p.textContent('#feedback');
    ok('wrong: "try again", then a count-on/back hint', /Try again/.test(f1) && /Hint: start at/.test(f2), `${f1} / ${f2}`);
    await p.click(`#answers .ans >> text="${ans}"`);
    await p.waitForFunction(() => !document.querySelector('#answers .ans') || !document.getElementById('xchg').hidden, null, { timeout: 15000 });
    const r = await play(p, stay);
    const stars = (await p.textContent('#endStars')).match(/⭐/g)?.length || 0;
    ok('wrong: the missed question gets no star (15 of 16)', stars === 15 && r.questions === 15, `stars ${stars}`);
    ok('wrong: no script errors', !p.errs.length, p.errs.join('; '));
  },

  // No localStorage (private browsing) + reduced motion: a whole line still plays.
  async storage(b) {
    const p = await open(b, { reducedMotion: 'reduce', init: () => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }) });
    await p.tap('.line-btn >> nth=2'); await p.tap('[data-mode=sub]');
    await go(p);
    const r = await play(p, stay);
    ok('storage: blocked storage + reduced motion plays the whole NE line', r.questions === 16 && !r.bad && r.maxNum <= 10, JSON.stringify(r));
    ok('storage: no script errors', !p.errs.length, p.errs.join('; '));
  },

  // Game screen and map: no sideways scrolling, answers on screen.
  async screens(b) {
    for (const [name, dev] of Object.entries(SIZES)) {
      if (/sideways/.test(name)) continue;
      const p = await open(b, dev);
      await go(p);
      await p.waitForSelector('#answers .ans', { timeout: 40000 }); await p.waitForTimeout(600);
      const visible = await p.$eval('#answers', el => el.getBoundingClientRect().bottom <= innerHeight + 2);
      ok(`screens: ${name}: game fits sideways, answers visible`, (await noSideScroll(p)) && visible);
      const chips = await p.evaluate(() => ['#stationSign', '#starCount', '#mapBtn'].map(q => {
        const e = document.querySelector(q), r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return r.width > 20 && r.height > 20 && cs.opacity !== '0' && cs.visibility !== 'hidden' && r.right <= innerWidth + 1;
      }));
      ok(`screens: ${name}: station sign, ⭐ count and 🗺️ button all visible`, chips.every(Boolean), JSON.stringify(chips));
      await p.tap('#mapBtn'); await p.waitForTimeout(300);
      ok(`screens: ${name}: map opens, no sideways page scroll`, (await p.isVisible('#mapView')) && (await noSideScroll(p)));
      ok(`screens: ${name}: no script errors`, !p.errs.length, p.errs.join('; '));
      await p.context().close();
    }
  },

  // Start screen fits on one page (no scrolling) and the dock never covers the choices.
  async fit(b) {
    for (const [name, dev] of Object.entries(SIZES)) {
      const p = await open(b, dev);
      await p.waitForTimeout(2400);
      const m = await p.evaluate(() => {
        const dock = document.querySelector('.start-dock').getBoundingClientRect();
        const last = document.querySelector('[data-mode=mix]').getBoundingClientRect();
        const side = dock.top < 5; // phone held sideways: dock on the right
        return { scroll: document.documentElement.scrollHeight - innerHeight, gap: Math.round(side ? dock.left - last.right : dock.top - last.bottom), wide: document.documentElement.scrollWidth - innerWidth };
      });
      ok(`fit: ${name}: one page, choices clear of the dock`, m.scroll <= 0 && m.gap >= 0 && m.wide <= 0, JSON.stringify(m));
      await p.context().close();
    }
  },

  // Signal: red → amber → green; GO before green only nudges; GO on green starts.
  async signal(b) {
    const p = await open(b);
    const sig = () => p.$eval('#signal', e => ['red', 'amber', 'green'].find(c => e.classList.contains(c)));
    await p.waitForTimeout(300);
    ok('signal: red while the train pulls in', (await sig()) === 'red');
    await p.tap('#goSignal', { force: true }); await p.waitForTimeout(200);
    ok('signal: GO on red does not start', !(await p.isVisible('#game')) && /Wait for the green light/.test(await p.textContent('#startHint')));
    await p.waitForTimeout(700);
    ok('signal: amber while braking', (await sig()) === 'amber');
    await p.waitForTimeout(1000);
    ok('signal: green when stopped', (await sig()) === 'green' && /GO/.test(await p.textContent('#startHint')));
    await p.tap('#goSignal', { force: true });
    await p.waitForSelector('#game.active', { timeout: 3000 });
    ok('signal: GO on green starts the game', true);
    await p.tap('#homeBtn'); await p.waitForTimeout(2300);
    ok('signal: back home, green again', (await sig()) === 'green');
    await p.tap('#goBtn'); await p.waitForSelector('#game.active', { timeout: 3000 });
    ok('signal: tapping the train on green also starts', true);
    ok('signal: no script errors', !p.errs.length, p.errs.join('; '));
  },

  // Picking another line: the train swaps colour; quick taps settle on the last pick.
  async lines(b) {
    const p = await open(b);
    const colour = () => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--line').trim().toLowerCase());
    await p.waitForSelector('#signal.green', { timeout: 15000 });
    await p.tap('.line-btn >> nth=1'); await p.waitForTimeout(250);
    ok('lines: old train drives off in the old colour', (await p.getAttribute('#goBtn', 'class')).includes('swapping') && (await colour()) === '#d42e12');
    await p.waitForTimeout(800);
    ok('lines: new train arrives green (East West)', (await colour()) === '#009645');
    await p.waitForTimeout(1500);
    for (const n of [2, 3, 4]) { await p.tap(`.line-btn >> nth=${n}`); await p.waitForTimeout(120); }
    await p.waitForSelector('#signal.green', { timeout: 15000 });
    ok('lines: quick taps settle on Downtown (blue)', (await colour()) === '#005ec4');
    ok('lines: start chip resets to the new line\'s first station', (await p.textContent('#startPick')).includes('Bukit Panjang'));
    await p.tap('#goSignal', { force: true }); await p.waitForSelector('#game.active');
    ok('lines: game starts on the Downtown Line', (await p.textContent('#lineTitle')) === 'Downtown Line');
    ok('lines: no script errors', !p.errs.length, p.errs.join('; '));
  },

  // Sound starts only after a real tap (as on phones). Headless Chromium can't play audio,
  // so this counts oscillators and speech requests instead.
  async sound() {
    const b = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
    const p = await open(b, {
      init: () => {
        window.__osc = 0; window.__spoken = [];
        const start = OscillatorNode.prototype.start;
        OscillatorNode.prototype.start = function (...a) { window.__osc++; return start.apply(this, a); };
        const AC = window.AudioContext;
        window.AudioContext = function (...a) { const c = new AC(...a); window.__ac = c; return c; };
        const speak = speechSynthesis.speak.bind(speechSynthesis);
        speechSynthesis.speak = u => { window.__spoken.push(u.text); return speak(u); };
      },
    });
    const state = () => p.evaluate(() => ({ ac: window.__ac ? window.__ac.state : 'none', osc: window.__osc, spoken: window.__spoken.length }));
    await p.waitForTimeout(500);
    ok('sound: silent before any tap', (await state()).osc === 0);
    await p.tap('[data-mode=add]'); await p.waitForTimeout(1500);
    const s = await state();
    ok('sound: audio running and music playing after the first tap', s.ac === 'running' && s.osc > 0, JSON.stringify(s));
    await go(p); await p.waitForTimeout(8000);
    ok('sound: the voice reads during the game', (await state()).spoken > 1);
    // Phones pause sound when the screen locks or another app plays; the next tap must bring it back.
    await p.evaluate(() => window.__ac.suspend());
    await p.tap('#sayBtn'); await p.waitForTimeout(800);
    const back = await state();
    ok('sound: after a pause, sound comes back (on its own or with the next tap)', back.ac === 'running', JSON.stringify(back));
    const before = (await state()).osc; await p.waitForTimeout(2500);
    ok('sound: music carries on after the pause', (await state()).osc > before);
    ok('sound: no script errors', !p.errs.length, p.errs.join('; '));
    await b.close();
  },
};

(async () => {
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter(n => !CHECKS[n]);
  if (unknown.length) { console.error(`Unknown check: ${unknown.join(', ')}. Choose from: ${Object.keys(CHECKS).join(', ')}`); process.exit(2); }
  const names = wanted.length ? wanted : Object.keys(CHECKS);
  const browser = await chromium.launch();
  for (const name of names) {
    try { await CHECKS[name](browser); }
    catch (e) { ok(`${name}: finished without crashing`, false, e.message.split('\n')[0]); }
  }
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
})();
