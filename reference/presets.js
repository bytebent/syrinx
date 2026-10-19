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
    {
      name: 'Cardinal sweeps',
      about: 'Handoff: syllables sweep up from about 2 to 7 kHz, starting on the left side and finishing on the right.',
      params: { pattern: 1, sylrate: 3, duty: 0.75, shape: 1, sweep: 1.8, trill: 0, jitter: 0.1, minibreath: 0.6, regime: 0.2, link: 0.5, attack: 0.01, release: 0.05 },
      phrase: [[59, 0, 2.2]],
    },
    {
      name: 'Two voices',
      about: 'Interval mode, 7.3 semitones apart with some coupling: two lines and their sum and difference tones (thrasher, catbird).',
      params: { playmode: 1, interval: 7.3, coupling: 0.3, regime: 0.25, link: 0.4, attack: 0.03, release: 0.1 },
      phrase: [[60, 0, 0.8], [62, 0.9, 0.8], [57, 1.8, 1.0]],
    },
    {
      name: 'Canary trill',
      about: 'Pattern at 18 syllables per second, short down sweeps, minibreaths between syllables; the trill limit narrows the sweeps.',
      params: { pattern: 1, sylrate: 18, duty: 0.6, shape: 2, sweep: 1.2, trill: 1, jitter: 0.1, minibreath: 0.8, regime: 0.3, link: 0.5 },
      phrase: [[62, 0, 1.4], [58, 1.6, 1.2]],
    },
    {
      name: 'Chirr',
      about: 'Pulsatile phonation at 32 per second: too fast for minibreaths, so the source keeps going and only the gate pulses (cardinal chirr).',
      params: { pattern: 1, sylrate: 32, duty: 0.4, shape: 0, sweep: 0, jitter: 0.05, minibreath: 1, regime: 0.6, link: 0, transpose: 24 },
      phrase: [[60, 0, 1.5]],
    },
    {
      name: 'Ovenbird (Triple)',
      about: 'Labia and a tracheal membrane 3 semitones below: pulsing at low coupling, then locking into one lower tone as Coupling rises.',
      params: { topology: 2, membrane: -3, memlevel: 0.5, regime: 0.3, link: 0, transpose: 24, attack: 0.02, release: 0.1 },
      phrase: [[60, 0, 3.0]],
      sweep: { id: 'coupling', from: 0, to: 0.6 },
    },
    {
      name: 'Pulsing membrane',
      about: 'Triple with the membrane two octaves below: the membrane rides under the labial tone and the sound pulses.',
      params: { topology: 2, membrane: -22, memlevel: 0.6, coupling: 0.5, regime: 0.3, link: 0, transpose: 24, attack: 0.02, release: 0.1 },
      phrase: [[60, 0, 1.0], [55, 1.2, 1.0]],
    },
    {
      name: 'Rough folds (Single)',
      about: 'One source of two folds; Asymmetry rises from 0 to 1 until the folds stop locking and the tone turns rough (spot-winged pigeon).',
      params: { topology: 1, regime: 0.2, link: 0, transpose: 12, attack: 0.03, release: 0.1 },
      phrase: [[60, 0, 3.0]],
      sweep: { id: 'asym', from: 0, to: 1 },
    },
    {
      name: 'Kiskadee wobble',
      about: 'Superfast muscle modulation at 170 Hz on a rich note (kiskadee songs carry 160–190 Hz modulation).',
      params: { wobblerate: 170, wobble: 0.7, wobblefm: 0.2, regime: 0.6, link: 0, transpose: 24, attack: 0.02, release: 0.08 },
      phrase: [[57, 0, 0.6], [62, 0.7, 0.9]],
    },
    {
      name: 'Alternating sides',
      about: 'High whistles alternating between the sides every syllable, with Asymmetry colouring them (cowbird).',
      params: { pattern: 1, sylrate: 9, duty: 0.7, shape: 3, sweep: 0.4, sides: 3, asym: 0.6, jitter: 0.15, regime: 0, link: 0, transpose: 48 },
      phrase: [[60, 0, 1.6]],
    },
    {
      name: 'Jumps (tube sweep)',
      about: 'Jumps 1: a 3.3 kHz tone while the internal trachea lengthens from 4 to 7 cm; the pitch jumps where the tube round trip meets the period (Arneodo & Mindlin 2009).',
      params: { jumps: 1, trachea: 4, regime: 0, link: 0, filter: 0, attack: 0.02, release: 0.1 },
      phrase: [[68, 0, 3.0]],
      sweep: { id: 'trachea', from: 4, to: 7 },
    },
    {
      name: 'Screech (Chaos)',
      about: 'Chaos rising from 0 to 1 on a low note: the second side opens, feedback and coupling grow, and the tone breaks into a harsh, aperiodic call (cockatoo).',
      params: { regime: 0.5, attack: 0.02, release: 0.1 },
      phrase: [[36, 0, 3.0]],
      sweep: { id: 'chaos', from: 0, to: 1 },
    },
    {
      name: 'Filter off / on',
      about: 'The same rich phrase twice: raw source, then through the internal trachea and the tracking resonance.',
      params: { regime: 0.6, link: 0, transpose: 24, filter: 0, attack: 0.02, release: 0.08 },
      phrase: [[60, 0, 0.5], [64, 0.55, 0.5], [67, 1.1, 0.7], [60, 2.0, 0.5], [64, 2.55, 0.5], [67, 3.1, 0.7]],
      switchAt: { time: 1.9, id: 'filter', value: 1 },
    },
    {
      name: 'Locked trill (Stepped)',
      about: 'Lock on, Glide style Stepped: a trill whose up-sweeps run in semitone steps, over a C major arpeggio.',
      params: { lock: 1, glidestyle: 1, pattern: 1, sylrate: 10, duty: 0.7, shape: 1, sweep: 0.42, regime: 0.2, attack: 0.01, release: 0.08 },
      phrase: [[60, 0, 0.8], [64, 0.8, 0.8], [67, 1.6, 0.8], [72, 2.4, 1.0]],
    },
    {
      name: 'Locked song (Smooth)',
      about: 'Lock on, Glide style Smooth: swooping syllables that leave and land exactly on the notes of a melody.',
      params: { lock: 1, pattern: 1, sylrate: 5, duty: 0.75, shape: 3, sweep: 0.25, jitter: 0.3, attack: 0.01, release: 0.1 },
      phrase: [[67, 0, 0.6], [69, 0.6, 0.6], [67, 1.2, 0.6], [64, 1.8, 1.2], [62, 3.0, 0.6], [60, 3.6, 1.0]],
    },
    {
      name: 'Coupled sixth (Lock off → on)',
      about: 'Two sides a major sixth apart at Coupling 1: out of tune and rough with Lock off; Lock switches on at 2.1 s and the keeper pulls both onto their notes.',
      params: { playmode: 1, interval: 9, coupling: 1, attack: 0.02, release: 0.1 },
      phrase: [[55, 0, 2.0], [55, 2.1, 2.0]],
      switchAt: { time: 2.05, id: 'lock', value: 1 },
    },
    {
      name: 'Size sweep (Lock)',
      about: 'Size from wren to crane with Lock on: the bird drops in whole octaves, its trill slowing as Tempo lock is 50%.',
      params: { lock: 1, pattern: 1, sylrate: 12, shape: 2, sweep: 0.5, size: 0, tempolock: 0.5, attack: 0.02, release: 0.1 },
      phrase: [[60, 0, 4.0]],
      sweep: { id: 'size', from: 0, to: 1 },
    },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = { PRESETS };
  else root.SyrinxPresets = PRESETS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
