import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

// Find camera speed logic
const sIdx = js.indexOf('updateWASDCameraMovement');
console.log(js.substring(sIdx, sIdx + 1500));
