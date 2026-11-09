import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const gIdx = js.indexOf('gateState.progress !== gateState.targetProgress');
console.log('Index of gateState animation loop in editor_v2.js:', gIdx);
