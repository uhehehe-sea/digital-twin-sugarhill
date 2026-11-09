import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const gIdx = js.indexOf('let gateState =');
console.log('Index of gateState:', gIdx);
if (gIdx !== -1) {
  console.log(js.substring(gIdx - 200, gIdx + 1200));
}
