import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const aIdx = js.indexOf('function animate()');
console.log(js.substring(aIdx, aIdx + 1500));
