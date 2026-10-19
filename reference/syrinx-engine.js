/*
 * Syrinx engine v0.1 · bytebent
 *
 * A bird voice. Each voice is a syrinx source: the normal form of the Mindlin group's labial
 * model (Sitt et al. 2010; Perl et al. 2011), a two-variable nonlinear oscillator
 *     x' = y,   y' = γ²·α + γ²·β·x + γ²·x² − γ·x·y − γ²·x³ − γ·x²·y
 * where α is pressure (more negative = more drive), β is labial tension and γ a time scale.
 *   - γ only rescales time, so the pitch is exactly γ times the oscillator's frequency at γ = 1.
 *     A map of that frequency over (Regime, drive), made by tools/make-maps.js, lets every block
 *     set γ so the note comes out in tune whatever the timbre.
 *   - Regime moves along a path from the Hopf side (born as a pure tone, harmonics grow with
 *     drive) to the SNILC side (born pulse-like and rich, purer with more drive).
 *   - Link makes Regime follow the note: low notes rich, high notes tonal, as in zebra finch song.
 *   - Pressure and the envelope set the drive past onset; Grain is noise on tension; Breath bend
 *     lets pressure bend pitch.
 *
 * Batch 02: one source per voice. Sides, patterns, coupling, the internal trachea and Lock come
 * in later batches (see plan.md).
 *
 * The oscillator is integrated with RK4 at 4x the host rate, with enough sub-steps to keep the
 * step at or below 0.1 time units (pitch error under 0.03 cent), in fixed 32-sample blocks, and
 * decimated with a windowed-sinc FIR, as in Throat and Dolphin. process() never allocates.
 * Same seed, same notes: same output, at any host buffer size.
 *
 * Works in an AudioWorklet and in Node (module.exports) for offline tests.
 */
(function (root) {
  'use strict';

  const OS = 4;                 // internal oversampling
  const BLOCK = 32;             // fixed internal block (host samples) = latency
  const FIR_LEN = 128;          // decimation filter taps (at 4x rate)
  const MAX_VOICES = 4;         // Poly voices (batch 03: worst case about 11% of a core per voice)
  const TWO_PI = 2 * Math.PI;

  /* ---------- the model and its map ---------- */
  const BETA_LO = -0.4, BETA_HI = 0.4;     // Regime 0 → 1
  const D_MIN = 2e-4, D_MAX = 0.3;         // drive past onset covered by the map
  const ROWS = 49, COLS = 97;              // map size (row 9 sits on the Hopf/SNILC corner, β = −0.25)
  const U0 = Math.sqrt(D_MIN / D_MAX);
  const H_MAX = 0.1;                       // largest RK4 step, in model time units
  const MAX_SUB = 48;                      // sub-steps per oversampled sample, at most (the band limit keeps it under 20)
  const D_HOPF = 0.15, D_SNILC = 1e-3;     // drive at default Pressure and full envelope, Regime 0 and 1
  const PRESS_OCT = 8;                     // Pressure 0–1 spans 8 octaves of drive (default 0.7)
  const NORM_POW = 0.7;                    // how much loudness is evened out across the map
  const LEVEL = 0.22;
  const GRAIN_SD = 0.03;                   // tension noise at Grain 1 (β units)
  const GRAIN_HZ = 1000;                   // tension noise bandwidth
  const LINK_LO = 1000, LINK_HI = 2250;    // Hz: rich below, tonal above (Sitt et al. 2008, 2010)
  const CONTENT_HZ = 15000;                // band limit: spectral content at most CONTENT_HZ / pitch,
                                           // so high notes get the drive they need to stay below 4x Nyquist

  // onset line: Hopf at α = 0 up to β = −0.25, then the saddle-node of the fixed points (SNILC)
  function alphaOn(b) {
    if (b <= -0.25) return 0;
    const x = (2 + Math.sqrt(4 + 12 * b)) / 6;
    return Math.min(0, -b * x - x * x + x * x * x);
  }
  function colDrive(c) { const u = U0 + (1 - U0) * c / (COLS - 1); return D_MAX * u * u; }
  function rowBeta(r) { return BETA_LO + (BETA_HI - BETA_LO) * r / (ROWS - 1); }
  // one RK4 step of the oscillator at γ = 1; s = [x, y]
  function accel(a, b, x, y) { return a + b * x + x * x - x * y - x * x * x - x * x * y; }
  function rk4(a, b, s, h) {
    const x = s[0], y = s[1];
    const k1x = y, k1y = accel(a, b, x, y);
    const k2x = y + 0.5 * h * k1y, k2y = accel(a, b, x + 0.5 * h * k1x, y + 0.5 * h * k1y);
    const k3x = y + 0.5 * h * k2y, k3y = accel(a, b, x + 0.5 * h * k2x, y + 0.5 * h * k2y);
    const k4x = y + h * k3y, k4y = accel(a, b, x + h * k3x, y + h * k3y);
    s[0] = x + h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    s[1] = y + h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y);
  }
  const core = { BETA_LO, BETA_HI, D_MIN, D_MAX, ROWS, COLS, alphaOn, colDrive, rowBeta, rk4 };

  let MAP = null;
  if (typeof module !== 'undefined' && module.exports) {
    try { MAP = require('./syrinx-maps.js'); } catch (err) { MAP = null; }   // absent while make-maps.js runs
  } else MAP = root.SyrinxMap || null;

  // map lookup at Regime r (0–1) and drive d: Catmull-Rom across both. The onset line has a corner
  // at β = −0.25, which sits exactly on row KINK; no stencil reaches across it.
  const KINK = 9;
  function cubic(p0, p1, p2, p3, t) {
    return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  }
  function rowAt(arr, row, cx) {
    const c = Math.min(COLS - 2, Math.max(0, Math.floor(cx))), t = cx - c, o = row * COLS;
    const p1 = arr[o + c], p2 = arr[o + c + 1];
    // ends: extend linearly so the curve stays smooth
    const p0 = c === 0 ? 2 * p1 - p2 : arr[o + c - 1];
    const p3 = c + 2 > COLS - 1 ? 2 * p2 - p1 : arr[o + c + 2];
    return cubic(p0, p1, p2, p3, t);
  }
  function at(arr, r0, t, cx) {
    const p1 = rowAt(arr, r0, cx), p2 = rowAt(arr, r0 + 1, cx);
    const p0 = r0 === 0 || r0 === KINK ? 2 * p1 - p2 : rowAt(arr, r0 - 1, cx);
    const p3 = r0 + 1 === ROWS - 1 || r0 + 1 === KINK ? 2 * p2 - p1 : rowAt(arr, r0 + 2, cx);
    return cubic(p0, p1, p2, p3, t);
  }
  function coords(r, d) {
    const ry = Math.min(1, Math.max(0, r)) * (ROWS - 1);
    const u = Math.sqrt(Math.min(D_MAX, Math.max(D_MIN, d)) / D_MAX);
    const r0 = Math.min(ROWS - 2, Math.floor(ry));
    return [r0, ry - r0, (u - U0) / (1 - U0) * (COLS - 1)];
  }
  function lookup(r, d, out) {
    const [r0, t, cx] = coords(r, d);
    out.f = at(MAP.f, r0, t, cx);
    out.rms = at(MAP.rms, r0, t, cx);
    out.mean = at(MAP.mean, r0, t, cx);
    out.sci = at(MAP.sci, r0, t, cx);
    return out;
  }
  function sciAt(r, d) { const [r0, t, cx] = coords(r, d); return at(MAP.sci, r0, t, cx); }
  // least drive whose spectral content stays at or under smax (content falls as drive grows)
  function driveForContent(r, d, smax) {
    if (sciAt(r, d) <= smax) return d;
    let lo = Math.sqrt(d / D_MAX), hi = 1;
    if (sciAt(r, D_MAX) > smax) return D_MAX;
    for (let i = 0; i < 18; i++) { const m = 0.5 * (lo + hi); if (sciAt(r, D_MAX * m * m) > smax) lo = m; else hi = m; }
    return D_MAX * hi * hi;
  }

  // ids, defaults and ranges: the one table the C++ core and the UI copy.
  // log: the knob moves logarithmically; curve: knob position^curve; step: whole steps.
  // Batch 02 has the source controls; the rest of design.md §9 arrives batch by batch.
  const PARAMS = [
    { id: 'regime', def: 0.3, min: 0, max: 1 },          // Hopf (tonal) → SNILC (pulse-like)
    { id: 'link', def: 0.7, min: 0, max: 1 },            // how much Regime follows the note
    { id: 'grain', def: 0.15, min: 0, max: 1 },          // noise on tension
    { id: 'breathbend', def: 0, min: 0, max: 1 },        // octaves of pitch from pressure
    { id: 'pressure', def: 0.7, min: 0, max: 1 },        // drive past onset
    { id: 'attack', def: 0.008, min: 0.001, max: 5, curve: 3 },
    { id: 'decay', def: 0.3, min: 0.001, max: 5, curve: 3 },
    { id: 'sustain', def: 0.8, min: 0, max: 1 },
    { id: 'release', def: 0.03, min: 0.001, max: 8, curve: 3 },
    { id: 'transpose', def: 36, min: -24, max: 60, step: 1 },  // semitones; middle C plays about 2.1 kHz
    { id: 'detune', def: 0, min: -100, max: 100 },       // cents
    { id: 'glide', def: 0.02, min: 0, max: 2, curve: 3 },// s, mono only
    { id: 'bendrange', def: 12, min: 2, max: 48, step: 1 },
    { id: 'mode', def: 0, min: 0, max: 1, step: 1 },     // 0 mono, 1 poly
    { id: 'volume', def: -6, min: -48, max: 6 },         // dB
  ];
  const PINDEX = {};
  PARAMS.forEach((p, i) => { PINDEX[p.id] = i; });

  function toNorm(d, v) {
    if (d.log) return Math.log(v / d.min) / Math.log(d.max / d.min);
    const n = (v - d.min) / (d.max - d.min);
    return d.curve ? Math.pow(Math.max(0, n), 1 / d.curve) : n;
  }
  function fromNorm(d, n) {
    n = n < 0 ? 0 : n > 1 ? 1 : n;
    let v = d.log ? d.min * Math.pow(d.max / d.min, n) : d.min + (d.max - d.min) * (d.curve ? Math.pow(n, d.curve) : n);
    if (d.step) v = Math.round(v / d.step) * d.step;
    return v;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function makeFir() {
    const h = new Float32Array(FIR_LEN);
    const fc = 0.5 / OS * 0.92, M = (FIR_LEN - 1) / 2;
    let sum = 0;
    for (let n = 0; n < FIR_LEN; n++) {
      const x = n - M;
      const s = x === 0 ? 2 * fc : Math.sin(TWO_PI * fc * x) / (Math.PI * x);
      const a = TWO_PI * n / (FIR_LEN - 1);
      const w = 0.35875 - 0.48829 * Math.cos(a) + 0.14128 * Math.cos(2 * a) - 0.01168 * Math.cos(3 * a);
      h[n] = s * w; sum += h[n];
    }
    for (let n = 0; n < FIR_LEN; n++) h[n] /= sum;
    return h;
  }

  /* ---------- one voice ---------- */
  class Voice {
    constructor(e, seed) {
      this.e = e;
      this.seed = (seed >>> 0) || 1;
      this.s = new Float64Array(2);
      this.q = { f: 0, rms: 1, mean: 0, sci: 1 };
      this.reset();
    }
    reset() {
      this.rng = this.seed;
      this.stage = 0; this.env = 0; this.note = -1; this.held = false; this.vel = 1; this.age = 0;
      this.logF = Math.log2(440); this.glideLeft = 0; this.glideStep = 0;
      this.s[0] = 0; this.s[1] = 0;
      this.noise = 0;
      // block-to-block ramps
      this.a0 = 0; this.b0 = 0; this.g0 = 0; this.gain0 = 0; this.mean0 = 0; this.fresh = true;
      // what the bench and tests read
      this.fNow = 0; this.regimeNow = 0; this.driveNow = 0; this.sciNow = 1; this.gammaNow = 0; this.subNow = 0;
    }
    rand() {
      let x = this.rng;
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      this.rng = x;
      return x / 4294967296;
    }
    gauss() { let s = this.rand(); s += this.rand(); s += this.rand(); s += this.rand(); return (s - 2) * 1.7320508; }
    active() { return this.stage !== 0; }

    pitchTarget(note) {
      const e = this.e;
      return Math.log2(440) + (note - 69 + e.p[PINDEX.transpose] + e.p[PINDEX.detune] / 100) / 12;
    }
    setTarget(note, glide) {
      const t = this.pitchTarget(note);
      const g = this.e.p[PINDEX.glide];
      if (glide && g > 0.0015) {
        const steps = Math.max(1, Math.round(g * this.e.sr / BLOCK));
        this.glideStep = (t - this.logF) / steps; this.glideLeft = steps;
      } else { this.logF = t; this.glideLeft = 0; }
      this.note = note;
    }
    trigger(vel) {
      this.vel = 0.2 + 0.8 * clamp(vel / 127, 0, 1);
      if (this.stage === 0) {
        // from rest: the labia start at their midpoint with a small push
        this.env = 0; this.s[0] = 0; this.s[1] = 0.01; this.noise = 0; this.fresh = true;
      }
      this.stage = 1; this.held = true; this.age = ++this.e.ageCounter;
    }
    release() { if (this.stage !== 0) { this.stage = 4; this.held = false; } }

    // envelope over one block (Dolphin's shapes: linear attack, exponential decay and release)
    stepEnv(nOS) {
      const e = this.e, P = e.p, srOS = e.srOS;
      const attStep = 1 / Math.max(1, P[PINDEX.attack] * srOS);
      const dCoef = Math.exp(-4 / Math.max(1, P[PINDEX.decay] * srOS));
      const rCoef = Math.exp(-4 / Math.max(1, P[PINDEX.release] * srOS));
      const sus = P[PINDEX.sustain];
      let env = this.env;
      for (let i = 0; i < nOS; i++) {
        if (this.stage === 1) { env += attStep; if (env >= 1) { env = 1; this.stage = 2; } }
        else if (this.stage === 2) { env = sus + (env - sus) * dCoef; if (Math.abs(env - sus) < 1e-5) { env = sus; this.stage = 3; } }
        else if (this.stage === 3) env = sus;
        else if (this.stage === 4) env *= rCoef;
      }
      this.env = env;
      if (this.stage === 4 && env < 1e-4) { this.stage = 0; this.env = 0; return false; }
      return true;
    }

    render(nOS, out) {
      const e = this.e, P = e.p;
      if (this.glideLeft > 0) { this.logF += this.glideStep; this.glideLeft--; }
      if (!this.stepEnv(nOS)) return;
      const E = this.env;
      // pitch: note, bend, Breath bend (pressure lifts the pitch up to the note at full envelope)
      const logHz = this.logF + e.bendOct + P[PINDEX.breathbend] * (E - 1);
      const hz = Math.pow(2, logHz);
      // Regime, following the note by Link
      const lr = Math.log2(hz);
      const rNote = clamp((Math.log2(LINK_HI) - lr) / (Math.log2(LINK_HI) - Math.log2(LINK_LO)), 0, 1);
      const reg = clamp(P[PINDEX.regime] + P[PINDEX.link] * (rNote - P[PINDEX.regime]), 0, 1);
      // drive past onset: the Regime path at full pressure, scaled by Pressure and the envelope
      const dPath = D_HOPF * Math.pow(D_SNILC / D_HOPF, reg);
      let d = clamp(dPath * Math.pow(2, PRESS_OCT * (P[PINDEX.pressure] - 0.7)) * (0.3 + 0.7 * E), D_MIN, D_MAX);
      d = driveForContent(reg, d, Math.max(1.02, CONTENT_HZ / hz));
      const b = BETA_LO + (BETA_HI - BETA_LO) * reg;
      const a = alphaOn(b) - d;
      // Grain moves tension along the onset line, so the drive past onset stays the same
      const onSlope = (alphaOn(b + 1e-4) - alphaOn(b - 1e-4)) / 2e-4;
      const q = lookup(reg, d, this.q);
      const gamma = hz / q.f;
      const gain = this.vel * E * LEVEL / Math.pow(q.rms, NORM_POW);
      if (this.fresh) { this.a0 = a; this.b0 = b; this.g0 = gamma; this.gain0 = 0; this.mean0 = q.mean; this.fresh = false; }
      // sub-steps: keep every RK4 step at or below H_MAX
      const gmax = Math.max(gamma, this.g0);
      const sub = Math.min(MAX_SUB, Math.max(1, Math.ceil(gmax / (e.srOS * H_MAX))));
      // ramps across the block
      const inv = 1 / nOS;
      const da = (a - this.a0) * inv, db = (b - this.b0) * inv, dg = (gamma - this.g0) * inv;
      const dgain = (gain - this.gain0) * inv, dmean = (q.mean - this.mean0) * inv;
      let ca = this.a0, cb = this.b0, cg = this.g0, cgain = this.gain0, cmean = this.mean0;
      // grain: band-limited Gaussian noise on tension
      const grain = P[PINDEX.grain] * GRAIN_SD;
      const nc = 1 - Math.exp(-TWO_PI * GRAIN_HZ / e.srOS), nNorm = Math.sqrt((2 - nc) / nc);
      let noise = this.noise;
      const s = this.s, invSub = 1 / sub, invSr = 1 / e.srOS;
      let x = s[0], y = s[1];
      for (let i = 0; i < nOS; i++) {
        ca += da; cb += db; cg += dg; cgain += dgain; cmean += dmean;
        let bb = cb, aa = ca;
        if (grain > 0) { noise += nc * (this.gauss() - noise); const n = grain * nNorm * noise; bb += n; aa += onSlope * n; }
        const h = cg * invSr * invSub, hh = 0.5 * h, h6 = h / 6;
        // RK4, written out (same arithmetic as rk4() above, in the same order)
        for (let k = 0; k < sub; k++) {
          const k1x = y, k1y = aa + bb * x + x * x - x * y - x * x * x - x * x * y;
          const x2 = x + hh * k1x, y2 = y + hh * k1y;
          const k2x = y2, k2y = aa + bb * x2 + x2 * x2 - x2 * y2 - x2 * x2 * x2 - x2 * x2 * y2;
          const x3 = x + hh * k2x, y3 = y + hh * k2y;
          const k3x = y3, k3y = aa + bb * x3 + x3 * x3 - x3 * y3 - x3 * x3 * x3 - x3 * x3 * y3;
          const x4 = x + h * k3x, y4 = y + h * k3y;
          const k4x = y4, k4y = aa + bb * x4 + x4 * x4 - x4 * y4 - x4 * x4 * x4 - x4 * x4 * y4;
          x = x + h6 * (k1x + 2 * k2x + 2 * k3x + k4x);
          y = y + h6 * (k1y + 2 * k2y + 2 * k3y + k4y);
        }
        out[i] += (x - cmean) * cgain;
      }
      // a runaway state (should never happen) is reset rather than allowed to blow up
      if (!(Math.abs(x) < 50 && Math.abs(y) < 50)) { x = 0; y = 0.01; }
      s[0] = x; s[1] = y;
      this.noise = noise;
      this.a0 = a; this.b0 = b; this.g0 = gamma; this.gain0 = gain; this.mean0 = q.mean;
      this.fNow = hz; this.regimeNow = reg; this.driveNow = d; this.sciNow = q.sci; this.gammaNow = gamma; this.subNow = sub;
    }
  }

  /* ---------- the engine ---------- */
  class SyrinxEngine {
    constructor(sampleRate, seed) {
      if (!MAP) throw new Error('Syrinx map missing: run node tools/make-maps.js');
      this.sr = sampleRate; this.srOS = sampleRate * OS;
      this.p = new Float64Array(PARAMS.length);
      PARAMS.forEach((d, i) => { this.p[i] = d.def; });
      this.fir = makeFir();
      this.hist = new Float32Array(FIR_LEN * 2); this.hw = 0;
      this.os = new Float32Array(BLOCK * OS);
      this.blkL = new Float32Array(BLOCK); this.blkR = new Float32Array(BLOCK); this.blkPos = BLOCK;
      this.ageCounter = 0; this.quietBlocks = 0;
      this.stack = [];
      this.bendNorm = 0; this.bendOct = 0;
      this.dc = { x: 0, y: 0, R: 1 - 2 * Math.PI * 10 / sampleRate };
      this.volSm = Math.pow(10, PARAMS[PINDEX.volume].def / 20);
      this.smooth = 1 - Math.exp(-BLOCK / (0.02 * sampleRate));
      const base = (seed >>> 0) || 0x9e3779b9;
      this.voices = [];
      for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new Voice(this, (base + i * 0x6d2b79f5) >>> 0));
      this.info = { voices: 0, idle: true };
    }

    static get LATENCY() { return BLOCK; }
    static get PARAMS() { return PARAMS; }

    setParam(id, v) {
      const i = PINDEX[id];
      if (i === undefined || !Number.isFinite(v)) return;
      const d = PARAMS[i];
      this.p[i] = clamp(d.step ? Math.round(v / d.step) * d.step : v, d.min, d.max);
      if (id === 'mode') this.allNotesOff();
    }
    getParam(id) { return this.p[PINDEX[id]]; }
    setBend(norm) { this.bendNorm = clamp(norm, -1, 1); }

    noteOn(note, vel) {
      if (vel <= 0) { this.noteOff(note); return; }
      if (this.p[PINDEX.mode] === 0) {
        const v = this.voices[0];
        const i = this.stack.indexOf(note); if (i >= 0) this.stack.splice(i, 1);
        this.stack.push(note);
        const legato = v.active() && v.held;
        v.setTarget(note, legato);
        if (!legato) v.trigger(vel);
        else v.vel = 0.2 + 0.8 * clamp(vel / 127, 0, 1);
        return;
      }
      for (const v of this.voices) if (v.active() && v.note === note) { v.setTarget(note, false); v.trigger(vel); return; }
      let pick = null;
      for (const v of this.voices) if (!v.active()) { pick = v; break; }
      if (!pick) { for (const v of this.voices) if (!v.held && (!pick || v.age < pick.age)) pick = v; }
      if (!pick) { for (const v of this.voices) if (!pick || v.age < pick.age) pick = v; }
      pick.setTarget(note, false);
      pick.trigger(vel);
    }
    noteOff(note) {
      if (this.p[PINDEX.mode] === 0) {
        const i = this.stack.indexOf(note); if (i >= 0) this.stack.splice(i, 1);
        const v = this.voices[0];
        if (!v.active() || v.note !== note) return;
        if (this.stack.length) v.setTarget(this.stack[this.stack.length - 1], true);
        else v.release();
        return;
      }
      for (const v of this.voices) if (v.note === note && v.held) v.release();
    }
    allNotesOff() { this.stack.length = 0; for (const v of this.voices) v.release(); }

    processBlock() {
      const d = this.dc;
      const busy = this.voices.some(v => v.stage !== 0);
      if (!busy && this.quietBlocks > 0 && Math.abs(d.y) < 1e-12 && Math.abs(d.x) < 1e-12) {
        // idle: nothing sounds and the filters are empty
        this.blkL.fill(0); this.blkR.fill(0); d.x = d.y = 0;
        this.info.voices = 0; this.info.idle = true;
        return;
      }
      this.bendOct = this.bendNorm * this.p[PINDEX.bendrange] / 12;
      this.volSm += (Math.pow(10, this.p[PINDEX.volume] / 20) - this.volSm) * this.smooth;
      const nOS = BLOCK * OS, o = this.os;
      o.fill(0);
      let count = 0;
      for (const v of this.voices) if (v.stage !== 0) { v.render(nOS, o); count++; }
      this.quietBlocks = count === 0 ? this.quietBlocks + 1 : 0;
      this.info.voices = count; this.info.idle = false;
      // decimate (symmetric FIR), DC block, volume, clip; mono for now, same on both sides
      const L = FIR_LEN, H = FIR_LEN / 2, h = this.fir, hs = this.hist, vol = this.volSm;
      let hw = this.hw;
      for (let j = 0, k = 0; j < BLOCK; j++) {
        for (let q = 0; q < OS; q++, k++) { hs[hw] = hs[hw + L] = o[k]; hw = hw + 1 === L ? 0 : hw + 1; }
        let acc = 0;
        for (let t = 0, u = hw + L - 1; t < H; t++, u--) acc += h[t] * (hs[hw + t] + hs[u]);
        const y = acc - d.x + d.R * d.y; d.x = acc; d.y = y;
        const s = y * vol;
        this.blkL[j] = this.blkR[j] = s > 1 ? 1 : s < -1 ? -1 : s;
      }
      this.hw = hw;
      if (Math.abs(d.y) < 1e-20) d.y = 0;
    }

    // host calls with any n; work happens in fixed BLOCK chunks
    process(outL, outR, n) {
      let pos = this.blkPos;
      for (let j = 0; j < n; j++) {
        if (pos === BLOCK) { this.processBlock(); pos = 0; }
        outL[j] = this.blkL[pos];
        if (outR) outR[j] = this.blkR[pos];
        pos++;
      }
      this.blkPos = pos;
    }
  }

  SyrinxEngine.BLOCK = BLOCK; SyrinxEngine.OS = OS;
  SyrinxEngine.toNorm = toNorm; SyrinxEngine.fromNorm = fromNorm;
  SyrinxEngine.lookup = (r, d) => lookup(r, d, {});
  if (typeof module !== 'undefined' && module.exports) module.exports = { SyrinxEngine, PARAMS, core };
  else root.SyrinxEngine = SyrinxEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
