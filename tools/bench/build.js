// Builds tools/syrinx.html: the reference engine, its map and the worklet wrapper inlined into one
// page, plus the test presets. Run: node tools/bench/build.js
const fs = require('fs'), path = require('path');
const d = __dirname, ref = path.join(d, '..', '..', 'reference');
// the map goes first: in the worklet it defines globalThis.SyrinxMap, which the engine reads
const dsp = [path.join(ref, 'syrinx-maps.js'), path.join(ref, 'syrinx-engine.js'), path.join(d, 'processor.js')].map(f => fs.readFileSync(f, 'utf8')).join('\n');
const presets = fs.readFileSync(path.join(ref, 'presets.js'), 'utf8');
for (const [name, src] of [['DSP', dsp], ['presets', presets]]) if (/<\/script/i.test(src)) throw new Error(name + ' source contains </script');
const tpl = fs.readFileSync(path.join(d, 'template.html'), 'utf8');
for (const ph of ['/*__DSP__*/', '/*__PRESETS__*/']) if (tpl.split(ph).length !== 2) throw new Error('placeholder missing: ' + ph);
const out = path.join(d, '..', 'syrinx.html');
fs.writeFileSync(out, tpl.replace('/*__DSP__*/', () => dsp).replace('/*__PRESETS__*/', () => presets));
console.log('tools/syrinx.html', Math.round(fs.statSync(out).size / 1024), 'KB');
