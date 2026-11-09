import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const sIdx = js.indexOf('function createControllableGroup');
console.log(js.substring(sIdx + 600, sIdx + 1300));
