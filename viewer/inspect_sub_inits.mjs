import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const sIdx = js.indexOf('function renderMaterialStudio');
console.log('renderMaterialStudio:\n' + js.substring(sIdx, sIdx + 1200));

const iIdx = js.indexOf('function setupInteractions');
console.log('setupInteractions:\n' + js.substring(iIdx, iIdx + 1200));
