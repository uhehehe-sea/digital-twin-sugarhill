import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

console.log('archMats matches:', (js.match(/archMats\./g) || []).length);
