import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const gIdx = js.indexOf('let gateState =');
console.log('Index of gateState:', gIdx);
if (gIdx !== -1) {
  console.log(js.substring(gIdx - 200, gIdx + 1200));
}
