# Syrinx

A bird voice synth by bytebent. Each voice is a syrinx: one, two or three sound sources, each a
small nonlinear oscillator driven by air pressure and labial tension, the way birds make sound.
Low notes start pulse-like and rich, high notes start as near-pure tones, the two sides of the
syrinx hand a sweep between them, and coupled sources lock, beat and pulse on their own.

Syrinx makes the sound. Its partner, [beak-tube](https://github.com/bytebent/beak-tube), is a
separate effect that shapes any audio like a bird's trachea, throat and beak. They work alone or
together, the way Throat and mouth-tube do.

Status: **prototype, batch 03 of 11**. The source core of the reference engine works: one
oscillator per voice, in tune to 0.04 cent from pure tone to buzz, with Regime, Link, Grain,
Breath bend, Pressure and the envelope. Sides, patterns, coupling and the bench come next; then
the C++ port and the JUCE plugin.

## Try it

Needs Node 18 or newer. No packages to install.

```sh
node tests/engine-test.js        # engine tests
node tools/render-presets.js     # test presets → renders/*.wav
node tools/make-maps.js          # rebuild the map (about 2 minutes; only after changing the model)
node tools/perf.js               # CPU per scenario
```

## Performance

`node tools/perf.js` prints how much of one CPU core each scenario needs at 48 kHz. On a 2.1 GHz
Xeon core: about 2% per voice at the defaults, 11% for one voice at the worst case (a rich 2.5 kHz
note at Pressure 0 with Link off), 40% for four such voices. The cost is set by the physics:
rich notes need many small integration steps. C++ is no faster per source, but independent
sources interleave almost for free, which batch 04 and the C++ port use.

## Files

- `design.md`: what Syrinx is and how it works, with every parameter
- `plan.md`: build batches, in order
- `research.md`: the papers behind the design and the numbers taken from them
- `tests.md`: test and experiment results per batch, with pictures in `docs/tests/`

The design is shared with beak-tube in the doc *Syrinx and beak-tube: design and architecture*.
`design.md` is this repo's copy of the Syrinx half.

## Layout

- `reference/syrinx-engine.js`: the reference engine; defines the sound
- `reference/syrinx-maps.js`: generated map of frequency, spectral content and level over the
  oscillator's control plane (by `tools/make-maps.js`)
- `reference/presets.js`: test presets (renders and tests only)
- `tests/engine-test.js`: engine tests
- `tools/make-maps.js`, `tools/render-presets.js`, `tools/perf.js`: map generator, preset renders, benchmark

Later (see `plan.md`): `source/` (C++ port and JUCE instrument), `ui/`, `tools/bench/`
(`syrinx.html`), `packaging/`, CI.

## License note

The plugin will be built with [JUCE](https://juce.com) 8, which is available under the AGPLv3
or a commercial licence. Keeping this repository public and open source satisfies the AGPL.
