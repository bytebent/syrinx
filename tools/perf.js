// Performance benchmark for the reference engine. Run: node tools/perf.js [seconds]
// Prints how much of one CPU core each scenario needs to run in real time at 48 kHz, and the
// RK4 sub-steps per oversampled sample of the newest voice.
// This is the JS reference; the C++ port will be faster, but the ratios between scenarios carry over.
'use strict';
const path = require('path');
const { SyrinxEngine } = require(path.join(__dirname, '..', 'reference', 'syrinx-engine.js'));

const SR = 48000, SECS = +process.argv[2] || 3, BL = 128;
const chord = [48, 55, 60, 64];
const SCENARIOS = [
  ['Silent (no notes)', {}, []],
  ['1 voice, tonal (Regime 0)', { regime: 0, link: 0 }, [60]],
  ['1 voice, defaults (Link on)', {}, [60]],
  ['1 voice, rich low (Regime 1, 523 Hz)', { regime: 1, link: 0, transpose: 12 }, [60]],
  ['1 voice, worst case (2.5 kHz, Regime 0.4, Pressure 0)', { regime: 0.4, link: 0, pressure: 0, detune: 30 }, [63]],
  ['1 voice, worst case + Grain 1', { regime: 0.4, link: 0, pressure: 0, detune: 30, grain: 1 }, [63]],
  ['4 voices, defaults', { mode: 1 }, chord],
  ['4 voices, worst case', { mode: 1, regime: 0.4, link: 0, pressure: 0, grain: 1 }, [63, 63.0001, 64, 62].map(Math.round)],
];

function run(params, notes) {
  const e = new SyrinxEngine(SR, 1234);
  e.setParam('sustain', 1);
  for (const k in params) e.setParam(k, params[k]);
  // poly worst case: the same rich note four times on four voices (detuned by a few cents)
  if (params.mode === 1 && params.regime === 0.4) {
    notes.forEach((n, i) => { e.setParam('detune', 30 + i * 3); e.voices[i].setTarget(63, false); e.voices[i].trigger(100); });
  } else for (const n of notes) e.noteOn(n, 100);
  const L = new Float32Array(BL), R = new Float32Array(BL);
  for (let i = 0; i < SR * 0.25; i += BL) e.process(L, R, BL);          // warm up the JIT
  const total = Math.round(SR * SECS / BL) * BL;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < total; i += BL) e.process(L, R, BL);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const subs = e.voices.filter(v => v.active()).map(v => v.subNow);
  return [ms / (total / SR * 1000), subs.length ? Math.max(...subs) : 0];
}

const rows = [];
for (const [name, p, notes] of SCENARIOS) {
  const a = run(p, notes.slice()), b = run(p, notes.slice());
  rows.push([name, Math.min(a[0], b[0]), a[1]]);                       // best of two, less noise
}
const w = Math.max(...rows.map(r => r[0].length));
console.log('Syrinx reference engine · ' + SR / 1000 + ' kHz · ' + SECS + ' s per run · Node ' + process.version);
console.log('Scenario'.padEnd(w) + '   CPU  x real time  sub-steps');
for (const [name, f, s] of rows) console.log(name.padEnd(w) + '  ' + (f * 100).toFixed(1).padStart(4) + '%  ' + (1 / f).toFixed(0).padStart(7) + 'x  ' + String(s).padStart(9));
