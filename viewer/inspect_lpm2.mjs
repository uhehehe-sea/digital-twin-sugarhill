import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const sIdx = js.indexOf('function loadPrecisionModel');
const sub = js.substring(sIdx + 7000, sIdx + 11000);
console.log(sub.substring(0, 1500));
