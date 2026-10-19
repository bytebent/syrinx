// Reference engine tests. Run: node tests/engine-test.js
'use strict';
const path = require('path');
const { SyrinxEngine, PARAMS, core } = require(path.join(__dirname, '..', 'reference', 'syrinx-engine.js'));
const MAP = require(path.join(__dirname, '..', 'reference', 'syrinx-maps.js'));

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
  if (!ok) failed++;
}

function render(sr, seconds, setup, block, events) {
  const e = new SyrinxEngine(sr, 1234);
  const n = Math.round(sr * seconds);
  const L = new Float32Array(n), R = new Float32Array(n);
  setup(e);
  const bl = block || 128;
  const tl = new Float32Array(bl), tr = new Float32Array(bl);
  for (let i = 0; i < n; i += bl) {
    if (events) events(e, i);
    const m = Math.min(bl, n - i);
    e.process(tl, tr, m);
    L.set(tl.subarray(0, m), i); R.set(tr.subarray(0, m), i);
  }
  return { e, L, R };
}
function apply(e, p) { for (const k in p) e.setParam(k, p[k]); }
const cents = (a, b) => 1200 * Math.log2(a / b);
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// period by correlation at ever longer lags: start near the expected period, then at 4, 16, 64…
// periods, each time searching only around the lag the last estimate predicts, so an error of a
// fraction of a sample is divided by the number of periods
function pitch(x, sr, lo, hi) {
  const n = x.length;
  // normalised correlation between x[i] and x[i + lag] (the stretch is steady)
  const ac = (lag) => { let s = 0, a = 0, b = 0; for (let i = 0; i + lag < n; i++) { s += x[i] * x[i + lag]; a += x[i] * x[i]; b += x[i + lag] * x[i + lag]; } return s / Math.sqrt(a * b); };
  const peak = (from, to) => {
    let best = from, bv = -Infinity;
    for (let l = from; l <= to; l++) { const v = ac(l); if (v > bv) { bv = v; best = l; } }
    const y0 = ac(best - 1), y1 = bv, y2 = ac(best + 1);
    return best + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2);
  };
  let T = sr / Math.sqrt(lo * hi);
  T = peak(Math.max(2, Math.floor(T * 0.75)), Math.ceil(T * 1.33));
  for (let k = 4; k * T < n / 2; k *= 4) {
    const want = k * T;
    T = peak(Math.round(want) - 2, Math.round(want) + 2) / k;
  }
  return sr / T;
}
// spectral content of a steady stretch: energy-weighted mean harmonic number (1 = pure tone)
function spectralContent(x, sr, f0) {
  let num = 0, den = 0;
  for (let k = 1; k * f0 < 0.45 * sr; k++) {
    const w = 2 * Math.PI * k * f0 / sr;
    let re = 0, im = 0;
    for (let i = 0; i < x.length; i++) { const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / x.length); re += hann * x[i] * Math.cos(w * i); im += hann * x[i] * Math.sin(w * i); }
    const e = re * re + im * im;
    num += k * e; den += e;
  }
  return num / den;
}
function steady(L, sr, from, to) { return L.subarray(Math.round(from * sr), Math.round(to * sr)); }
const PLAIN = { grain: 0, link: 0, attack: 0.005, sustain: 1, decay: 0.05 };

// 1. the map: the Hopf side is born with a set frequency and little amplitude, the SNILC side with
//    near-zero frequency, full amplitude and rich spectrum
{
  const C = MAP.cols, last = MAP.rows - 1;
  const hopfF = MAP.f[0], hopfRms = MAP.rms[0], hopfSci = MAP.sci[0];
  const snF = MAP.f[last * C], snRms = MAP.rms[last * C], snSci = MAP.sci[last * C];
  check('map: Hopf onset (Regime 0)', hopfF > 0.08 && hopfRms < 0.08 && hopfSci < 1.05, 'f ' + hopfF.toFixed(4) + ', rms ' + hopfRms.toFixed(3) + ', content ' + hopfSci.toFixed(2));
  check('map: SNILC onset (Regime 1)', snF < 0.012 && snSci > 5, 'f ' + snF.toFixed(4) + ', rms ' + snRms.toFixed(3) + ' (brief pulses), content ' + snSci.toFixed(2));
  let mono = true;
  for (let c = 1; c < C; c++) if (MAP.f[last * C + c] < MAP.f[last * C + c - 1]) mono = false;
  check('map: SNILC frequency rises with drive', mono);
  // the onset line matches a direct check: just above it the rest state holds, just below it oscillates
  let lineOk = true;
  for (const b of [-0.4, -0.2, 0, 0.2, 0.4]) {
    const a = core.alphaOn(b);
    // start from the rest state, as a note does: settle well above the line first
    const swing = (alpha) => { const s = [0, 0.01]; for (let i = 0; i < 20000; i++) core.rk4(a + 0.05, b, s, 0.1); for (let i = 0; i < 40000; i++) core.rk4(alpha, b, s, 0.1); let mn = 9, mx = -9; for (let i = 0; i < 20000; i++) { core.rk4(alpha, b, s, 0.1); mn = Math.min(mn, s[0]); mx = Math.max(mx, s[0]); } return mx - mn; };
    if (!(swing(a + 0.01) < 1e-3 && swing(a - 0.01) > 0.05)) lineOk = false;
  }
  check('map: onset line is where oscillation starts', lineOk);
}

// 2. pitch is exact across Regime, at several notes
{
  let worst = 0, where = '';
  for (const note of [48, 60, 72, 84]) {
    for (let r = 0; r <= 1.0001; r += 0.125) {
      const { L } = render(48000, 0.7, e => { apply(e, Object.assign({ regime: r }, PLAIN)); e.noteOn(note, 100); });
      const want = midiHz(note + 36);
      const got = pitch(steady(L, 48000, 0.25, 0.7), 48000, want / 1.5, want * 1.5);
      const c = Math.abs(cents(got, want));
      if (c > worst) { worst = c; where = 'note ' + note + ', Regime ' + r.toFixed(3); }
    }
  }
  check('pitch within 1 cent across Regime', worst < 1, 'worst ' + worst.toFixed(3) + ' cents at ' + where);
}

// 3. pitch holds while pressure changes the timbre
{
  let worst = 0;
  for (const p of [0, 0.35, 0.7, 1]) {
    const { L } = render(48000, 0.7, e => { apply(e, Object.assign({ regime: 0.8, pressure: p }, PLAIN)); e.noteOn(60, 100); });
    const want = midiHz(96);
    worst = Math.max(worst, Math.abs(cents(pitch(steady(L, 48000, 0.25, 0.7), 48000, want / 1.5, want * 1.5), want)));
  }
  check('pitch within 1 cent across Pressure', worst < 1, 'worst ' + worst.toFixed(3) + ' cents');
}

// 4. Regime moves the timbre from tonal to rich
{
  const sc = [];
  for (const r of [0, 0.5, 1]) {
    const { L } = render(48000, 0.6, e => { apply(e, Object.assign({ regime: r, transpose: 12 }, PLAIN)); e.noteOn(60, 100); });
    sc.push(spectralContent(steady(L, 48000, 0.3, 0.6), 48000, midiHz(72)));
  }
  check('Regime: tonal → rich', sc[0] < 1.1 && sc[1] > sc[0] && sc[2] > 3, sc.map(v => v.toFixed(2)).join(' → '));
}

// 5. Link: low notes rich, high notes tonal (Sitt et al. 2008)
{
  const rows = [];
  for (const hz of [500, 900, 1500, 2500, 4500]) {
    const note = 69 + 12 * Math.log2(hz / 440) - 36;
    const { L } = render(48000, 0.6, e => { apply(e, { regime: 0.3, link: 1, grain: 0, sustain: 1, detune: 100 * (note - Math.round(note)) }); e.noteOn(Math.round(note), 100); });
    rows.push([hz, spectralContent(steady(L, 48000, 0.3, 0.6), 48000, hz)]);
  }
  const falls = rows.every((r, i) => i === 0 || r[1] <= rows[i - 1][1] + 0.05);
  check('Link: content falls with pitch', falls && rows[0][1] > 2.5 && rows[4][1] < 1.15, rows.map(r => r[0] + ' Hz ' + r[1].toFixed(2)).join(', '));
}

// 6. same output at any host buffer size, and from the same seed
{
  // note-off at 16000 samples: a block boundary for all three sizes
  const runs = [1, 64, 1000].map(bl => render(48000, 0.5, e => { apply(e, { grain: 0.5 }); e.noteOn(60, 100); }, bl, (e, i) => { if (i === 16000) e.noteOff(60); }).L);
  let same = true;
  for (let i = 0; i < runs[0].length; i++) if (runs[0][i] !== runs[1][i] || runs[0][i] !== runs[2][i]) { same = false; break; }
  check('same output at buffer sizes 1, 64, 1000', same);
}

// 7. levels: no NaN, sensible peaks across Regime and pitch at the defaults
{
  let ok = true, lo = 1, hi = 0;
  for (const note of [36, 48, 60, 72]) for (const r of [0, 0.5, 1]) {
    const { L } = render(48000, 0.5, e => { apply(e, { regime: r }); e.noteOn(note, 127); });
    let pk = 0; for (const v of L) { if (!Number.isFinite(v)) ok = false; pk = Math.max(pk, Math.abs(v)); }
    lo = Math.min(lo, pk); hi = Math.max(hi, pk);
  }
  check('levels: no NaN, peaks in range', ok && lo > 0.05 && hi < 0.98, 'peaks ' + lo.toFixed(3) + '–' + hi.toFixed(3));
}

// 8. release: the voice stops and the engine goes idle
{
  const { e, L } = render(48000, 1, e => { e.noteOn(60, 100); }, 128, (e, i) => { if (i === 12800) e.noteOff(60); });
  let tail = 0; for (let i = 36000; i < 48000; i++) tail = Math.max(tail, Math.abs(L[i]));
  check('release ends in silence', tail < 1e-6 && e.info.idle === true, 'tail ' + tail.toExponential(1));
}

// 9. Grain roughens the sound; at its default it barely moves the pitch, at full it smears it
{
  const want = midiHz(96);
  const run = (g) => render(48000, 0.7, e => { apply(e, Object.assign({ regime: 0.2 }, PLAIN, { grain: g })); e.noteOn(60, 100); }).L;
  const a = run(0), b = run(0.15), c = run(1);
  const pb = pitch(steady(b, 48000, 0.25, 0.7), 48000, want / 1.5, want * 1.5);
  const pc = pitch(steady(c, 48000, 0.25, 0.7), 48000, want / 1.5, want * 1.5);
  let diff = 0; for (let i = 12000; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
  check('Grain changes the sound; pitch holds at the default, smears at full', diff > 0.01 && Math.abs(cents(pb, want)) < 3 && Math.abs(cents(pc, want)) < 60,
    'default ' + cents(pb, want).toFixed(2) + ' cents, full ' + cents(pc, want).toFixed(2) + ' cents');
}

// 10. Breath bend: the pitch starts low and rises with the envelope
{
  const { e } = render(48000, 0.02, e => { apply(e, { breathbend: 1, attack: 0.5, link: 0 }); e.noteOn(60, 100); });
  const early = e.voices[0].fNow;
  check('Breath bend starts below the note', cents(early, midiHz(96)) < -900, cents(early, midiHz(96)).toFixed(0) + ' cents at 20 ms');
}

// 11. pitch bend +12 and transpose
{
  const { L } = render(48000, 0.7, e => { apply(e, Object.assign({ regime: 0 }, PLAIN)); e.setBend(1); e.noteOn(60, 100); });
  const want = midiHz(108);
  const got = pitch(steady(L, 48000, 0.25, 0.7), 48000, want / 1.5, want * 1.5);
  check('pitch bend +12', Math.abs(cents(got, want)) < 1, got.toFixed(1) + ' Hz');
}

// 12. mono legato glides; poly plays a chord
{
  const { e } = render(48000, 0.5, e => { apply(e, { glide: 0.2 }); e.noteOn(60, 100); }, 128, (e, i) => { if (i === 9600) e.noteOn(67, 100); });
  const v = e.voices[0];
  check('mono legato glides', Math.abs(cents(v.fNow, midiHz(103))) < 5, cents(v.fNow, midiHz(103)).toFixed(1) + ' cents from the new note after 0.3 s');
  const { e: p } = render(48000, 0.3, e => { apply(e, { mode: 1 }); e.noteOn(60, 100); e.noteOn(64, 100); e.noteOn(67, 100); });
  check('poly plays three notes', p.info.voices === 3);
}

check('15 parameters in batch 02', PARAMS.length === 15, PARAMS.length + '');

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
