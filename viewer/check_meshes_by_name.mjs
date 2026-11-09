import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const mIdx = js.indexOf('meshesByName[');
console.log('Index of meshesByName[:', mIdx);
if (mIdx !== -1) {
  console.log(js.substring(mIdx - 100, mIdx + 300));
}

console.log('Is meshesByName defined globally?:', js.includes('const meshesByName =') || js.includes('let meshesByName =') || js.includes('var meshesByName ='));
