# Syrinx · research

The papers behind `design.md` and the numbers taken from them. All were read in full unless
marked otherwise.

## Model

| Source | What Syrinx takes from it |
|---|---|
| Amador, Mindlin & Elemans 2025, *Transitions and tricks: nonlinear phenomena in the avian voice*, Phil. Trans. R. Soc. B 380:20240007, [doi](https://doi.org/10.1098/rstb.2024.0007) | The normal-form equations as used here. Birds have 0–3 sound sources. Confirmed chaos is rare in birds (cockatoos); claimed period doubling in zebra finch did not survive analysis of 130 birds. Sidebands from coupled sides (chickadee), roughness from unlocked folds (spot-winged pigeon), apparent period doubling from anti-phase locking. Kiskadee: pitch follows pressure; 160–190 Hz muscle modulation. Little experimental evidence of source–tract coupling, so a separate tract effect loses little. |
| Perl et al. 2011, *Reconstruction of physiological instructions from zebra finch song*, Phys. Rev. E 84:051909, [doi](https://doi.org/10.1103/PhysRevE.84.051909) | Normal form, eq. 8; γ = 24,000 for zebra finch, fitted over 28 segments from 4 birds; 100 × 100 (α, β) grid search; noise on tension makes synthesis more natural; frequency and spectral-content maps, Fig. 5. |
| Sitt et al. 2010, *Physiologically driven avian vocal synthesizer*, Phys. Rev. E 81:031927, [doi](https://doi.org/10.1103/PhysRevE.81.031927) | Real-time precedent: two sources on a 225 MHz DSP at 48 kHz, forward Euler, 18 steps per sample; γ = 23,500; gating by switching the pressure parameter between an off (0.05) and an on (−0.15) value; Hopf above 1.8 kHz, SNILC below 1.2 kHz; tube 1.9 cm, reflection −0.9. |
| Sitt et al. 2008, *Dynamical origin of spectrally rich vocalizations in birdsong*, Phys. Rev. E 78:011905, [doi](https://doi.org/10.1103/PhysRevE.78.011905) | Spectral content falls with fundamental: rich below about 1.5 kHz, tonal above (172 segments, 6 zebra finches). SNILC onset explains it; Hopf does not. Basis for Regime and Link. |
| Amador & Mindlin 2008, *Beyond harmonic sounds in a simple model for birdsong production*, Chaos 18:043123, [doi](https://doi.org/10.1063/1.3041023) | Bifurcation diagram of the physical model; SNILC (rich) and Hopf (tonal) paths; several syllables from one pressure pulse by gating. |
| Laje & Mindlin 2005, *Modeling source-source and source-filter acoustic interaction in birdsong*, Phys. Rev. E 72:036218, [doi](https://doi.org/10.1103/PhysRevE.72.036218) | Two sources coupled through the shared pressure at the trachea's base, eqs. 62–67; with no feedback, coupled sources give sums and differences of multiples of both pitches (Fig. 6); standard values include a 2 cm tube and reflection 0.9; weak-coupling approximation. Basis for Coupling and Jumps. |
| Arneodo & Mindlin 2009, *Source-tract coupling in birdsong production*, Phys. Rev. E 79:061921, [doi](https://doi.org/10.1103/PhysRevE.79.061921) | Tube feedback gives coexisting periods when the round trip is near the source period; lengthening the tube from 5.01 to 5.4 cm gives a frequency jump. Basis for Jumps. |
| Garcia et al. 2017, *Evolution of vocal diversity through morphological adaptation without vocal learning or complex neural control*, Current Biology 27:2677–2683, [doi](https://doi.org/10.1016/j.cub.2017.07.059) | Tracheophones have three sources. Model: two van der Pol oscillators (labia, membrane), pressures cross-modulated by each other's position; far apart in pitch they pulse, close they lock at an intermediate pitch and louder; pressure moves one to the other. Rufous ovenbird modulation up to 650 Hz. Code: github.com/gabomindlin/tracheophones. Basis for Triple. |

## Behaviour

| Source | What Syrinx takes from it |
|---|---|
| Podos 1997, *A performance constraint on the evolution of trilled vocalizations in a songbird family*, Evolution 51:537–551, [doi](https://doi.org/10.1111/j.1558-5646.1997.tb02441.x) | Upper bound across emberizids: bandwidth (kHz) = 7.55 − 0.124 × trill rate (Hz), r² = 0.894, trills up to 50 per second. Canaries take minibreaths below about 27 per second and pulse a breath above about 30 (cited from earlier work). Basis for the trill limit. |
| Fitch 1999, *Acoustic exaggeration of size in birds via tracheal elongation*, J. Zool. 248:31–48, [doi](https://doi.org/10.1111/j.1469-7998.1999.tb01020.x) | Call pitch of geese, swans and cranes: 131 Hz to 1.4 kHz, not set by trachea length. Basis for the large end of Size. |
| Research brief, *Syrinx and beak-tube: research brief for a bird-voice synthesizer pair* | Cardinal left–right split near 3.5 kHz and sweeps of 1–9 kHz; canary split (left below about 2.6 kHz, right above about 3.5 kHz); muscles modulating airflow up to 250 Hz (Elemans et al. 2008); cardinal syllables up to 16 per second with minibreaths, chirr about 30 per second; two-voice syllables seldom harmonically related (Suthers et al. 1994); cowbird left–right alternation. Secondary: these were read through the brief's sources, not all in full. |

## To read after the first listening tests

Döppler et al. 2020 (kiskadee rough sounds, for Wobble), Fletcher 2000 (chaotic calls, for
Chaos).
