# Syrinx · tests

Quick results per batch: tests, experiments and pictures. Pictures live in `docs/tests/`. Run the
tests with `node tests/engine-test.js`.

**Now: 17 engine tests passing** (about 3 s).

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
