# Syrinx · build plan

Reference engine and bench first, then the C++ port and the plugin. Design: `design.md`.

Each batch ends with passing tests and a commit authored as
`bytebent <bytebent@users.noreply.github.com>`. Nothing moves to the next batch until you've
checked the one before where it says **You**.

## Layout

```
reference/
  syrinx-engine.js   the reference engine; defines the sound
  syrinx-maps.js     generated (P, k) map: frequency, spectral content, level
  presets.js         test presets (bench and tests only)
source/
  SyrinxDSP.h        C++ port, no JUCE
  PluginProcessor.*  JUCE instrument: MIDI in, stereo out
  PluginEditor.*     web-view host
  PresetManager.h    saving and loading presets
ui/index.html        interface (also opens in a browser)
tests/               engine-test.js, compare.js + dsp_cli.cpp, plugin_test.cpp
tools/
  bench/             bench template, AudioWorklet wrapper, build script → syrinx.html
  make-maps.js       integrates the oscillator over the (P, k) grid
  perf.js            CPU per scenario
  render-presets.js  every test preset to a WAV
packaging/           Mac installer
.github/workflows/   CI: tests, universal binary, auval, pluginval strictness 7
```

## Batches

| # | Batch | Contents | Check | State |
|---|---|---|---|---|
| 01 | **Setup** | `README.md`, `design.md`, `plan.md`, `research.md`, `.gitignore`. | | Done |
| 02 | **Source core** | One oscillator, `make-maps.js` and the map, γ set per block from the note, Regime and Link, Grain, Breath bend. Test runner. | Tests: pitch within 1 cent across all of Regime; spectral content falls from rich to tonal as in Sitt et al. 2008; the map shows the Hopf and SNILC lines of Perl et al. 2011, Fig. 4 · **You:** listen to `tools/render-presets.js` | Done: pitch within 0.04 cent; content 8 at 500 Hz → 1.04 at 2.5 kHz |
| 03 | **Cost** | `perf.js` at the worst case (all sources, high notes, Mono and Poly, Jumps on). Decides the integrator, the sub-step rule and the Poly voice count. | Numbers in the README | Done: RK4 at step ≤ 0.1; sources of a voice interleaved in one loop; Poly 4 voices |
| 04 | **Sources** | Topology (Duplex, Single, Triple), play modes, Split and Overlap, Asymmetry, Coupling through the shared tube, the Triple membrane. All sources of a voice in one interleaved loop (batch 03). | Tests: Handoff switches side at Split; anti-phase locking halves the period; detuned coupled sides show sum and difference tones; Triple reproduces Garcia et al.'s pulsing and locking | |
| 05 | **Breath and patterns** | Pressure envelope, minibreaths, gating, Wobble, the pattern engine and the trill limit. | Tests: syllable timing exact at any buffer size; gating stops sound while pressure stays up; the trill limit follows Podos's line | |
| 06 | **Nonlinear set** | Internal trachea and Jumps, Chaos, the Filter switch. | Test: a slow trachea sweep near the period jumps, with hysteresis | |
| 07 | **Musical lock** | Lock, Glide style, the pitch keeper, tempo sync of sweeps. | Tests: locked syllables start and end within 1 cent of a semitone; Stepped passes only semitones; the keeper holds within 5 cents at full Coupling | |
| 08 | **Bench** | `syrinx.html`: keyboard as on the other benches, test presets, DSP meter. | **You:** first listening round; decide LFOs and the Lock default | |
| 09 | **C++ port** | `SyrinxDSP.h`, `dsp_cli.cpp`, `compare.js`. | Tests: C++ matches the reference | |
| 10 | **Plugin** | JUCE wrapper, web-view UI, presets, installer, CI. | CI green · **You:** play it in a host | |
| 11 | **Listening round** | Tuning defaults and ranges from what you hear. | **You** | |
