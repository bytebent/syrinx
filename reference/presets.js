// Test presets: for the bench and the tests only, not the plugin build.
// Each has the settings and a short phrase (notes in MIDI numbers, times in seconds).
(function (root) {
  'use strict';
  const PRESETS = [
    {
      name: 'Whistle (Hopf)',
      about: 'Regime 0, Link off: born as a pure tone, harmonics only with drive.',
      params: { regime: 0, link: 0, grain: 0.05, attack: 0.03, release: 0.08 },
      phrase: [[60, 0, 0.6], [64, 0.7, 0.6], [67, 1.4, 1.0]],
    },
    {
      name: 'Buzz (SNILC)',
      about: 'Regime 1, Link off: born pulse-like and rich at every pitch.',
      params: { regime: 1, link: 0, grain: 0.1, attack: 0.01, release: 0.05, transpose: 24 },
      phrase: [[60, 0, 0.6], [64, 0.7, 0.6], [67, 1.4, 1.0]],
    },
    {
      name: 'Regime sweep',
      about: 'One held note while Regime moves from 0 to 1 (set by the render script).',
      params: { regime: 0, link: 0, grain: 0.1, attack: 0.02, release: 0.1, transpose: 24 },
      phrase: [[60, 0, 3.0]],
      sweep: { id: 'regime', from: 0, to: 1 },
    },
    {
      name: 'Link (finch fingerprint)',
      about: 'Default Regime and Link: low notes buzz, high notes whistle. A scale over four octaves.',
      params: {},
      phrase: [36, 43, 48, 55, 60, 67, 72, 79].map((n, i) => [n, i * 0.35, 0.3]),
    },
    {
      name: 'Pressure swell',
      about: 'A rich note while Pressure rises: the pulses smooth out as drive grows.',
      params: { regime: 0.9, link: 0, grain: 0.1, attack: 0.02, release: 0.1, transpose: 24 },
      phrase: [[55, 0, 3.0]],
      sweep: { id: 'pressure', from: 0, to: 1 },
    },
    {
      name: 'Breath bend',
      about: 'Slow attack with Breath bend: each note rises into pitch as pressure builds.',
      params: { breathbend: 0.5, attack: 0.25, release: 0.15, regime: 0.2 },
      phrase: [[62, 0, 0.8], [69, 1.0, 0.8], [65, 2.0, 1.0]],
    },
    {
      name: 'Grain',
      about: 'Grain at maximum on a middle Regime.',
      params: { grain: 1, regime: 0.5, link: 0, attack: 0.02, release: 0.1, transpose: 30 },
      phrase: [[60, 0, 1.2], [55, 1.4, 1.2]],
    },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = { PRESETS };
  else root.SyrinxPresets = PRESETS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
