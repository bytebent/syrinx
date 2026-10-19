// Renders every test preset to a WAV in renders/ (48 kHz, 24-bit, stereo).
// Run: node tools/render-presets.js [out-dir]
'use strict';
const fs = require('fs'), path = require('path');
const { SyrinxEngine } = require(path.join(__dirname, '..', 'reference', 'syrinx-engine.js'));
const { PRESETS } = require(path.join(__dirname, '..', 'reference', 'presets.js'));

const SR = 48000, BL = 128;
const outDir = process.argv[2] || path.join(__dirname, '..', 'renders');
fs.mkdirSync(outDir, { recursive: true });

function wav24(L, R) {
  const n = L.length, data = Buffer.alloc(n * 6);
  for (let i = 0; i < n; i++) for (const [c, x] of [[0, L[i]], [1, R[i]]]) {
    const v = Math.max(-8388608, Math.min(8388607, Math.round(x * 8388607)));
    data.writeIntLE(v, i * 6 + c * 3, 3);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 6, 28); h.writeUInt16LE(6, 32); h.writeUInt16LE(24, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

PRESETS.forEach((pr, idx) => {
  const e = new SyrinxEngine(SR, 1234);
  for (const k in pr.params) e.setParam(k, pr.params[k]);
  const end = Math.max(...pr.phrase.map(([, t, d]) => t + d)) + 0.6;
  const n = Math.round(end * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const ev = [];
  for (const [note, t, d] of pr.phrase) { ev.push([Math.round(t * SR), 'on', note]); ev.push([Math.round((t + d) * SR), 'off', note]); }
  ev.sort((a, b) => a[0] - b[0]);
  const tl = new Float32Array(BL), tr = new Float32Array(BL);
  let k = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i += BL) {
    while (k < ev.length && ev[k][0] < i + BL) { if (ev[k][1] === 'on') e.noteOn(ev[k][2], 100); else e.noteOff(ev[k][2]); k++; }
    if (pr.switchAt && i >= pr.switchAt.time * SR && i < pr.switchAt.time * SR + BL) e.setParam(pr.switchAt.id, pr.switchAt.value);
    if (pr.sweep) { const u = Math.min(1, i / (n - 0.6 * SR)); e.setParam(pr.sweep.id, pr.sweep.from + (pr.sweep.to - pr.sweep.from) * u); }
    const m = Math.min(BL, n - i);
    e.process(tl, tr, m);
    L.set(tl.subarray(0, m), i); R.set(tr.subarray(0, m), i);
  }
  const ms = Date.now() - t0;
  let pk = 0; for (const v of L) pk = Math.max(pk, Math.abs(v));
  const file = path.join(outDir, String(idx + 1).padStart(2, '0') + ' ' + pr.name.replace(/[^\w ()-]/g, '') + '.wav');
  fs.writeFileSync(file, wav24(L, R));
  console.log(path.basename(file).padEnd(34), 'peak', pk.toFixed(3), ' render', (ms / 1000 / end * 100).toFixed(1) + '% of real time');
});
