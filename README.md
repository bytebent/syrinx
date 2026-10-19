# Syrinx

A bird voice synth by bytebent. Each voice is a syrinx: one, two or three sound sources, each a
small nonlinear oscillator driven by air pressure and labial tension, the way birds make sound.
Low notes start pulse-like and rich, high notes start as near-pure tones, the two sides of the
syrinx hand a sweep between them, and coupled sources lock, beat and pulse on their own.

Syrinx makes the sound. Its partner, [beak-tube](https://github.com/bytebent/beak-tube), is a
separate effect that shapes any audio like a bird's trachea, throat and beak. They work alone or
together, the way Throat and mouth-tube do.

Status: **design**. Nothing is built yet. The reference engine and browser bench come first,
then the C++ port and the JUCE plugin.

## Files

- `design.md`: what Syrinx is and how it works, with every parameter
- `plan.md`: build batches, in order
- `research.md`: the papers behind the design and the numbers taken from them

The design is shared with beak-tube in the doc *Syrinx and beak-tube: design and architecture*.
`design.md` is this repo's copy of the Syrinx half.

## Planned layout

- `reference/syrinx-engine.js`: the reference engine; defines the sound
- `reference/syrinx-maps.js`: generated map of pitch and spectral content over the model's
  pressure–tension plane
- `reference/presets.js`: test presets (bench and tests only)
- `source/SyrinxDSP.h`: C++ port, real-time safe, no JUCE dependency
- `source/PluginProcessor.*`, `source/PluginEditor.*`, `ui/index.html`: JUCE instrument and its
  web-view interface
- `tests/`: engine tests, C++ against reference comparison, plugin wrapper test
- `tools/`: bench (`syrinx.html`), map generator, performance and preset renders

## License note

The plugin will be built with [JUCE](https://juce.com) 8, which is available under the AGPLv3
or a commercial licence. Keeping this repository public and open source satisfies the AGPL.
