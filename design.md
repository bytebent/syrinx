# Syrinx · design

A playable bird voice. MIDI in, stereo audio out. Each voice is a syrinx with one, two or three
sound sources; each source is a two-variable nonlinear oscillator (the normal form of the
Mindlin group's labial model). Breath, gating and a syllable pattern engine shape it in time.

Labels: **[Decided]** you chose it, **[Proposed]** suggested and not yet confirmed, **[Open]**
still to decide. Sources for every number are in `research.md`.

---

## 1. What it is

- An **AU/VST3 instrument for macOS** plus a standalone app, like Throat and Dolphin. [Decided]
- It makes the sound only. Shaping by a bird's trachea, throat and beak is **beak-tube**, a
  separate effect in its own repo. Only audio passes between them. [Decided]
- It still **sounds like a bird on its own**: the Filter switch (on by default) adds a short
  internal trachea and a light resonance that follows the pitch. Off sends the raw source, for
  beak-tube. [Decided]
- Built the bytebent way: JavaScript reference engine and browser bench first, then the C++
  port, then the JUCE plugin. [Decided]

## 2. Signal flow

```
MIDI ─► notes and play mode ─► breath and patterns ─┬─► left side  ─┐
                                                    ├─► right side ─┼─► shared trachea ─► Filter on/off ─► out
                                                    └─► membrane   ─┘        │
                                         (Triple only)          ▲            │
                                                                └─ Coupling / Jumps (feedback)
```

## 3. The source model

Each source is one normal-form oscillator, in the form used by Amador, Mindlin & Elemans 2025 and
Perl et al. 2011. x is the midpoint position of the labia, P is proportional to bronchial
pressure, k to labial tension, γ is a time scale:

```
dx/dt = y
dy/dt = −P·γ² − k·γ²·x − γ²·x³ − γ·x²·y + γ²·x² − γ·x·y
```

The output is x with its DC removed (the airflow the labia let through).

- **Pitch from γ, timbre from (P, k).** γ only rescales time, so the frequency is exactly γ times
  the frequency the same (P, k) gives at γ = 1. A precomputed map of frequency, spectral content
  and level over the (P, k) plane (`reference/syrinx-maps.js`, made by `tools/make-maps.js`) lets
  the engine pick (P, k) from the timbre controls and then set γ every 32-sample block so the note
  comes out exactly in tune. [Decided]
- **Regime** moves the note along a fixed path in the map: 0 is the Hopf side (born as a pure
  tone that gains harmonics as it grows), 1 is the SNILC side (born pulse-like and rich, purer
  further from threshold). [Decided]
- **Link** makes Regime follow the note: in zebra finch song, notes below about 1.5 kHz are rich
  and notes above it are nearly pure. With Link up, low notes buzz and high ones whistle; Link 0
  frees Regime. [Proposed default 0.7]
- **Grain** adds noise to tension, which made Perl et al.'s synthetic song sound more natural.
- **Breath bend** lets pressure bend pitch, after the great kiskadee, whose pitch follows air sac
  pressure rather than muscle. A direct pitch offset, an approximation.
- **Integration:** RK4 at 4× the host rate, with enough sub-steps to keep each step at or below
  0.1 model time units: n = ceil(γ / (4 × host rate × 0.1)), at most 48. Worst pitch error over
  the whole map is 0.1 cent. RK4 needs 3–10 times fewer evaluations than RK2 or RK3 for the same
  accuracy; semi-implicit Euler cannot hold pitch at any practical step. [Decided, batch 03]

**How the controls reach the model** (batch 02):

- The onset line is exact: Hopf at α = 0 for β ≤ −0.25, otherwise the saddle-node of the fixed
  points, where the rest state is destroyed (SNILC). Drive is measured past this line.
- Regime r sets β = −0.4 + 0.8·r and the drive at default Pressure and full envelope:
  0.15·(0.001/0.15)^r. Regime 0 is a tonal Hopf tone; Regime 1 sits just past the SNILC line,
  rich and pulse-like.
- Pressure scales the drive over 8 octaves (×2^(8·(p − 0.7))); the envelope scales it between
  0.3 and 1. On the rich side more drive smooths the pulses; on the tonal side it adds level and a
  little brightness. The envelope also sets the output level, since a SNILC tone starts at full
  amplitude.
- Link pulls Regime towards 1 below 1 kHz and towards 0 above 2.25 kHz (log scale between).
- Band limit: spectral content is held at or below 15 kHz ÷ pitch by adding drive, so very high
  rich notes stay below the oversampled Nyquist.
- Grain moves tension along the onset line (so the drive stays put), band-limited to 1 kHz.
- Levels are evened by RMS to the power 0.7, as in Throat.
- The map (49 Regime rows × 97 drive columns, square-root spaced) is read with Catmull-Rom
  interpolation; no stencil crosses the Hopf/SNILC corner, which sits exactly on a row. Map and
  direct integration agree to 0.01 cent.

## 4. Sources and play modes

**Topology** [Decided: all three from the start]

- **Duplex** (default): two independent sides, Left and Right, as in songbirds. Each has its own
  γ, tension and gate.
- **Single:** one source of two folds, as in pigeons, doves and parrots. The folds are tied
  through their velocities (dissipative coupling, which favours moving together and vanishes when
  they do), so they sound as one tone. Asymmetry detunes them around the note, with the square of
  the knob up to 3 semitones: in tune at small values, slipping into the roughness and sidebands
  of spot-winged pigeons from about 0.5 (tonal) to 0.7 (rich). [Decided, batch 04: position
  coupling made the folds lock in anti-phase and cancel]
- **Triple:** as in the tracheophone suboscines (Garcia et al. 2017). The two sides move together
  as one labial source, and a tracheal membrane is a second, lower oscillator with a pulse-like
  wave (a strongly nonlinear van der Pol oscillator). Each one's driving pressure is nudged by the
  other's position. Far apart in pitch, the membrane modulates the labial tone and the sound
  pulses (up to 650 Hz in the rufous ovenbird); close in pitch, the two lock into a louder tone
  between them. Rising pressure can carry a note from pulsing to locking. Membrane sets its pitch
  from the note, Membrane level its pressure (0 stops it). Garcia et al.'s model code is at
  github.com/gabomindlin/tracheophones. The membrane here is z'' = 3(μ − z²)z' − z, its frequency
  table built at load; the labia's drive is nudged by the membrane's position, the membrane's μ
  by the labia's (as Garcia et al.'s μ1 − 0.25·x2 and μ2 + 0.1·x1).

**Play modes** (Duplex)

| Mode | What a key does | Bird behaviour it plays |
|---|---|---|
| Handoff (default) | One note. Below Split the left side sings, above it the right; a glide crosses over inside the Overlap band | Cardinal: below about 3.5 kHz left, above right, switched mid-sweep |
| Interval | Left plays the note, right plays it at a fixed offset | Thrasher and catbird two-voice syllables, seldom harmonically related |
| Duo | The two lowest held notes go to left and right | Two independent lines |
| Independent | MIDI channel 1 to the left side, channel 2 to the right | Sequencing two voices |

In Single and Triple the play modes do not apply: a key sets the source's pitch. Duo and
Independent play one voice with a note per side; Poly applies to Handoff and Interval.

Split defaults to 3.5 kHz (cardinal; scaled by Size). Interval defaults to +7.3 semitones, a
deliberately non-harmonic offset. **Asymmetry** makes the sides differ in tension offset, Regime
and level, so a handoff changes colour slightly, as in real birds.

**Coupling** (Laje & Mindlin 2005). The sides meet in a shared pressure at the base of the
trachea. Each side pushes pressure into the tube in step with its movement; the tube reflects it
back, and it acts on the pressure driving both sides. Coupling scales the push, Jumps scales the
reflection. Even with no reflection the sides interact:

- close in pitch, they lock;
- locked half a cycle apart, the summed period halves, and a switch between anti-phase and
  in-phase locking sounds like period doubling without being one (zebra finch);
- apart in pitch, the output carries sums and differences of multiples of both pitches, heard as
  sidebands (black-capped chickadee).

Which locking wins comes out of the dynamics; there is no Phase control. [Decided]

In the engine each source's drive gets Coupling × (its drive + 0.002) × the other sources'
normalized positions, taken from the previous sample. Measured (batch 04): Coupling 0.1 locks
tonal sides up to about 50 cents apart; rich sides resist more. Identical tonal sides lock in
anti-phase at weak coupling (the sum's period halves) and in phase from about 0.3. Strong
coupling pulls both pitches off their notes (Lock's pitch keeper, batch 07, holds them).

## 5. Breath, gating and patterns

- **Breath.** Pressure sets how far past the onset threshold the sources are driven. The ADSR
  shapes pressure, not output level, so a slow attack crosses the threshold audibly.
- **Minibreaths.** Between syllables, pressure dips below the threshold. Minibreath sets the
  depth. Canaries take minibreaths in trills slower than about 27 per second and pulse one long
  breath in faster trills, so Minibreath fades out above about 30 per second.
- **Gating.** Each side can be shut while pressure stays up (dorsal syringeal muscles), by moving
  that source back across its threshold. Several syllables can come from one breath. Gating is
  sample-accurate, so it can pulse. In the engine a closed side's drive goes past onset and its
  output is muted; between syllables the output is muted while the source keeps going, unless
  Minibreath drops the drive too, which stops the source so the next syllable starts physically.
  Gates take at most 1.5 ms, less for short syllables.
- **Wobble.** Superfast syringeal muscles modulate airflow up to about 250 Hz; the kiskadee's
  songs carry 160–190 Hz amplitude modulation from them. Wobble is a per-side modulator, 0–250 Hz,
  with Amount and a mix between amplitude and pitch modulation.
- **Pattern engine.** With Pattern on, a held key sings syllables:
  - Rate 0.5–60 per second, free or synced to tempo.
  - Duty: the sound share of each cycle.
  - Shape (Flat, Up, Down, Convex, Concave, Wave, as Dolphin's whistle) and Sweep in octaves.
  - Sides: Auto (by Split), Left, Right or Alternate (the cowbird's left–right exchange).
  - Trill limit: at 1, each syllable's sweep stays under Podos's upper bound, bandwidth (kHz) =
    7.55 − 0.124 × rate (Hz): about 6.3 kHz at 10 per second, 2.6 kHz at 40. At 0 it is off.
  - Jitter: small seeded changes in timing and pitch per syllable.

## 6. Rough sounds

Roughness comes from what birds are known to do, not from one Chaos knob. One oscillator has two
state variables and cannot be chaotic, and confirmed chaos is rare in birds (Amador, Mindlin &
Elemans 2025).

| Sound | Mechanism | Controls |
|---|---|---|
| Buzzy, pulse-like low notes | SNILC onset | Regime, Link |
| Sidebands | Two sides at different pitches, coupled | Coupling, Interval |
| Roughness from one source | Two folds that fail to lock | Asymmetry (Single) |
| Apparent period doubling | Anti-phase locking switching to in-phase | Coupling |
| Pulsing, or a louder locked low tone | Labia and membrane coupled | Triple, Membrane, Coupling, Pressure |
| Fast throb | Superfast muscle modulation | Wobble |
| Frequency jumps | Tube feedback when its round trip is near the note's period | Jumps, Trachea |
| Breathy grain | Noise on tension | Grain |
| Chaos | Strong coupling plus feedback | Chaos (off by default) [Decided] |

**Jumps** (Arneodo & Mindlin 2009): when the tube's round trip, 2L/c, is close to the source's
period, two stable periods coexist; slowly lengthening the tube from 5.01 to 5.4 cm in their
simulation produced a jump in frequency. The internal trachea is the same shared tube that
couples the sides: Trachea sets its length and Jumps the reflection (Laje & Mindlin's standard
values: 2 cm and 0.9). It is the only place the tract acts back on the source.

How it is built (batch 06):

- The tube is a delay line per voice with round trip 2L/c (c = 350 m/s) and a wall-loss low-pass
  at 10 kHz. Its far end reflects 0.5 + 0.45 × Jumps of the wave (up to 0.95 with Chaos).
- What comes back drives the sources with strength 0.3 × Jumps² + 0.3 × Chaos. Squared because a
  linear scale pulled the pitch hundreds of cents at mid settings: now Jumps 0.3 pulls about 10
  cents, 0.6 bends the pitch smoothly by tens of cents, and near 1 the pitch jumps by up to an
  octave and stays on its branch until the tube moves back past the other edge (hysteresis).
- **Chaos** does three things at once: it lifts Regime (after Link) toward the rich side, opens the
  silent side in Handoff 3.3 semitones away (a non-harmonic interval), and adds coupling and tube
  feedback. One source with feedback stayed periodic in every test; two rich, coupled, detuned
  sources break up. Limit: above about 2 kHz the band limit keeps the source near-pure, so Chaos
  has little effect on high notes.
- **Filter** sends what the tube transmits (instead of the raw source), then a band-pass that
  tracks the note (Q 2.5, 70% mix). The level stays within about ±7 dB of Filter off, depending on
  where the note falls against the tube's resonances; batch 11 can smooth this if it matters.

## 7. Musical lock

With Lock on, every pitch lands on a semitone, so Syrinx plays with ordinary music while keeping
bird-speed sweeps and trills. There is no key or scale: the notes played choose the harmony.
[Decided]

| What moves pitch | Lock off | Lock on |
|---|---|---|
| Syllable sweep | Any extent | Whole semitones, starting and ending on one |
| How a sweep travels | Smooth | Glide style: Smooth (lands exactly) or Stepped (a fast chromatic run, each step on pitch) |
| Interval offset | Free | Whole semitones |
| Pattern jitter | Cents | Whole semitones, or none |
| Breath bend | Bends with pressure | A scoop during the attack only |
| Wobble (pitch part) | Free | Vibrato around a centre on the note |
| Jumps, Coupling, Chaos | Free | The pitch keeper pulls each source back onto its note |
| Size | Continuous | Whole octaves |
| Pitch bend wheel | Free | Free |

**Pitch keeper:** each source measures its actual period every block and corrects γ. A jump then
becomes a short break that settles back on the note. With Sync on, syllable rate and sweep time
follow the host tempo.

How it is built (batch 07):

- The keeper counts the periods a source really makes, through a band-pass on its own pitch (Q 8,
  so the other side's tone adds no crossings), against the cycles its commanded pitch should make
  over the same stretch. Both count the same stretch, so sweeps and Wobble do not fool it. It
  measures over 8 periods and corrects a little each period. After a step in the target (a
  Stepped run, a syllable start) it starts over and skips 4 periods while the band-pass settles.
- Single measures its two folds together; Triple keeps the labia on the note and lets the
  membrane lock to them.
- A correction is limited to 3 semitones. A source still off at that limit has been captured,
  usually by the other side in a close interval: it stays there, moved onto the nearest semitone
  (two sides a whole tone apart high up merge into a unison on the upper note).
- With Lock on, **Coupling covers 0–0.35** of its unlocked strength and **Jumps 0–0.7**. Above
  that the keeper could not hold: the sides lock onto one pitch and wobble, or the tube owns the
  pitch and γ no longer steers it. So "a jump to the nearest semitone" from the first design is
  dropped: under Lock a jump is always a short break that settles back.
- The keeper holds both sides within about 1 cent at full Coupling (all intervals from a minor
  third to an octave, across the range), Triple and Single within 0.1 cent. A coupled fifth beats
  slowly, like a tempered fifth on any instrument: the sides would lock to a pure 3:2, 2 cents wider.
- Sync keeps syllables on the beat grid, so Jitter no longer moves their timing; Lock removes its
  pitch part. The Stepped run's speed follows Sweep (and Glide): no own control. [Decided]
- Strong Coupling could freeze a tonal side while the other buzzed at a few hundred Hz (with or
  without Lock). The push from the other sources now never swings the drive by more than 80% of
  itself; nothing else changes below Coupling 0.4.

[Open] Whether Lock defaults to On.

## 8. Size

Size (0–1) moves the keyboard's pitch range, Split, and the band where Link turns rich into
tonal; beak-tube's Size scales its tube to match. Regime, Coupling and Wobble rate stay put.

- Songbird (about 0.25, default): cardinal sweeps of 1–9 kHz, split near 3.5 kHz.
- Dove: a coo of about 600 Hz.
- Large bird (1): calls of about 0.5–1 kHz (Fitch 1999 lists 131 Hz to 1.4 kHz for geese,
  swans and cranes). Pitch comes from the syrinx, not the trachea, so Syrinx's pitch and
  beak-tube's trachea length can be pushed apart freely.

Built in batch 07: Size moves pitch by −(Size − 0.25) × 8/3 octaves (wren +⅔ octave, crane −2
octaves), whole octaves with Lock, and moves Split, the Link band and the internal trachea with it.

**Tempo lock** decides what Size does to timing: at 100% syllable rate and sweep speed stay; at
0% they slow with size. Default 50%. [Open: needs a listening test] Playing lower notes or
Transpose never changes timing.

## 9. Parameters

44 parameters plus the 2 of Musical lock, all in the reference engine since batch 07. Same id style and knob curves as Dolphin. LFOs:
[Open] decided after testing. Defaults are design values to tune by ear unless the text gives a
source. Ranges may go somewhat past nature.

| Group | id | Range | Default | What it does |
|---|---|---|---|---|
| Source | `topology` | Duplex, Single, Triple | Duplex | Number and kind of sources |
| | `membrane` | −48 to +12 st | −24 st | Triple: membrane pitch from the note |
| | `memlevel` | 0–1 | 0.5 | Triple: membrane pressure |
| | `regime` | 0–1 | 0.3 | Hopf (tonal) to SNILC (pulse-like) |
| | `link` | 0–1 | 0.7 | How much Regime follows the note |
| | `grain` | 0–1 | 0.15 | Noise on tension |
| | `breathbend` | 0–1 oct | 0 | How far pressure bends pitch |
| Sides | `playmode` | Handoff, Interval, Duo, Independent | Handoff | How keys reach the sides |
| | `split` | 0.5–8 kHz, log | 3.5 kHz | Handoff point (scaled by Size) |
| | `overlap` | 0–1.5 kHz | 0.3 kHz | Crossover band |
| | `interval` | −24 to +24 st | +7.3 st | Right side offset in Interval mode |
| | `asym` | 0–1 | 0.2 | How much the sides (or folds) differ |
| | `balance` | −1 to +1 | 0 | Left–right level |
| | `coupling` | 0–1 | 0.1 | How much each source pushes into the shared tube |
| Nonlinear | `jumps` | 0–1 | 0 | Reflection at the tube's far end |
| | `trachea` | 1–200 cm, log | 3.5 cm | Internal tube length (scaled by Size) |
| | `chaos` | 0–1 | 0 | Strong coupling for screeches |
| Muscles | `wobblerate` | 0–250 Hz | 0 | Superfast muscle modulation rate |
| | `wobble` | 0–1 | 0 | Its depth |
| | `wobblefm` | 0–1 | 0 | Amplitude (0) to pitch (1) |
| Breath | `pressure` | 0–1 | 0.7 | Drive past threshold |
| | `attack` | 1 ms–5 s | 8 ms | Pressure envelope |
| | `decay` | 1 ms–5 s | 0.3 s | |
| | `sustain` | 0–1 | 0.8 | |
| | `release` | 1 ms–8 s | 30 ms | |
| | `minibreath` | 0–1 | 0.6 | Dip between syllables |
| Pattern | `pattern` | Off, On | Off | Held key sings syllables |
| | `sylrate` | 0.5–60 /s, log | 8 /s | Syllables per second |
| | `sync` | Off, On | Off | Rate from tempo |
| | `duty` | 5–95% | 60% | Sound share of each cycle |
| | `shape` | Flat, Up, Down, Convex, Concave, Wave | Down | Syllable pitch path |
| | `sweep` | −4 to +4 oct | 1 oct | Its extent |
| | `sides` | Auto, Left, Right, Alternate | Auto | Which side sings each syllable |
| | `trill` | 0–1 | 0.7 | Trill limit (Podos) |
| | `jitter` | 0–1 | 0.05 | Per-syllable variation |
| Pitch | `transpose` | −24 to +60 st | +36 st | Middle C plays about 2.1 kHz |
| | `detune` | ±100 cents | 0 | |
| | `glide` | 0–2 s | 20 ms | Mono only |
| | `bendrange` | 2–48 st | 12 st | |
| | `mode` | Mono, Poly | Mono | Poly: 4 voices [Decided, batch 03] |
| | `size` | 0–1 | 0.25 | Wren to crane |
| | `tempolock` | 0–100% | 50% | Keep or scale timing with Size |
| Output | `filter` | Off, On | On | Internal trachea and tracking resonance |
| | `volume` | −48 to +6 dB | −6 dB | |
| Lock | `lock` | Off, On | Off | Snaps every pitch to semitones |
| | `glidestyle` | Smooth, Stepped | Smooth | How a locked sweep travels |

## 10. Code architecture

Same rules as Throat and Dolphin:

- Everything runs at 4× the host rate in fixed 32-sample blocks and is decimated with a 128-tap
  windowed-sinc FIR. The block is the latency, reported to the host.
- `process()` never allocates. Parameters are read once per block; gating and Wobble stay
  sample-accurate.
- Each voice has its own seeded xorshift generator. Same seed and same notes give the same output
  at any host buffer size.
- The C++ port is checked sample by sample against the reference, built with `-ffp-contract=off`.
- Idle voices and silent sources do no work.
- **All sources of a voice are integrated together in one loop**, sharing the sub-step count
  (the largest any of them needs), each with its own step. Coupling needs this anyway, and it is
  nearly free: the loop is bound by latency, not arithmetic, so 2 interleaved sources cost what 1
  does (JS and C++), 4 cost about 1.5×. The C++ port may interleave across voices too (8 sources:
  1.0–1.7× one source). [Decided, batch 03]
- **Cost** (batch 03, one 2.1 GHz Xeon core, 48 kHz): about 2% per voice at the defaults, 11% at
  the worst case (a rich 2.5 kHz note at Pressure 0, Link off: 19 sub-steps). C++ is no faster
  per source (9.5%), for the same latency reason.
- The map file is generated once and committed; the engine never integrates a grid at load.

Engine interface: `new SyrinxEngine(sr, seed)`, `setParam`, `noteOn` / `noteOff`, `setBend`,
`process(L, R, n)`.
