# Syrinx · tests

Quick results per batch: tests, experiments and pictures. Pictures live in `docs/tests/`. Run the
tests with `node tests/engine-test.js`.

**Now: 17 engine tests passing** (about 3 s). Benchmark: `node tools/perf.js`.

## Batch 02 · source core

Experiments before building:

- Mapped the oscillator over tension and pressure: tonal (Hopf) below β ≈ −0.25, rich near onset
  above it (SNILC), as in Perl et al. 2011, Fig. 4.
- Onset line has a closed form; matches the numerical onsets within the scan step.
- One attractor past onset (start state doesn't matter). Above onset, near β = −0.2, the cycle
  coexists with rest (the homoclinic region), so notes start from rest.
- RK4 pitch error vs step: under 0.03 cent at step 0.1 everywhere, 4–26 cents at 0.3–0.4 on the
  sharpest pulses. Chose RK4, step ≤ 0.1.

![map](docs/tests/02-map.png)

Tests:

- Map: Hopf onset is a quiet pure tone, SNILC onset is near zero frequency and rich (content 17). ✓
- Onset line is where oscillation starts (from rest). ✓
- Pitch within 1 cent across Regime and four notes: worst 0.04 cent. ✓
- Pitch within 1 cent across Pressure: worst 0.004 cent. ✓
- Regime: content 1.04 → 1.91 → 7.96. ✓
- Link, finch fingerprint: content 8 at 500 Hz, 1.9 at 1.5 kHz, 1.04 at 2.5 kHz. ✓
- Same output at buffer sizes 1, 64, 1000. ✓
- No NaN; peaks 0.13–0.50 across Regime and pitch. ✓
- Release ends in silence; engine goes idle. ✓
- Grain: pitch within 0.05 cent at the default, smeared by about 34 cents at full. ✓
- Breath bend starts 1152 cents low with a slow attack. ✓
- Pitch bend, mono glide, poly chord. ✓

Problems found and fixed:

- 8 kHz rich notes aliased: added a band limit (content ≤ 15 kHz ÷ pitch, by adding drive).
- 2-cent map error between rows: interpolation made cubic in both directions, one-sided at the
  Hopf/SNILC corner. Map now agrees with direct integration to 0.01 cent.
- Grain pulled pitch flat by moving the onset: noise now moves along the onset line.
- Pressure barely changed a buzz: widened Pressure to 8 octaves of drive.

Renders (`tools/render-presets.js`), 2–8% of real time each in JavaScript:

![presets](docs/tests/02-presets.png)

After widening Pressure (Buzz, Link, Pressure swell):

![pressure widened](docs/tests/02-pressure-widened.png)

**You:** listen to the renders.

## Batch 03 · cost

- Worst case over notes, Regime and Pressure (Link off): 19 sub-steps per 4× sample, a rich
  2.5 kHz note at Pressure 0. The 48-step cap is never reached (the band limit keeps it under 20).
- Integrators at equal accuracy (0.05 cent): RK4 needs 3–10× fewer evaluations than RK2 or RK3;
  semi-implicit Euler can't hold pitch at any practical step. Kept RK4.
- RK4 step vs worst pitch error over the map: 0.1 → 0.10 cent, 0.125 → 0.26, 0.15 → 0.57,
  0.2 → 1.9. Kept 0.1 (larger saves little).
- `tools/perf.js` (one 2.1 GHz Xeon core, 48 kHz):

  | Scenario | CPU |
  |---|---|
  | Silent | 0.1% |
  | 1 voice, tonal | 1.4% |
  | 1 voice, defaults | 2.1% |
  | 1 voice, rich low | 3.0% |
  | 1 voice, worst case | 10.8% |
  | 4 voices, defaults | 6.3% |
  | 4 voices, worst case | 40.0% |

- The same worst-case loop in C++: 9.5% (no faster: each step waits on the last).
- Interleaving independent oscillators in one loop: C++ 1, 2, 4, 8 sources = 9.9, 9.5, 11.1,
  16.6%; JS = 11.4, 11.0, 17.8, 48.5%. Decided: all sources of a voice share one loop.
- Inlining RK4 by hand in JS: about 5% faster (V8 already inlined it). Kept.
- Decided: Poly has 4 voices.
