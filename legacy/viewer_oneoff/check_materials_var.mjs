import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const target = 'rrSteelMat = materials.STAINLESS_304;';
const idx = js.indexOf(target);
console.log('Index of rrSteelMat:', idx);
if (idx !== -1) {
  console.log(js.substring(idx - 150, idx + 200));
}

console.log('Is materials defined?:', js.includes('const materials =') || js.includes('let materials =') || js.includes('var materials ='));
