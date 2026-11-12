#!/usr/bin/env node
// Checks the station data in index.html: every station has a map position, no two stations sit
// on top of each other, and no line has a suspiciously long jump (a sign of a misplaced station).
//
//   node tests/check-stations.js
//
// Run it after adding or moving stations. Exits with code 1 if something needs fixing.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const grab = (start, end) => {
  const i = html.indexOf(start);
  if (i < 0) throw new Error(`Couldn't find "${start}" in index.html`);
  return html.slice(i, html.indexOf(end, i) + end.length);
};
const ctx = {};
vm.runInNewContext(grab('const LINES = [', '\n  ];').replace('const LINES', 'this.LINES') + '\n' + grab('const POS = {', '};').replace('const POS', 'this.POS'), ctx);
const { LINES, POS } = ctx;

const MIN_GAP = 3;   // map units between any two stations
const MAX_HOP = 17;  // map units between neighbouring stations on a line
let problems = 0;
const problem = msg => { problems++; console.log('FIX   ' + msg); };

const names = new Set(LINES.flatMap(L => L.stations));
console.log(`Lines: ${LINES.map(L => `${L.id} ${L.stations.length}`).join(', ')}. Stations: ${names.size}.`);
for (const n of names) if (!POS[n]) problem(`"${n}" has no map position in POS`);
for (const n of Object.keys(POS)) if (!names.has(n)) problem(`POS has "${n}", but no line stops there`);
for (const L of LINES) {
  const seen = new Set();
  for (const s of L.stations) { if (seen.has(s)) problem(`${L.id} lists "${s}" twice`); seen.add(s); }
  for (let i = 1; i < L.stations.length; i++) {
    const a = POS[L.stations[i - 1]], b = POS[L.stations[i]];
    if (!a || !b) continue;
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d > MAX_HOP) problem(`${L.id}: long jump ${L.stations[i - 1]} → ${L.stations[i]} (${d.toFixed(1)})`);
  }
}
const placed = [...names].filter(n => POS[n]);
for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
  const [a, b] = [POS[placed[i]], POS[placed[j]]];
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (d < MIN_GAP) problem(`${placed[i]} and ${placed[j]} overlap on the map (${d.toFixed(1)} apart)`);
}
const inter = [...names].filter(n => LINES.filter(L => L.stations.includes(n)).length > 1);
console.log(`Interchanges: ${inter.length}.`);
console.log(problems ? `\n${problems} problem(s) to fix.` : 'All station data looks good.');
process.exit(problems ? 1 : 0);
