/* AudioWorklet wrapper: Syrinx engine → stereo output. Runs after syrinx-maps.js and syrinx-engine.js. */
class SyrinxProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.eng = new SyrinxEngine(sampleRate, 1234);
    this.vizEvery = Math.round(sampleRate / 30);
    this.vizCount = 0;
    // DSP load: time spent in the engine / length of audio produced. performance.now() where the
    // worklet has it; otherwise Date.now(), whose 1 ms steps average out over half a second
    this.hiRes = typeof performance !== 'undefined' && typeof performance.now === 'function';
    this.clock = this.hiRes ? () => performance.now() : () => Date.now();
    this.busyMs = 0; this.audioMs = 0; this.load = 0; this.peak = 0; this.winPeak = 0; this.peakAge = 0;
    this.port.onmessage = (e) => {
      const m = e.data, eng = this.eng;
      if (m.t === 'p') eng.setParam(m.id, m.v);
      else if (m.t === 'many') { for (const k in m.p) eng.setParam(k, m.p[k]); }
      else if (m.t === 'on') eng.noteOn(m.n, m.v, m.ch | 0);
      else if (m.t === 'off') eng.noteOff(m.n, m.ch | 0);
      else if (m.t === 'bend') eng.setBend(m.v);
      else if (m.t === 'tempo') eng.setTempo(m.v);
      else if (m.t === 'panic') eng.allNotesOff();
    };
    this.port.postMessage({ t: 'ready', sr: sampleRate, latency: SyrinxEngine.LATENCY });
  }
  process(inputs, outputs) {
    const out = outputs[0], l = out[0], r = out[1] || null, n = l.length;
    const t0 = this.clock();
    this.eng.process(l, r, n);
    const spent = this.clock() - t0, len = n / sampleRate * 1000;
    this.busyMs += spent; this.audioMs += len;
    if (this.hiRes && spent / len > this.winPeak) this.winPeak = spent / len;
    if (this.audioMs >= 500) {
      this.load = this.busyMs / this.audioMs; this.busyMs = 0; this.audioMs = 0;
      // peak: the slowest single callback, held for 2 s
      if (this.winPeak >= this.peak || ++this.peakAge >= 4) { this.peak = this.winPeak; this.peakAge = 0; }
      this.winPeak = 0;
    }
    this.vizCount += n;
    if (this.vizCount >= this.vizEvery) {
      this.vizCount = 0;
      const e = this.eng;
      // the newest sounding voice: what each of its sources is doing
      let v = null; for (const x of e.voices) if (x.active() && (!v || x.age > v.age)) v = x;
      const src = v ? [0, 1, 2].map(j => ({ on: !!v.on[j], f: v.fNow[j], g: v.gs[j] })) : null;
      this.port.postMessage({ t: 'stat', voices: e.info.voices, idle: !!e.info.idle, load: this.load, peak: this.hiRes ? this.peak : -1,
        src, regime: v ? v.regimeNow : 0, content: v ? v.sciNow : 0, sub: v ? v.subNow : 0,
        keep: v ? [v.corr[0] * 1200, v.corr[1] * 1200] : null, env: v ? v.env : 0 });
    }
    return true;
  }
}
registerProcessor('syrinx-processor', SyrinxProcessor);
