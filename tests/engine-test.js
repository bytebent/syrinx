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
const PLAIN = { grain: 0, link: 0, attack: 0.005, sustain: 1, decay: 0.05, filter: 0 };   // the raw source

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
    const { L } = render(48000, 0.6, e => { apply(e, { regime: 0.3, link: 1, grain: 0, sustain: 1, filter: 0, detune: 100 * (note - Math.round(note)) }); e.noteOn(Math.round(note), 100); });
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
  const early = e.voices[0].fNow[0];
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
  check('mono legato glides', Math.abs(cents(v.fNow[0], midiHz(103))) < 5, cents(v.fNow[0], midiHz(103)).toFixed(1) + ' cents from the new note after 0.3 s');
  const { e: p } = render(48000, 0.3, e => { apply(e, { mode: 1 }); e.noteOn(60, 100); e.noteOn(64, 100); e.noteOn(67, 100); });
  check('poly plays three notes', p.info.voices === 3);
}

/* ---------- batches 04–05: sources, play modes, coupling, breath, patterns ---------- */
const OSR = 48000 * 4;
function tapRun(params, seconds, notes, events) {
  const e = new SyrinxEngine(48000, 1234);
  apply(e, Object.assign({ grain: 0, sustain: 1, decay: 0.05, attack: 0.005, transpose: 24 }, params));
  const len = Math.round(seconds * OSR);
  e.tap = { s0: new Float32Array(len), s1: new Float32Array(len), s2: new Float32Array(len), n: 0, len };
  e.onsets = [];
  for (const [n, ch] of notes) e.noteOn(n, 100, ch || 0);
  const N = Math.round(seconds * 48000), L = new Float32Array(N), bl = 128, tl = new Float32Array(bl), tr = new Float32Array(bl);
  for (let i = 0; i < N; i += bl) { if (events) events(e, i); const m = Math.min(bl, N - i); e.process(tl, tr, m); L.set(tl.subarray(0, m), i); }
  return { e, L, tap: e.tap };
}
function zfreq(x, sr, from, to) {
  let m = 0; for (let i = from; i < to; i++) m += x[i]; m /= (to - from);
  const cr = []; for (let i = from + 1; i < to; i++) if (x[i - 1] < m && x[i] >= m) cr.push(i - 1 + (m - x[i - 1]) / (x[i] - x[i - 1]));
  return cr.length < 3 ? 0 : sr * (cr.length - 1) / (cr[cr.length - 1] - cr[0]);
}
function rms(x, from, to) { let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, to - from)); }
// the varying part only (a stopped source rests away from its running mean)
function ac(x, from, to) { let m = 0; for (let i = from; i < to; i++) m += x[i]; m /= Math.max(1, to - from); let s = 0; for (let i = from; i < to; i++) s += (x[i] - m) ** 2; return Math.sqrt(s / Math.max(1, to - from)); }
function tone(x, sr, f, from, to) {
  let re = 0, im = 0; const n = to - from;
  for (let i = from; i < to; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i - from) / n); re += w * x[i] * Math.cos(2 * Math.PI * f * i / sr); im += w * x[i] * Math.sin(2 * Math.PI * f * i / sr); }
  return 2 * Math.sqrt(re * re + im * im) / n;
}
const corr = (a, b, from, to) => { let sx = 0, sy = 0, xy = 0; for (let i = from; i < to; i++) { sx += a[i] * a[i]; sy += b[i] * b[i]; xy += a[i] * b[i]; } return xy / Math.sqrt(sx * sy); };
const late = (t) => [Math.round(0.5 * OSR), t.n];

// 13. Handoff: below Split the left side sings, above it the right
{
  const lo = tapRun({ regime: 0.3, link: 0 }, 0.6, [[60]]);            // 1047 Hz
  const hi = tapRun({ regime: 0.3, link: 0 }, 0.6, [[84]]);            // 4186 Hz
  const [a, b] = late(lo.tap);
  check('Handoff: low note on the left, high note on the right',
    rms(lo.tap.s0, a, b) > 0.3 && rms(lo.tap.s1, a, b) === 0 && rms(hi.tap.s1, a, b) > 0.3 && rms(hi.tap.s0, a, b) === 0);
  // a syllable sweeping up from 2 to 7 kHz starts on the left and ends on the right (cardinal)
  const sw = tapRun({ pattern: 1, sylrate: 2, duty: 0.9, shape: 1, sweep: Math.log2(3.5), trill: 0, jitter: 0, minibreath: 0, link: 0, regime: 0.2 }, 0.45, [[71]]);   // 1976 Hz → 6.9 kHz
  const t = sw.tap, q = (from, to) => [rms(t.s0, Math.round(from * OSR), Math.round(to * OSR)), rms(t.s1, Math.round(from * OSR), Math.round(to * OSR))];
  const [eL, eR] = q(0.02, 0.05), [lL, lR] = q(0.35, 0.42);
  check('Handoff mid-sweep: left early, right late', eL > 0.3 && eR < 0.05 && lR > 0.3 && lL < 0.05, 'early ' + eL.toFixed(2) + '/' + eR.toFixed(2) + ', late ' + lL.toFixed(2) + '/' + lR.toFixed(2));
}

// 14. Interval, Duo and Independent put the right notes on the sides
{
  const iv = tapRun({ playmode: 1, interval: 7.3, coupling: 0, regime: 0, link: 0 }, 0.6, [[60]]);
  const [a, b] = late(iv.tap);
  const fl = zfreq(iv.tap.s0, OSR, a, b), fr = zfreq(iv.tap.s1, OSR, a, b);
  check('Interval: right side 7.3 semitones up', Math.abs(1200 * Math.log2(fr / fl) - 730) < 1, (1200 * Math.log2(fr / fl)).toFixed(2) + ' cents');
  const duo = tapRun({ playmode: 2, coupling: 0, regime: 0, link: 0 }, 0.6, [[67], [60]]);
  const dl = zfreq(duo.tap.s0, OSR, a, b), dr = zfreq(duo.tap.s1, OSR, a, b);
  check('Duo: lower note left, higher right', Math.abs(cents(dl, midiHz(84))) < 2 && Math.abs(cents(dr, midiHz(91))) < 2, dl.toFixed(0) + ' / ' + dr.toFixed(0) + ' Hz');
  const ind = tapRun({ playmode: 3, coupling: 0, regime: 0, link: 0 }, 0.6, [[64, 1], [60, 0]]);
  const il = zfreq(ind.tap.s0, OSR, a, b), ir = zfreq(ind.tap.s1, OSR, a, b);
  check('Independent: channel 1 left, channel 2 right', Math.abs(cents(il, midiHz(84))) < 2 && Math.abs(cents(ir, midiHz(88))) < 2, il.toFixed(0) + ' / ' + ir.toFixed(0) + ' Hz');
}

// 15. coupling: detuned sides lock; unlocked sides make sum and difference tones
{
  const f = (c) => { const r = tapRun({ playmode: 1, interval: 0.1, coupling: c, asym: 0, regime: 0, link: 0 }, 1, [[60]]); const [a, b] = late(r.tap); return 1200 * Math.log2(zfreq(r.tap.s1, OSR, a, b) / zfreq(r.tap.s0, OSR, a, b)); };
  const free = f(0), locked = f(0.1);
  check('Coupling locks sides 10 cents apart', Math.abs(free - 10) < 0.5 && Math.abs(locked) < 0.1, 'apart ' + free.toFixed(1) + ' → ' + locked.toFixed(2) + ' cents');
  const comb = (c) => { const r = tapRun({ playmode: 1, interval: 7.3, coupling: c, asym: 0, regime: 0, link: 0 }, 1, [[60]]); const [a, b] = late(r.tap);
    const fl = zfreq(r.tap.s0, OSR, a, b), fr = zfreq(r.tap.s1, OSR, a, b); return 20 * Math.log10(tone(r.L, 48000, fr - fl, 24000, 48000) / rms(r.L, 24000, 48000)); };
  const d0 = comb(0), d3 = comb(0.3);
  check('Coupling makes a difference tone', d0 < -100 && d3 > -50, d0.toFixed(0) + ' dB → ' + d3.toFixed(0) + ' dB re output');
  const ph = (c) => { const r = tapRun({ playmode: 1, interval: 0, coupling: c, asym: 0, regime: 0, link: 0 }, 0.6, [[60]]); const [a, b] = late(r.tap); return corr(r.tap.s0, r.tap.s1, a, b); };
  const weak = ph(0.1), strong = ph(0.6);
  check('Identical tonal sides: anti-phase when weak, in phase when strong', weak < -0.8 && strong > 0.95, 'correlation ' + weak.toFixed(2) + ' → ' + strong.toFixed(2));
}

// 16. Single: folds lock at low Asymmetry and slip past about a semitone
{
  const s = (asym) => { const r = tapRun({ topology: 1, asym, regime: 0.2, link: 0 }, 1, [[60]]); const [a, b] = late(r.tap); return 1200 * Math.log2(zfreq(r.tap.s1, OSR, a, b) / zfreq(r.tap.s0, OSR, a, b)); };
  const a2 = s(0.2), a6 = s(0.6);
  check('Single: folds lock at Asymmetry 0.2, slip at 0.6', Math.abs(a2) < 0.1 && Math.abs(a6) > 5, a2.toFixed(2) + ' / ' + a6.toFixed(1) + ' cents apart');
}

// 17. Triple: a close membrane locks with the labia at a lower shared pitch; a far one does not
{
  const t = (mem, c) => { const r = tapRun({ topology: 2, membrane: mem, memlevel: 0.5, coupling: c, regime: 0.3, link: 0 }, 1, [[60]]); const [a, b] = late(r.tap); return [zfreq(r.tap.s0, OSR, a, b), zfreq(r.tap.s2, OSR, a, b)]; };
  const [l0, m0] = t(-2, 0), [l1, m1] = t(-2, 0.3), [lf, mf] = t(-24, 0.3);
  check('Triple: close membrane locks below the labial pitch', Math.abs(cents(l1, m1)) < 0.5 && l1 < l0 && l1 > m0, 'labia ' + l0.toFixed(0) + ' + membrane ' + m0.toFixed(0) + ' → both ' + l1.toFixed(0) + ' Hz');
  check('Triple: far membrane keeps its own pitch', Math.abs(cents(mf, midiHz(84 - 24))) < 20 && Math.abs(cents(lf, midiHz(84))) < 20, lf.toFixed(0) + ' / ' + mf.toFixed(0) + ' Hz');
  const off = tapRun({ topology: 2, memlevel: 0, regime: 0.3, link: 0 }, 0.4, [[60]]);
  check('Triple: Membrane level 0 silences the membrane', rms(off.tap.s2, 0, off.tap.n) === 0);
}

// 18. patterns: onsets exact, the same at any buffer size, synced to tempo
{
  const r = tapRun({ pattern: 1, sylrate: 10, jitter: 0 }, 1.05, [[60]]);
  const o = r.e.onsets, per = OSR / 10;
  let worst = 0; for (let i = 1; i < o.length; i++) worst = Math.max(worst, Math.abs(o[i] - o[i - 1] - per));
  check('Pattern: 10 syllables per second, onsets exact', o.length === 11 && worst <= 1, o.length + ' onsets, worst gap error ' + worst + ' samples at 4x');
  const runs = [1, 64, 1000].map(bl => render(48000, 0.5, e => { apply(e, { pattern: 1, sylrate: 23, jitter: 0.5, grain: 0.3 }); e.noteOn(60, 100); }, bl).L);
  let same = true; for (let i = 0; i < runs[0].length; i++) if (runs[0][i] !== runs[1][i] || runs[0][i] !== runs[2][i]) { same = false; break; }
  check('Pattern with jitter: same output at buffer sizes 1, 64, 1000', same);
  const sy = tapRun({ pattern: 1, sylrate: 7, sync: 1, jitter: 0 }, 1.05, [[60]]);   // 120 BPM: 4 per beat = 8/s
  check('Sync: 7/s snaps to 4 per beat at 120 BPM', sy.e.onsets.length === 9, sy.e.onsets.length + ' onsets in 1.05 s');
}

// 19. gating: sound stops between syllables while the source keeps going; minibreaths stop the source
{
  const gaps = (mb, rate) => {
    const r = tapRun({ pattern: 1, sylrate: rate, duty: 0.5, minibreath: mb, jitter: 0, regime: 0.3, link: 0 }, 1, [[60]]);
    const per = OSR / rate; let outOn = 0, outOff = 0, srcOff = 0, nOn = 0, nOff = 0;
    for (let k = 2; k < rate * 0.9; k++) {
      const s = Math.round(k * per);
      const on = [s + Math.round(0.15 * per), s + Math.round(0.4 * per)], off = [s + Math.round(0.75 * per), s + Math.round(0.95 * per)];
      outOn += rms(r.L, Math.round(on[0] / 4), Math.round(on[1] / 4)); outOff += rms(r.L, Math.round(off[0] / 4), Math.round(off[1] / 4));
      srcOff += ac(r.tap.s0, off[0], off[1]); nOn++; nOff++;
    }
    return [outOff / outOn, srcOff / nOff];
  };
  const [g0, s0] = gaps(0, 8), [g1, s1] = gaps(1, 8), [g2, s2] = gaps(1, 40);
  check('Gating: silent between syllables, source still running', g0 < 0.01 && s0 > 0.3, 'off/on ' + g0.toExponential(1) + ', source ' + s0.toFixed(2));
  check('Minibreath: the source stops between slow syllables', s1 < 0.1, 'source ' + s1.toFixed(3));
  check('Minibreath fades out above 30 per second', s2 > 0.3, 'source at 40/s ' + s2.toFixed(2));
}

// 20. trill limit follows Podos's line; Alternate swaps sides per syllable
{
  const r = tapRun({ pattern: 1, sylrate: 20, sweep: 3, shape: 1, trill: 1, jitter: 0 }, 0.2, [[60]]);
  const v = r.e.voices[0], f = Math.pow(2, v.logF[0]);
  const bw = f * (Math.pow(2, v.sylSweep) - 1), lim = SyrinxEngine.podosBandwidth(20);
  check('Trill limit: a 20/s trill sweeps at most Podos bandwidth', Math.abs(bw - lim) < 1 && v.sylSweep < 3, 'sweep ' + v.sylSweep.toFixed(3) + ' oct, ' + bw.toFixed(0) + ' Hz (line ' + lim.toFixed(0) + ' Hz)');
  const alt = tapRun({ pattern: 1, sylrate: 10, sides: 3, duty: 0.8, jitter: 0, regime: 0.3, link: 0 }, 0.4, [[60]]);
  const seg = (k, s) => rms(s, Math.round((k + 0.3) * OSR / 10), Math.round((k + 0.7) * OSR / 10));
  check('Alternate: syllables switch sides', seg(1, alt.tap.s1) > 0.3 && seg(1, alt.tap.s0) < 0.05 && seg(2, alt.tap.s0) > 0.3 && seg(2, alt.tap.s1) < 0.05);
}

// 21. Wobble: amplitude modulation at its rate makes sidebands; pitch modulation keeps the centre
{
  const r = tapRun({ wobblerate: 160, wobble: 0.8, wobblefm: 0, regime: 0, link: 0 }, 0.8, [[60]]);
  const f0 = midiHz(84), c = tone(r.L, 48000, f0, 12000, 38400), sb = tone(r.L, 48000, f0 + 160, 12000, 38400);
  check('Wobble (amplitude): sidebands at ±160 Hz', sb / c > 0.1, (20 * Math.log10(sb / c)).toFixed(1) + ' dB');
  const fm = tapRun({ wobblerate: 160, wobble: 0.5, wobblefm: 1, regime: 0, link: 0 }, 0.8, [[60]]);
  const want = midiHz(84), got = pitch(fm.L.subarray(12000, 38400), 48000, want / 1.5, want * 1.5);
  check('Wobble (pitch): centre stays on the note', Math.abs(cents(got, want)) < 5, cents(got, want).toFixed(2) + ' cents');
}

/* ---------- batch 06: internal trachea, Jumps, Chaos, Filter ---------- */
function periodicity(x, f0, from, to) {
  const W = Math.round(0.04 * 48000), T = 48000 / f0, vals = [];
  for (let a = from; a + 2 * W + Math.ceil(T * 4) <= to; a += W) {
    let best = -1;
    for (let lag = Math.max(2, Math.floor(T * 0.5)); lag <= Math.ceil(T * 4); lag++) {
      let s = 0, p = 0, q = 0; for (let i = a; i < a + W; i++) { s += x[i] * x[i + lag]; p += x[i] * x[i]; q += x[i + lag] * x[i + lag]; }
      const c = s / Math.sqrt(p * q + 1e-30); if (c > best) best = c;
    }
    vals.push(best);
  }
  vals.sort((p, q) => p - q); return vals[Math.floor(vals.length / 2)];
}

// 22. Filter: purer, same pitch, level within a few dB
{
  const want = midiHz(84);
  const off = render(48000, 0.6, e => { apply(e, Object.assign({}, PLAIN, { regime: 0.6, transpose: 24 })); e.noteOn(60, 100); }).L;
  const on = render(48000, 0.6, e => { apply(e, Object.assign({}, PLAIN, { regime: 0.6, transpose: 24, filter: 1 })); e.noteOn(60, 100); }).L;
  const cOff = spectralContent(steady(off, 48000, 0.25, 0.6), 48000, want), cOn = spectralContent(steady(on, 48000, 0.25, 0.6), 48000, want);
  const p = pitch(steady(on, 48000, 0.25, 0.6), 48000, want / 1.5, want * 1.5);
  const db = 20 * Math.log10(rms(on, 12000, 28800) / rms(off, 12000, 28800));
  check('Filter: purer, in tune, level close', cOn < cOff - 0.5 && Math.abs(cents(p, want)) < 1 && Math.abs(db) < 8,
    'content ' + cOff.toFixed(2) + ' → ' + cOn.toFixed(2) + ', ' + cents(p, want).toFixed(2) + ' cents, ' + db.toFixed(1) + ' dB');
}

// 23. without Jumps and Filter the tube changes nothing; with Jumps, lengthening it near the period jumps, with hysteresis
{
  const a = render(48000, 0.3, e => { apply(e, Object.assign({}, PLAIN, { trachea: 3.5 })); e.noteOn(60, 100); }).L;
  const b = render(48000, 0.3, e => { apply(e, Object.assign({}, PLAIN, { trachea: 7 })); e.noteOn(60, 100); }).L;
  let same = true; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { same = false; break; }
  check('Jumps 0, Filter off: tube length changes nothing', same);
  const sweep = (jumps) => {
    const secs = 6, N = secs * 48000, want = midiHz(104);   // 3.3 kHz: one period is 5.3 cm of round trip
    const r = tapRun({ regime: 0, link: 0, jumps, filter: 0, trachea: 4, transpose: 36 }, secs, [[68]], (e, i) => { const u = i / N; e.setParam('trachea', u < 0.5 ? 4 + 6 * u : 7 - 6 * (u - 0.5)); });
    const W = Math.round(0.02 * OSR), rows = [];
    for (let s0 = Math.round(0.1 * OSR); s0 + W <= r.tap.n; s0 += W) { const t = (s0 + W / 2) / OSR, u = t / secs; rows.push([t, u < 0.5 ? 4 + 6 * u : 7 - 6 * (u - 0.5), 1200 * Math.log2(zfreq(r.tap.s0, OSR, s0, s0 + W) / want)]); }
    let step = 0; for (let i = 1; i < rows.length; i++) step = Math.max(step, Math.abs(rows[i][2] - rows[i - 1][2]));
    const up = rows.filter(q => q[0] < secs / 2), dn = rows.filter(q => q[0] > secs / 2);
    let hyst = 0; for (const q of up) { const d = dn.reduce((p, z) => Math.abs(z[1] - q[1]) < Math.abs(p[1] - q[1]) ? z : p); hyst = Math.max(hyst, Math.abs(q[2] - d[2])); }
    return [step, hyst, Math.max(...rows.map(q => Math.abs(q[2])))];
  };
  const [s3, h3, p3] = sweep(0.3), [s1, h1] = sweep(1);
  check('Jumps 0.3: a gentle pull, no jumps', p3 < 60 && s3 < 20, 'pull up to ' + p3.toFixed(0) + ' cents, largest step ' + s3.toFixed(0));
  check('Jumps 1: frequency jumps with hysteresis (Arneodo & Mindlin)', s1 > 300 && h1 > 300, 'largest step ' + s1.toFixed(0) + ' cents, up/down differ by ' + h1.toFixed(0));
}

// 24. Chaos: a periodic note turns aperiodic
{
  // defaults at 523 Hz: Chaos works best below about 2 kHz (higher notes are held pure by the band limit)
  const f0 = midiHz(72);
  const pr = (c) => periodicity(render(48000, 1, e => { apply(e, { grain: 0, sustain: 1, filter: 0, chaos: c }); e.noteOn(36, 100); }).L, f0, 12000, 48000);
  const p0 = pr(0), p1 = pr(1);
  check('Chaos: periodic → aperiodic', p0 > 0.95 && p1 < 0.6, 'periodicity ' + p0.toFixed(2) + ' → ' + p1.toFixed(2));
}

// 25. extremes stay finite
{
  let ok = true, worst = 0;
  for (const topology of [0, 1, 2]) for (const trachea of [1, 200]) {
    const { L } = render(48000, 0.5, e => { apply(e, { topology, trachea, chaos: 1, jumps: 1, coupling: 1, grain: 1, wobblerate: 250, wobble: 1, pattern: 1, sylrate: 60, regime: 1 }); e.noteOn(36, 127); e.noteOn(84, 127); });
    for (const v of L) { if (!Number.isFinite(v)) ok = false; worst = Math.max(worst, Math.abs(v)); }
  }
  check('Extremes: no NaN, output within ±1', ok && worst <= 1, 'peak ' + worst.toFixed(3));
}

check('42 parameters after batch 06', PARAMS.length === 42, PARAMS.length + '');

console.log(failed ? failed + ' failed' : 'all passed');
process.exit(failed ? 1 : 0);
